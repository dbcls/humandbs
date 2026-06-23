/**
 * Research CRUD Handlers
 *
 * Handlers for create, read, update, delete operations.
 */
import type { OpenAPIHono } from "@hono/zod-openapi"

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/api/errors"
import { checkRequestedStatus } from "@/api/es-client/auth"
import {
  createResearch,
  deleteResearch,
  getResearchDetail,
  getResearchWithSeqNo,
  updateResearch,
  updateResearchUids,
} from "@/api/es-client/research"
import { getResearchVersionWithSeqNo, updateResearchVersionReleaseNote } from "@/api/es-client/research-version"
import { searchResearches } from "@/api/es-client/search"
import { uniq } from "@/api/es-client/utils"
import {
  batchResponse,
  createdResponse,
  searchResponse,
  singleResponse,
} from "@/api/helpers"
import { getAuthenticatedUser } from "@/api/middleware/auth"
import { ResearchStatusSchema } from "@/api/types"
import type { ResearchDetail } from "@/api/types"
import { createPagination } from "@/api/types/response"
import { maybeStripRawHtml } from "@/api/utils/strip-raw-html"
import { sanitizeResearchDetailForUser } from "@/api/utils/version"

import {
  listResearchRoute,
  batchGetResearchRoute,
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

    const statusCheck = checkRequestedStatus(authUser, query.status)
    if (!statusCheck.allowed) throw new ForbiddenError(statusCheck.message)

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

    // searchResearches returns ResearchSummary[] which has no rawHtml fields;
    // strip is reserved for the detail endpoint (crud.ts:140).
    const pagination = createPagination(result.pagination.total, result.pagination.page, result.pagination.limit)

    return searchResponse(c, result.data, pagination, result.facets)
  })

  // GET /research/batch
  // Registered before GET /research/{humId} so "batch" is matched as a static
  // path, not captured by the dynamic {humId} segment.
  router.openapi(batchGetResearchRoute, async (c) => {
    const { ids, includeRawHtml } = c.req.valid("query")
    const authUser = c.get("authUser")

    const uniqIds = uniq(ids)
    // getResearchDetail applies per-ID authorization and version resolution,
    // returning null for absent or inaccessible Research (existence is hidden).
    const details = await Promise.all(uniqIds.map((id) => getResearchDetail(id, {}, authUser)))

    const data: ResearchDetail[] = []
    const notFound: string[] = []
    uniqIds.forEach((id, i) => {
      const detail = details[i]
      if (!detail) {
        notFound.push(id)
        return
      }
      // Match the detail endpoint: value-based masking, then strip rawHtml.
      const sanitized = sanitizeResearchDetailForUser(detail, authUser)
      data.push(maybeStripRawHtml(sanitized, includeRawHtml))
    })

    return batchResponse(c, data, {
      requested: uniqIds.length,
      found: data.length,
      notFound,
    })
  })

  // POST /research/new
  // Middleware: requireAuth + requireAdmin (registered in routes/research/index.ts).
  router.openapi(createResearchRoute, async (c) => {
    getAuthenticatedUser(c) // assert middleware ran; admin already enforced

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
    })

    // Get the created research with seqNo for the response
    const researchWithSeqNo = await getResearchWithSeqNo(createResult.research.humId)
    if (!researchWithSeqNo) {
      throw new NotFoundError("Created research not found")
    }

    const { status, ...rest } = createResult.research
    const responseData = {
      ...rest,
      status: ResearchStatusSchema.parse(status),
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

    // Fetch lock fields separately (Dataset detail pattern, architecture.md § detail レスポンスの meta)
    const lock = await getResearchWithSeqNo(humId)
    const seqNo = lock?.seqNo ?? 0
    const primaryTerm = lock?.primaryTerm ?? 1

    // Value-based access control: owner/admin sees actual values, others see sanitized values
    const responseData = sanitizeResearchDetailForUser(detail, authUser)

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
    }, seqNo, primaryTerm)

    if (!updated) {
      throw new ConflictError()
    }

    if (body.releaseNote !== undefined && research.draftVersion) {
      const draftVersionId = `${humId}-${research.draftVersion}`
      const versionWithSeq = await getResearchVersionWithSeqNo(draftVersionId)
      if (versionWithSeq) {
        const ok = await updateResearchVersionReleaseNote(
          draftVersionId, body.releaseNote, versionWithSeq.seqNo, versionWithSeq.primaryTerm,
        )
        if (!ok) {
          throw new ConflictError()
        }
      }
    }

    // Get updated seqNo/primaryTerm
    const updatedWithSeqNo = await getResearchWithSeqNo(humId)
    if (!updatedWithSeqNo) {
      throw new NotFoundError("Updated research not found")
    }

    const { status: updatedStatus, ...restUpdated } = updated
    const responseData = {
      ...restUpdated,
      status: ResearchStatusSchema.parse(updatedStatus),
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
