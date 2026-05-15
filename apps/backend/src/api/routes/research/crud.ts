/**
 * Research CRUD Handlers
 *
 * Handlers for create, read, update, delete operations.
 */
import type { OpenAPIHono } from "@hono/zod-openapi"

import { validateRequestedStatus } from "@/api/es-client/auth"
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
} from "@/api/helpers"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/api/routes/errors"
import { createPagination } from "@/api/types/response"
import { EditableResearchStatusSchema } from "@/api/types/workflow"
import { maybeStripRawHtml } from "@/api/utils/strip-raw-html"
import { isOwnerOrAdmin } from "@/api/utils/version"

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

    validateRequestedStatus(authUser, query.status)

    // Convert listing query to search query format
    const result = await searchResearches({
      page: query.page,
      limit: query.limit,
      lang: query.lang,
      sort: query.sort,
      order: query.order,
      status: query.status,
      humId: query.humId,
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
      status: EditableResearchStatusSchema.parse(status),
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

    // Extract lock fields (present for all users, consistent with Dataset)
    const { _seq_no, _primary_term, ...detailData } = detail
    const seqNo = _seq_no ?? 0
    const primaryTerm = _primary_term ?? 1

    // Value-based access control: owner/admin sees actual values, others see sanitized values
    const isOwner = isOwnerOrAdmin(authUser, detailData.uids)
    const responseData = isOwner
      ? detailData
      : {
        ...detailData,
        status: "published" as const,
        uids: [],
        draftVersion: null,
      }

    const strippedDetail = maybeStripRawHtml(responseData, query.includeRawHtml ?? false)

    return singleResponse(c, strippedDetail, seqNo, primaryTerm)
  })

  // PUT /research/{humId}/update
  // Middleware: loadResearchAndAuthorize({ requireOwnership: true, requireDraftStatus: true })
  // — 401 / 403 / 404 / 409 are all surfaced before validators run.
  router.openapi(updateResearchRoute, async (c) => {
    // Research is preloaded by middleware; status === "draft" is guaranteed.
    const research = c.get("research")
    const { humId } = research

    const body = c.req.valid("json")

    const seqNo = body._seq_no
    const primaryTerm = body._primary_term

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
      status: EditableResearchStatusSchema.parse(updatedStatus),
      datasets: [],
    }

    return singleResponse(c, responseData, updatedWithSeqNo.seqNo, updatedWithSeqNo.primaryTerm)
  })

  // POST /research/{humId}/delete
  // Middleware: loadResearchAndAuthorize({ requireAdmin: true })
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
  // Middleware: loadResearchAndAuthorize({ requireAdmin: true })
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
