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
  getResearchWithSeqNo,
  updateResearch,
  updateResearchUids,
} from "@/api/es-client/research"
import { searchResearches } from "@/api/es-client/search"
import {
  createdResponse,
  searchResponse,
  singleResponse,
} from "@/api/helpers/response"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/api/routes/errors"
import { createPagination } from "@/api/types/response"
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
    const query = c.req.valid("query")
    const authUser = c.get("authUser")

    // Validate status filter permissions per api-spec.md
    if (query.status) {
      // public: can only request "published"
      if (!authUser && query.status !== "published") {
        throw new ForbiddenError("Public users can only access published resources")
      }
      // authenticated (non-admin): can request "draft", "review", "published" (own resources only)
      // "deleted" is admin-only
      if (authUser && !authUser.isAdmin && query.status === "deleted") {
        throw new ForbiddenError("Only admin can access deleted resources")
      }
    }

    // Convert listing query to search query format
    const result = await searchResearches({
      page: query.page,
      limit: query.limit,
      lang: query.lang,
      sort: query.sort,
      order: query.order,
      status: query.status,
      includeFacets: query.includeFacets,
      includeRawHtml: query.includeRawHtml,
    }, authUser)

    const strippedData = maybeStripRawHtml(result.data, query.includeRawHtml ?? false)
    const pagination = createPagination(result.pagination.total, result.pagination.page, result.pagination.limit)

    return searchResponse(c, strippedData, pagination, result.facets)
  })

  // POST /research/new (admin only - admin creates research and assigns researcherUids)
  router.openapi(createResearchRoute, async (c) => {
    const authUser = c.get("authUser")
    if (!authUser) {
      throw new UnauthorizedError()
    }
    if (!authUser.isAdmin) {
      throw new ForbiddenError("Admin access required")
    }

    const body = c.req.valid("json")

    const createResult = await createResearch({
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

    // Get the created research with seqNo for the response
    const researchWithSeqNo = await getResearchWithSeqNo(createResult.research.humId)
    if (!researchWithSeqNo) {
      throw new NotFoundError("Created research not found")
    }

    const { status, ...rest } = createResult.research
    const responseData = {
      ...rest,
      status: status as "draft" | "review" | "published",
      datasets: [],
    }

    return createdResponse(c, responseData, researchWithSeqNo.seqNo, researchWithSeqNo.primaryTerm)
  })

  // GET /research/{humId}
  router.openapi(getResearchRoute, async (c) => {
    const { humId } = c.req.valid("param")
    const query = c.req.valid("query")
    const authUser = c.get("authUser")

    const detail = await getResearchDetail(humId, { version: query.version ?? undefined }, authUser)
    if (!detail) {
      throw NotFoundError.forResource("Research", humId)
    }

    // Extract seqNo and primaryTerm from detail
    const { _seq_no, _primary_term, ...detailData } = detail
    const strippedDetail = maybeStripRawHtml(detailData, query.includeRawHtml ?? false)

    // _seq_no and _primary_term should always be present from ES
    // Use 0/1 as fallback for type safety (should never happen in practice)
    const seqNo = _seq_no ?? 0
    const primaryTerm = _primary_term ?? 1

    return singleResponse(c, strippedDetail, seqNo, primaryTerm)
  })

  // PUT /research/{humId}/update
  // Middleware: loadResearchAndAuthorize({ requireOwnership: true })
  router.openapi(updateResearchRoute, async (c) => {
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
      throw new ConflictError()
    }

    // Get updated seqNo/primaryTerm
    const updatedWithSeqNo = await getResearchWithSeqNo(humId)
    if (!updatedWithSeqNo) {
      throw new NotFoundError("Updated research not found")
    }

    const { status: updatedStatus, ...restUpdated } = updated
    const responseData = {
      ...restUpdated,
      status: updatedStatus as "draft" | "review" | "published",
      datasets: [],
    }

    return singleResponse(c, responseData, updatedWithSeqNo.seqNo, updatedWithSeqNo.primaryTerm)
  })

  // POST /research/{humId}/delete
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(deleteResearchRoute, async (c) => {
    // Research is preloaded by middleware with admin check
    const research = c.get("research")
    const { humId, seqNo, primaryTerm } = research

    const deleted = await deleteResearch(humId, seqNo, primaryTerm)
    if (!deleted) {
      throw new ConflictError()
    }

    return c.body(null, 204)
  })

  // PUT /research/{humId}/uids
  // Middleware: loadResearchAndAuthorize({ adminOnly: true })
  router.openapi(updateUidsRoute, async (c) => {
    // Research is preloaded by middleware with admin check
    const research = c.get("research")
    const { humId } = research

    const body = c.req.valid("json")

    // Use optimistic lock values from request body
    const updatedUids = await updateResearchUids(humId, body.uids, body._seq_no, body._primary_term)
    if (!updatedUids) {
      throw new ConflictError()
    }

    // Get updated seqNo/primaryTerm
    const updatedWithSeqNo = await getResearchWithSeqNo(humId)
    if (!updatedWithSeqNo) {
      throw new NotFoundError("Updated research not found")
    }

    const responseData = {
      humId,
      uids: updatedUids,
    }

    return singleResponse(c, responseData, updatedWithSeqNo.seqNo, updatedWithSeqNo.primaryTerm)
  })
}
