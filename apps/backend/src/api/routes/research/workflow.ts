/**
 * Research Workflow Handlers
 *
 * Handlers for status transition operations (submit, approve, reject, unpublish).
 */
import type { OpenAPIHono, RouteConfig } from "@hono/zod-openapi"
import type { Context } from "hono"

import { validateStatusTransition } from "@/api/es-client/auth"
import { updateResearchStatus } from "@/api/es-client/research"
import { logger } from "@/api/logger"
import { getRequestId } from "@/api/middleware/request-id"
import {
  conflictResponse,
  serverErrorResponse,
} from "@/api/routes/errors"
import type { EsResearchDoc, ResearchStatus, StatusAction } from "@/api/types"

import {
  submitRoute,
  approveRoute,
  rejectRoute,
  unpublishRoute,
} from "./routes"

/** Research document with optimistic locking fields (set by middleware) */
type ResearchWithSeqNo = EsResearchDoc & { seqNo: number; primaryTerm: number }

/**
 * Create a status transition handler
 *
 * This factory function reduces duplication across workflow handlers.
 */
function createStatusTransitionHandler(
  action: StatusAction,
  targetStatus: ResearchStatus,
  logMessage: string,
) {
  return async (c: Context) => {
    try {
      // Research is preloaded by middleware
      const research = c.get("research") as ResearchWithSeqNo
      const { humId, seqNo, primaryTerm, status } = research

      // Validate transition
      const validationError = validateStatusTransition(status, action)
      if (validationError) {
        return conflictResponse(c, validationError)
      }

      // Update status
      const updated = await updateResearchStatus(humId, targetStatus, seqNo, primaryTerm)
      if (!updated) {
        return conflictResponse(c)
      }

      return c.json({
        humId,
        status: targetStatus,
        dateModified: updated.dateModified,
        _seq_no: updated.seqNo,
        _primary_term: updated.primaryTerm,
      }, 200)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error(logMessage, { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
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
    createStatusTransitionHandler("submit", "review", "Error submitting research"),
  )

  // POST /research/{humId}/approve
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(
    approveRoute as RouteConfig,
    createStatusTransitionHandler("approve", "published", "Error approving research"),
  )

  // POST /research/{humId}/reject
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(
    rejectRoute as RouteConfig,
    createStatusTransitionHandler("reject", "draft", "Error rejecting research"),
  )

  // POST /research/{humId}/unpublish
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(
    unpublishRoute as RouteConfig,
    createStatusTransitionHandler("unpublish", "draft", "Error unpublishing research"),
  )
}
