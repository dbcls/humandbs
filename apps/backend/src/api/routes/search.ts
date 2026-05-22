/**
 * Search API Routes
 *
 * Provides POST-based search endpoints for Research and Dataset resources,
 * and GET endpoints for facet values.
 *
 * Note: GET /search/* endpoints have been removed in favor of POST endpoints.
 * Use GET /research and GET /dataset for simple list retrieval.
 */
import { createRoute, z } from "@hono/zod-openapi"

import { ForbiddenError } from "@/api/errors"
import { checkRequestedStatus } from "@/api/es-client/auth"
import {
  convertDatasetBodyToQuery,
  convertResearchBodyToQuery,
} from "@/api/es-client/query-builders"
import { searchDatasets, searchResearches } from "@/api/es-client/search"
import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import {
  searchResponse,
  singleReadOnlyResponse,
} from "@/api/helpers/response"
import { optionalAuth } from "@/api/middleware/auth"
import { SECURITY_OPTIONAL_AUTH } from "@/api/openapi/document"
import {
  exampleAllFacetsResponse,
  exampleDatasetSearchBody,
  exampleDatasetSearchResponse,
  exampleFacetFieldResponse,
  exampleResearchSearchBody,
  exampleResearchSearchResponse,
} from "@/api/openapi/examples"
import { ErrorSpec400, ErrorSpec403, ErrorSpec500 } from "@/api/routes/errors"
import {
  createSingleReadOnlyResponseSchema,
  DATASET_FACET_NAMES,
  DatasetSearchBodySchema,
  DatasetSearchResponseSchema,
  FacetFieldResponseSchema,
  FacetFilterQuerySchema,
  FacetsMapSchema,
  ResearchSearchBodySchema,
  ResearchSearchResponseSchema,
} from "@/api/types"
import type { DatasetSearchQuery } from "@/api/types"
import { createPagination } from "@/api/types/response"

// === Response Schemas ===
// Search response schemas live in `@/api/types` (ResearchSearchResponseSchema /
// DatasetSearchResponseSchema). Only facet helpers are still composed locally.

// All facets response (read-only)
const AllFacetsResponseSchema = createSingleReadOnlyResponseSchema(FacetsMapSchema)

// Single facet field response (read-only)
const SingleFacetFieldResponseSchema = createSingleReadOnlyResponseSchema(FacetFieldResponseSchema)

// === Route Definitions ===

const postResearchSearchRoute = createRoute({
  method: "post",
  path: "/research/search",
  tags: ["Search"],
  operationId: "searchResearch",
  summary: "Search Research (POST)",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Search Research resources with advanced filters and facets.

**Full-text search targets:** title, summary.aims, summary.methods, summary.targets

**ID match:**
- \`humId\`: exact and prefix match (e.g., \`hum0001\`, \`hum000\`)
- \`datasetId\`: a query like \`JGAD000002\` resolves the parent Research via the Dataset index (hits \`hum0001\`)

**Fuzziness:** full-text matches use \`AUTO:5,12\` (0 typo for <5 chars, 1 typo for 5-11 chars, 2 typos for 12+ chars).

**Filter modes:**
- Array filters use OR logic (e.g., assayType: ["WGS", "WES"] matches either)
- Multiple filters use AND logic (all conditions must match)
- datasetFilters: Filter Research by attributes of linked Datasets

**Sort options:** humId, datePublished, dateModified, relevance

Set includeFacets=true to get facet counts for building filter UIs.`,
  request: {
    body: { content: { "application/json": { schema: ResearchSearchBodySchema, example: exampleResearchSearchBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchSearchResponseSchema, example: exampleResearchSearchResponse } },
      description: "Research search results with optional facets",
    },
    400: ErrorSpec400,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

const postDatasetSearchRoute = createRoute({
  method: "post",
  path: "/dataset/search",
  tags: ["Search"],
  operationId: "searchDataset",
  summary: "Search Dataset (POST)",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Search Dataset resources with advanced filters and facets.

**Full-text search targets:** typeOfData, experiments.searchable.targets

**ID match:** \`humId\` and \`datasetId\` accept both exact and prefix match (e.g., \`JGAD000001\`, \`JGAD00\`).

**Fuzziness:** full-text matches use \`AUTO:5,12\` (0 typo for <5 chars, 1 typo for 5-11 chars, 2 typos for 12+ chars).

**Filter modes:**
- Array filters use OR logic (e.g., assayType: ["WGS", "WES"] matches either)
- Multiple filters use AND logic (all conditions must match)
- Use humId to filter Datasets belonging to a specific Research

**Sort options:** datasetId, releaseDate, relevance

Set includeFacets=true to get facet counts for building filter UIs.`,
  request: {
    body: { content: { "application/json": { schema: DatasetSearchBodySchema, example: exampleDatasetSearchBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetSearchResponseSchema, example: exampleDatasetSearchResponse } },
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
  operationId: "getFacets",
  summary: "Get All Facet Values",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Get all available facet values with document counts.

Returns facet values grouped by field name. Use this to populate filter dropdowns in search UIs.

**Available facets:** criteria, assayType, healthStatus, sex, ageGroup, tissues, population, platform, referenceGenome, fileTypes, diseaseIcd10, etc.

Counts reflect published Datasets only. Pass filter parameters to get counts narrowed to matching Datasets.`,
  request: {
    query: FacetFilterQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: AllFacetsResponseSchema, example: exampleAllFacetsResponse } },
      description: "All facet values with counts grouped by field",
    },
    400: ErrorSpec400,
    500: ErrorSpec500,
  },
})

const getFacetFieldRoute = createRoute({
  method: "get",
  path: "/facets/{fieldName}",
  tags: ["Search"],
  operationId: "getFacet",
  summary: "Get Facet Values for Field",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Get available values for a specific facet field.

**Example fields:** criteria, assayType, healthStatus, tissues, platform

Returns an array of {value, count} pairs sorted by count descending. Pass filter parameters to get counts narrowed to matching Datasets.`,
  request: {
    params: z.object({
      fieldName: z.enum(DATASET_FACET_NAMES).describe("Facet field name"),
    }),
    query: FacetFilterQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: SingleFacetFieldResponseSchema, example: exampleFacetFieldResponse } },
      description: "Facet values for the specified field",
    },
    400: ErrorSpec400,
    500: ErrorSpec500,
  },
})

// === Router ===

export const searchRouter = createOpenAPIHono()

searchRouter.use("*", optionalAuth)

// POST /research/search
searchRouter.openapi(postResearchSearchRoute, async (c) => {
  const body = c.req.valid("json")
  const authUser = c.get("authUser")

  const statusCheck = checkRequestedStatus(authUser, body.status)
  if (!statusCheck.allowed) throw new ForbiddenError(statusCheck.message)

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
  const { countBy, ...filters } = c.req.valid("query")
  const authUser = c.get("authUser")
  const facetCountField = countBy === "research" ? "humId" : "datasetId"

  // Fetch facets from Dataset index with includeFacets=true
  const result = await searchDatasets({
    ...filters,
    page: 1,
    limit: 1,
    lang: "en",
    sort: "datasetId",
    order: "asc",
    includeFacets: true,
    includeRawHtml: false,
  } satisfies DatasetSearchQuery, authUser, { facetCountField })

  // Return facets with counts (read-only response)
  return singleReadOnlyResponse(c, result.facets ?? {})
})

// GET /facets/{fieldName}
searchRouter.openapi(getFacetFieldRoute, async (c) => {
  const { fieldName } = c.req.valid("param")
  const { countBy, ...filters } = c.req.valid("query")
  const authUser = c.get("authUser")
  const facetCountField = countBy === "research" ? "humId" : "datasetId"

  // Fetch facets from Dataset index
  const result = await searchDatasets({
    ...filters,
    page: 1,
    limit: 1,
    lang: "en",
    sort: "datasetId",
    order: "asc",
    includeFacets: true,
    includeRawHtml: false,
  } satisfies DatasetSearchQuery, authUser, { facetCountField })

  // Return facet values with counts (read-only response)
  const fieldFacet = result.facets?.[fieldName] ?? []

  return singleReadOnlyResponse(c, { fieldName, values: fieldFacet })
})
