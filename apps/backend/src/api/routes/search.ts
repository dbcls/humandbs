/**
 * Search API Routes
 *
 * Provides POST-based search endpoints for Research and Dataset resources,
 * and GET endpoints for facet values.
 *
 * Note: GET /search/* endpoints have been removed in favor of POST endpoints.
 * Use GET /research and GET /dataset for simple list retrieval.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { ARRAY_FIELD_MAPPINGS, RANGE_FIELD_MAPPINGS } from "@/api/es-client/filters"
import { searchDatasets, searchResearches } from "@/api/es-client/search"
import {
  searchResponse,
  singleReadOnlyResponse,
} from "@/api/helpers/response"
import { optionalAuth } from "@/api/middleware/auth"
import { ErrorSpec400, ErrorSpec500 } from "@/api/routes/errors"
import {
  createUnifiedSearchResponseSchema,
  createUnifiedSingleReadOnlyResponseSchema,
  DatasetSearchBodySchema,
  EsDatasetDocSchema,
  FacetFieldResponseSchema,
  FacetsMapSchema,
  ResearchSearchBodySchema,
  ResearchSummarySchema,
} from "@/api/types"
import type { DatasetSearchBody, DatasetSearchQuery, ResearchSearchBody, ResearchSearchQuery } from "@/api/types"
import { createPagination } from "@/api/types/response"

// === Helper: Convert POST body to GET query format ===

interface RangeValue { min?: string | number; max?: string | number }

/**
 * Convert DatasetFilters (POST format) to query params (GET format)
 * POST uses arrays, GET uses comma-separated strings
 */
const convertDatasetFiltersToQuery = (filters: DatasetSearchBody["filters"]): Partial<DatasetSearchQuery> => {
  if (!filters) return {}

  const query: Record<string, unknown> = {}
  const f = filters as Record<string, unknown>

  // Convert array fields to comma-separated strings
  for (const { from, to } of ARRAY_FIELD_MAPPINGS) {
    const value = f[from]
    if (Array.isArray(value) && value.length > 0) {
      query[to] = value.join(",")
    }
  }

  // Convert range fields
  for (const { from, minTo, maxTo } of RANGE_FIELD_MAPPINGS) {
    const range = f[from] as RangeValue | undefined
    if (range?.min !== undefined) {
      query[minTo] = range.min
    }
    if (range?.max !== undefined) {
      query[maxTo] = range.max
    }
  }

  // Direct string fields
  if (filters.disease) query.disease = filters.disease

  // Boolean fields
  if (filters.isTumor !== undefined) query.isTumor = filters.isTumor
  if (filters.hasPhenotypeData !== undefined) query.hasPhenotypeData = filters.hasPhenotypeData

  return query as Partial<DatasetSearchQuery>
}

/**
 * Convert ResearchSearchBody (POST) to ResearchSearchQuery (GET format)
 */
const convertResearchBodyToQuery = (body: ResearchSearchBody): ResearchSearchQuery => {
  const datasetFilters = convertDatasetFiltersToQuery(body.datasetFilters)

  const sortMap: Record<string, "humId" | "title" | "releaseDate" | "relevance"> = {
    humId: "humId",
    datePublished: "releaseDate",
    dateModified: "releaseDate",
  }

  return {
    page: body.page,
    limit: body.limit,
    lang: body.lang ?? "ja",
    sort: body.sort ? sortMap[body.sort] ?? "humId" : "humId",
    order: body.order,
    q: body.query,
    // datePublished range (first release date)
    minDatePublished: body.datePublished?.min ? String(body.datePublished.min) : undefined,
    maxDatePublished: body.datePublished?.max ? String(body.datePublished.max) : undefined,
    // dateModified range (last update date)
    minDateModified: body.dateModified?.min ? String(body.dateModified.min) : undefined,
    maxDateModified: body.dateModified?.max ? String(body.dateModified.max) : undefined,
    includeFacets: body.includeFacets,
    ...datasetFilters,
  } as ResearchSearchQuery
}

/**
 * Convert DatasetSearchBody (POST) to DatasetSearchQuery (GET format)
 */
const convertDatasetBodyToQuery = (body: DatasetSearchBody): DatasetSearchQuery => {
  const filters = convertDatasetFiltersToQuery(body.filters)

  return {
    page: body.page,
    limit: body.limit,
    lang: body.lang ?? "ja",
    sort: body.sort ?? "datasetId",
    order: body.order,
    q: body.query, // Unified query parameter (S2)
    humId: body.humId,
    includeFacets: body.includeFacets,
    ...filters,
  } as DatasetSearchQuery
}

// === Unified Response Schemas ===

// Research search response
const ResearchSearchUnifiedResponseSchema = createUnifiedSearchResponseSchema(ResearchSummarySchema)

// Dataset search response
const DatasetSearchUnifiedResponseSchema = createUnifiedSearchResponseSchema(EsDatasetDocSchema)

// All facets response (read-only)
const AllFacetsUnifiedResponseSchema = createUnifiedSingleReadOnlyResponseSchema(FacetsMapSchema)

// Single facet field response (read-only)
const FacetFieldUnifiedResponseSchema = createUnifiedSingleReadOnlyResponseSchema(FacetFieldResponseSchema)

// === Route Definitions ===

const postResearchSearchRoute = createRoute({
  method: "post",
  path: "/research/search",
  tags: ["Search"],
  summary: "Search Research (POST)",
  description: `Search Research resources with advanced filters and facets.

**Full-text search targets:** title, summary.aims, summary.methods, summary.targets

**Filter modes:**
- Array filters use OR logic (e.g., assayType: ["WGS", "WES"] matches either)
- Multiple filters use AND logic (all conditions must match)
- datasetFilters: Filter Research by attributes of linked Datasets

**Sort options:** humId, datePublished, dateModified, relevance

Set includeFacets=true to get facet counts for building filter UIs.`,
  request: {
    body: { content: { "application/json": { schema: ResearchSearchBodySchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchSearchUnifiedResponseSchema } },
      description: "Research search results with optional facets",
    },
    400: ErrorSpec400,
    500: ErrorSpec500,
  },
})

const postDatasetSearchRoute = createRoute({
  method: "post",
  path: "/dataset/search",
  tags: ["Search"],
  summary: "Search Dataset (POST)",
  description: `Search Dataset resources with advanced filters and facets.

**Full-text search targets:** typeOfData, experiments.header, experiments.searchable.targets

**Filter modes:**
- Array filters use OR logic (e.g., assayType: ["WGS", "WES"] matches either)
- Multiple filters use AND logic (all conditions must match)
- Use humId to filter Datasets belonging to a specific Research

**Sort options:** datasetId, releaseDate, relevance

Set includeFacets=true to get facet counts for building filter UIs.`,
  request: {
    body: { content: { "application/json": { schema: DatasetSearchBodySchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetSearchUnifiedResponseSchema } },
      description: "Dataset search results with optional facets",
    },
    400: ErrorSpec400,
    500: ErrorSpec500,
  },
})

const getFacetsRoute = createRoute({
  method: "get",
  path: "/facets",
  tags: ["Search"],
  summary: "Get All Facet Values",
  description: `Get all available facet values with document counts.

Returns facet values grouped by field name. Use this to populate filter dropdowns in search UIs.

**Available facets:** criteria, assayType, healthStatus, sex, ageGroup, tissues, population, platform, referenceGenome, fileTypes, diseaseIcd10, etc.

Counts reflect published Datasets only.`,
  responses: {
    200: {
      content: { "application/json": { schema: AllFacetsUnifiedResponseSchema } },
      description: "All facet values with counts grouped by field",
    },
    500: ErrorSpec500,
  },
})

const getFacetFieldRoute = createRoute({
  method: "get",
  path: "/facets/{fieldName}",
  tags: ["Search"],
  summary: "Get Facet Values for Field",
  description: `Get available values for a specific facet field.

**Example fields:** criteria, assayType, healthStatus, tissues, platform

Returns an array of {value, count} pairs sorted by count descending.`,
  request: {
    params: z.object({
      fieldName: z.string().describe("Facet field name (e.g., 'assayType', 'criteria')"),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: FacetFieldUnifiedResponseSchema } },
      description: "Facet values for the specified field",
    },
    500: ErrorSpec500,
  },
})

// === Router ===

export const searchRouter = new OpenAPIHono()

searchRouter.use("*", optionalAuth)

// POST /research/search
searchRouter.openapi(postResearchSearchRoute, async (c) => {
  const body = c.req.valid("json")
  const authUser = c.get("authUser")

  // Convert POST body to GET query format for existing searchResearches function
  const query = convertResearchBodyToQuery(body)
  const result = await searchResearches(query, authUser)

  const pagination = createPagination(result.pagination.total, result.pagination.page, result.pagination.limit)

  return searchResponse(c, result.data, pagination, result.facets)
})

// POST /dataset/search
searchRouter.openapi(postDatasetSearchRoute, async (c) => {
  const body = c.req.valid("json")
  const authUser = c.get("authUser")

  // Convert POST body to GET query format for existing searchDatasets function
  const query = convertDatasetBodyToQuery(body)
  const result = await searchDatasets(query, authUser)

  const pagination = createPagination(result.pagination.total, result.pagination.page, result.pagination.limit)

  return searchResponse(c, result.data, pagination, result.facets)
})

// GET /facets
searchRouter.openapi(getFacetsRoute, async (c) => {
  const authUser = c.get("authUser")

  // Fetch facets from Dataset index with includeFacets=true
  const result = await searchDatasets({
    page: 1,
    limit: 1,
    lang: "en",
    sort: "datasetId",
    order: "asc",
    includeFacets: true,
  } as DatasetSearchQuery, authUser)

  // Return facets with counts (read-only response)
  return singleReadOnlyResponse(c, result.facets ?? {})
})

// GET /facets/{fieldName}
searchRouter.openapi(getFacetFieldRoute, async (c) => {
  const { fieldName } = c.req.param()
  const authUser = c.get("authUser")

  // Fetch facets from Dataset index
  const result = await searchDatasets({
    page: 1,
    limit: 1,
    lang: "en",
    sort: "datasetId",
    order: "asc",
    includeFacets: true,
  } as DatasetSearchQuery, authUser)

  // Return facet values with counts (read-only response)
  const fieldFacet = result.facets?.[fieldName] ?? []

  return singleReadOnlyResponse(c, { fieldName, values: fieldFacet })
})
