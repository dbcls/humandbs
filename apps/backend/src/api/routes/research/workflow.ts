/**
 * Research Workflow Handlers
 *
 * Handlers for status transition operations (submit, approve, reject, unpublish).
 */
import type { OpenAPIHono, RouteConfig } from "@hono/zod-openapi"
import type { Context } from "hono"

import { validateStatusTransition } from "@/api/es-client/auth"
import { updateResearchStatus } from "@/api/es-client/research"
import { singleResponse } from "@/api/helpers/response"
import { ConflictError } from "@/api/routes/errors"
import type { EsResearch, ResearchStatus, StatusAction } from "@/api/types"

import {
  submitRoute,
  approveRoute,
  rejectRoute,
  unpublishRoute,
} from "./routes"

/** Research document with optimistic locking fields (set by middleware) */
type ResearchWithSeqNo = EsResearch & { seqNo: number; primaryTerm: number }

/**
 * Compute version updates (latestVersion/draftVersion) for a status transition
 */
export const computeVersionUpdates = (
  action: StatusAction,
  research: EsResearch,
): { latestVersion?: string | null; draftVersion?: string | null; datePublished?: string | null } | undefined => {
  switch (action) {
    case "approve": {
      if (!research.draftVersion) {
        throw new Error("Cannot approve: draftVersion is null")
      }
      const updates: { latestVersion: string; draftVersion: null; datePublished?: string } = {
        latestVersion: research.draftVersion,
        draftVersion: null,
      }
      if (!research.datePublished) {
        updates.datePublished = new Date().toISOString().split("T")[0]
      }

      return updates
    }
    case "unpublish":
      if (!research.latestVersion) {
        throw new Error("Cannot unpublish: latestVersion is null")
      }

      return { latestVersion: null, draftVersion: research.latestVersion }
    default:
      // submit, reject: no version changes
      return undefined
  }
}

/**
 * Create a status transition handler
 *
 * This factory function reduces duplication across workflow handlers.
 */
const createStatusTransitionHandler = (
  action: StatusAction,
  targetStatus: ResearchStatus,
) => {
  return async (c: Context) => {
    // Research is preloaded by middleware
    const research = c.get("research") as ResearchWithSeqNo
    const { humId, seqNo, primaryTerm, status } = research

    // Validate transition
    const validationError = validateStatusTransition(status, action)
    if (validationError) {
      throw new ConflictError(validationError)
    }

    // Compute version updates for this action
    const versionUpdates = computeVersionUpdates(action, research)

    // Update status (and optionally latestVersion/draftVersion)
    const updated = await updateResearchStatus(humId, targetStatus, seqNo, primaryTerm, versionUpdates)
    if (!updated) {
      throw new ConflictError()
    }

    const responseData = {
      humId,
      status: targetStatus,
      dateModified: updated.dateModified,
    }

    return singleResponse(c, responseData, updated.seqNo, updated.primaryTerm)
  }
}

/**
 * Register workflow handlers on the router
 */
export function registerWorkflowHandlers(router: OpenAPIHono): void {
  // POST /research/{humId}/submit
  // Middleware: loadResearchAndAuthorize({ requireOwnership: true })
  router.openapi(
    submitRoute as RouteConfig,
    createStatusTransitionHandler("submit", "review"),
  )

  // POST /research/{humId}/approve
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(
    approveRoute as RouteConfig,
    createStatusTransitionHandler("approve", "published"),
  )

  // POST /research/{humId}/reject
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(
    rejectRoute as RouteConfig,
    createStatusTransitionHandler("reject", "draft"),
  )

  // POST /research/{humId}/unpublish
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(
    unpublishRoute as RouteConfig,
    createStatusTransitionHandler("unpublish", "draft"),
  )
}
