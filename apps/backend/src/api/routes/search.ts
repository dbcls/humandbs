/**
 * Search API Routes
 *
 * Handles full-text search and faceted filtering across Research and Dataset resources.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { optionalAuth } from "@/api/middleware/auth"
import { ErrorSpec500 } from "@/api/routes/errors"
import {
  FacetsResponseSchema,
  SearchDatasetResultSchema,
  SearchQuerySchema,
  SearchResearchResultSchema,
  SearchResponseSchema,
} from "@/api/types"
import type { SearchQuery } from "@/api/types"
import { langType } from "@/types"

// === Specific Search Schemas ===

const ResearchSearchQuerySchema = SearchQuerySchema

const DatasetSearchQuerySchema = z.object({
  q: z.string().optional(),
  lang: z.enum(langType).default("en"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["relevance", "releaseDate", "datasetId"]).default("relevance"),
  order: z.enum(["asc", "desc"]).default("desc"),
  criteria: z.string().optional(),
  typeOfData: z.string().optional(),
  minSubjects: z.coerce.number().int().min(0).optional(),
  maxSubjects: z.coerce.number().int().min(0).optional(),
})

const ResearchSearchResponseSchema = z.object({
  data: z.array(SearchResearchResultSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  facets: z.record(z.string(), z.array(z.object({
    value: z.string(),
    count: z.number(),
  }))).optional(),
})

const DatasetSearchResponseSchema = z.object({
  data: z.array(SearchDatasetResultSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  facets: z.record(z.string(), z.array(z.object({
    value: z.string(),
    count: z.number(),
  }))).optional(),
})

// === Route Definitions ===

const searchAllRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Search"],
  summary: "Cross-resource Search",
  description: "Search across both Research and Dataset resources. Returns combined results.",
  request: {
    query: SearchQuerySchema,
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
    const query = c.req.query() as unknown as SearchQuery
    // TODO: Implement cross-resource search
    return c.json({
      data: [],
      pagination: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
      facets: {},
    }, 200)
  } catch (error) {
    console.error("Error in cross-resource search:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /search/research
searchRouter.openapi(searchResearchRoute, async (c) => {
  try {
    const query = c.req.query() as unknown as SearchQuery
    // TODO: Implement Research search
    return c.json({
      data: [],
      pagination: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
      facets: {},
    }, 200)
  } catch (error) {
    console.error("Error in research search:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /search/dataset
searchRouter.openapi(searchDatasetRoute, async (c) => {
  try {
    const query = c.req.query()
    // TODO: Implement Dataset search
    return c.json({
      data: [],
      pagination: {
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
      facets: {},
    }, 200)
  } catch (error) {
    console.error("Error in dataset search:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /search/facets
searchRouter.openapi(getFacetsRoute, async (c) => {
  try {
    const { lang: _lang, resource: _resource } = c.req.query()
    // TODO: Implement facet aggregation
    const facets: Record<string, { value: string; count: number }[]> = {
      dataProvider: [],
      criteria: [],
      typeOfData: [],
      assayType: [],
      disease: [],
      tissue: [],
      platform: [],
    }
    return c.json({ facets }, 200)
  } catch (error) {
    console.error("Error fetching facets:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})
