/**
 * Research Workflow Handlers
 *
 * Handlers for status transition operations (submit, approve, reject, unpublish).
 */
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Context } from "hono"

import { ConflictError } from "@/api/errors"
import { validateStatusTransition } from "@/api/es-client/auth"
import { syncResearchRootFromVersion, updateResearchStatus } from "@/api/es-client/research"
import { singleResponse } from "@/api/helpers/response"
import type { EsResearch, ResearchStatus, StatusAction } from "@/api/types"

import {
  submitRoute,
  approveRoute,
  rejectRoute,
  unpublishRoute,
} from "./routes"

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
    const research = c.get("research")
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

    // On approve, sync the Research root content from the newly-published RV
    // so search / listing / public detail all serve the just-approved version.
    // Non-atomic with the status update: if this throws, status has already
    // flipped and the root still holds the previous latestVersion content —
    // safe from a public-visibility standpoint (no draft leak), and the sync
    // can be re-run manually to catch up.
    if (action === "approve" && versionUpdates?.latestVersion) {
      await syncResearchRootFromVersion(humId, versionUpdates.latestVersion)
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
    submitRoute,
    createStatusTransitionHandler("submit", "review"),
  )

  // POST /research/{humId}/approve
  // Middleware: loadResearchAndAuthorize({ requireAdmin: true })
  router.openapi(
    approveRoute,
    createStatusTransitionHandler("approve", "published"),
  )

  // POST /research/{humId}/reject
  // Middleware: loadResearchAndAuthorize({ requireAdmin: true })
  router.openapi(
    rejectRoute,
    createStatusTransitionHandler("reject", "draft"),
  )

  // POST /research/{humId}/unpublish
  // Middleware: loadResearchAndAuthorize({ requireAdmin: true })
  router.openapi(
    unpublishRoute,
    createStatusTransitionHandler("unpublish", "draft"),
  )
}
