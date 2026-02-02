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
  title: BilingualTextSchema
    .describe("Research title in Japanese and English"),
  summary: SummarySchema
    .describe("Research summary including aims, methods, and targets"),
  dataProvider: z.array(PersonSchema)
    .describe("Data providers (researchers providing the data)"),
  researchProject: z.array(ResearchProjectSchema)
    .describe("Related research projects"),
  grant: z.array(GrantSchema)
    .describe("Funding grants"),
  relatedPublication: z.array(PublicationSchema)
    .describe("Related publications (papers, preprints)"),
  controlledAccessUser: z.array(PersonSchema)
    .describe("Users with controlled access to the data"),
  _seq_no: z.number()
    .describe("Sequence number for optimistic locking. Obtained from GET response."),
  _primary_term: z.number()
    .describe("Primary term for optimistic locking. Obtained from GET response."),
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
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
  lang: z.enum(langType).default("ja")
    .describe("Response language for bilingual fields"),
  sort: z.enum(["humId", "title", "releaseDate"]).default("humId")
    .describe("Sort field"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order"),

  // Status filter (admin only for non-published)
  status: z.enum(["draft", "review", "published", "deleted"]).optional()
    .describe("Filter by status. public: published only, authenticated: own draft/review/published, admin: all including deleted"),

  // Optional humId filter for specific research
  humId: z.string().optional()
    .describe("Filter by specific Research ID"),

  // Include facet counts in response
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields (e.g., summary.aims.rawHtml) in response"),
})
export type ResearchListingQuery = z.infer<typeof ResearchListingQuerySchema>

// === Research Search Query & Response ===

export const ResearchSearchQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
  lang: z.enum(langType).default("ja")
    .describe("Response language for bilingual fields"),
  sort: z.enum(["humId", "title", "releaseDate", "relevance"]).default("humId")
    .describe("Sort field. Use 'relevance' for full-text search ranking"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order (default: desc when sort=relevance)"),

  // Status filter (admin only for non-published)
  status: z.enum(["draft", "review", "published", "deleted"]).optional()
    .describe("Filter by status. public: published only, authenticated: own draft/review/published, admin: all including deleted"),

  // Full-text search
  q: z.string().optional()
    .describe("Full-text search query. Searches title, aims, methods, and targets"),

  // Research-specific filters (legacy, kept for backwards compatibility)
  releasedAfter: z.string().optional()
    .describe("Filter by release date >= (ISO 8601 date, legacy)"),
  releasedBefore: z.string().optional()
    .describe("Filter by release date <= (ISO 8601 date, legacy)"),

  // Date range filters for POST search
  minDatePublished: z.string().optional()
    .describe("Filter by datePublished >= (ISO 8601 date)"),
  maxDatePublished: z.string().optional()
    .describe("Filter by datePublished <= (ISO 8601 date)"),
  minDateModified: z.string().optional()
    .describe("Filter by dateModified >= (ISO 8601 date)"),
  maxDateModified: z.string().optional()
    .describe("Filter by dateModified <= (ISO 8601 date)"),

  // Filter Research by Dataset attributes (comma-separated for OR)
  assayType: z.string().optional()
    .describe("Filter by assay type (comma-separated for OR, e.g., 'WGS,WES')"),
  disease: z.string().optional()
    .describe("Filter by disease label (partial match)"),
  diseaseIcd10: z.string().optional()
    .describe("Filter by ICD-10 code (prefix match, comma-separated for OR)"),
  tissue: z.string().optional()
    .describe("Filter by tissue type (comma-separated for OR)"),
  population: z.string().optional()
    .describe("Filter by population (comma-separated for OR)"),
  platform: z.string().optional()
    .describe("Filter by sequencing platform (comma-separated for OR)"),
  criteria: z.string().optional()
    .describe("Filter by data access criteria: Controlled-access (Type I/II), Unrestricted-access"),
  fileType: z.string().optional()
    .describe("Filter by file type (comma-separated for OR)"),
  minSubjects: z.coerce.number().int().min(0).optional()
    .describe("Minimum subject count"),
  maxSubjects: z.coerce.number().int().min(0).optional()
    .describe("Maximum subject count"),

  // Extended filters
  healthStatus: z.string().optional()
    .describe("Filter by health status: healthy, affected, mixed (comma-separated for OR)"),
  subjectCountType: z.string().optional()
    .describe("Filter by subject count type: individual, sample, mixed"),
  sex: z.string().optional()
    .describe("Filter by sex: male, female, mixed (comma-separated for OR)"),
  ageGroup: z.string().optional()
    .describe("Filter by age group: infant, child, adult, elderly, mixed (comma-separated for OR)"),
  libraryKits: z.string().optional()
    .describe("Filter by library preparation kit (comma-separated for OR)"),
  readType: z.string().optional()
    .describe("Filter by read type: single-end, paired-end"),
  referenceGenome: z.string().optional()
    .describe("Filter by reference genome (comma-separated for OR)"),
  processedDataTypes: z.string().optional()
    .describe("Filter by processed data types (comma-separated for OR)"),
  hasPhenotypeData: booleanFromString
    .describe("Filter by presence of phenotype data"),
  cellLine: z.string().optional()
    .describe("Filter by cell line (exact match)"),
  isTumor: booleanFromString
    .describe("Filter by tumor sample status"),
  policyId: z.string().optional()
    .describe("Filter by data access policy ID"),

  // Range filters
  minReleaseDate: z.string().optional()
    .describe("Filter by Dataset release date >= (ISO 8601 date)"),
  maxReleaseDate: z.string().optional()
    .describe("Filter by Dataset release date <= (ISO 8601 date)"),
  minReadLength: z.coerce.number().int().min(0).optional()
    .describe("Minimum read length (bp)"),
  maxReadLength: z.coerce.number().int().min(0).optional()
    .describe("Maximum read length (bp)"),
  minSequencingDepth: z.coerce.number().min(0).optional()
    .describe("Minimum sequencing depth (x)"),
  maxSequencingDepth: z.coerce.number().min(0).optional()
    .describe("Maximum sequencing depth (x)"),
  minTargetCoverage: z.coerce.number().min(0).optional()
    .describe("Minimum target coverage (%)"),
  maxTargetCoverage: z.coerce.number().min(0).optional()
    .describe("Maximum target coverage (%)"),
  minDataVolumeGb: z.coerce.number().min(0).optional()
    .describe("Minimum data volume (GB)"),
  maxDataVolumeGb: z.coerce.number().min(0).optional()
    .describe("Maximum data volume (GB)"),
  minVariantSnv: z.coerce.number().int().min(0).optional()
    .describe("Minimum SNV variant count"),
  maxVariantSnv: z.coerce.number().int().min(0).optional()
    .describe("Maximum SNV variant count"),
  minVariantIndel: z.coerce.number().int().min(0).optional()
    .describe("Minimum indel variant count"),
  maxVariantIndel: z.coerce.number().int().min(0).optional()
    .describe("Maximum indel variant count"),
  minVariantCnv: z.coerce.number().int().min(0).optional()
    .describe("Minimum CNV variant count"),
  maxVariantCnv: z.coerce.number().int().min(0).optional()
    .describe("Maximum CNV variant count"),
  minVariantSv: z.coerce.number().int().min(0).optional()
    .describe("Minimum SV variant count"),
  maxVariantSv: z.coerce.number().int().min(0).optional()
    .describe("Maximum SV variant count"),
  minVariantTotal: z.coerce.number().int().min(0).optional()
    .describe("Minimum total variant count"),
  maxVariantTotal: z.coerce.number().int().min(0).optional()
    .describe("Maximum total variant count"),

  // Include facet counts in response
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields in response"),
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
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
  lang: z.enum(langType).default("ja")
    .describe("Response language for bilingual fields"),
  sort: z.enum(["datasetId", "releaseDate"]).default("datasetId")
    .describe("Sort field"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order"),

  // Parent Research ID filter
  humId: z.string().optional()
    .describe("Filter by parent Research ID"),

  // Include facet counts in response
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields in response"),
})
export type DatasetListingQuery = z.infer<typeof DatasetListingQuerySchema>

// === Dataset Search Query & Response ===

export const DatasetSearchQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
  lang: z.enum(langType).default("ja")
    .describe("Response language for bilingual fields"),
  sort: z.enum(["datasetId", "releaseDate", "subjectCount", "relevance"]).default("datasetId")
    .describe("Sort field. Use 'relevance' for full-text search ranking"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order (default: desc when sort=relevance)"),

  // Full-text search
  q: z.string().optional()
    .describe("Full-text search query. Searches experiments (header, data, footers)"),

  // Dataset filters
  humId: z.string().optional()
    .describe("Filter by parent Research ID (exact match)"),
  criteria: z.string().optional()
    .describe("Filter by data access criteria (comma-separated for OR)"),
  typeOfData: z.string().optional()
    .describe("Filter by data type (partial match)"),
  assayType: z.string().optional()
    .describe("Filter by assay type (comma-separated for OR)"),
  disease: z.string().optional()
    .describe("Filter by disease label (partial match)"),
  diseaseIcd10: z.string().optional()
    .describe("Filter by ICD-10 code (prefix match, comma-separated for OR)"),
  tissue: z.string().optional()
    .describe("Filter by tissue type (comma-separated for OR)"),
  population: z.string().optional()
    .describe("Filter by population (comma-separated for OR)"),
  platform: z.string().optional()
    .describe("Filter by sequencing platform model (comma-separated for OR)"),
  fileType: z.string().optional()
    .describe("Filter by file type (comma-separated for OR)"),
  minSubjects: z.coerce.number().int().min(0).optional()
    .describe("Minimum subject count"),
  maxSubjects: z.coerce.number().int().min(0).optional()
    .describe("Maximum subject count"),

  // Extended filters
  healthStatus: z.string().optional()
    .describe("Filter by health status: healthy, affected, mixed (comma-separated for OR)"),
  subjectCountType: z.string().optional()
    .describe("Filter by subject count type: individual, sample, mixed"),
  sex: z.string().optional()
    .describe("Filter by sex: male, female, mixed (comma-separated for OR)"),
  ageGroup: z.string().optional()
    .describe("Filter by age group: infant, child, adult, elderly, mixed (comma-separated for OR)"),
  libraryKits: z.string().optional()
    .describe("Filter by library preparation kit (comma-separated for OR)"),
  readType: z.string().optional()
    .describe("Filter by read type: single-end, paired-end"),
  referenceGenome: z.string().optional()
    .describe("Filter by reference genome (comma-separated for OR)"),
  processedDataTypes: z.string().optional()
    .describe("Filter by processed data types (comma-separated for OR)"),
  hasPhenotypeData: booleanFromString
    .describe("Filter by presence of phenotype data"),
  cellLine: z.string().optional()
    .describe("Filter by cell line (exact match)"),
  isTumor: booleanFromString
    .describe("Filter by tumor sample status"),
  policyId: z.string().optional()
    .describe("Filter by data access policy ID"),

  // Range filters
  minReleaseDate: z.string().optional()
    .describe("Filter by release date >= (ISO 8601 date)"),
  maxReleaseDate: z.string().optional()
    .describe("Filter by release date <= (ISO 8601 date)"),
  minReadLength: z.coerce.number().int().min(0).optional()
    .describe("Minimum read length (bp)"),
  maxReadLength: z.coerce.number().int().min(0).optional()
    .describe("Maximum read length (bp)"),
  minSequencingDepth: z.coerce.number().min(0).optional()
    .describe("Minimum sequencing depth (x)"),
  maxSequencingDepth: z.coerce.number().min(0).optional()
    .describe("Maximum sequencing depth (x)"),
  minTargetCoverage: z.coerce.number().min(0).optional()
    .describe("Minimum target coverage (%)"),
  maxTargetCoverage: z.coerce.number().min(0).optional()
    .describe("Maximum target coverage (%)"),
  minDataVolumeGb: z.coerce.number().min(0).optional()
    .describe("Minimum data volume (GB)"),
  maxDataVolumeGb: z.coerce.number().min(0).optional()
    .describe("Maximum data volume (GB)"),
  minVariantSnv: z.coerce.number().int().min(0).optional()
    .describe("Minimum SNV variant count"),
  maxVariantSnv: z.coerce.number().int().min(0).optional()
    .describe("Maximum SNV variant count"),
  minVariantIndel: z.coerce.number().int().min(0).optional()
    .describe("Minimum indel variant count"),
  maxVariantIndel: z.coerce.number().int().min(0).optional()
    .describe("Maximum indel variant count"),
  minVariantCnv: z.coerce.number().int().min(0).optional()
    .describe("Minimum CNV variant count"),
  maxVariantCnv: z.coerce.number().int().min(0).optional()
    .describe("Maximum CNV variant count"),
  minVariantSv: z.coerce.number().int().min(0).optional()
    .describe("Minimum SV variant count"),
  maxVariantSv: z.coerce.number().int().min(0).optional()
    .describe("Maximum SV variant count"),
  minVariantTotal: z.coerce.number().int().min(0).optional()
    .describe("Minimum total variant count"),
  maxVariantTotal: z.coerce.number().int().min(0).optional()
    .describe("Maximum total variant count"),

  // Include facet counts in response
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields in response"),
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
  criteria: z.array(z.string()).optional()
    .describe("Data access criteria: Controlled-access (Type I/II), Unrestricted-access. Array for OR logic."),
  subjectCountType: z.array(z.enum(["individual", "sample", "mixed"])).optional()
    .describe("Subject count type: individual, sample, or mixed"),
  healthStatus: z.array(z.enum(["healthy", "affected", "mixed"])).optional()
    .describe("Health status: healthy, affected, or mixed"),
  disease: z.string().optional()
    .describe("Disease label partial match (free-text search)"),
  diseaseIcd10: z.array(z.string()).optional()
    .describe("ICD-10 disease codes (prefix match, e.g., 'C34' matches 'C34.1')"),
  tissue: z.array(z.string()).optional()
    .describe("Tissue types (facet selection)"),
  isTumor: z.boolean().optional()
    .describe("Filter by tumor sample status"),
  cellLine: z.array(z.string()).optional()
    .describe("Cell line names (facet selection)"),
  population: z.array(z.string()).optional()
    .describe("Population groups (facet selection)"),
  sex: z.array(z.enum(["male", "female", "mixed"])).optional()
    .describe("Biological sex: male, female, or mixed"),
  ageGroup: z.array(z.enum(["infant", "child", "adult", "elderly", "mixed"])).optional()
    .describe("Age groups: infant, child, adult, elderly, or mixed"),
  assayType: z.array(z.string()).optional()
    .describe("Assay types (e.g., WGS, WES, RNA-seq)"),
  libraryKits: z.array(z.string()).optional()
    .describe("Library preparation kits"),
  platform: z.array(z.string()).optional()
    .describe("Sequencing platforms (e.g., 'Illumina NovaSeq 6000')"),
  readType: z.array(z.enum(["single-end", "paired-end"])).optional()
    .describe("Read type: single-end or paired-end"),
  referenceGenome: z.array(z.string()).optional()
    .describe("Reference genomes (e.g., GRCh38, GRCh37)"),
  fileType: z.array(z.string()).optional()
    .describe("File types (e.g., FASTQ, BAM, VCF)"),
  processedDataTypes: z.array(z.string()).optional()
    .describe("Processed data types available"),
  hasPhenotypeData: z.boolean().optional()
    .describe("Filter by presence of phenotype data"),
  policyId: z.array(z.string()).optional()
    .describe("Data access policy IDs"),

  // Range filters
  releaseDate: RangeFilterSchema.optional()
    .describe("Dataset release date range (ISO 8601 format, e.g., {min: '2020-01-01', max: '2024-12-31'})"),
  subjectCount: RangeFilterSchema.optional()
    .describe("Subject count range (e.g., {min: 100, max: 1000})"),
  readLength: RangeFilterSchema.optional()
    .describe("Read length range in base pairs"),
  sequencingDepth: RangeFilterSchema.optional()
    .describe("Sequencing depth range (x)"),
  targetCoverage: RangeFilterSchema.optional()
    .describe("Target coverage range (%)"),
  dataVolumeGb: RangeFilterSchema.optional()
    .describe("Data volume range in GB"),
  variantSnv: RangeFilterSchema.optional()
    .describe("SNV variant count range"),
  variantIndel: RangeFilterSchema.optional()
    .describe("Indel variant count range"),
  variantCnv: RangeFilterSchema.optional()
    .describe("CNV variant count range"),
  variantSv: RangeFilterSchema.optional()
    .describe("SV variant count range"),
  variantTotal: RangeFilterSchema.optional()
    .describe("Total variant count range"),
})
export type DatasetFilters = z.infer<typeof DatasetFiltersSchema>

/**
 * POST /research/search request body
 */
export const ResearchSearchBodySchema = z.object({
  // Pagination
  page: z.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),

  // Sort
  sort: z.enum(["humId", "datePublished", "dateModified", "relevance"]).optional()
    .describe("Sort field. Defaults to 'relevance' when query is provided, 'humId' otherwise"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order. Defaults to 'desc' when sort=relevance"),

  // Free-text search
  query: z.string().optional()
    .describe("Full-text search query. Searches title, aims, methods, and targets"),

  // Date range filters
  datePublished: RangeFilterSchema.optional()
    .describe("Filter by datePublished range (ISO 8601 format)"),
  dateModified: RangeFilterSchema.optional()
    .describe("Filter by dateModified range (ISO 8601 format)"),

  // Dataset attribute filters (parent-child filter)
  datasetFilters: DatasetFiltersSchema.optional()
    .describe("Filter Research by attributes of linked Datasets. Returns Research that has at least one Dataset matching the filters."),

  // Options
  includeFacets: z.boolean().default(false)
    .describe("Include facet aggregation counts in response"),
  fields: z.array(z.string()).optional()
    .describe("Additional fields to include in response"),
})
export type ResearchSearchBody = z.infer<typeof ResearchSearchBodySchema>

/**
 * POST /dataset/search request body
 */
export const DatasetSearchBodySchema = z.object({
  // Pagination
  page: z.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),

  // Sort
  sort: z.enum(["datasetId", "releaseDate", "relevance"]).optional()
    .describe("Sort field. Defaults to 'relevance' when query is provided, 'datasetId' otherwise"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order. Defaults to 'desc' when sort=relevance"),

  // Free-text search (unified query instead of separate metadataQuery/experimentQuery)
  query: z.string().optional()
    .describe("Full-text search query. Searches experiments (header, data, footers)"),

  // Parent Research filter
  humId: z.string().optional()
    .describe("Filter by parent Research ID (exact match)"),

  // Dataset filters
  filters: DatasetFiltersSchema.optional()
    .describe("Filter Datasets by various attributes"),

  // Options
  includeFacets: z.boolean().default(false)
    .describe("Include facet aggregation counts in response"),
  fields: z.array(z.string()).optional()
    .describe("Additional fields to include in response"),
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
