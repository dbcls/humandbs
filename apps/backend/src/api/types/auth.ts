/**
 * Authentication & Authorization type definitions
 *
 * This module provides:
 * - JWT claims from Keycloak
 * - Authenticated user context
 */
import { z } from "zod"

// === Authentication & Authorization ===

/**
 * JWT claims from Keycloak
 * Note: We only use sub (UID) from Keycloak. Role information is not extracted from JWT.
 * Admin determination is done via admin_uids.json file.
 */
export const JwtClaimsSchema = z.object({
  sub: z.string(),
  preferred_username: z.string().optional(),
  email: z.string().optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
})
export type JwtClaims = z.infer<typeof JwtClaimsSchema>

/**
 * Authenticated user context
 * Note: Roles are NOT extracted from Keycloak JWT.
 * - isAdmin is determined by admin_uids.json file
 * - Owner status is determined by Research.researcherUids field
 */
export const AuthUserSchema = z.object({
  userId: z.string(),
  username: z.string().optional(),
  email: z.string().optional(),
  isAdmin: z.boolean(), // Determined by admin_uids.json
})
export type AuthUser = z.infer<typeof AuthUserSchema>
