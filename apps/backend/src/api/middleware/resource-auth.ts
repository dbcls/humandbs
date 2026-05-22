/**
 * Resource Authorization Middleware
 *
 * Provides middleware for loading and authorizing access to Research resources.
 * Eliminates repetitive auth checks in route handlers.
 */

import type { MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"

import { ERROR_MESSAGES } from "@/api/constants"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/api/errors"
import { getDatasetWithSeqNo, resolveLatestDatasetVersion } from "@/api/es-client/dataset"
import { getResearchDoc, getResearchWithSeqNo } from "@/api/es-client/research"
import type { AuthUser, EsDataset, EsResearch } from "@/api/types"
import { VERSION_STRING_REGEX } from "@/api/types/common"

// Extend Hono context with resource preload data
declare module "hono" {
  interface ContextVariableMap {
    research: EsResearch & { seqNo: number; primaryTerm: number }
    dataset: EsDataset & { seqNo: number; primaryTerm: number }
    parentResearch: EsResearch
  }
}

interface ResourceAuthOptions {
  /** Require user to be admin or owner of the resource */
  requireOwnership?: boolean
  /** Require user to be admin */
  requireAdmin?: boolean
  /** Require the Research to be in `draft` status (409 otherwise) */
  requireDraftStatus?: boolean
}

interface DatasetAuthOptions extends ResourceAuthOptions {
  /** Require the parent Research to be in `draft` status (403 otherwise) */
  requireParentDraft?: boolean
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
    if ((options.requireOwnership || options.requireAdmin) && !authUser) {
      throw new UnauthorizedError(ERROR_MESSAGES.UNAUTHORIZED)
    }

    // Check admin requirement
    if (options.requireAdmin && !authUser?.isAdmin) {
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

    // Check ownership permission (admin or owner via uids)
    if (options.requireOwnership && !authUser?.isAdmin) {
      if (!canModifyResource(authUser, doc)) {
        throw new ForbiddenError(ERROR_MESSAGES.FORBIDDEN)
      }
    }

    // Some mutations are only valid against a draft Research (e.g. dataset
    // creation, dataset update). Surface a 409 here so handlers can rely on
    // c.get("research").status === "draft" without re-checking.
    if (options.requireDraftStatus && doc.status !== "draft") {
      throw new ConflictError(
        `Cannot mutate: Research is in '${doc.status}' status, expected 'draft'`,
      )
    }

    // Set research data for route handler
    c.set("research", { ...doc, seqNo, primaryTerm })

    // When auth was required to reach here, expose a non-null variant so
    // handlers can read the authenticated user without an extra null-check.
    if (authUser && (options.requireOwnership || options.requireAdmin)) {
      c.set("authenticatedUser", authUser)
    }

    await next()
  })
}

/**
 * Check if user can modify the resource (admin or owner)
 */
export const canModifyResource = (authUser: AuthUser | null, doc: EsResearch): boolean => {
  if (!authUser) return false
  if (authUser.isAdmin) return true
  return doc.uids.includes(authUser.userId)
}

/**
 * Middleware to load Dataset (+ parent Research) and verify authorization.
 *
 * Runs BEFORE zod validators, so unauthenticated / non-owner / non-draft-parent
 * callers receive 401 / 403 / 404 without leaking body schema details from a
 * validation 400.
 *
 *  1. authUser presence (UnauthorizedError 401 when requireOwnership/requireAdmin)
 *  2. admin requirement (ForbiddenError 403 when requireAdmin)
 *  3. Dataset preload via `?version=<v>` (defaults to `v1`, matching the
 *     handler's prior default). Missing dataset → 404.
 *  4. parent Research preload via `getResearchDoc`. Missing or `status="deleted"` → 404.
 *  5. ownership check (`canModifyResource`) when requireOwnership.
 *  6. parent-draft check (`parentResearch.status === "draft"`) when requireParentDraft.
 *     Surfaced as 409 ConflictError to match `loadResearchAndAuthorize.requireDraftStatus`.
 *  7. Sets `c.set("dataset", ...)` and `c.set("parentResearch", ...)` for the handler.
 */
export const loadDatasetAndAuthorize = (options: DatasetAuthOptions = {}): MiddlewareHandler => {
  return createMiddleware(async (c, next) => {
    const authUser = c.get("authUser")
    const datasetId = c.req.param("datasetId")

    if (!datasetId) {
      throw new ValidationError("datasetId parameter is required")
    }

    if ((options.requireOwnership || options.requireAdmin) && !authUser) {
      throw new UnauthorizedError(ERROR_MESSAGES.UNAUTHORIZED)
    }

    if (options.requireAdmin && !authUser?.isAdmin) {
      throw new ForbiddenError(ERROR_MESSAGES.FORBIDDEN_ADMIN)
    }

    // validators have not yet run, so `c.req.valid("query")` is unavailable.
    // Read raw query; on missing/malformed values, resolve the latest dataset version
    // (matching `getDataset`'s default behaviour) so a draft-cycle bump's new version
    // is picked up. Strict format validation remains the validators' job.
    const versionRaw = c.req.query("version")
    let version: string
    if (versionRaw && VERSION_STRING_REGEX.test(versionRaw)) {
      version = versionRaw
    } else {
      const latest = await resolveLatestDatasetVersion(datasetId)
      if (!latest) {
        throw new NotFoundError(`Dataset ${datasetId} not found`)
      }
      version = latest
    }

    const result = await getDatasetWithSeqNo(datasetId, version)
    if (!result) {
      throw new NotFoundError(`Dataset ${datasetId} version ${version} not found`)
    }
    const { doc, seqNo, primaryTerm } = result

    const parentResearch = await getResearchDoc(doc.humId)
    if (!parentResearch || parentResearch.status === "deleted") {
      throw new NotFoundError(`Parent Research ${doc.humId} not found`)
    }

    if (options.requireOwnership && !canModifyResource(authUser, parentResearch)) {
      throw new ForbiddenError("Not authorized to update this dataset")
    }

    if (options.requireParentDraft && parentResearch.status !== "draft") {
      throw new ConflictError(
        `Cannot mutate dataset: parent Research is in '${parentResearch.status}' status, expected 'draft'`,
      )
    }

    c.set("dataset", { ...doc, seqNo, primaryTerm })
    c.set("parentResearch", parentResearch)

    if (authUser && (options.requireOwnership || options.requireAdmin)) {
      c.set("authenticatedUser", authUser)
    }

    await next()
  })
}
