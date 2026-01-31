/**
 * Dataset API Routes
 *
 * Handles CRUD operations and versioning for Dataset resources.
 * Dataset visibility is determined by linked Research status.
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { getDataset, getResearchByDatasetId, listDatasetVersions, searchDatasets } from "@/api/es-client"
import { canDeleteResource, optionalAuth } from "@/api/middleware/auth"
import { ErrorSpec401, ErrorSpec403, ErrorSpec404, ErrorSpec500 } from "@/api/routes/errors"
import {
  CreateDatasetRequestSchema,
  DatasetIdParamsSchema,
  DatasetSearchQuerySchema,
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
import type { DatasetIdParams, DatasetSearchQuery, DatasetVersionParams, LangQuery, LangVersionQuery } from "@/api/types"

// === Route Definitions ===

const listDatasetsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Dataset"],
  summary: "List Datasets",
  description: "Get a paginated list of datasets with search and filtering. Only datasets linked to published research are visible to public. Supports keyword search and facet filtering.",
  request: {
    query: DatasetSearchQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetSearchResponseSchema } },
      description: "List of datasets with optional facets",
    },
    500: ErrorSpec500,
  },
})

const createDatasetRoute = createRoute({
  method: "post",
  path: "/new",
  tags: ["Dataset"],
  summary: "Create Dataset",
  description: "Create a new dataset. Requires authentication. Dataset visibility is determined by linked Research status.",
  request: {
    body: { content: { "application/json": { schema: CreateDatasetRequestSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: DatasetWithMetadataSchema } },
      description: "Dataset created successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
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
    const query = c.req.query() as unknown as DatasetSearchQuery
    const authUser = c.get("authUser")
    const datasetsData = await searchDatasets(query, authUser)
    return c.json(datasetsData, 200)
  } catch (error) {
    console.error("Error fetching datasets:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /dataset/new (any authenticated user can create a dataset)
datasetRouter.openapi(createDatasetRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  // Any authenticated user can create a dataset
  // Dataset visibility is determined by linked Research status
  try {
    // TODO: Implement create dataset logic
    return c.json({ error: "Not Implemented", message: "Create dataset not yet implemented" }, 500)
  } catch (error) {
    console.error("Error creating dataset:", error)
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
    return c.json(dataset, 200)
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
    const { datasetId: _datasetId } = c.req.param() as unknown as DatasetIdParams
    // TODO: Implement update logic
    return c.json({ error: "Not Implemented", message: "Update dataset not yet implemented" }, 500)
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
    const { datasetId: _datasetId } = c.req.param() as unknown as DatasetIdParams
    // TODO: Implement delete logic
    return c.json({ error: "Not Implemented", message: "Delete dataset not yet implemented" }, 500)
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
    return c.json(dataset, 200)
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
