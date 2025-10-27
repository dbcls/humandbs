import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { ErrorSpec404, ErrorSpec500 } from "@/api/routes/errors"
import { DatasetIdParamsSchema, DatasetSchema, DatasetsQuerySchema, DatasetsResponseSchema, DatasetVersionsResponseSchema, LangQuerySchema, LangVersionQuerySchema, type DatasetIdParams, type DatasetsQuery, type LangQuery, type LangVersionQuery } from "@/types"

import { getDataset, listDatasetsLatest, listDatasetVersions } from "../es-client"

const listDatasetsRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List Datasets",
  description: "Get a paginated list of datasets with optional filtering and sorting",
  request: {
    query: DatasetsQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: DatasetsResponseSchema,
        },
      },
      description: "List of datasets",
    },
    500: ErrorSpec500,
  },
})

const getDatasetRoute = createRoute({
  method: "get",
  path: "/{datasetId}",
  summary: "Get Dataset Detail",
  description: "Get detailed information about a specific dataset by its datasetId",
  request: {
    params: DatasetIdParamsSchema,
    query: LangVersionQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: DatasetSchema,
        },
      },
      description: "Detailed information about the dataset",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listDatasetVersionsRoute = createRoute({
  method: "get",
  path: "/{datasetId}/versions",
  summary: "List Dataset Versions",
  description: "List version metadata for a dataset.",
  request: {
    params: DatasetIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: DatasetVersionsResponseSchema,
        },
      },
      description: "Versions of the dataset",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const datasetsRouter = new OpenAPIHono()

// GET /datasets - List datasets
datasetsRouter.openapi(listDatasetsRoute, async (c) => {
  try {
    const query = c.req.query() as unknown as DatasetsQuery
    const datasetsData = await listDatasetsLatest(query)
    return c.json(datasetsData, 200)
  } catch (error) {
    console.error("Error fetching datasets:", error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})

// GET /datasets/{datasetId} - Get dataset detail
datasetsRouter.openapi(getDatasetRoute, async (c) => {
  try {
    const { datasetId } = c.req.param() as unknown as DatasetIdParams
    const query = c.req.query() as unknown as LangVersionQuery
    const dataset = await getDataset(datasetId, query)
    if (dataset === null) return c.json({ error: `Dataset with datasetId ${datasetId} not found` }, 404)
    return c.json(dataset, 200)
  } catch (error) {
    console.error("Error fetching dataset detail:", error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})

// GET /datasets/{datasetId}/versions - List dataset versions
datasetsRouter.openapi(listDatasetVersionsRoute, async (c) => {
  try {
    const { datasetId } = c.req.param() as unknown as DatasetIdParams
    const query = c.req.query() as unknown as LangQuery
    const versions = await listDatasetVersions(datasetId, query.lang)
    return c.json({ data: versions }, 200)
  } catch (error) {
    console.error("Error fetching dataset versions:", error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})
