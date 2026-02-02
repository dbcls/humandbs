/**
 * API-specific type definitions
 *
 * This module provides:
 * - Authentication & authorization types (JWT, AuthUser)
 * - Research workflow types (status, transitions)
 * - API request/response schemas (CRUD operations, search, pagination)
 *
 * Dependency flow: crawler/types → es/types → api/types
 *
 * For ES document types and zod schemas, see: @/es/types
 * For crawler types (structured data), see: @/crawler/types
 */
import { z } from "zod"

// Import Zod schemas from es/types (which re-exports from crawler/types)
import {
  TextValueSchema,
  BilingualTextSchema,
  BilingualTextValueSchema,
  CriteriaCanonicalSchema,
  PersonSchema,
  ResearchProjectSchema,
  GrantSchema,
  PublicationSchema,
  SummarySchema,
  DatasetRefSchema,
  EsDatasetSchema,
  EsResearchSchema,
  EsResearchVersionSchema,
  ResearchStatusSchema as EsResearchStatusSchema,
  // Crawler schemas (for API request validation)
  CrawlerResearchSchema as ResearchSchema,
  CrawlerResearchVersionSchema as ResearchVersionSchema,
} from "@/es/types"

// Re-export ES types for convenience
export type {
  EsDataset,
  EsResearch,
  EsResearchVersion,
  EsExperiment,
  EsPerson,
  EsGrant,
  EsPublication,
  EsSummary,
} from "@/es/types"

// === Common Schemas ===

export const langType = ["ja", "en"] as const
export type LangType = (typeof langType)[number]

const booleanFromString = z.preprocess(
  (v) => v === "true" ? true : v === "false" ? false : undefined,
  z.boolean().optional(),
)

// === API-specific schemas (using imported schemas from es/types) ===

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
const DatasetSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
  versionReleaseDate: z.string(),
  humId: z.string(),
  humVersionId: z.string(),
  releaseDate: z.string(),
  criteria: CriteriaCanonicalSchema,
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }),
  experiments: z.array(ExperimentSchemaBase),
})

// === Re-export ES schemas for convenience ===

// Research status (re-export from es/types)
export const ResearchStatusSchema = EsResearchStatusSchema
export type EsResearchStatus = z.infer<typeof ResearchStatusSchema>

// Dataset reference (re-export from es/types)
export { DatasetRefSchema }
export type DatasetRef = z.infer<typeof DatasetRefSchema>

// Dataset document (alias to ES schema)
export const EsDatasetDocSchema = EsDatasetSchema
export type EsDatasetDoc = z.infer<typeof EsDatasetDocSchema>

// ResearchVersion document (alias to ES schema)
export const EsResearchVersionDocSchema = EsResearchVersionSchema
export type EsResearchVersionDoc = z.infer<typeof EsResearchVersionDocSchema>

// Research document (alias to ES schema)
export const EsResearchDocSchema = EsResearchSchema
export type EsResearchDoc = z.infer<typeof EsResearchDocSchema>

// Research detail (Research + ResearchVersion info + Datasets)
export const EsResearchDetailSchema = EsResearchDocSchema
  .omit({ versionIds: true })
  .extend({
    humVersionId: z.string(),
    version: z.string(),
    versionReleaseDate: z.string(),
    releaseNote: BilingualTextValueSchema,
    datasets: z.array(EsDatasetDocSchema),
  })
export type EsResearchDetail = z.infer<typeof EsResearchDetailSchema>

// Dataset version item (for version list)
export const DatasetVersionItemSchema = z.object({
  version: z.string(),
  typeOfData: BilingualTextSchema.nullable().optional(),
  criteria: CriteriaCanonicalSchema.nullable().optional(),
  releaseDate: z.string().nullable().optional(),
})
export type DatasetVersionItem = z.infer<typeof DatasetVersionItemSchema>

// Lang version query
export const LangVersionQuerySchema = z.object({
  lang: z.enum(langType).default("ja"),
  version: z.string().regex(/^v\d+$/).nullable().optional(),
  includeRawHtml: z.coerce.boolean().default(false),
})
export type LangVersionQuery = z.infer<typeof LangVersionQuerySchema>

// Lang query
export const LangQuerySchema = z.object({
  lang: z.enum(langType).default("ja"),
  includeRawHtml: z.coerce.boolean().default(false),
})
export type LangQuery = z.infer<typeof LangQuerySchema>

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

// Note: ResearchSchema and ResearchVersionSchema are imported from @/es/types
// via the import block at the top of this file

// === Authentication & Authorization ===

/**
 * JWT claims from Keycloak
 * Note: We only use sub (UID) from Keycloak. Role information is not extracted from JWT.
 * Admin determination is done via admin_uids.json file.
 */
export const JwtClaimsSchema = z.object({
  sub: z.string(),
  preferred_username: z.string().optional(),
  email: z.string().optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
})
export type JwtClaims = z.infer<typeof JwtClaimsSchema>

/**
 * Authenticated user context
 * Note: Roles are NOT extracted from Keycloak JWT.
 * - isAdmin is determined by admin_uids.json file
 * - Owner status is determined by Research.researcherUids field
 */
export const AuthUserSchema = z.object({
  userId: z.string(),
  username: z.string().optional(),
  email: z.string().optional(),
  isAdmin: z.boolean(), // Determined by admin_uids.json
})
export type AuthUser = z.infer<typeof AuthUserSchema>

// === Research Status & Workflow ===

/**
 * Research publication status
 */
export const ResearchStatus = ["draft", "review", "published"] as const
export type ResearchStatus = (typeof ResearchStatus)[number]

/**
 * Status transition actions
 */
export const StatusAction = ["submit", "approve", "reject", "unpublish"] as const
export type StatusAction = (typeof StatusAction)[number]

/**
 * Valid status transitions
 */
export const StatusTransitions: Record<StatusAction, { from: ResearchStatus; to: ResearchStatus }> = {
  submit: { from: "draft", to: "review" },
  approve: { from: "review", to: "published" },
  reject: { from: "review", to: "draft" },
  unpublish: { from: "published", to: "draft" },
}

/**
 * Research with status (extends Research with API-specific fields)
 */
export const ResearchWithStatusSchema = ResearchSchema.extend({
  status: z.enum(ResearchStatus),
  uids: z.array(z.string()).default([]), // Keycloak sub (UUID) of users who can edit this research
})
export type ResearchWithStatus = z.infer<typeof ResearchWithStatusSchema>

// === API Request/Response Types ===

/**
 * Extended error response with details
 */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
    timestamp: z.string(),
  }),
})
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>

/**
 * Error codes
 */
export const ErrorCode = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const
export type ErrorCode = (typeof ErrorCode)[number]

// === Research API ===

/**
 * Create research request
 * Creates Research + initial ResearchVersion (v1) simultaneously
 * Note: humId, versionIds, latestVersion, datePublished, dateModified are auto-generated
 * All fields are optional - defaults will be used for missing fields
 */
export const CreateResearchRequestSchema = z.object({
  // Optional humId - auto-generated if not provided (hum0001, hum0002, ...)
  humId: z.string().optional(),

  // Research fields - all optional with defaults
  title: BilingualTextSchema.optional(),
  summary: SummarySchema.optional(),
  dataProvider: z.array(PersonSchema).optional(),
  researchProject: z.array(ResearchProjectSchema).optional(),
  grant: z.array(GrantSchema).optional(),
  relatedPublication: z.array(PublicationSchema).optional(),

  // Admin assigns owner UIDs (optional, defaults to empty array)
  uids: z.array(z.string()).optional(),

  // Initial version release note (optional)
  initialReleaseNote: BilingualTextValueSchema.optional(),
})
export type CreateResearchRequest = z.infer<typeof CreateResearchRequestSchema>

/**
 * Update research request (full replacement)
 * Note: humId, url, versionIds, latestVersion, datePublished, dateModified cannot be changed
 * url is auto-generated from humId
 */
export const UpdateResearchRequestSchema = z.object({
  title: BilingualTextSchema,
  summary: SummarySchema,
  dataProvider: z.array(PersonSchema),
  researchProject: z.array(ResearchProjectSchema),
  grant: z.array(GrantSchema),
  relatedPublication: z.array(PublicationSchema),
  controlledAccessUser: z.array(PersonSchema),
})
export type UpdateResearchRequest = z.infer<typeof UpdateResearchRequestSchema>

/**
 * Research list query parameters
 */
export const ResearchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["humId", "title", "releaseDate", "updatedAt"]).default("humId"),
  order: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(ResearchStatus).optional(), // For authenticated users
})
export type ResearchListQuery = z.infer<typeof ResearchListQuerySchema>

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
  humId: z.string(),
  uids: z.array(z.string()),
})
export type UpdateUidsResponse = z.infer<typeof UpdateUidsResponseSchema>

// === Version API ===

/**
 * Create version request
 * Note: datasets are automatically copied from the previous version
 */
export const CreateVersionRequestSchema = z.object({
  releaseNote: BilingualTextValueSchema.optional(),
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
 * Dataset list query parameters
 */
export const DatasetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["datasetId", "releaseDate", "updatedAt"]).default("datasetId"),
  order: z.enum(["asc", "desc"]).default("asc"),
})
export type DatasetListQuery = z.infer<typeof DatasetListQuerySchema>

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

// === Facets ===

export const FacetItemSchema = z.object({
  value: z.string(),
  count: z.number(),
})
export type FacetItem = z.infer<typeof FacetItemSchema>

export const FacetsMapSchema = z.record(z.string(), z.array(FacetItemSchema))
export type FacetsMap = z.infer<typeof FacetsMapSchema>

// === Research Summary (for list view) ===

export const ResearchSummarySchema = z.object({
  humId: z.string(),
  lang: z.enum(langType),
  title: z.string(),
  versions: z.array(z.object({
    version: z.string(),
    releaseDate: z.string(),
  })),
  methods: z.string(),
  datasetIds: z.array(z.string()),
  typeOfData: z.array(z.string()),
  platforms: z.array(z.string()),
  targets: z.string(),
  dataProvider: z.array(z.string()),
  criteria: z.string(),
})
export type ResearchSummary = z.infer<typeof ResearchSummarySchema>

// === Research Listing Query (GET /research) ===

/**
 * Research listing query parameters (GET /research)
 * For complex searches with filters, use POST /research/search instead
 */
export const ResearchListingQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  lang: z.enum(langType).default("ja"),
  sort: z.enum(["humId", "title", "releaseDate"]).default("humId"),
  order: z.enum(["asc", "desc"]).default("asc"),

  // Status filter (admin only for non-published)
  status: z.enum(["draft", "review", "published", "deleted"]).optional(),

  // Optional humId filter for specific research
  humId: z.string().optional(),

  // Include facet counts in response
  includeFacets: booleanFromString,

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false),
})
export type ResearchListingQuery = z.infer<typeof ResearchListingQuerySchema>

// === Research Search Query & Response ===

export const ResearchSearchQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  lang: z.enum(langType).default("ja"),
  sort: z.enum(["humId", "title", "releaseDate", "relevance"]).default("humId"),
  order: z.enum(["asc", "desc"]).default("asc"),

  // Status filter (admin only for non-published)
  status: z.enum(["draft", "review", "published", "deleted"]).optional(),

  // Full-text search
  q: z.string().optional(),

  // Research-specific filters (legacy, kept for backwards compatibility)
  releasedAfter: z.string().optional(),  // ISO 8601 date
  releasedBefore: z.string().optional(), // ISO 8601 date

  // Date range filters for POST search
  minDatePublished: z.string().optional(), // datePublished >= (ISO 8601 date)
  maxDatePublished: z.string().optional(), // datePublished <= (ISO 8601 date)
  minDateModified: z.string().optional(),  // dateModified >= (ISO 8601 date)
  maxDateModified: z.string().optional(),  // dateModified <= (ISO 8601 date)

  // Filter Research by Dataset attributes (comma-separated for OR)
  assayType: z.string().optional(),
  disease: z.string().optional(),
  diseaseIcd10: z.string().optional(),  // ICD-10 code prefix match
  tissue: z.string().optional(),
  population: z.string().optional(),
  platform: z.string().optional(),
  criteria: z.string().optional(),
  fileType: z.string().optional(),
  minSubjects: z.coerce.number().int().min(0).optional(),
  maxSubjects: z.coerce.number().int().min(0).optional(),

  // Extended filters
  healthStatus: z.string().optional(),  // healthy/affected/mixed (use this instead of hasHealthyControl)
  subjectCountType: z.string().optional(),  // individual/sample/mixed
  sex: z.string().optional(),  // male/female/mixed
  ageGroup: z.string().optional(),  // infant/child/adult/elderly/mixed
  libraryKits: z.string().optional(),
  readType: z.string().optional(),  // single-end/paired-end
  referenceGenome: z.string().optional(),
  processedDataTypes: z.string().optional(),
  hasPhenotypeData: booleanFromString,
  cellLine: z.string().optional(),  // exact match
  isTumor: booleanFromString,
  policyId: z.string().optional(),

  // Range filters
  minReleaseDate: z.string().optional(),
  maxReleaseDate: z.string().optional(),
  minReadLength: z.coerce.number().int().min(0).optional(),
  maxReadLength: z.coerce.number().int().min(0).optional(),
  minSequencingDepth: z.coerce.number().min(0).optional(),
  maxSequencingDepth: z.coerce.number().min(0).optional(),
  minTargetCoverage: z.coerce.number().min(0).optional(),
  maxTargetCoverage: z.coerce.number().min(0).optional(),
  minDataVolumeGb: z.coerce.number().min(0).optional(),
  maxDataVolumeGb: z.coerce.number().min(0).optional(),
  minVariantSnv: z.coerce.number().int().min(0).optional(),
  maxVariantSnv: z.coerce.number().int().min(0).optional(),
  minVariantIndel: z.coerce.number().int().min(0).optional(),
  maxVariantIndel: z.coerce.number().int().min(0).optional(),
  minVariantCnv: z.coerce.number().int().min(0).optional(),
  maxVariantCnv: z.coerce.number().int().min(0).optional(),
  minVariantSv: z.coerce.number().int().min(0).optional(),
  maxVariantSv: z.coerce.number().int().min(0).optional(),
  minVariantTotal: z.coerce.number().int().min(0).optional(),
  maxVariantTotal: z.coerce.number().int().min(0).optional(),

  // Include facet counts in response
  includeFacets: booleanFromString,

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false),
})
export type ResearchSearchQuery = z.infer<typeof ResearchSearchQuerySchema>

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

// === Dataset Listing Query (GET /dataset) ===

/**
 * Dataset listing query parameters (GET /dataset)
 * For complex searches with filters, use POST /dataset/search instead
 */
export const DatasetListingQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  lang: z.enum(langType).default("ja"),
  sort: z.enum(["datasetId", "releaseDate"]).default("datasetId"),
  order: z.enum(["asc", "desc"]).default("asc"),

  // Parent Research ID filter
  humId: z.string().optional(),

  // Include facet counts in response
  includeFacets: booleanFromString,

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false),
})
export type DatasetListingQuery = z.infer<typeof DatasetListingQuerySchema>

// === Dataset Search Query & Response ===

export const DatasetSearchQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  lang: z.enum(langType).default("ja"),
  sort: z.enum(["datasetId", "releaseDate", "subjectCount", "relevance"]).default("datasetId"),
  order: z.enum(["asc", "desc"]).default("asc"),

  // Full-text search
  q: z.string().optional(),

  // Dataset filters
  humId: z.string().optional(),  // Parent Research ID (exact match)
  criteria: z.string().optional(),  // Comma-separated for OR
  typeOfData: z.string().optional(),  // Partial match
  assayType: z.string().optional(),  // Comma-separated for OR
  disease: z.string().optional(),  // Partial match on label
  diseaseIcd10: z.string().optional(),  // ICD-10 code prefix match
  tissue: z.string().optional(),  // Comma-separated for OR
  population: z.string().optional(),  // Comma-separated for OR
  platform: z.string().optional(),  // Comma-separated for OR (platform model)
  fileType: z.string().optional(),  // Comma-separated for OR
  minSubjects: z.coerce.number().int().min(0).optional(),
  maxSubjects: z.coerce.number().int().min(0).optional(),

  // Extended filters
  healthStatus: z.string().optional(),  // healthy/affected/mixed (use this instead of hasHealthyControl)
  subjectCountType: z.string().optional(),  // individual/sample/mixed
  sex: z.string().optional(),  // male/female/mixed
  ageGroup: z.string().optional(),  // infant/child/adult/elderly/mixed
  libraryKits: z.string().optional(),
  readType: z.string().optional(),  // single-end/paired-end
  referenceGenome: z.string().optional(),
  processedDataTypes: z.string().optional(),
  hasPhenotypeData: booleanFromString,
  cellLine: z.string().optional(),  // exact match
  isTumor: booleanFromString,
  policyId: z.string().optional(),

  // Range filters
  minReleaseDate: z.string().optional(),
  maxReleaseDate: z.string().optional(),
  minReadLength: z.coerce.number().int().min(0).optional(),
  maxReadLength: z.coerce.number().int().min(0).optional(),
  minSequencingDepth: z.coerce.number().min(0).optional(),
  maxSequencingDepth: z.coerce.number().min(0).optional(),
  minTargetCoverage: z.coerce.number().min(0).optional(),
  maxTargetCoverage: z.coerce.number().min(0).optional(),
  minDataVolumeGb: z.coerce.number().min(0).optional(),
  maxDataVolumeGb: z.coerce.number().min(0).optional(),
  minVariantSnv: z.coerce.number().int().min(0).optional(),
  maxVariantSnv: z.coerce.number().int().min(0).optional(),
  minVariantIndel: z.coerce.number().int().min(0).optional(),
  maxVariantIndel: z.coerce.number().int().min(0).optional(),
  minVariantCnv: z.coerce.number().int().min(0).optional(),
  maxVariantCnv: z.coerce.number().int().min(0).optional(),
  minVariantSv: z.coerce.number().int().min(0).optional(),
  maxVariantSv: z.coerce.number().int().min(0).optional(),
  minVariantTotal: z.coerce.number().int().min(0).optional(),
  maxVariantTotal: z.coerce.number().int().min(0).optional(),

  // Include facet counts in response
  includeFacets: booleanFromString,

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false),
})
export type DatasetSearchQuery = z.infer<typeof DatasetSearchQuerySchema>

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

// === POST Search API (api-spec.md compliant) ===

/**
 * Range filter for numeric/date values
 */
const RangeFilterSchema = z.object({
  min: z.union([z.string(), z.number()]).optional(),
  max: z.union([z.string(), z.number()]).optional(),
})

/**
 * Dataset filters for POST search (used in both Research and Dataset search)
 * Values are arrays (OR logic within each filter)
 */
export const DatasetFiltersSchema = z.object({
  // Facet filters (category values)
  criteria: z.array(z.string()).optional(),
  subjectCountType: z.array(z.enum(["individual", "sample", "mixed"])).optional(),
  healthStatus: z.array(z.enum(["healthy", "affected", "mixed"])).optional(),
  disease: z.string().optional(), // Partial match
  diseaseIcd10: z.array(z.string()).optional(), // Prefix match
  tissue: z.array(z.string()).optional(),
  isTumor: z.boolean().optional(),
  cellLine: z.array(z.string()).optional(),
  population: z.array(z.string()).optional(),
  sex: z.array(z.enum(["male", "female", "mixed"])).optional(),
  ageGroup: z.array(z.enum(["infant", "child", "adult", "elderly", "mixed"])).optional(),
  assayType: z.array(z.string()).optional(),
  libraryKits: z.array(z.string()).optional(),
  platform: z.array(z.string()).optional(), // Platform (vendor or model)
  readType: z.array(z.enum(["single-end", "paired-end"])).optional(),
  referenceGenome: z.array(z.string()).optional(),
  fileType: z.array(z.string()).optional(),
  processedDataTypes: z.array(z.string()).optional(),
  hasPhenotypeData: z.boolean().optional(),
  policyId: z.array(z.string()).optional(),

  // Range filters
  releaseDate: RangeFilterSchema.optional(),
  subjectCount: RangeFilterSchema.optional(),
  readLength: RangeFilterSchema.optional(),
  sequencingDepth: RangeFilterSchema.optional(),
  targetCoverage: RangeFilterSchema.optional(),
  dataVolumeGb: RangeFilterSchema.optional(),
  variantSnv: RangeFilterSchema.optional(),
  variantIndel: RangeFilterSchema.optional(),
  variantCnv: RangeFilterSchema.optional(),
  variantSv: RangeFilterSchema.optional(),
  variantTotal: RangeFilterSchema.optional(),
})
export type DatasetFilters = z.infer<typeof DatasetFiltersSchema>

/**
 * POST /research/search request body
 */
export const ResearchSearchBodySchema = z.object({
  // Pagination
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),

  // Sort
  sort: z.enum(["humId", "datePublished", "dateModified", "relevance"]).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),

  // Free-text search
  query: z.string().optional(), // Searches title, summary

  // Date range filters
  datePublished: RangeFilterSchema.optional(),
  dateModified: RangeFilterSchema.optional(),

  // Dataset attribute filters (parent-child filter)
  datasetFilters: DatasetFiltersSchema.optional(),

  // Options
  includeFacets: z.boolean().default(false),
  fields: z.array(z.string()).optional(), // Additional fields to return
})
export type ResearchSearchBody = z.infer<typeof ResearchSearchBodySchema>

/**
 * POST /dataset/search request body
 */
export const DatasetSearchBodySchema = z.object({
  // Pagination
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),

  // Sort
  sort: z.enum(["datasetId", "releaseDate", "relevance"]).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),

  // S2: Free-text search (unified query instead of separate metadataQuery/experimentQuery)
  query: z.string().optional(), // Searches typeOfData, experiments

  // Parent Research filter
  humId: z.string().optional(),

  // Dataset filters
  filters: DatasetFiltersSchema.optional(),

  // Options
  includeFacets: z.boolean().default(false),
  fields: z.array(z.string()).optional(), // Additional fields to return
})
export type DatasetSearchBody = z.infer<typeof DatasetSearchBodySchema>

/**
 * Facet value with count
 */
export const FacetValueWithCountSchema = z.object({
  value: z.string(),
  count: z.number(),
})
export type FacetValueWithCount = z.infer<typeof FacetValueWithCountSchema>

/**
 * Single facet field response (with counts)
 */
export const FacetFieldResponseSchema = z.object({
  fieldName: z.string(),
  values: z.array(FacetValueWithCountSchema),
})
export type FacetFieldResponse = z.infer<typeof FacetFieldResponseSchema>

/**
 * All facets response (GET /facets) - with counts
 */
export const AllFacetsResponseSchema = z.record(z.string(), z.array(FacetValueWithCountSchema))
export type AllFacetsResponse = z.infer<typeof AllFacetsResponseSchema>

// === Search API ===

/**
 * Search query parameters
 */
export const SearchQuerySchema = z.object({
  q: z.string().optional(), // Full-text search

  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["relevance", "releaseDate", "title"]).default("relevance"),
  order: z.enum(["asc", "desc"]).default("desc"),

  // Research filters
  dataProvider: z.string().optional(),
  organization: z.string().optional(),
  releasedAfter: z.string().optional(), // ISO 8601 date
  releasedBefore: z.string().optional(), // ISO 8601 date

  // Filter Research by Dataset attributes
  assayType: z.string().optional(),
  disease: z.string().optional(),
  tissue: z.string().optional(),
  platform: z.string().optional(),
  hasHealthyControl: z.coerce.boolean().optional(),

  // Dataset-specific filters
  criteria: z.string().optional(),
  minSubjects: z.coerce.number().int().min(0).optional(),
  maxSubjects: z.coerce.number().int().min(0).optional(),
})
export type SearchQuery = z.infer<typeof SearchQuerySchema>

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

// === Create Dataset for Research ===

/**
 * Create dataset request for POST /research/{humId}/dataset/new
 * All fields are optional - defaults will be used
 */
export const CreateDatasetForResearchRequestSchema = z.object({
  datasetId: z.string().optional(), // Auto-generated as DRAFT-{humId}-{uuid} if not provided
  releaseDate: z.string().optional(),
  criteria: CriteriaCanonicalSchema.optional(),
  typeOfData: BilingualTextSchema.optional(),
  experiments: z.array(ExperimentSchemaBase).optional(),
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
  humId: z.string(),
  status: z.enum(ResearchStatus),
  dateModified: z.string(),
  _seq_no: z.number(),
  _primary_term: z.number(),
})
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>

// === Utility Types ===

/**
 * API success response wrapper
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
  })

/**
 * Path parameters
 */
export const HumIdParamsSchema = z.object({
  humId: z.string(),
})
export type HumIdParams = z.infer<typeof HumIdParamsSchema>

export const DatasetIdParamsSchema = z.object({
  datasetId: z.string(),
})
export type DatasetIdParams = z.infer<typeof DatasetIdParamsSchema>

export const VersionParamsSchema = z.object({
  humId: z.string(),
  version: z.string().regex(/^v\d+$/),
})
export type VersionParams = z.infer<typeof VersionParamsSchema>

export const DatasetVersionParamsSchema = z.object({
  datasetId: z.string(),
  version: z.string().regex(/^v\d+$/),
})
export type DatasetVersionParams = z.infer<typeof DatasetVersionParamsSchema>

export const LinkParamsSchema = z.object({
  humId: z.string(),
  datasetId: z.string(),
})
export type LinkParams = z.infer<typeof LinkParamsSchema>

// === Simple Response Schemas ===

export const HealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const IsAdminResponseSchema = z.object({
  isAdmin: z.boolean(),
})
export type IsAdminResponse = z.infer<typeof IsAdminResponseSchema>

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().nullable().optional(),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

// === Stats API ===

/**
 * Stats facet counts per Research/Dataset
 */
export const StatsFacetCountSchema = z.object({
  research: z.number(),
  dataset: z.number(),
})
export type StatsFacetCount = z.infer<typeof StatsFacetCountSchema>

/**
 * Stats response (GET /stats)
 * Returns counts and facets for published resources
 * Facets include both Research and Dataset counts per value
 */
export const StatsResponseSchema = z.object({
  research: z.object({
    total: z.number(),
  }),
  dataset: z.object({
    total: z.number(),
  }),
  facets: z.record(z.string(), z.record(z.string(), StatsFacetCountSchema)),
})
export type StatsResponse = z.infer<typeof StatsResponseSchema>

// Re-export schemas for route definitions
// Note: ResearchSchema and ResearchVersionSchema are imported from @/es/types
// DatasetSchema is defined locally for API requests (without searchable field)
export { DatasetSchema, ResearchSchema, ResearchVersionSchema }
