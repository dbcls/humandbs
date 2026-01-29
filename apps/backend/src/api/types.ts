/**
 * API-specific type definitions
 * Extends crawler/types with authentication, authorization, and workflow types
 */
import { z } from "zod"

// === Common Schemas ===

export const langType = ["ja", "en"] as const
export type LangType = (typeof langType)[number]

const booleanFromString = z.preprocess(
  (v) => v === "true" ? true : v === "false" ? false : undefined,
  z.boolean().optional(),
)

// === Zod Schemas for crawler types ===

const TextValueSchema = z.object({
  text: z.string(),
  rawHtml: z.string(),
})

const UrlValueSchema = z.object({
  text: z.string(),
  url: z.string(),
})

const BilingualTextSchema = z.object({
  ja: z.string().nullable(),
  en: z.string().nullable(),
})

const BilingualTextValueSchema = z.object({
  ja: TextValueSchema.nullable(),
  en: TextValueSchema.nullable(),
})

const BilingualUrlValueSchema = z.object({
  ja: UrlValueSchema.nullable(),
  en: UrlValueSchema.nullable(),
})

const PeriodOfDataUseSchema = z.object({
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
})

const CriteriaCanonicalSchema = z.enum([
  "Controlled-access (Type I)",
  "Controlled-access (Type II)",
  "Unrestricted-access",
])

// === Complex type schemas ===

const PersonSchema = z.object({
  name: BilingualTextValueSchema,
  email: z.string().nullable().optional(),
  orcid: z.string().nullable().optional(),
  organization: z.object({
    name: BilingualTextValueSchema,
    address: z.object({
      country: z.string().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
  researchTitle: BilingualTextSchema.optional(),
  periodOfDataUse: PeriodOfDataUseSchema.nullable().optional(),
})

const ResearchProjectSchema = z.object({
  name: BilingualTextValueSchema,
  url: BilingualUrlValueSchema.nullable().optional(),
})

const GrantSchema = z.object({
  id: z.array(z.string()),
  title: BilingualTextSchema,
  agency: z.object({ name: BilingualTextSchema }),
})

const PublicationSchema = z.object({
  title: BilingualTextSchema,
  doi: z.string().nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
})

const SummarySchema = z.object({
  aims: BilingualTextValueSchema,
  methods: BilingualTextValueSchema,
  targets: BilingualTextValueSchema,
  url: z.object({
    ja: z.array(UrlValueSchema),
    en: z.array(UrlValueSchema),
  }),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
})

const ExperimentSchema = z.object({
  header: BilingualTextValueSchema,
  data: z.record(z.string(), BilingualTextValueSchema.nullable()),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
})

// Dataset schema matching crawler unified.ts (for API responses)
const DatasetSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
  versionReleaseDate: z.string(),
  humId: z.string(),
  humVersionId: z.string(),
  releaseDate: z.array(z.string()),
  criteria: CriteriaCanonicalSchema,
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }),
  experiments: z.array(ExperimentSchema),
})

// ES Doc schemas (legacy format used in current ES indices)
const EsExperimentSchema = z.object({
  header: z.string(),
  data: z.record(z.string(), z.string().nullable()),
  footers: z.array(z.string()),
})

export const EsDatasetDocSchema = z.object({
  datasetId: z.string(),
  lang: z.enum(langType),
  version: z.string(),
  typeOfData: z.array(z.string()).nullable().optional(),
  criteria: CriteriaCanonicalSchema.nullable().optional(),
  releaseDate: z.array(z.string()).nullable().optional(),
  experiments: z.array(EsExperimentSchema),
})
export type EsDatasetDoc = z.infer<typeof EsDatasetDocSchema>

export const EsResearchVersionDocSchema = z.object({
  humId: z.string(),
  lang: z.enum(langType),
  version: z.string(),
  humVersionId: z.string(),
  datasets: z.array(z.string()),
  releaseDate: z.string(),
  releaseNote: z.array(z.string()),
})
export type EsResearchVersionDoc = z.infer<typeof EsResearchVersionDocSchema>

const EsPersonSchema = z.object({
  name: z.string(),
  email: z.string().nullable().optional(),
  orcid: z.string().nullable().optional(),
  organization: z.object({
    name: z.string(),
    address: z.object({
      country: z.string().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
  researchTitle: z.string().nullable().optional(),
  periodOfDataUse: z.string().nullable().optional(),
}).passthrough()

const EsResearchProjectSchema = z.object({
  name: z.string(),
  url: z.string().nullable().optional(),
}).passthrough()

const EsGrantSchema = z.object({
  id: z.string(),
  title: z.string(),
  agency: z.object({
    name: z.string(),
  }).passthrough(),
}).passthrough()

const EsPublicationSchema = z.object({
  title: z.string(),
  doi: z.string().nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
}).passthrough()

const EsSummarySchema = z.object({
  aims: z.string(),
  methods: z.string(),
  targets: z.string(),
  url: z.array(z.object({
    url: z.string(),
    text: z.string(),
  })),
}).passthrough()

export const EsResearchDocSchema = z.object({
  humId: z.string(),
  lang: z.enum(langType),
  title: z.string(),
  url: z.string(),
  dataProvider: z.array(EsPersonSchema),
  researchProject: z.array(EsResearchProjectSchema),
  grant: z.array(EsGrantSchema),
  relatedPublication: z.array(EsPublicationSchema),
  controlledAccessUser: z.array(EsPersonSchema),
  summary: EsSummarySchema,
  versions: z.array(z.string()),
})
export type EsResearchDoc = z.infer<typeof EsResearchDocSchema>

export const EsResearchDetailSchema = EsResearchDocSchema
  .omit({ versions: true })
  .extend({
    humVersionId: z.string(),
    version: z.string(),
    releaseDate: z.string(),
    releaseNote: z.array(z.string()),
    datasets: z.array(EsDatasetDocSchema),
  })
export type EsResearchDetail = z.infer<typeof EsResearchDetailSchema>

// Dataset version item (for version list)
export const DatasetVersionItemSchema = z.object({
  version: z.string(),
  typeOfData: z.array(z.string()).nullable().optional(),
  criteria: CriteriaCanonicalSchema.nullable().optional(),
  releaseDate: z.array(z.string()).nullable().optional(),
})
export type DatasetVersionItem = z.infer<typeof DatasetVersionItemSchema>

// Lang version query
export const LangVersionQuerySchema = z.object({
  lang: z.enum(langType).default("en"),
  version: z.string().regex(/^v\d+$/).nullable().optional(),
})
export type LangVersionQuery = z.infer<typeof LangVersionQuerySchema>

// Lang query
export const LangQuerySchema = z.object({
  lang: z.enum(langType).default("en"),
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

const ResearchSchema = z.object({
  humId: z.string(),
  url: BilingualTextSchema,
  title: BilingualTextSchema,
  summary: SummarySchema,
  dataProvider: z.array(PersonSchema),
  researchProject: z.array(ResearchProjectSchema),
  grant: z.array(GrantSchema),
  relatedPublication: z.array(PublicationSchema),
  controlledAccessUser: z.array(PersonSchema),
  versionIds: z.array(z.string()),
  latestVersion: z.string(),
  firstReleaseDate: z.string(),
  lastReleaseDate: z.string(),
})

const ResearchVersionSchema = z.object({
  humId: z.string(),
  humVersionId: z.string(),
  version: z.string(),
  versionReleaseDate: z.string(),
  datasetIds: z.array(z.string()),
  releaseNote: BilingualTextValueSchema,
})

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
  researcherUids: z.array(z.string()).default([]), // UIDs of researchers who can edit this research
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
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
 * Note: humId, versionIds, latestVersion, firstReleaseDate, lastReleaseDate are auto-generated
 */
export const CreateResearchRequestSchema = z.object({
  // Research fields (ja/en both required)
  title: BilingualTextSchema,
  summary: SummarySchema,
  dataProvider: z.array(PersonSchema),
  researchProject: z.array(ResearchProjectSchema),
  grant: z.array(GrantSchema),
  relatedPublication: z.array(PublicationSchema),

  // Admin assigns researcher UIDs
  researcherUids: z.array(z.string()),

  // Initial version release note (optional)
  initialReleaseNote: BilingualTextValueSchema.optional(),
})
export type CreateResearchRequest = z.infer<typeof CreateResearchRequestSchema>

/**
 * Update research request (full replacement)
 * Note: humId, versionIds, latestVersion, firstReleaseDate, lastReleaseDate cannot be changed
 */
export const UpdateResearchRequestSchema = z.object({
  url: BilingualTextSchema,
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

// === Version API ===

/**
 * Create version request
 */
export const CreateVersionRequestSchema = z.object({
  releaseNote: BilingualTextValueSchema,
  datasetIds: z.array(z.string()).optional(), // Datasets to link (optional)
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
  releaseDate: z.array(z.string()),
  criteria: CriteriaCanonicalSchema,
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }),
  experiments: z.array(ExperimentSchema),
})
export type CreateDatasetRequest = z.infer<typeof CreateDatasetRequestSchema>

/**
 * Update dataset request (full replacement)
 * Note: datasetId, version, versionReleaseDate cannot be changed
 */
export const UpdateDatasetRequestSchema = z.object({
  humId: z.string(),
  humVersionId: z.string(),
  releaseDate: z.array(z.string()),
  criteria: CriteriaCanonicalSchema,
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }),
  experiments: z.array(ExperimentSchema),
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

// === Research Search Query & Response ===

export const ResearchSearchQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  lang: z.enum(langType).default("en"),
  sort: z.enum(["humId", "title", "releaseDate", "relevance"]).default("humId"),
  order: z.enum(["asc", "desc"]).default("asc"),

  // Full-text search
  q: z.string().optional(),

  // Research-specific filters
  releasedAfter: z.string().optional(),  // ISO 8601 date
  releasedBefore: z.string().optional(), // ISO 8601 date

  // Filter Research by Dataset attributes (comma-separated for OR)
  assayType: z.string().optional(),
  disease: z.string().optional(),
  tissue: z.string().optional(),
  population: z.string().optional(),
  platform: z.string().optional(),
  criteria: z.string().optional(),
  fileType: z.string().optional(),
  hasHealthyControl: booleanFromString,
  hasTumor: booleanFromString,
  hasCellLine: booleanFromString,
  minSubjects: z.coerce.number().int().min(0).optional(),

  // Include facet counts in response
  includeFacets: booleanFromString,
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

// === Dataset Search Query & Response ===

export const DatasetSearchQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  lang: z.enum(langType).default("en"),
  sort: z.enum(["datasetId", "releaseDate", "subjectCount", "relevance"]).default("datasetId"),
  order: z.enum(["asc", "desc"]).default("asc"),

  // Full-text search
  q: z.string().optional(),

  // Dataset filters
  humId: z.string().optional(),  // Parent Research ID (exact match)
  criteria: z.string().optional(),  // Comma-separated for OR
  typeOfData: z.string().optional(),  // Partial match
  assayType: z.string().optional(),  // Comma-separated for OR
  disease: z.string().optional(),  // Partial match
  tissue: z.string().optional(),  // Comma-separated for OR
  population: z.string().optional(),  // Comma-separated for OR
  platform: z.string().optional(),  // Partial match
  fileType: z.string().optional(),  // Comma-separated for OR
  hasHealthyControl: booleanFromString,
  hasTumor: booleanFromString,
  hasCellLine: booleanFromString,
  minSubjects: z.coerce.number().int().min(0).optional(),
  maxSubjects: z.coerce.number().int().min(0).optional(),

  // Include facet counts in response
  includeFacets: booleanFromString,
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

// === Admin API ===

/**
 * Pending review item
 */
export const PendingReviewItemSchema = z.object({
  humId: z.string(),
  title: BilingualTextSchema,
  researcherUids: z.array(z.string()),
  submittedAt: z.string(),
})
export type PendingReviewItem = z.infer<typeof PendingReviewItemSchema>

/**
 * Pending reviews response
 */
export const PendingReviewsResponseSchema = z.object({
  data: z.array(PendingReviewItemSchema),
  total: z.number(),
})
export type PendingReviewsResponse = z.infer<typeof PendingReviewsResponseSchema>

/**
 * User info for admin
 * Note: isAdmin is determined by admin_uids.json, not stored per user
 */
export const UserInfoSchema = z.object({
  userId: z.string(),
  username: z.string(),
  email: z.string().optional(),
  isAdmin: z.boolean(),
  createdAt: z.string().optional(),
})
export type UserInfo = z.infer<typeof UserInfoSchema>

/**
 * Users list response
 */
export const UsersListResponseSchema = z.object({
  data: z.array(UserInfoSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
})
export type UsersListResponse = z.infer<typeof UsersListResponseSchema>

/**
 * Update user admin status request
 * Note: This updates the admin_uids.json file
 */
export const UpdateUserAdminRequestSchema = z.object({
  isAdmin: z.boolean(),
})
export type UpdateUserAdminRequest = z.infer<typeof UpdateUserAdminRequestSchema>

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
 */
export const LinkedResearchesResponseSchema = z.object({
  data: z.array(ResearchResponseSchema),
})
export type LinkedResearchesResponse = z.infer<typeof LinkedResearchesResponseSchema>

// === Status Transition API ===

/**
 * Status transition response
 */
export const StatusTransitionResponseSchema = z.object({
  humId: z.string(),
  previousStatus: z.enum(ResearchStatus),
  currentStatus: z.enum(ResearchStatus),
  action: z.enum(StatusAction),
  timestamp: z.string(),
})
export type StatusTransitionResponse = z.infer<typeof StatusTransitionResponseSchema>

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

export const UserIdParamsSchema = z.object({
  userId: z.string(),
})
export type UserIdParams = z.infer<typeof UserIdParamsSchema>

// Re-export schemas for route definitions
export { DatasetSchema, ResearchSchema, ResearchVersionSchema }
