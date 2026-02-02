/**
 * Stats API Routes
 *
 * Provides statistics about published resources.
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { searchDatasets, searchResearches } from "@/api/es-client"
import { ErrorSpec500, serverErrorResponse } from "@/api/routes/errors"
import { StatsResponseSchema } from "@/api/types"
import type { DatasetSearchQuery, ResearchSearchQuery, StatsFacetCount } from "@/api/types"

// === Route Definitions ===

const getStatsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Stats"],
  summary: "Get Statistics",
  description: "Get statistics about published Research and Dataset resources, including counts and facets with Research/Dataset breakdown.",
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
    // Fetch published Research count with facets
    const researchResult = await searchResearches({
      page: 1,
      limit: 1,
      lang: "ja",
      sort: "humId",
      order: "asc",
      status: "published",
      includeFacets: true,
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

    // Merge facets: combine Research and Dataset counts for each facet value
    const researchFacets = researchResult.facets ?? {}
    const datasetFacets = datasetResult.facets ?? {}

    // Get all facet keys (union of Research and Dataset facets)
    const allFacetKeys = new Set([
      ...Object.keys(researchFacets),
      ...Object.keys(datasetFacets),
    ])

    // Build merged facets with Research/Dataset counts
    const mergedFacets: Record<string, Record<string, StatsFacetCount>> = {}

    for (const facetKey of allFacetKeys) {
      const researchValues = researchFacets[facetKey] ?? []
      const datasetValues = datasetFacets[facetKey] ?? []

      // Get all values for this facet
      const allValues = new Set([
        ...researchValues.map(v => v.value),
        ...datasetValues.map(v => v.value),
      ])

      // Build counts map
      const researchCountMap = new Map(researchValues.map(v => [v.value, v.count]))
      const datasetCountMap = new Map(datasetValues.map(v => [v.value, v.count]))

      mergedFacets[facetKey] = {}
      for (const value of allValues) {
        mergedFacets[facetKey][value] = {
          research: researchCountMap.get(value) ?? 0,
          dataset: datasetCountMap.get(value) ?? 0,
        }
      }
    }

    return c.json({
      research: {
        total: researchResult.pagination.total,
      },
      dataset: {
        total: datasetResult.pagination.total,
      },
      facets: mergedFacets,
    }, 200)
  } catch (error) {
    console.error("Error fetching stats:", error)
    return serverErrorResponse(c, error)
  }
})
