/**
 * Search API Routes
 *
 * Handles full-text search and faceted filtering across Research and Dataset resources.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { searchDatasets, searchResearches } from "@/api/es-client"
import { optionalAuth } from "@/api/middleware/auth"
import { ErrorSpec500 } from "@/api/routes/errors"
import {
  DatasetSearchQuerySchema,
  DatasetSearchResponseSchema,
  FacetsResponseSchema,
  ResearchSearchQuerySchema,
  ResearchSearchResponseSchema,
  SearchResponseSchema,
} from "@/api/types"
import type { DatasetSearchQuery, ResearchSearchQuery } from "@/api/types"
import { langType } from "@/types"

// === Route Definitions ===

const searchAllRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Search"],
  summary: "Cross-resource Search",
  description: "Search across both Research and Dataset resources. Returns combined results.",
  request: {
    query: ResearchSearchQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: SearchResponseSchema } },
      description: "Combined search results",
    },
    500: ErrorSpec500,
  },
})

const searchResearchRoute = createRoute({
  method: "get",
  path: "/research",
  tags: ["Search"],
  summary: "Search Research",
  description: "Search Research resources with full-text and faceted filtering. Can filter by Dataset attributes.",
  request: {
    query: ResearchSearchQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchSearchResponseSchema } },
      description: "Research search results",
    },
    500: ErrorSpec500,
  },
})

const searchDatasetRoute = createRoute({
  method: "get",
  path: "/dataset",
  tags: ["Search"],
  summary: "Search Dataset",
  description: "Search Dataset resources with full-text and faceted filtering.",
  request: {
    query: DatasetSearchQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetSearchResponseSchema } },
      description: "Dataset search results",
    },
    500: ErrorSpec500,
  },
})

const getFacetsRoute = createRoute({
  method: "get",
  path: "/facets",
  tags: ["Search"],
  summary: "Get Facet Values",
  description: "Get available facet values for filtering. Returns counts for each facet value.",
  request: {
    query: z.object({
      lang: z.enum(langType).default("en"),
      resource: z.enum(["research", "dataset", "all"]).default("all"),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: FacetsResponseSchema } },
      description: "Available facet values",
    },
    500: ErrorSpec500,
  },
})

// === Router ===

export const searchRouter = new OpenAPIHono()

searchRouter.use("*", optionalAuth)

// GET /search
searchRouter.openapi(searchAllRoute, async (c) => {
  try {
    const query = c.req.valid("query") as ResearchSearchQuery

    // Cross-resource search: search both Research and Dataset, merge results
    const [researchResults, datasetResults] = await Promise.all([
      searchResearches({ ...query, includeFacets: true }),
      searchDatasets({ ...query, includeFacets: true } as DatasetSearchQuery),
    ])

    // Combine results - Research as SearchResearchResult, Dataset as SearchDatasetResult
    const combinedData = [
      ...researchResults.data.map((r) => ({
        type: "research" as const,
        humId: r.humId,
        title: { ja: null, en: r.title },
        summary: r.methods || undefined,
        dataProvider: r.dataProvider,
        releaseDate: r.versions[0]?.releaseDate || undefined,
        score: undefined,
        highlights: undefined,
      })),
      ...datasetResults.data.map((d) => ({
        type: "dataset" as const,
        datasetId: d.datasetId,
        humId: "", // Not directly available in EsDatasetDoc
        typeOfData: d.typeOfData ? { ja: d.typeOfData[0] ?? null, en: d.typeOfData[1] ?? null } : undefined,
        criteria: d.criteria || undefined,
        score: undefined,
        highlights: undefined,
      })),
    ]

    // Merge facets from both sources
    const mergedFacets: Record<string, { value: string; count: number }[]> = {}
    const allFacetKeys = new Set([
      ...Object.keys(researchResults.facets ?? {}),
      ...Object.keys(datasetResults.facets ?? {}),
    ])
    for (const key of allFacetKeys) {
      const rFacet = researchResults.facets?.[key] ?? []
      const dFacet = datasetResults.facets?.[key] ?? []
      // Merge by value, sum counts
      const merged = new Map<string, number>()
      for (const f of rFacet) merged.set(f.value, (merged.get(f.value) ?? 0) + f.count)
      for (const f of dFacet) merged.set(f.value, (merged.get(f.value) ?? 0) + f.count)
      mergedFacets[key] = Array.from(merged.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
    }

    const total = researchResults.pagination.total + datasetResults.pagination.total
    return c.json({
      data: combinedData,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        hasNext: (query.page - 1) * query.limit + query.limit < total,
        hasPrev: query.page > 1,
      },
      facets: mergedFacets,
    }, 200)
  } catch (error) {
    console.error("Error in cross-resource search:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /search/research
searchRouter.openapi(searchResearchRoute, async (c) => {
  try {
    const query = c.req.valid("query") as ResearchSearchQuery
    const result = await searchResearches(query)

    // Return ResearchSummary format directly (matches ResearchSearchResponseSchema)
    return c.json({
      data: result.data,
      pagination: result.pagination,
      facets: result.facets,
    }, 200)
  } catch (error) {
    console.error("Error in research search:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /search/dataset
searchRouter.openapi(searchDatasetRoute, async (c) => {
  try {
    const query = c.req.valid("query") as DatasetSearchQuery
    const result = await searchDatasets(query)

    // Return EsDatasetDoc format directly (matches DatasetSearchResponseSchema)
    return c.json({
      data: result.data,
      pagination: result.pagination,
      facets: result.facets,
    }, 200)
  } catch (error) {
    console.error("Error in dataset search:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /search/facets
searchRouter.openapi(getFacetsRoute, async (c) => {
  try {
    const { lang, resource: _resource } = c.req.valid("query")

    // Fetch facets from Dataset index (primary source for facets)
    const datasetResult = await searchDatasets({
      page: 1,
      limit: 1,
      lang,
      sort: "datasetId",
      order: "asc",
      includeFacets: true,
    } as DatasetSearchQuery)

    const facets = datasetResult.facets ?? {}

    return c.json({ facets }, 200)
  } catch (error) {
    console.error("Error fetching facets:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})
