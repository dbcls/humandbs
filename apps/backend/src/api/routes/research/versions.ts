/**
 * Research Version Handlers
 *
 * Handlers for version-related operations.
 */
import type { OpenAPIHono } from "@hono/zod-openapi"

import { getResearchDetail } from "@/api/es-client/research"
import {
  createResearchVersion,
  listResearchVersionsSorted,
} from "@/api/es-client/research-version"
import { logger } from "@/api/logger"
import { getRequestId } from "@/api/middleware/request-id"
import {
  conflictResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/api/routes/errors"

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
    try {
      const { humId } = c.req.valid("param")
      const authUser = c.get("authUser")
      const versions = await listResearchVersionsSorted(humId, authUser)
      if (versions === null) return notFoundResponse(c, `Research with humId ${humId} not found`)
      return c.json({ data: versions }, 200)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error fetching research versions", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })

  // GET /research/{humId}/versions/{version}
  router.openapi(getVersionRoute, async (c) => {
    try {
      const { humId, version } = c.req.valid("param")
      const authUser = c.get("authUser")

      // Use getResearchDetail with specific version
      const detail = await getResearchDetail(humId, { version }, authUser)
      if (!detail) return notFoundResponse(c, `Research version ${humId}/${version} not found`)

      // Return version-specific response
      return c.json({
        humId: detail.humId,
        humVersionId: detail.humVersionId,
        version: detail.version,
        versionReleaseDate: detail.versionReleaseDate,
        releaseNote: detail.releaseNote,
        datasets: detail.datasets,
      }, 200)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error fetching version", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })

  // POST /research/{humId}/versions/new
  // Middleware: loadResearchAndAuthorize({ requireOwnership: true })
  router.openapi(createVersionRoute, async (c) => {
    try {
      // Research is preloaded by middleware with auth/ownership checks
      const research = c.get("research")!
      const { humId, seqNo, primaryTerm } = research

      const body = await c.req.json()

      const newVersion = await createResearchVersion(
        humId,
        body.releaseNote ?? { ja: null, en: null },
        undefined, // datasets are auto-copied from previous version
        seqNo,
        primaryTerm,
      )

      if (!newVersion) {
        return conflictResponse(c)
      }

      return c.json({
        humId: newVersion.humId,
        humVersionId: newVersion.humVersionId,
        version: newVersion.version,
        versionReleaseDate: newVersion.versionReleaseDate,
        releaseNote: newVersion.releaseNote,
        datasets: [], // Empty initially, datasets can be linked later
      }, 201)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error creating version", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })
}
