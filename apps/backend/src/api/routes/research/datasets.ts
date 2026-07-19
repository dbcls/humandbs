/**
 * Research-Dataset Handlers
 *
 * Handlers for managing datasets linked to a research.
 */
import type { OpenAPIHono } from "@hono/zod-openapi"

import {
  ConflictError,
  InternalError,
  NotFoundError,
} from "@/api/errors"
import {
  createDataset,
  getDatasetWithSeqNo,
  resolveLatestDatasetVersion,
} from "@/api/es-client/dataset"
import { getResearchDetail } from "@/api/es-client/research"
import { getResearchVersion } from "@/api/es-client/research-version"
import {
  createdResponse,
  listResponse,
} from "@/api/helpers/response"
import { createPagination } from "@/api/types/response"

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
    const { humId } = c.req.valid("param")
    const authUser = c.get("authUser")

    const detail = await getResearchDetail(humId, {}, authUser)
    if (!detail) {
      throw NotFoundError.forResource("Research", humId)
    }

    const datasets = detail.datasets ?? []
    // Dataset list has no pagination (returns all datasets for this research)
    const pagination = createPagination(datasets.length, 1, datasets.length || 1)

    return listResponse(c, datasets, pagination)
  })

  // POST /research/{humId}/dataset/new
  // Middleware: loadResearchAndAuthorize({ requireOwnership: true, requireDraftStatus: true })
  router.openapi(createDatasetForResearchRoute, async (c) => {
    const research = c.get("research")
    const { humId } = research
    const body = c.req.valid("json")

    // datasetId is globally unique. Without this guard, an existing id would
    // silently mint a v(N+1) doc via getNextDatasetVersion, and — when the id
    // belongs to another Research — linkDatasetToResearch would attach that new
    // version to the calling Research, breaking the 1:N Research→Dataset link.
    if (body.datasetId !== undefined) {
      const existing = await resolveLatestDatasetVersion(body.datasetId)
      if (existing !== null) {
        throw ConflictError.forDuplicate("Dataset", body.datasetId)
      }
    }

    // Get latest ResearchVersion to determine humVersionId
    const latestVersion = await getResearchVersion(humId, {})
    if (!latestVersion) {
      throw new InternalError(`Research ${humId} has no version`)
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

    // Get dataset with seqNo for the response
    const datasetWithSeqNo = await getDatasetWithSeqNo(dataset.datasetId, dataset.version)
    if (!datasetWithSeqNo) {
      throw new InternalError("Created dataset not found")
    }

    return createdResponse(c, dataset, datasetWithSeqNo.seqNo, datasetWithSeqNo.primaryTerm)
  })
}
