/**
 * Research CRUD Handlers
 *
 * Handlers for create, read, update, delete operations.
 */
import type { OpenAPIHono } from "@hono/zod-openapi"

import {
  createResearch,
  deleteResearch,
  getResearchDetail,
  updateResearch,
  updateResearchUids,
} from "@/api/es-client/research"
import { searchResearches } from "@/api/es-client/search"
import { logger } from "@/api/logger"
import { getRequestId } from "@/api/middleware/request-id"
import {
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/api/routes/errors"
import { maybeStripRawHtml } from "@/api/utils/strip-raw-html"

import {
  listResearchRoute,
  createResearchRoute,
  getResearchRoute,
  updateResearchRoute,
  deleteResearchRoute,
  updateUidsRoute,
} from "./routes"

/**
 * Register CRUD handlers on the router
 */
export function registerCrudHandlers(router: OpenAPIHono): void {
  // GET /research
  router.openapi(listResearchRoute, async (c) => {
    try {
      const query = c.req.valid("query")
      const authUser = c.get("authUser")

      // Validate status filter permissions per api-spec.md
      if (query.status) {
        // public: can only request "published"
        if (!authUser && query.status !== "published") {
          return forbiddenResponse(c, "Public users can only access published resources")
        }
        // authenticated (non-admin): can request "draft", "review", "published" (own resources only)
        // "deleted" is admin-only
        if (authUser && !authUser.isAdmin && query.status === "deleted") {
          return forbiddenResponse(c, "Only admin can access deleted resources")
        }
      }

      // Convert listing query to search query format
      const researches = await searchResearches({
        page: query.page,
        limit: query.limit,
        lang: query.lang,
        sort: query.sort,
        order: query.order,
        status: query.status,
        includeFacets: query.includeFacets,
        includeRawHtml: query.includeRawHtml,
      }, authUser)
      return c.json(maybeStripRawHtml(researches, query.includeRawHtml ?? false), 200)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error fetching research list", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })

  // POST /research/new (admin only - admin creates research and assigns researcherUids)
  router.openapi(createResearchRoute, async (c) => {
    const authUser = c.get("authUser")
    if (!authUser) {
      return unauthorizedResponse(c)
    }
    if (!authUser.isAdmin) {
      return forbiddenResponse(c, "Admin access required")
    }
    try {
      const body = c.req.valid("json")

      const result = await createResearch({
        humId: body.humId,
        title: body.title,
        summary: body.summary,
        dataProvider: body.dataProvider,
        researchProject: body.researchProject,
        grant: body.grant,
        relatedPublication: body.relatedPublication,
        uids: body.uids,
        initialReleaseNote: body.initialReleaseNote,
      })

      // Return the created research with status
      const { status, ...rest } = result.research
      return c.json({
        ...rest,
        status: status as "draft" | "review" | "published",
        datasets: [],
      }, 201)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error creating research", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })

  // GET /research/{humId}
  router.openapi(getResearchRoute, async (c) => {
    try {
      const { humId } = c.req.valid("param")
      const query = c.req.valid("query")
      const authUser = c.get("authUser")
      const detail = await getResearchDetail(humId, { version: query.version ?? undefined }, authUser)
      if (!detail) return notFoundResponse(c, `Research with humId ${humId} not found`)
      return c.json(maybeStripRawHtml(detail, query.includeRawHtml ?? false), 200)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error fetching research detail", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })

  // PUT /research/{humId}/update
  // Middleware: loadResearchAndAuthorize({ requireOwnership: true })
  router.openapi(updateResearchRoute, async (c) => {
    try {
      // Research is preloaded by middleware with auth/ownership checks
      const research = c.get("research")
      const { humId } = research

      const body = c.req.valid("json")

      // Use optimistic lock values from request body (per api-spec.md)
      // If not provided, fall back to values from middleware for backwards compatibility
      const seqNo = body._seq_no ?? research.seqNo
      const primaryTerm = body._primary_term ?? research.primaryTerm

      const updated = await updateResearch(humId, {
        title: body.title,
        summary: body.summary,
        dataProvider: body.dataProvider,
        researchProject: body.researchProject,
        grant: body.grant,
        relatedPublication: body.relatedPublication,
        controlledAccessUser: body.controlledAccessUser,
      }, seqNo, primaryTerm)

      if (!updated) {
        return conflictResponse(c)
      }

      const { status: updatedStatus, ...restUpdated } = updated
      return c.json({
        ...restUpdated,
        status: updatedStatus as "draft" | "review" | "published",
        datasets: [],
      }, 200)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error updating research", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })

  // POST /research/{humId}/delete
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(deleteResearchRoute, async (c) => {
    try {
      // Research is preloaded by middleware with admin check
      const research = c.get("research")
      const { humId, seqNo, primaryTerm } = research

      const deleted = await deleteResearch(humId, seqNo, primaryTerm)
      if (!deleted) {
        return conflictResponse(c)
      }

      return c.body(null, 204)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error deleting research", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })

  // PUT /research/{humId}/uids
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(updateUidsRoute, async (c) => {
    try {
      // Research is preloaded by middleware with admin check
      const research = c.get("research")
      const { humId } = research

      const body = c.req.valid("json")

      // Use optimistic lock values from request body
      const updatedUids = await updateResearchUids(humId, body.uids, body._seq_no, body._primary_term)
      if (!updatedUids) {
        return conflictResponse(c)
      }

      return c.json({
        humId,
        uids: updatedUids,
      }, 200)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error updating research uids", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })
}
