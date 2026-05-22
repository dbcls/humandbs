/**
 * Header-based auth mock for unit tests.
 *
 * Routes through `X-Test-Auth: <JSON-serialized AuthUser>` so a single
 * `mock.module("@/api/middleware/auth", ...)` factory can stand in for the
 * real Keycloak-backed middleware. Designed so:
 *
 * - `optionalAuth` populates `authUser` from the header or `null` when absent.
 * - `requireAuth` throws 401 when the header is missing (matching production).
 * - `requireAdmin` throws 403 when `authUser?.isAdmin !== true`.
 *
 * Tests build the header with `userAuthHeader()` / `adminAuthHeader()` and
 * forward it through `app.request(..., { headers: userAuthHeader() })`.
 */
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"

import type { AuthUser } from "@/api/types"

import { createMockAuthUser } from "./mock-es"

export const TEST_AUTH_HEADER = "X-Test-Auth"

/** Mock module factory for `@/api/middleware/auth`. */
export const buildMockAuthModule = () => ({
  optionalAuth: createMiddleware(async (c, next) => {
    const raw = c.req.header(TEST_AUTH_HEADER)
    c.set("authUser", raw ? (JSON.parse(raw) as AuthUser) : null)
    await next()
  }),
  requireAuth: createMiddleware(async (c, next) => {
    const raw = c.req.header(TEST_AUTH_HEADER)
    if (!raw) {
      const { UnauthorizedError } = await import("@/api/errors")
      throw new UnauthorizedError("Authentication required")
    }
    const user = JSON.parse(raw) as AuthUser
    c.set("authUser", user)
    c.set("authenticatedUser", user)
    await next()
  }),
  requireAdmin: createMiddleware(async (c, next) => {
    const user = c.get("authUser")
    if (!user?.isAdmin) {
      const { ForbiddenError } = await import("@/api/errors")
      throw new ForbiddenError("Admin access required")
    }
    await next()
  }),
  // Mirror the real helper so handlers that read `authenticatedUser` via
  // `getAuthenticatedUser(c)` (e.g. routes/admin.ts) still work behind the mock.
  getAuthenticatedUser: (c: Context): AuthUser => {
    const user = c.get("authenticatedUser") as AuthUser | undefined
    if (!user) {
      throw new Error("mock getAuthenticatedUser: authenticatedUser not set on context")
    }
    return user
  },
  isAdminUser: async () => false,
  __testing: { clearJwksCache: () => undefined, clearAdminUidsCache: () => undefined },
})

export const userAuthHeader = (overrides: Partial<AuthUser> = {}): Record<string, string> => ({
  [TEST_AUTH_HEADER]: JSON.stringify(createMockAuthUser({ userId: "user-1", isAdmin: false, ...overrides })),
})

export const adminAuthHeader = (overrides: Partial<AuthUser> = {}): Record<string, string> => ({
  [TEST_AUTH_HEADER]: JSON.stringify(createMockAuthUser({ userId: "admin-1", isAdmin: true, ...overrides })),
})
