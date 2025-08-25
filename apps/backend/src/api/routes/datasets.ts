import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { getDatasetById } from "@/api/es-client"
import { ErrorSpec404, ErrorSpec500 } from "@/api/routes/errors"
import { DatasetSchema, DatasetRequestQuerySchema } from "@/types"

const getDatasetRoute = createRoute({
  method: "get",
  path: "/{datasetId}",
  summary: "Get Dataset",
  description: "Fetch a dataset by its ID.",
  request: {
    params: z.object({
      datasetId: z.string(),
    }),
    query: DatasetRequestQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: DatasetSchema,
        },
      },
      description: "Dataset details",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const datasetsRouter = new OpenAPIHono()

datasetsRouter.openapi(getDatasetRoute, async (c) => {
  try {
    const { datasetId } = c.req.valid("param")
    const { lang, version } = c.req.valid("query")

    const dataset = await getDatasetById(datasetId, lang, version)

    if (!dataset) {
      return c.json({ error: "Dataset not found" }, 404)
    }

    const response = DatasetSchema.parse(dataset)

    return c.json(response, 200)
  } catch (error) {
    console.error("Error fetching dataset:", error)
    return c.json({
      error: "Internal Server Error",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, 500)
  }
})
