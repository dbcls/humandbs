/**
 * Authentication & Authorization type definitions
 *
 * This module provides:
 * - JWT claims from Keycloak
 * - Authenticated user context
 */
import { z } from "zod";
/**
 * JWT claims from Keycloak
 * Note: We only use sub (UID) from Keycloak. Role information is not extracted from JWT.
 * Admin determination is done via admin_uids.json file.
 */
export declare const JwtClaimsSchema: z.ZodObject<{
    sub: z.ZodString;
    preferred_username: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    iat: z.ZodOptional<z.ZodNumber>;
    exp: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type JwtClaims = z.infer<typeof JwtClaimsSchema>;
/**
 * Authenticated user context
 * Note: Roles are NOT extracted from Keycloak JWT.
 * - isAdmin is determined by admin_uids.json file
 * - Owner status is determined by Research.uids field
 */
export declare const AuthUserSchema: z.ZodObject<{
    userId: z.ZodString;
    username: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    isAdmin: z.ZodBoolean;
}, z.core.$strip>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
//# sourceMappingURL=auth.d.ts.map