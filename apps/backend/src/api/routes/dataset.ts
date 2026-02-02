/**
 * Dataset API Routes
 *
 * Handles CRUD operations and versioning for Dataset resources.
 * Dataset visibility is determined by linked Research status.
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import {
  canAccessResearchDoc,
  deleteDataset,
  getDataset,
  getDatasetWithSeqNo,
  getResearchByDatasetId,
  getResearchDoc,
  listDatasetVersions,
  searchDatasets,
  updateDataset,
} from "@/api/es-client"
import { canDeleteResource, optionalAuth } from "@/api/middleware/auth"
import { ErrorSpec401, ErrorSpec403, ErrorSpec404, ErrorSpec409, ErrorSpec500 } from "@/api/routes/errors"
import {
  DatasetIdParamsSchema,
  DatasetListingQuerySchema,
  DatasetSearchResponseSchema,
  DatasetVersionParamsSchema,
  DatasetVersionsResponseSchema,
  DatasetWithMetadataSchema,
  EsDatasetDocSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  LinkedResearchesResponseSchema,
  UpdateDatasetRequestSchema,
} from "@/api/types"
import type { DatasetIdParams, DatasetListingQuery, DatasetVersionParams, LangVersionQuery } from "@/api/types"
import { addMergedSearchable } from "@/api/utils/merge-searchable"
import { maybeStripRawHtml } from "@/api/utils/strip-raw-html"

// === Route Definitions ===

const listDatasetsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Dataset"],
  summary: "List Datasets",
  description: "Get a paginated list of datasets. Only datasets linked to published research are visible to public. For complex searches with filters, use POST /dataset/search instead.",
  request: {
    query: DatasetListingQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetSearchResponseSchema } },
      description: "List of datasets with optional facets",
    },
    500: ErrorSpec500,
  },
})

const getDatasetRoute = createRoute({
  method: "get",
  path: "/{datasetId}",
  tags: ["Dataset"],
  summary: "Get Dataset Detail",
  description: "Get detailed information about a specific dataset",
  request: {
    params: DatasetIdParamsSchema,
    query: LangVersionQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: EsDatasetDocSchema } },
      description: "Dataset detail",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const updateDatasetRoute = createRoute({
  method: "put",
  path: "/{datasetId}/update",
  tags: ["Dataset"],
  summary: "Update Dataset",
  description: "Fully update a dataset. Requires owner or admin.",
  request: {
    params: DatasetIdParamsSchema,
    body: { content: { "application/json": { schema: UpdateDatasetRequestSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetWithMetadataSchema } },
      description: "Dataset updated successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

const deleteDatasetRoute = createRoute({
  method: "post",
  path: "/{datasetId}/delete",
  tags: ["Dataset"],
  summary: "Delete Dataset",
  description: "Delete a dataset. Requires admin role.",
  request: {
    params: DatasetIdParamsSchema,
  },
  responses: {
    204: { description: "Dataset deleted successfully" },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listVersionsRoute = createRoute({
  method: "get",
  path: "/{datasetId}/versions",
  tags: ["Dataset Versions"],
  summary: "List Dataset Versions",
  description: "List all versions of a dataset",
  request: {
    params: DatasetIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetVersionsResponseSchema } },
      description: "List of versions",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const getVersionRoute = createRoute({
  method: "get",
  path: "/{datasetId}/versions/{version}",
  tags: ["Dataset Versions"],
  summary: "Get Specific Version",
  description: "Get a specific version of a dataset",
  request: {
    params: DatasetVersionParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: EsDatasetDocSchema } },
      description: "Version detail",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listLinkedResearchesRoute = createRoute({
  method: "get",
  path: "/{datasetId}/research",
  tags: ["Dataset"],
  summary: "List Linked Researches",
  description: "List all researches that link to this dataset",
  request: {
    params: DatasetIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: LinkedResearchesResponseSchema } },
      description: "List of linked researches",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

// === Router ===

export const datasetRouter = new OpenAPIHono()

datasetRouter.use("*", optionalAuth)

// GET /dataset
datasetRouter.openapi(listDatasetsRoute, async (c) => {
  try {
    const query = c.req.query() as unknown as DatasetListingQuery
    const authUser = c.get("authUser")
    // Convert listing query to search query format
    const datasetsData = await searchDatasets({
      page: query.page,
      limit: query.limit,
      lang: query.lang,
      sort: query.sort,
      order: query.order,
      humId: query.humId,
      includeFacets: query.includeFacets,
      includeRawHtml: query.includeRawHtml,
    }, authUser)
    return c.json(maybeStripRawHtml(datasetsData, query.includeRawHtml ?? false), 200)
  } catch (error) {
    console.error("Error fetching datasets:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /dataset/{datasetId}
datasetRouter.openapi(getDatasetRoute, async (c) => {
  try {
    const { datasetId } = c.req.param() as unknown as DatasetIdParams
    const query = c.req.query() as unknown as LangVersionQuery
    const authUser = c.get("authUser")
    const dataset = await getDataset(datasetId, { version: query.version ?? undefined }, authUser)
    if (dataset === null) return c.json({ error: `Dataset with datasetId ${datasetId} not found` }, 404)
    // Add mergedSearchable for convenience (aggregates all experiment searchable fields)
    // Note: This extends the response beyond the OpenAPI schema
    const datasetWithMerged = addMergedSearchable(dataset as Parameters<typeof addMergedSearchable>[0])
    return c.json(maybeStripRawHtml(datasetWithMerged, query.includeRawHtml ?? false) as unknown as typeof dataset, 200)
  } catch (error) {
    console.error("Error fetching dataset detail:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// PUT /dataset/{datasetId}/update
datasetRouter.openapi(updateDatasetRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  try {
    const { datasetId } = c.req.param() as unknown as DatasetIdParams
    const query = c.req.query() as unknown as LangVersionQuery
    const version = query.version ?? "v1"

    // Get dataset with sequence number for optimistic locking
    const result = await getDatasetWithSeqNo(datasetId, version)
    if (!result) {
      return c.json({ error: `Dataset ${datasetId} version ${version} not found` }, 404)
    }

    const { doc, seqNo, primaryTerm } = result

    // Check if user has access to parent Research
    const research = await getResearchDoc(doc.humId)
    if (!research) {
      return c.json({ error: `Parent Research ${doc.humId} not found` }, 404)
    }

    // Deleted research is not accessible
    if (research.status === "deleted") {
      return c.json({ error: `Parent Research ${doc.humId} not found` }, 404)
    }

    // Check permission (owner or admin can update)
    if (!canAccessResearchDoc(authUser, research)) {
      return c.json({ error: "Forbidden", message: "Not authorized to update this dataset" }, 403)
    }

    // D1: Check that parent Research is in draft status
    if (research.status !== "draft") {
      return c.json({ error: "Forbidden", message: "Cannot update dataset: parent Research is not in draft status" }, 403)
    }

    const body = await c.req.json()

    const updated = await updateDataset(datasetId, version, {
      releaseDate: body.releaseDate,
      criteria: body.criteria,
      typeOfData: body.typeOfData,
      experiments: body.experiments,
      humId: body.humId,
      humVersionId: body.humVersionId,
    }, seqNo, primaryTerm)

    if (!updated) {
      return c.json({ error: "Conflict", message: "Resource was modified by another request" }, 409)
    }

    return c.json({
      ...updated,
      updatedAt: new Date().toISOString(),
    }, 200)
  } catch (error) {
    console.error("Error updating dataset:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /dataset/{datasetId}/delete
datasetRouter.openapi(deleteDatasetRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  if (!canDeleteResource(authUser)) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }
  try {
    const { datasetId } = c.req.param() as unknown as DatasetIdParams
    const query = c.req.query() as unknown as LangVersionQuery
    const version = query.version ?? undefined // If undefined, deletes all versions

    // Check if dataset exists
    const dataset = await getDataset(datasetId, { version })
    if (!dataset) {
      // Already deleted or doesn't exist - idempotent success
      return c.body(null, 204)
    }

    // D2: Check that parent Research is in draft status
    const research = await getResearchDoc(dataset.humId)
    if (!research) {
      return c.json({ error: `Parent Research ${dataset.humId} not found` }, 404)
    }
    if (research.status === "deleted") {
      return c.json({ error: `Parent Research ${dataset.humId} not found` }, 404)
    }
    if (research.status !== "draft") {
      return c.json({ error: "Forbidden", message: "Cannot delete dataset: parent Research is not in draft status" }, 403)
    }

    await deleteDataset(datasetId, version)

    return c.body(null, 204)
  } catch (error) {
    console.error("Error deleting dataset:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /dataset/{datasetId}/versions
datasetRouter.openapi(listVersionsRoute, async (c) => {
  try {
    const { datasetId } = c.req.param() as unknown as DatasetIdParams
    const authUser = c.get("authUser")
    const versions = await listDatasetVersions(datasetId, authUser)
    if (versions === null) return c.json({ error: `Dataset with datasetId ${datasetId} not found` }, 404)
    return c.json({ data: versions }, 200)
  } catch (error) {
    console.error("Error fetching dataset versions:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /dataset/{datasetId}/versions/{version}
datasetRouter.openapi(getVersionRoute, async (c) => {
  try {
    const { datasetId, version } = c.req.param() as unknown as DatasetVersionParams
    const authUser = c.get("authUser")
    const dataset = await getDataset(datasetId, { version }, authUser)
    if (dataset === null) return c.json({ error: `Dataset version ${version} not found` }, 404)
    // Add mergedSearchable for convenience
    const datasetWithMerged = addMergedSearchable(dataset as Parameters<typeof addMergedSearchable>[0])
    return c.json(datasetWithMerged as unknown as typeof dataset, 200)
  } catch (error) {
    console.error("Error fetching dataset version:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /dataset/{datasetId}/research
datasetRouter.openapi(listLinkedResearchesRoute, async (c) => {
  try {
    const { datasetId } = c.req.param() as unknown as DatasetIdParams
    const authUser = c.get("authUser")

    // Get the parent Research for this Dataset
    const research = await getResearchByDatasetId(datasetId, authUser)
    if (!research) return c.json({ error: `Dataset ${datasetId} not found or no linked research` }, 404)

    // Return as array since the schema expects LinkedResearchesResponse
    return c.json({ data: [research] }, 200)
  } catch (error) {
    console.error("Error fetching linked researches:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})
