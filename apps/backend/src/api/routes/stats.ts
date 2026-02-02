/**
 * Stats API Routes
 *
 * Provides statistics about published resources.
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { searchDatasets, searchResearches } from "@/api/es-client"
import { ErrorSpec500 } from "@/api/routes/errors"
import { StatsResponseSchema } from "@/api/types"
import type { DatasetSearchQuery, ResearchSearchQuery } from "@/api/types"

// === Route Definitions ===

const getStatsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Stats"],
  summary: "Get Statistics",
  description: "Get statistics about published Research and Dataset resources, including counts and facets.",
  responses: {
    200: {
      content: { "application/json": { schema: StatsResponseSchema } },
      description: "Statistics about published resources",
    },
    500: ErrorSpec500,
  },
})

// === Router ===

export const statsRouter = new OpenAPIHono()

// GET /stats
statsRouter.openapi(getStatsRoute, async (c) => {
  try {
    // Fetch published Research count
    const researchResult = await searchResearches({
      page: 1,
      limit: 1,
      lang: "ja",
      sort: "humId",
      order: "asc",
      status: "published",
    } as ResearchSearchQuery, undefined)

    // Fetch published Dataset count with facets
    const datasetResult = await searchDatasets({
      page: 1,
      limit: 1,
      lang: "ja",
      sort: "datasetId",
      order: "asc",
      includeFacets: true,
    } as DatasetSearchQuery, undefined)

    return c.json({
      researchCount: researchResult.pagination.total,
      datasetCount: datasetResult.pagination.total,
      facets: datasetResult.facets ?? {},
    }, 200)
  } catch (error) {
    console.error("Error fetching stats:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})
