/**
 * Research-Dataset Handlers
 *
 * Handlers for managing datasets linked to a research.
 */
import type { OpenAPIHono } from "@hono/zod-openapi"

import { canAccessResearchDoc } from "@/api/es-client/auth"
import { createDataset } from "@/api/es-client/dataset"
import {
  getResearchDetail,
  getResearchDoc,
} from "@/api/es-client/research"
import { getResearchVersion } from "@/api/es-client/research-version"
import { logger } from "@/api/logger"
import { getRequestId } from "@/api/middleware/request-id"
import {
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/api/routes/errors"

import {
  listLinkedDatasetsRoute,
  createDatasetForResearchRoute,
} from "./routes"

/**
 * Register dataset handlers on the router
 */
export function registerDatasetHandlers(router: OpenAPIHono): void {
  // GET /research/{humId}/dataset
  router.openapi(listLinkedDatasetsRoute, async (c) => {
    try {
      const { humId } = c.req.valid("param")
      const authUser = c.get("authUser")

      const detail = await getResearchDetail(humId, {}, authUser)
      if (!detail) return notFoundResponse(c, `Research with humId ${humId} not found`)

      return c.json({ data: detail.datasets ?? [] }, 200)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error fetching linked datasets", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })

  // POST /research/{humId}/dataset/new
  router.openapi(createDatasetForResearchRoute, async (c) => {
    const authUser = c.get("authUser")
    if (!authUser) {
      return unauthorizedResponse(c)
    }
    try {
      const { humId } = c.req.valid("param")
      const body = c.req.valid("json")

      // Get research to check permissions and status
      const research = await getResearchDoc(humId)
      if (!research) {
        return notFoundResponse(c, `Research ${humId} not found`)
      }

      // Deleted research is not accessible
      if (research.status === "deleted") {
        return notFoundResponse(c, `Research ${humId} not found`)
      }

      // Check permission (owner or admin can create datasets)
      if (!canAccessResearchDoc(authUser, research)) {
        return forbiddenResponse(c, "Not authorized to create datasets for this research")
      }

      // Check that Research is in draft status
      if (research.status !== "draft") {
        return forbiddenResponse(c, "Cannot create dataset: parent Research is not in draft status")
      }

      // Get latest ResearchVersion to determine humVersionId
      const latestVersion = await getResearchVersion(humId, {})
      if (!latestVersion) {
        return serverErrorResponse(c, `Research ${humId} has no version`)
      }

      // Create dataset with defaults for optional fields
      const dataset = await createDataset({
        datasetId: body.datasetId,
        humId,
        humVersionId: latestVersion.humVersionId,
        releaseDate: body.releaseDate ?? new Date().toISOString().split("T")[0],
        criteria: body.criteria ?? "Controlled-access (Type I)",
        typeOfData: body.typeOfData ?? { ja: null, en: null },
        experiments: body.experiments ?? [],
      })

      return c.json(dataset, 201)
    } catch (error) {
      const requestId = getRequestId(c)
      logger.error("Error creating dataset for research", { requestId, error: String(error) })
      return serverErrorResponse(c, error)
    }
  })
}
