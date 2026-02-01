/**
 * Keycloak OIDC Authentication Middleware
 *
 * Validates JWT tokens from Keycloak and extracts user information.
 * Uses JWKS endpoint for signature verification.
 *
 * Note: Role information is NOT extracted from Keycloak JWT.
 * Admin determination is done via admin_uids.json file.
 */

import type { MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"
import * as jose from "jose"
import * as fs from "node:fs/promises"
import * as path from "node:path"

import { CACHE_TTL } from "../constants"
import type { AuthUser, JwtClaims } from "../types"
import { JwtClaimsSchema } from "../types"

// Environment variables
const OIDC_ISSUER_URL = process.env.OIDC_ISSUER_URL || "https://idp-staging.ddbj.nig.ac.jp/realms/master"
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || "humandbs-dev"
const ADMIN_UID_FILE = process.env.ADMIN_UID_FILE || path.join(process.cwd(), "admin_uids.json")

// === TTL Cache Factory ===

interface TtlCache<T> {
  get: () => T | null
  set: (value: T) => void
}

const createTtlCache = <T>(ttl: number): TtlCache<T> => {
  let cache: T | null = null
  let expiry = 0

  return {
    get: () => {
      if (cache && Date.now() < expiry) return cache
      return null
    },
    set: (value: T) => {
      cache = value
      expiry = Date.now() + ttl
    },
  }
}

// Caches using factory pattern
const jwksCache = createTtlCache<jose.JWTVerifyGetKey>(CACHE_TTL.JWKS)
const adminUidsCache = createTtlCache<string[]>(CACHE_TTL.ADMIN_UIDS)

/**
 * Get JWKS from Keycloak (with caching)
 */
async function getJwks(): Promise<jose.JWTVerifyGetKey> {
  const cached = jwksCache.get()
  if (cached) return cached

  const jwksUrl = `${OIDC_ISSUER_URL}/protocol/openid-connect/certs`
  const jwks = jose.createRemoteJWKSet(new URL(jwksUrl))
  jwksCache.set(jwks)

  return jwks
}

/**
 * Load admin UIDs from file (with caching)
 */
async function getAdminUids(): Promise<string[]> {
  const cached = adminUidsCache.get()
  if (cached) return cached

  let uids: string[] = []
  try {
    const content = await fs.readFile(ADMIN_UID_FILE, "utf-8")
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      uids = parsed.filter((uid): uid is string => typeof uid === "string")
    } else {
      console.warn("admin_uids.json is not an array, using empty list")
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist, use empty list (no admins)
      console.warn(`Admin UID file not found: ${ADMIN_UID_FILE}`)
    } else {
      console.error("Error loading admin UIDs:", error)
    }
  }

  adminUidsCache.set(uids)
  return uids
}

/**
 * Check if a user ID is an admin
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const adminUids = await getAdminUids()
  return adminUids.includes(userId)
}

/**
 * Build AuthUser from JWT claims
 */
async function buildAuthUser(claims: JwtClaims): Promise<AuthUser> {
  const isAdmin = await isAdminUser(claims.sub)
  return {
    userId: claims.sub,
    username: claims.preferred_username,
    email: claims.email,
    isAdmin,
  }
}

/**
 * Verify JWT token and return claims
 */
async function verifyToken(token: string): Promise<JwtClaims | null> {
  try {
    const jwks = await getJwks()
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: OIDC_ISSUER_URL,
      audience: OIDC_CLIENT_ID,
    })

    const parseResult = JwtClaimsSchema.safeParse(payload)
    if (!parseResult.success) {
      console.error("JWT claims validation failed:", parseResult.error)
      return null
    }

    return parseResult.data
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      console.warn("JWT token expired")
    } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
      console.warn("JWT claim validation failed:", error.message)
    } else {
      console.error("JWT verification error:", error)
    }
    return null
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

// Extend Hono context with auth user
declare module "hono" {
  interface ContextVariableMap {
    authUser: AuthUser | null
  }
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't require it.
 * Sets c.get("authUser") to the authenticated user or null.
 */
export const optionalAuth: MiddlewareHandler = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const token = extractBearerToken(authHeader)

  if (token) {
    const claims = await verifyToken(token)
    if (claims) {
      c.set("authUser", await buildAuthUser(claims))
    } else {
      c.set("authUser", null)
    }
  } else {
    c.set("authUser", null)
  }

  await next()
})

/**
 * Required authentication middleware
 * Returns 401 if not authenticated.
 */
export const requireAuth: MiddlewareHandler = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const token = extractBearerToken(authHeader)

  if (!token) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }

  const claims = await verifyToken(token)
  if (!claims) {
    return c.json({ error: "Unauthorized", message: "Invalid or expired token" }, 401)
  }

  c.set("authUser", await buildAuthUser(claims))
  await next()
})

/**
 * Admin-only middleware
 * Must be used after requireAuth.
 */
export const requireAdmin: MiddlewareHandler = createMiddleware(async (c, next) => {
  const authUser = c.get("authUser")

  if (!authUser?.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }

  await next()
})

/**
 * Check if user is an owner of a research (based on researcherUids)
 * Returns true if user's UID is in the research's researcherUids array
 */
export function isResearchOwner(authUser: AuthUser | null, researcherUids: string[]): boolean {
  if (!authUser) return false
  return researcherUids.includes(authUser.userId)
}

/**
 * Check if user can access a research resource
 * Returns true if user is admin or owner (in researcherUids)
 */
export function canAccessResearch(authUser: AuthUser | null, researcherUids: string[]): boolean {
  if (!authUser) return false
  if (authUser.isAdmin) return true
  return isResearchOwner(authUser, researcherUids)
}

/**
 * Check if user can modify a research resource
 * Returns true if user is admin or owner (in researcherUids)
 */
export function canModifyResearch(authUser: AuthUser | null, researcherUids: string[]): boolean {
  return canAccessResearch(authUser, researcherUids)
}

/**
 * Check if user can delete a resource
 * Returns true only for admin
 */
export function canDeleteResource(authUser: AuthUser | null): boolean {
  return authUser?.isAdmin ?? false
}
