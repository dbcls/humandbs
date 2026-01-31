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

/**
 * Convert DatasetFilters (POST format) to query params (GET format)
 * POST uses arrays, GET uses comma-separated strings
 */
const convertDatasetFiltersToQuery = (filters: DatasetSearchBody["filters"]): Partial<DatasetSearchQuery> => {
  if (!filters) return {}

  const query: Partial<DatasetSearchQuery> = {}

  // Array to comma-separated string
  if (filters.criteria) query.criteria = filters.criteria.join(",")
  if (filters.subjectCountType) query.subjectCountType = filters.subjectCountType.join(",")
  if (filters.healthStatus) query.healthStatus = filters.healthStatus.join(",")
  if (filters.disease) query.disease = filters.disease
  if (filters.diseaseIcd10) query.diseaseIcd10 = filters.diseaseIcd10.join(",")
  if (filters.tissue) query.tissue = filters.tissue.join(",")
  if (filters.isTumor !== undefined) query.isTumor = filters.isTumor
  if (filters.cellLine) query.cellLine = filters.cellLine.join(",")
  if (filters.population) query.population = filters.population.join(",")
  if (filters.sex) query.sex = filters.sex.join(",")
  if (filters.ageGroup) query.ageGroup = filters.ageGroup.join(",")
  if (filters.assayType) query.assayType = filters.assayType.join(",")
  if (filters.libraryKits) query.libraryKits = filters.libraryKits.join(",")
  if (filters.platformVendor) query.platform = filters.platformVendor
  if (filters.platformModel) query.platformModel = filters.platformModel.join(",")
  if (filters.readType) query.readType = filters.readType.join(",")
  if (filters.referenceGenome) query.referenceGenome = filters.referenceGenome.join(",")
  if (filters.fileType) query.fileType = filters.fileType.join(",")
  if (filters.processedDataTypes) query.processedDataTypes = filters.processedDataTypes.join(",")
  if (filters.hasPhenotypeData !== undefined) query.hasPhenotypeData = filters.hasPhenotypeData
  if (filters.policyId) query.policyId = filters.policyId.join(",")

  // Range filters
  if (filters.releaseDate?.min) query.minReleaseDate = String(filters.releaseDate.min)
  if (filters.releaseDate?.max) query.maxReleaseDate = String(filters.releaseDate.max)
  if (filters.subjectCount?.min !== undefined) query.minSubjects = Number(filters.subjectCount.min)
  if (filters.subjectCount?.max !== undefined) query.maxSubjects = Number(filters.subjectCount.max)
  if (filters.readLength?.min !== undefined) query.minReadLength = Number(filters.readLength.min)
  if (filters.readLength?.max !== undefined) query.maxReadLength = Number(filters.readLength.max)
  if (filters.sequencingDepth?.min !== undefined) query.minSequencingDepth = Number(filters.sequencingDepth.min)
  if (filters.sequencingDepth?.max !== undefined) query.maxSequencingDepth = Number(filters.sequencingDepth.max)
  if (filters.targetCoverage?.min !== undefined) query.minTargetCoverage = Number(filters.targetCoverage.min)
  if (filters.targetCoverage?.max !== undefined) query.maxTargetCoverage = Number(filters.targetCoverage.max)
  if (filters.dataVolumeGb?.min !== undefined) query.minDataVolumeGb = Number(filters.dataVolumeGb.min)
  if (filters.dataVolumeGb?.max !== undefined) query.maxDataVolumeGb = Number(filters.dataVolumeGb.max)
  if (filters.variantSnv?.min !== undefined) query.minVariantSnv = Number(filters.variantSnv.min)
  if (filters.variantSnv?.max !== undefined) query.maxVariantSnv = Number(filters.variantSnv.max)
  if (filters.variantIndel?.min !== undefined) query.minVariantIndel = Number(filters.variantIndel.min)
  if (filters.variantIndel?.max !== undefined) query.maxVariantIndel = Number(filters.variantIndel.max)
  if (filters.variantCnv?.min !== undefined) query.minVariantCnv = Number(filters.variantCnv.min)
  if (filters.variantCnv?.max !== undefined) query.maxVariantCnv = Number(filters.variantCnv.max)
  if (filters.variantSv?.min !== undefined) query.minVariantSv = Number(filters.variantSv.min)
  if (filters.variantSv?.max !== undefined) query.maxVariantSv = Number(filters.variantSv.max)
  if (filters.variantTotal?.min !== undefined) query.minVariantTotal = Number(filters.variantTotal.min)
  if (filters.variantTotal?.max !== undefined) query.maxVariantTotal = Number(filters.variantTotal.max)

  return query
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
