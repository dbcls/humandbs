/**
 * Research Version Handlers
 *
 * Handlers for version-related operations.
 */
import type { OpenAPIHono } from "@hono/zod-openapi"

import { getResearchDetail, getResearchWithSeqNo } from "@/api/es-client/research"
import {
  createResearchVersion,
  listResearchVersionsSorted,
} from "@/api/es-client/research-version"
import {
  createdResponse,
  listResponse,
  singleReadOnlyResponse,
} from "@/api/helpers/response"
import { ConflictError, NotFoundError } from "@/api/routes/errors"
import { createPagination } from "@/api/types/response"

import {
  listVersionsRoute,
  getVersionRoute,
  createVersionRoute,
} from "./routes"

/**
 * Register version handlers on the router
 */
export function registerVersionHandlers(router: OpenAPIHono): void {
  // GET /research/{humId}/versions
  router.openapi(listVersionsRoute, async (c) => {
    const { humId } = c.req.valid("param")
    const authUser = c.get("authUser")

    const versions = await listResearchVersionsSorted(humId, authUser)
    if (versions === null) {
      throw NotFoundError.forResource("Research", humId)
    }

    // Versions list has no pagination (returns all versions)
    const pagination = createPagination(versions.length, 1, versions.length || 1)

    return listResponse(c, versions, pagination)
  })

  // GET /research/{humId}/versions/{version}
  router.openapi(getVersionRoute, async (c) => {
    const { humId, version } = c.req.valid("param")
    const authUser = c.get("authUser")

    // Use getResearchDetail with specific version
    const detail = await getResearchDetail(humId, { version }, authUser)
    if (!detail) {
      throw new NotFoundError(`Research version ${humId}/${version} not found`)
    }

    // Return version-specific response (read-only - historical versions cannot be edited)
    const responseData = {
      humId: detail.humId,
      humVersionId: detail.humVersionId,
      version: detail.version,
      versionReleaseDate: detail.versionReleaseDate,
      releaseNote: detail.releaseNote,
      datasets: detail.datasets,
    }

    return singleReadOnlyResponse(c, responseData)
  })

  // POST /research/{humId}/versions/new
  // Middleware: loadResearchAndAuthorize({ requireOwnership: true })
  router.openapi(createVersionRoute, async (c) => {
    // Research is preloaded by middleware with auth/ownership checks
    const research = c.get("research")
    const { humId, seqNo, primaryTerm } = research

    const body = c.req.valid("json")

    const newVersion = await createResearchVersion(
      humId,
      body.releaseNote ?? { ja: null, en: null },
      undefined, // datasets are auto-copied from previous version
      seqNo,
      primaryTerm,
    )

    if (!newVersion) {
      throw new ConflictError()
    }

    // Get updated seqNo/primaryTerm for the response
    const updatedResearch = await getResearchWithSeqNo(humId)
    if (!updatedResearch) {
      throw new NotFoundError("Research not found after version creation")
    }

    const responseData = {
      humId: newVersion.humId,
      humVersionId: newVersion.humVersionId,
      version: newVersion.version,
      versionReleaseDate: newVersion.versionReleaseDate,
      releaseNote: newVersion.releaseNote,
      datasets: [], // Empty initially, datasets can be linked later
    }

    return createdResponse(c, responseData, updatedResearch.seqNo, updatedResearch.primaryTerm)
  })
}
