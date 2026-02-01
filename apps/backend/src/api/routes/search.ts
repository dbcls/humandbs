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

import { searchDatasets, searchResearches } from "@/api/es-client"
import { optionalAuth } from "@/api/middleware/auth"
import { ErrorSpec500 } from "@/api/routes/errors"
import {
  AllFacetsResponseSchema,
  DatasetSearchBodySchema,
  DatasetSearchResponseSchema,
  FacetFieldResponseSchema,
  ResearchSearchBodySchema,
  ResearchSearchResponseSchema,
} from "@/api/types"
import type { DatasetSearchBody, DatasetSearchQuery, ResearchSearchBody, ResearchSearchQuery } from "@/api/types"

// === Helper: Convert POST body to GET query format ===

// Table-driven conversion for array fields (POST arrays -> GET comma-separated)
const ARRAY_FIELD_MAPPINGS: { from: string; to: string }[] = [
  { from: "criteria", to: "criteria" },
  { from: "subjectCountType", to: "subjectCountType" },
  { from: "healthStatus", to: "healthStatus" },
  { from: "diseaseIcd10", to: "diseaseIcd10" },
  { from: "tissue", to: "tissue" },
  { from: "cellLine", to: "cellLine" },
  { from: "population", to: "population" },
  { from: "sex", to: "sex" },
  { from: "ageGroup", to: "ageGroup" },
  { from: "assayType", to: "assayType" },
  { from: "libraryKits", to: "libraryKits" },
  { from: "platformModel", to: "platformModel" },
  { from: "readType", to: "readType" },
  { from: "referenceGenome", to: "referenceGenome" },
  { from: "fileType", to: "fileType" },
  { from: "processedDataTypes", to: "processedDataTypes" },
  { from: "policyId", to: "policyId" },
]

// Table-driven conversion for range fields
const RANGE_FIELD_MAPPINGS: { from: string; minTo: string; maxTo: string }[] = [
  { from: "releaseDate", minTo: "minReleaseDate", maxTo: "maxReleaseDate" },
  { from: "subjectCount", minTo: "minSubjects", maxTo: "maxSubjects" },
  { from: "readLength", minTo: "minReadLength", maxTo: "maxReadLength" },
  { from: "sequencingDepth", minTo: "minSequencingDepth", maxTo: "maxSequencingDepth" },
  { from: "targetCoverage", minTo: "minTargetCoverage", maxTo: "maxTargetCoverage" },
  { from: "dataVolumeGb", minTo: "minDataVolumeGb", maxTo: "maxDataVolumeGb" },
  { from: "variantSnv", minTo: "minVariantSnv", maxTo: "maxVariantSnv" },
  { from: "variantIndel", minTo: "minVariantIndel", maxTo: "maxVariantIndel" },
  { from: "variantCnv", minTo: "minVariantCnv", maxTo: "maxVariantCnv" },
  { from: "variantSv", minTo: "minVariantSv", maxTo: "maxVariantSv" },
  { from: "variantTotal", minTo: "minVariantTotal", maxTo: "maxVariantTotal" },
]

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
      query[minTo] = typeof range.min === "string" ? range.min : Number(range.min)
    }
    if (range?.max !== undefined) {
      query[maxTo] = typeof range.max === "string" ? range.max : Number(range.max)
    }
  }

  // Direct string fields
  if (filters.disease) query.disease = filters.disease
  if (filters.platformVendor) query.platform = filters.platformVendor

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
    lang: "en", // Default, can be extended
    sort: body.sort ? sortMap[body.sort] ?? "humId" : "humId",
    order: body.order,
    q: body.query,
    releasedAfter: body.dateModified?.min ? String(body.dateModified.min) : undefined,
    releasedBefore: body.datePublished?.max ? String(body.datePublished.max) : undefined,
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
    lang: "en", // Default, can be extended
    sort: body.sort ?? "datasetId",
    order: body.order,
    q: body.metadataQuery || body.experimentQuery, // Combine queries
    humId: body.humId,
    includeFacets: body.includeFacets,
    ...filters,
  } as DatasetSearchQuery
}

// === Route Definitions ===

const postResearchSearchRoute = createRoute({
  method: "post",
  path: "/research/search",
  tags: ["Search"],
  summary: "Search Research (POST)",
  description: "Search Research resources with filters and facets. Use POST body for complex filters.",
  request: {
    body: { content: { "application/json": { schema: ResearchSearchBodySchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchSearchResponseSchema } },
      description: "Research search results with optional facets",
    },
    500: ErrorSpec500,
  },
})

const postDatasetSearchRoute = createRoute({
  method: "post",
  path: "/dataset/search",
  tags: ["Search"],
  summary: "Search Dataset (POST)",
  description: "Search Dataset resources with filters and facets. Use POST body for complex filters.",
  request: {
    body: { content: { "application/json": { schema: DatasetSearchBodySchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetSearchResponseSchema } },
      description: "Dataset search results with optional facets",
    },
    500: ErrorSpec500,
  },
})

const getFacetsRoute = createRoute({
  method: "get",
  path: "/facets",
  tags: ["Search"],
  summary: "Get All Facet Values",
  description: "Get available facet values for UI filter dropdowns. Returns value lists without counts.",
  responses: {
    200: {
      content: { "application/json": { schema: AllFacetsResponseSchema } },
      description: "All facet values grouped by field",
    },
    500: ErrorSpec500,
  },
})

const getFacetFieldRoute = createRoute({
  method: "get",
  path: "/facets/{fieldName}",
  tags: ["Search"],
  summary: "Get Facet Values for Field",
  description: "Get available values for a specific facet field.",
  request: {
    params: z.object({
      fieldName: z.string(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: FacetFieldResponseSchema } },
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
  try {
    const body = await c.req.json() as ResearchSearchBody
    const authUser = c.get("authUser")

    // Convert POST body to GET query format for existing searchResearches function
    const query = convertResearchBodyToQuery(body)
    const result = await searchResearches(query, authUser)

    return c.json({
      data: result.data,
      pagination: result.pagination,
      facets: result.facets,
    }, 200)
  } catch (error) {
    console.error("Error in POST research search:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /dataset/search
searchRouter.openapi(postDatasetSearchRoute, async (c) => {
  try {
    const body = await c.req.json() as DatasetSearchBody
    const authUser = c.get("authUser")

    // Convert POST body to GET query format for existing searchDatasets function
    const query = convertDatasetBodyToQuery(body)
    const result = await searchDatasets(query, authUser)

    return c.json({
      data: result.data,
      pagination: result.pagination,
      facets: result.facets,
    }, 200)
  } catch (error) {
    console.error("Error in POST dataset search:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /facets
searchRouter.openapi(getFacetsRoute, async (c) => {
  try {
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

    // Convert facets to value-only format (without counts)
    const facets: Record<string, string[]> = {}
    for (const [key, items] of Object.entries(result.facets ?? {})) {
      facets[key] = items.map(item => item.value)
    }

    return c.json(facets, 200)
  } catch (error) {
    console.error("Error fetching facets:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /facets/{fieldName}
searchRouter.openapi(getFacetFieldRoute, async (c) => {
  try {
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

    const fieldFacet = result.facets?.[fieldName]
    const values = fieldFacet ? fieldFacet.map(item => item.value) : []

    return c.json({ fieldName, values }, 200)
  } catch (error) {
    console.error("Error fetching facet field:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})
