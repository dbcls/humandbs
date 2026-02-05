/**
 * API Request/Response type definitions
 *
 * This module provides:
 * - CRUD request/response schemas
 * - Path parameter schemas
 * - Search response schemas
 * - Error response schemas
 */
import { z } from "zod"

// Import from es/types

import {
  EsDatasetDocSchema,
  EsResearchDetailSchema,
  EsResearchVersionDocSchema,
  DatasetVersionItemSchema,
} from "@/api/types/es-docs"
import { FacetsMapSchema } from "@/api/types/facets"
import { ResearchSummarySchema } from "@/api/types/query-params"
import {
  ResponseMetaReadOnlySchema,
  ResponseMetaWithLockSchema,
  ResponseMetaWithPaginationSchema,
} from "@/api/types/response"
import { RESEARCH_STATUS } from "@/api/types/workflow"
import {
  BilingualTextSchema,
  BilingualTextValueSchema,
  CriteriaCanonicalSchema,
  PersonSchema,
  ResearchProjectSchema,
  GrantSchema,
  PublicationSchema,
  SummarySchema,
  TextValueSchema,
  // Crawler schemas (for API request validation)
  CrawlerResearchSchema as ResearchSchema,
  CrawlerResearchVersionSchema as ResearchVersionSchema,
} from "@/es/types"

// === Unified Response Schemas ===

// === Experiment Schema ===

// Experiment schema for API requests (without searchable field)
export const ExperimentSchemaBase = z.object({
  header: BilingualTextValueSchema,
  data: z.record(z.string(), BilingualTextValueSchema.nullable()),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
})

// Dataset schema for API requests
export const DatasetSchema = z.object({
  datasetId: z.string()
    .describe("Unique dataset identifier (e.g., 'JGAD000001')"),
  version: z.string()
    .describe("Dataset version (e.g., 'v1', 'v2')"),
  versionReleaseDate: z.string()
    .describe("ISO 8601 date when this version was released"),
  humId: z.string()
    .describe("Parent Research identifier (e.g., 'hum0001')"),
  humVersionId: z.string()
    .describe("Parent Research version identifier (e.g., 'hum0001.v1')"),
  releaseDate: z.string()
    .describe("ISO 8601 date when the dataset was first released"),
  criteria: CriteriaCanonicalSchema
    .describe("Data access criteria: 'Controlled-access (Type I)', 'Controlled-access (Type II)', or 'Unrestricted-access'"),
  typeOfData: z.object({
    ja: z.string().nullable()
      .describe("Data type description in Japanese"),
    en: z.string().nullable()
      .describe("Data type description in English"),
  }).describe("Bilingual description of the type of data in this dataset"),
  experiments: z.array(ExperimentSchemaBase)
    .describe("Array of experiment records containing sample/sequencing metadata"),
})

// === Error Responses ===

/**
 * Error codes
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * RFC 7807 Problem Details for HTTP APIs
 * @see https://tools.ietf.org/html/rfc7807
 */
export const ProblemDetailsSchema = z.object({
  type: z.url()
    .describe("URI reference identifying the problem type (e.g., 'https://api.humandbs.dbcls.jp/errors/not-found')"),
  title: z.string()
    .describe("Short, human-readable summary of the problem type (e.g., 'Not Found', 'Validation Error')"),
  status: z.number().int().min(400).max(599)
    .describe("HTTP status code for this error (e.g., 400, 401, 404, 500)"),
  detail: z.string().optional()
    .describe("Human-readable explanation specific to this occurrence of the problem"),
  instance: z.string().optional()
    .describe("URI reference for the specific occurrence, usually the request path"),
  timestamp: z.string()
    .describe("ISO 8601 timestamp of when the error occurred"),
  requestId: z.string().optional()
    .describe("Unique request identifier for tracing and debugging"),
})
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>

// === Response Meta Schema ===

/**
 * Meta information for single resource responses
 * Contains optimistic locking fields
 */
export const ResponseMetaSchema = z.object({
  _seq_no: z.number(),
  _primary_term: z.number(),
})
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>

// === Research API ===

/**
 * Create research request
 * Creates Research + initial ResearchVersion (v1) simultaneously
 * Note: humId, versionIds, latestVersion, datePublished, dateModified are auto-generated
 * All fields are optional - defaults will be used for missing fields
 */
export const CreateResearchRequestSchema = z.object({
  // Optional humId - auto-generated if not provided (hum0001, hum0002, ...)
  humId: z.string().optional()
    .describe("Research ID (e.g., 'hum0001'). Auto-generated if not provided."),

  // Research fields - all optional with defaults
  title: BilingualTextSchema.optional()
    .describe("Research title in Japanese and English"),
  summary: SummarySchema.optional()
    .describe("Research summary including aims, methods, and targets"),
  dataProvider: z.array(PersonSchema).optional()
    .describe("Data providers (researchers providing the data)"),
  researchProject: z.array(ResearchProjectSchema).optional()
    .describe("Related research projects"),
  grant: z.array(GrantSchema).optional()
    .describe("Funding grants"),
  relatedPublication: z.array(PublicationSchema).optional()
    .describe("Related publications (papers, preprints)"),

  // Admin assigns owner UIDs (optional, defaults to empty array)
  uids: z.array(z.string()).optional()
    .describe("Keycloak user IDs (sub) who can edit this Research. Admin-only field."),

  // Initial version release note (optional)
  initialReleaseNote: BilingualTextValueSchema.optional()
    .describe("Release note for the initial version (v1)"),
})
export type CreateResearchRequest = z.infer<typeof CreateResearchRequestSchema>

/**
 * Update research request (full replacement)
 * Note: humId, url, versionIds, latestVersion, datePublished, dateModified cannot be changed
 * url is auto-generated from humId
 * Includes optimistic locking fields (_seq_no, _primary_term) for concurrent edit detection
 */
export const UpdateResearchRequestSchema = z.object({
  title: BilingualTextSchema.optional()
    .describe("Research title in Japanese and English"),
  summary: SummarySchema.optional()
    .describe("Research summary including aims, methods, and targets"),
  dataProvider: z.array(PersonSchema).optional()
    .describe("Data providers (researchers providing the data)"),
  researchProject: z.array(ResearchProjectSchema).optional()
    .describe("Related research projects"),
  grant: z.array(GrantSchema).optional()
    .describe("Funding grants"),
  relatedPublication: z.array(PublicationSchema).optional()
    .describe("Related publications (papers, preprints)"),
  controlledAccessUser: z.array(PersonSchema).optional()
    .describe("Users with controlled access to the data"),
  _seq_no: z.number()
    .describe("Sequence number for optimistic locking. Obtained from GET response."),
  _primary_term: z.number()
    .describe("Primary term for optimistic locking. Obtained from GET response."),
})
export type UpdateResearchRequest = z.infer<typeof UpdateResearchRequestSchema>

/**
 * Research with status (extends Research with API-specific fields)
 */
export const ResearchWithStatusSchema = ResearchSchema.extend({
  status: z.enum(RESEARCH_STATUS),
  uids: z.array(z.string()).default([]), // Keycloak sub (UUID) of users who can edit this research
})
export type ResearchWithStatus = z.infer<typeof ResearchWithStatusSchema>

/**
 * Research response with status info
 */
export const ResearchResponseSchema = ResearchWithStatusSchema.extend({
  datasets: z.array(DatasetSchema).optional(), // Embedded datasets (for detail view)
})
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>

/**
 * Research list response
 */
export const ResearchListResponseSchema = z.object({
  data: z.array(ResearchResponseSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
})
export type ResearchListResponse = z.infer<typeof ResearchListResponseSchema>

// === Research UIDs API ===

/**
 * Update Research UIDs (owner list) request
 * Includes optimistic locking fields
 */
export const UpdateUidsRequestSchema = z.object({
  uids: z.array(z.string()).describe("Keycloak sub (UUID) array of users who can edit this research"),
  _seq_no: z.number().describe("Sequence number for optimistic locking"),
  _primary_term: z.number().describe("Primary term for optimistic locking"),
})
export type UpdateUidsRequest = z.infer<typeof UpdateUidsRequestSchema>

/**
 * Update UIDs response
 */
export const UpdateUidsResponseSchema = z.object({
  humId: z.string()
    .describe("Research identifier"),
  uids: z.array(z.string())
    .describe("Updated list of Keycloak user IDs (sub) who can edit this Research"),
})
export type UpdateUidsResponse = z.infer<typeof UpdateUidsResponseSchema>

// === Version API ===

/**
 * Create version request
 * Note: datasets are automatically copied from the previous version
 */
export const CreateVersionRequestSchema = z.object({
  releaseNote: BilingualTextValueSchema.optional()
    .describe("Bilingual release note describing changes in this version"),
})
export type CreateVersionRequest = z.infer<typeof CreateVersionRequestSchema>

/**
 * Version response
 */
export const VersionResponseSchema = ResearchVersionSchema.extend({
  datasets: z.array(DatasetSchema).optional(),
})
export type VersionResponse = z.infer<typeof VersionResponseSchema>

/**
 * Versions list response
 */
export const VersionsListResponseSchema = z.object({
  data: z.array(VersionResponseSchema),
})
export type VersionsListResponse = z.infer<typeof VersionsListResponseSchema>

// Research versions response
export const ResearchVersionsResponseSchema = z.object({
  data: z.array(EsResearchVersionDocSchema),
})
export type ResearchVersionsResponse = z.infer<typeof ResearchVersionsResponseSchema>

// Dataset versions response
export const DatasetVersionsResponseSchema = z.object({
  data: z.array(DatasetVersionItemSchema),
})
export type DatasetVersionsResponse = z.infer<typeof DatasetVersionsResponseSchema>

// === Dataset API ===

/**
 * Create dataset request
 * Note: datasetId, version, versionReleaseDate are auto-generated
 */
export const CreateDatasetRequestSchema = z.object({
  // Link target
  humId: z.string(),
  humVersionId: z.string(),

  // Dataset fields
  releaseDate: z.string(),
  criteria: CriteriaCanonicalSchema,
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }),
  experiments: z.array(ExperimentSchemaBase),
})
export type CreateDatasetRequest = z.infer<typeof CreateDatasetRequestSchema>

/**
 * Update dataset request (full replacement)
 * Note: datasetId, version, versionReleaseDate cannot be changed
 * Includes optimistic locking fields (_seq_no, _primary_term) for concurrent edit detection
 */
export const UpdateDatasetRequestSchema = z.object({
  humId: z.string(),
  humVersionId: z.string(),
  releaseDate: z.string(),
  criteria: CriteriaCanonicalSchema,
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }),
  experiments: z.array(ExperimentSchemaBase),
  _seq_no: z.number().describe("Sequence number for optimistic locking"),
  _primary_term: z.number().describe("Primary term for optimistic locking"),
})
export type UpdateDatasetRequest = z.infer<typeof UpdateDatasetRequestSchema>

/**
 * Dataset with metadata
 */
export const DatasetWithMetadataSchema = DatasetSchema.extend({
  ownerId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type DatasetWithMetadata = z.infer<typeof DatasetWithMetadataSchema>

/**
 * Dataset list response
 */
export const DatasetListResponseSchema = z.object({
  data: z.array(DatasetWithMetadataSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
})
export type DatasetListResponse = z.infer<typeof DatasetListResponseSchema>

// === Create Dataset for Research ===

/**
 * Create dataset request for POST /research/{humId}/dataset/new
 * All fields are optional - defaults will be used
 */
export const CreateDatasetForResearchRequestSchema = z.object({
  datasetId: z.string().optional()
    .describe("Dataset ID. Auto-generated (DRAFT-{humId}-{uuid}) if not provided."),
  releaseDate: z.string().optional()
    .describe("ISO 8601 date for dataset release. Defaults to current date."),
  criteria: CriteriaCanonicalSchema.optional()
    .describe("Data access criteria. Defaults to 'Controlled-access (Type I)'."),
  typeOfData: BilingualTextSchema.optional()
    .describe("Bilingual description of the data type"),
  experiments: z.array(ExperimentSchemaBase).optional()
    .describe("Array of experiment records. Defaults to empty array."),
})
export type CreateDatasetForResearchRequest = z.infer<typeof CreateDatasetForResearchRequestSchema>

// === Link API (Research-Dataset relationship) ===

/**
 * Linked datasets response
 */
export const LinkedDatasetsResponseSchema = z.object({
  data: z.array(EsDatasetDocSchema),
})
export type LinkedDatasetsResponse = z.infer<typeof LinkedDatasetsResponseSchema>

/**
 * Linked researches response
 * Note: Uses EsResearchDetailSchema (without versionIds) for API responses
 */
export const LinkedResearchesResponseSchema = z.object({
  data: z.array(EsResearchDetailSchema),
})
export type LinkedResearchesResponse = z.infer<typeof LinkedResearchesResponseSchema>

// === Status Transition API ===

/**
 * Workflow response (for submit, approve, reject, unpublish)
 * Returns current state for optimistic locking
 */
export const WorkflowResponseSchema = z.object({
  humId: z.string()
    .describe("Research identifier"),
  status: z.enum(RESEARCH_STATUS)
    .describe("Current status after the workflow action: 'draft', 'review', 'published', or 'deleted'"),
  dateModified: z.string()
    .describe("ISO 8601 timestamp when the Research was last modified"),
  _seq_no: z.number()
    .describe("Elasticsearch sequence number for subsequent updates"),
  _primary_term: z.number()
    .describe("Elasticsearch primary term for subsequent updates"),
})
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>

// === Search Responses ===

export const ResearchSearchResponseSchema = z.object({
  data: z.array(ResearchSummarySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  facets: FacetsMapSchema.optional(),
})
export type ResearchSearchResponse = z.infer<typeof ResearchSearchResponseSchema>

export const DatasetSearchResponseSchema = z.object({
  data: z.array(EsDatasetDocSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  facets: FacetsMapSchema.optional(),
})
export type DatasetSearchResponse = z.infer<typeof DatasetSearchResponseSchema>

// === Search Result Items ===

/**
 * Search result item (Research)
 */
export const SearchResearchResultSchema = z.object({
  type: z.literal("research"),
  humId: z.string(),
  title: BilingualTextSchema,
  summary: z.string().optional(),
  dataProvider: z.array(z.string()),
  releaseDate: z.string().optional(),
  score: z.number().optional(),
  highlights: z.record(z.string(), z.array(z.string())).optional(),
})
export type SearchResearchResult = z.infer<typeof SearchResearchResultSchema>

/**
 * Search result item (Dataset)
 */
export const SearchDatasetResultSchema = z.object({
  type: z.literal("dataset"),
  datasetId: z.string(),
  humId: z.string(), // Parent research
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }).optional(),
  criteria: CriteriaCanonicalSchema.optional(),
  score: z.number().optional(),
  highlights: z.record(z.string(), z.array(z.string())).optional(),
})
export type SearchDatasetResult = z.infer<typeof SearchDatasetResultSchema>

/**
 * Combined search response
 */
export const SearchResponseSchema = z.object({
  data: z.array(z.union([SearchResearchResultSchema, SearchDatasetResultSchema])),
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
export type SearchResponse = z.infer<typeof SearchResponseSchema>

/**
 * Facets response
 */
export const FacetsResponseSchema = z.object({
  facets: z.record(z.string(), z.array(z.object({
    value: z.string(),
    count: z.number(),
  }))),
})
export type FacetsResponse = z.infer<typeof FacetsResponseSchema>

/**
 * Facet value with count
 */
export const FacetValueWithCountSchema = z.object({
  value: z.string()
    .describe("The facet value (e.g., 'WGS', 'Controlled-access (Type I)')"),
  count: z.number()
    .describe("Number of resources matching this facet value"),
})
export type FacetValueWithCount = z.infer<typeof FacetValueWithCountSchema>

/**
 * Single facet field response (with counts)
 */
export const FacetFieldResponseSchema = z.object({
  fieldName: z.string()
    .describe("The facet field name (e.g., 'assayType', 'criteria', 'platform')"),
  values: z.array(FacetValueWithCountSchema)
    .describe("Available values for this facet with their counts"),
})
export type FacetFieldResponse = z.infer<typeof FacetFieldResponseSchema>

/**
 * All facets response (GET /facets) - with counts
 */
export const AllFacetsResponseSchema = z.record(z.string(), z.array(FacetValueWithCountSchema))
  .describe("Map of facet field names to their available values with counts")
export type AllFacetsResponse = z.infer<typeof AllFacetsResponseSchema>

// === Path Parameters ===

export const HumIdParamsSchema = z.object({
  humId: z.string()
    .describe("Research identifier (e.g., 'hum0001'). Unique across all Research resources."),
})
export type HumIdParams = z.infer<typeof HumIdParamsSchema>

export const DatasetIdParamsSchema = z.object({
  datasetId: z.string()
    .describe("Dataset identifier (e.g., 'JGAD000001'). Unique across all Dataset resources."),
})
export type DatasetIdParams = z.infer<typeof DatasetIdParamsSchema>

export const VersionParamsSchema = z.object({
  humId: z.string()
    .describe("Research identifier (e.g., 'hum0001')"),
  version: z.string().regex(/^v\d+$/)
    .describe("Version number in format v1, v2, v3, etc. (e.g., 'v1', 'v2')"),
})
export type VersionParams = z.infer<typeof VersionParamsSchema>

export const DatasetVersionParamsSchema = z.object({
  datasetId: z.string()
    .describe("Dataset identifier (e.g., 'JGAD000001')"),
  version: z.string().regex(/^v\d+$/)
    .describe("Version number in format v1, v2, v3, etc. (e.g., 'v1', 'v2')"),
})
export type DatasetVersionParams = z.infer<typeof DatasetVersionParamsSchema>

// === Simple Response Schemas ===

export const HealthResponseSchema = z.object({
  status: z.string()
    .describe("Health status indicator ('ok' when healthy)"),
  timestamp: z.string()
    .describe("ISO 8601 timestamp of the health check"),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const IsAdminResponseSchema = z.object({
  isAdmin: z.boolean()
    .describe("Whether the authenticated user has admin privileges"),
})
export type IsAdminResponse = z.infer<typeof IsAdminResponseSchema>

// === Stats API ===

/**
 * Stats facet counts per Research/Dataset
 */
export const StatsFacetCountSchema = z.object({
  research: z.number()
    .describe("Number of Research resources with this facet value"),
  dataset: z.number()
    .describe("Number of Dataset resources with this facet value"),
})
export type StatsFacetCount = z.infer<typeof StatsFacetCountSchema>

/**
 * Stats response (GET /stats)
 * Returns counts and facets for published resources
 * Facets include both Research and Dataset counts per value
 */
export const StatsResponseSchema = z.object({
  research: z.object({
    total: z.number()
      .describe("Total number of published Research resources"),
  }).describe("Research resource statistics"),
  dataset: z.object({
    total: z.number()
      .describe("Total number of published Dataset resources"),
  }).describe("Dataset resource statistics"),
  facets: z.record(z.string(), z.record(z.string(), StatsFacetCountSchema))
    .describe("Facet aggregations with Research/Dataset counts per value. Outer key is field name (e.g., 'criteria'), inner key is facet value."),
})
export type StatsResponse = z.infer<typeof StatsResponseSchema>

/**
 * Create unified single response schema (with optimistic locking)
 */
export const createUnifiedSingleResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: ResponseMetaWithLockSchema,
  })

/**
 * Create unified single read-only response schema
 */
export const createUnifiedSingleReadOnlyResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: ResponseMetaReadOnlySchema,
  })

/**
 * Create unified list response schema
 */
export const createUnifiedListResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: ResponseMetaWithPaginationSchema,
  })

/**
 * Create unified search response schema with facets
 */
export const createUnifiedSearchResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: ResponseMetaWithPaginationSchema,
    facets: FacetsMapSchema.optional(),
  })

// Re-export schemas for route definitions (ResearchSchema, ResearchVersionSchema only - DatasetSchema defined above)
export { ResearchSchema, ResearchVersionSchema }
