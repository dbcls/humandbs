/**
 * Resource Authorization Middleware
 *
 * Provides middleware for loading and authorizing access to Research resources.
 * Eliminates repetitive auth checks in route handlers.
 */

import type { MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"

import { ERROR_MESSAGES } from "@/api/constants"
import { canAccessResearchDoc, getResearchWithSeqNo } from "@/api/es-client"
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
    const authUser = c.get("authUser") as AuthUser | null
    const humId = c.req.param("humId")

    // humId is required for this middleware
    if (!humId) {
      return c.json({ error: "Bad Request", message: "humId parameter is required" }, 400)
    }

    // Check authentication requirements
    if ((options.requireOwnership || options.adminOnly) && !authUser) {
      return c.json({ error: "Unauthorized", message: ERROR_MESSAGES.UNAUTHORIZED }, 401)
    }

    // Check admin requirement
    if (options.adminOnly && !authUser?.isAdmin) {
      return c.json({ error: "Forbidden", message: ERROR_MESSAGES.FORBIDDEN_ADMIN }, 403)
    }

    // Load Research document
    const result = await getResearchWithSeqNo(humId)
    if (!result) {
      return c.json({ error: ERROR_MESSAGES.NOT_FOUND("Research", humId) }, 404)
    }

    const { doc, seqNo, primaryTerm } = result

    // Deleted research is not accessible
    if (doc.status === "deleted") {
      return c.json({ error: ERROR_MESSAGES.NOT_FOUND("Research", humId) }, 404)
    }

    // Check ownership permission
    if (options.requireOwnership && !authUser?.isAdmin) {
      if (!canAccessResearchDoc(authUser, doc)) {
        return c.json({ error: "Forbidden", message: ERROR_MESSAGES.FORBIDDEN }, 403)
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
