/**
 * Resource Authorization Middleware
 *
 * Provides middleware for loading and authorizing access to Research resources.
 * Eliminates repetitive auth checks in route handlers.
 */

import type { MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"

import { ERROR_MESSAGES } from "@/api/constants"
import { canAccessResearchDoc } from "@/api/es-client/auth"
import { getResearchWithSeqNo } from "@/api/es-client/research"
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/api/routes/errors"
import type { AuthUser, EsResearchDoc } from "@/api/types"

// Extend Hono context with research data
declare module "hono" {
  interface ContextVariableMap {
    research: EsResearchDoc & { seqNo: number; primaryTerm: number }
  }
}

interface ResourceAuthOptions {
  /** Require user to be admin or owner of the resource */
  requireOwnership?: boolean
  /** Require user to be admin */
  adminOnly?: boolean
}

/**
 * Middleware to load Research and verify authorization
 *
 * This middleware:
 * 1. Checks authentication if required
 * 2. Loads the Research document with optimistic lock info
 * 3. Verifies the resource exists and is not deleted
 * 4. Checks ownership/admin permissions
 * 5. Sets c.get("research") for use in route handlers
 *
 * @example
 * // Require authentication and ownership
 * app.use("/:humId/update", loadResearchAndAuthorize({ requireOwnership: true }))
 *
 * app.put("/:humId/update", (c) => {
 *   const research = c.get("research")!
 *   const { seqNo, primaryTerm } = research
 *   // ... update logic using seqNo/primaryTerm for optimistic locking
 * })
 */
export const loadResearchAndAuthorize = (options: ResourceAuthOptions = {}): MiddlewareHandler => {
  return createMiddleware(async (c, next) => {
    const authUser = c.get("authUser")
    const humId = c.req.param("humId")

    // humId is required for this middleware
    if (!humId) {
      throw new ValidationError("humId parameter is required")
    }

    // Check authentication requirements
    if ((options.requireOwnership || options.adminOnly) && !authUser) {
      throw new UnauthorizedError(ERROR_MESSAGES.UNAUTHORIZED)
    }

    // Check admin requirement
    if (options.adminOnly && !authUser?.isAdmin) {
      throw new ForbiddenError(ERROR_MESSAGES.FORBIDDEN_ADMIN)
    }

    // Load Research document
    const result = await getResearchWithSeqNo(humId)
    if (!result) {
      throw new NotFoundError(ERROR_MESSAGES.NOT_FOUND("Research", humId))
    }

    const { doc, seqNo, primaryTerm } = result

    // Deleted research is not accessible
    if (doc.status === "deleted") {
      throw new NotFoundError(ERROR_MESSAGES.NOT_FOUND("Research", humId))
    }

    // Check ownership permission
    if (options.requireOwnership && !authUser?.isAdmin) {
      if (!canAccessResearchDoc(authUser, doc)) {
        throw new ForbiddenError(ERROR_MESSAGES.FORBIDDEN)
      }
    }

    // Set research data for route handler
    c.set("research", { ...doc, seqNo, primaryTerm })

    await next()
  })
}

/**
 * Check if user can modify the resource (admin or owner)
 */
export const canModifyResource = (authUser: AuthUser | null, doc: EsResearchDoc): boolean => {
  if (!authUser) return false
  if (authUser.isAdmin) return true
  return doc.uids.includes(authUser.userId)
}
