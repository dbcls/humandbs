/**
 * API Request/Response type definitions
 *
 * This module provides:
 * - CRUD request/response schemas
 * - Path parameter schemas
 * - Search response schemas
 * - Error response schemas
 */
import "@hono/zod-openapi"
import { z } from "zod"

import {
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
} from "../../crawler/types/jga-shinsei"
import { SearchableExperimentFieldsSchema } from "../../crawler/types/structured"
// Import from es/types
import {
  BilingualTextSchema,
  BilingualTextValueSchema,
  CriteriaCanonicalSchema,
  GrantSchema,
  PublicationSchema,
  // Crawler schemas (for API request validation)
  CrawlerResearchSchema as ResearchSchema,
  ResearchVersionSchema,
} from "../../es/types"

import { EsDatasetSchema } from "./es-docs"
import { FacetsMapSchema } from "./facets"
import { ResearchSummarySchema } from "./query-params"
import {
  BilingualTextValueRequestSchema,
  ExperimentRequestSchema,
  PersonRequestSchema,
  ResearchProjectRequestSchema,
  SummaryRequestSchema,
} from "./request-schemas"
import {
  ResponseMetaReadOnlySchema,
  ResponseMetaWithLockSchema,
  ResponseMetaWithPaginationSchema,
  ResponseMetaWithBatchSchema,
} from "./response"
import {
  DatasetDocWithMergedSchema,
  ResearchDetailSchema,
  DatasetVersionItemSchema,
} from "./views"
import { RESEARCH_STATUS } from "./workflow"

// === Response Schemas ===

// === Experiment Schema ===

// Experiment schema for API requests and responses.
// `searchable` is optional: GET responses surface it when ES has it (LLM-
// extracted or admin-provided); POST/PUT bodies may include it when an admin
// chooses to seed the searchable fields directly (e.g., from a template).
export const ExperimentSchemaBase = z.object({
  header: BilingualTextValueSchema,
  data: z.record(z.string(), BilingualTextValueSchema.nullable()),
  searchable: SearchableExperimentFieldsSchema.optional(),
})

// Dataset schema for API requests
export const ApiDatasetSchema = z.object({
  datasetId: z
    .string()
    .describe("Unique dataset identifier (e.g., 'JGAD000001')"),
  version: z.string().describe("Dataset version (e.g., 'v1', 'v2')"),
  versionReleaseDate: z
    .string()
    .nullable()
    .describe("ISO 8601 date when this version was released. Null for drafts."),
  humId: z.string().describe("Parent Research identifier (e.g., 'hum0001')"),
  humVersionId: z
    .string()
    .describe("Parent Research version identifier (e.g., 'hum0001-v1')"),
  releaseDate: z
    .string()
    .nullable()
    .describe("ISO 8601 date when the dataset was first released. Null for drafts."),
  criteria: CriteriaCanonicalSchema.describe(
    "Data access criteria: 'Controlled-access (Type I)', 'Controlled-access (Type II)', or 'Unrestricted-access'",
  ),
  typeOfData: z
    .object({
      ja: z.string().nullable().describe("Data type description in Japanese"),
      en: z.string().nullable().describe("Data type description in English"),
    })
    .describe("Bilingual description of the type of data in this dataset"),
  experiments: z
    .array(ExperimentSchemaBase)
    .describe(
      "Array of experiment records containing sample/sequencing metadata",
    ),
})

// Error response schemas live in `./errors.ts`. Path params live in
// `./path-params.ts`. Stats schemas live in `./stats.ts`. The barrel
// (./index.ts) re-exports all of those alongside the request/response
// schemas defined in this file.

// === API-specific Person / Publication schemas ===
// Person/Publication sub-fields are selectively included based on context:
// - dataProvider: omit datasetIds, researchTitle, periodOfDataUse (no real data)
// - controlledAccessUser: read-only (written by generate-cau batch, not via API)
// - relatedPublication: all fields included

/** relatedPublication: datasetIds で論文とデータセットを紐付ける */
const ApiPublicationSchema = PublicationSchema

/** dataProvider (request 用): rawHtml を含まない + 実データのない 3 フィールドを除外 */
const ApiDataProviderPersonRequestSchema = PersonRequestSchema.omit({
  datasetIds: true,
  researchTitle: true,
  periodOfDataUse: true,
})

// === Research API ===

/**
 * Create research request
 * Creates Research + initial ResearchVersion (v1) simultaneously
 * Note: versionIds, latestVersion, datePublished, dateModified are auto-generated
 * All fields except humId are optional - defaults will be used for missing fields
 */
export const CreateResearchRequestSchema = z.object({
  humId: z
    .string()
    .regex(/^hum\d{4}$/, "humId must match hum0000–hum9999")
    .describe("Research ID (e.g., 'hum0001'). Must match /^hum\\d{4}$/."),

  // Research fields - all optional with defaults
  title: BilingualTextSchema.optional().describe(
    "Research title in Japanese and English",
  ),
  summary: SummaryRequestSchema.optional().describe(
    "Research summary including aims, methods, and targets",
  ),
  dataProvider: z
    .array(ApiDataProviderPersonRequestSchema)
    .optional()
    .describe("Data providers (researchers providing the data)"),
  researchProject: z
    .array(ResearchProjectRequestSchema)
    .optional()
    .describe("Related research projects"),
  grant: z.array(GrantSchema).optional().describe("Funding grants"),
  relatedPublication: z
    .array(ApiPublicationSchema)
    .optional()
    .describe("Related publications (papers, preprints)"),
  summaryShort: z
    .object({
      methods: BilingualTextValueRequestSchema,
      typeOfData: BilingualTextValueRequestSchema,
      targets: BilingualTextValueRequestSchema,
    })
    .nullable()
    .optional()
    .describe(
      "Short bilingual summaries for the listing view (research method / data type / target). Typically null at creation until the humId appears on the Joomla home.",
    ),
})
export type CreateResearchRequest = z.infer<typeof CreateResearchRequestSchema>

/**
 * Update research request (full replacement)
 * Note: humId, url, versionIds, latestVersion, datePublished, dateModified cannot be changed
 * url is auto-generated from humId
 * Includes optimistic locking fields (_seq_no, _primary_term) for concurrent edit detection
 */
export const UpdateResearchRequestSchema = z.object({
  title: BilingualTextSchema.optional().describe(
    "Research title in Japanese and English",
  ),
  summary: SummaryRequestSchema.optional().describe(
    "Research summary including aims, methods, and targets",
  ),
  dataProvider: z
    .array(ApiDataProviderPersonRequestSchema)
    .optional()
    .describe("Data providers (researchers providing the data)"),
  researchProject: z
    .array(ResearchProjectRequestSchema)
    .optional()
    .describe("Related research projects"),
  grant: z.array(GrantSchema).optional().describe("Funding grants"),
  relatedPublication: z
    .array(ApiPublicationSchema)
    .optional()
    .describe("Related publications (papers, preprints)"),
  releaseNote: BilingualTextValueRequestSchema.optional().describe(
    "Release note for the current draft version",
  ),
  summaryShort: z
    .object({
      methods: BilingualTextValueRequestSchema,
      typeOfData: BilingualTextValueRequestSchema,
      targets: BilingualTextValueRequestSchema,
    })
    .nullable()
    .optional()
    .describe(
      "Short bilingual summaries for the listing view (research method / data type / target). Null clears the field for humIds no longer listed on the Joomla home. Omit to keep the current value.",
    ),
  _seq_no: z
    .number()
    .describe(
      "Sequence number for optimistic locking. Obtained from GET response.",
    ),
  _primary_term: z
    .number()
    .describe(
      "Primary term for optimistic locking. Obtained from GET response.",
    ),
})
export type UpdateResearchRequest = z.infer<typeof UpdateResearchRequestSchema>

/**
 * Research with status (extends Research with API-specific fields)
 */
export const ResearchWithStatusSchema = ResearchSchema.extend({
  status: z.enum(RESEARCH_STATUS),
  owners: z.array(z.string()).default([]),
})
export type ResearchWithStatus = z.infer<typeof ResearchWithStatusSchema>

export const ResearchResponseSchema = ResearchWithStatusSchema.extend({
  datasets: z.array(ApiDatasetSchema).optional(),
})
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>

// === Version API ===

/**
 * Create version request
 * Note: datasets are automatically copied from the previous version
 */
export const CreateVersionRequestSchema = z.object({
  releaseNote: BilingualTextValueRequestSchema.optional().describe(
    "Bilingual release note describing changes in this version",
  ),
})
export type CreateVersionRequest = z.infer<typeof CreateVersionRequestSchema>

/**
 * Version response
 */
export const VersionResponseSchema = ResearchVersionSchema.extend({
  datasets: z.array(ApiDatasetSchema).optional(),
})
export type VersionResponse = z.infer<typeof VersionResponseSchema>

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
  experiments: z.array(ExperimentRequestSchema),
})
export type CreateDatasetRequest = z.infer<typeof CreateDatasetRequestSchema>

/**
 * Update dataset request (full replacement)
 * Note: datasetId, version, versionReleaseDate cannot be changed
 * Includes optimistic locking fields (_seq_no, _primary_term) for concurrent edit detection
 */
export const UpdateDatasetRequestSchema = z.object({
  releaseDate: z.string(),
  criteria: CriteriaCanonicalSchema,
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }),
  experiments: z.array(ExperimentRequestSchema),
  _seq_no: z.number().describe("Sequence number for optimistic locking"),
  _primary_term: z.number().describe("Primary term for optimistic locking"),
})
export type UpdateDatasetRequest = z.infer<typeof UpdateDatasetRequestSchema>

/**
 * Dataset with metadata
 */
export const DatasetWithMetadataSchema = ApiDatasetSchema.extend({
  ownerId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type DatasetWithMetadata = z.infer<typeof DatasetWithMetadataSchema>

// === Create Dataset for Research ===

/**
 * Experiment schema for draft initialization. Unlike ExperimentRequestSchema
 * (used by Create/Update dataset), header and data both default so that
 * frontend form init (e.g. "Add experiment" button) can post `{}`.
 *
 * `searchable` is optional in the draft as well — templates seed it when DRA
 * metadata makes the values mechanical (platforms / assayType / readType), and
 * admins can edit before posting.
 */
const ExperimentForDraftSchema = z.object({
  header: BilingualTextValueRequestSchema.default({ ja: null, en: null }),
  data: z
    .record(z.string(), BilingualTextValueRequestSchema.nullable())
    .default({}),
  searchable: SearchableExperimentFieldsSchema.optional(),
})

/**
 * Create dataset request for POST /research/{humId}/dataset/new
 * All fields are optional - defaults will be used
 */
export const CreateDatasetForResearchRequestSchema = z.object({
  datasetId: z
    .string()
    .optional()
    .describe(
      "Dataset ID. Auto-generated (DRAFT-{humId}-{uuid}) if not provided.",
    ),
  releaseDate: z
    .string()
    .optional()
    .describe("ISO 8601 date for dataset release. Defaults to current date."),
  criteria: CriteriaCanonicalSchema.optional().describe(
    "Data access criteria. Defaults to 'Controlled-access (Type I)'.",
  ),
  typeOfData: BilingualTextSchema.optional().describe(
    "Bilingual description of the data type",
  ),
  experiments: z
    .array(ExperimentForDraftSchema)
    .optional()
    .describe(
      "Array of experiment records. Defaults to []. Each element's header defaults to {ja:null,en:null} and data defaults to {}.",
    ),
})
export type CreateDatasetForResearchRequest = z.infer<
  typeof CreateDatasetForResearchRequestSchema
>

/**
 * Facet value with count
 */
export const FacetValueWithCountSchema = z.object({
  value: z
    .string()
    .describe("The facet value (e.g., 'WGS', 'Controlled-access (Type I)')"),
  count: z.number().describe("Number of resources matching this facet value"),
})
export type FacetValueWithCount = z.infer<typeof FacetValueWithCountSchema>

/**
 * Single facet field response (with counts)
 */
export const FacetFieldResponseSchema = z.object({
  fieldName: z
    .string()
    .describe(
      "The facet field name (e.g., 'assayType', 'criteria', 'platform')",
    ),
  values: z
    .array(FacetValueWithCountSchema)
    .describe("Available values for this facet with their counts"),
})
export type FacetFieldResponse = z.infer<typeof FacetFieldResponseSchema>

/**
 * All facets response (GET /facets) - with counts
 */
export const AllFacetsResponseSchema = FacetsMapSchema
export type AllFacetsResponse = z.infer<typeof AllFacetsResponseSchema>

// Path parameter schemas are defined in `./path-params.ts`.

// === Simple Response Schemas ===

export const HealthResponseSchema = z.object({
  status: z.string().describe("Health status indicator ('ok' when healthy)"),
  timestamp: z.string().describe("ISO 8601 timestamp of the health check"),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const IsAdminResponseSchema = z.object({
  isAdmin: z
    .boolean()
    .describe("Whether the authenticated user has admin privileges"),
})
export type IsAdminResponse = z.infer<typeof IsAdminResponseSchema>

// Stats schemas are defined in `./stats.ts`.

/**
 * Create single response schema (with optimistic locking)
 */
export const createSingleResponseSchema = <T extends z.ZodType>(
  dataSchema: T,
) =>
  z.object({
    data: dataSchema,
    meta: ResponseMetaWithLockSchema,
  })

/**
 * Create single read-only response schema
 */
export const createSingleReadOnlyResponseSchema = <T extends z.ZodType>(
  dataSchema: T,
) =>
  z.object({
    data: dataSchema,
    meta: ResponseMetaReadOnlySchema,
  })

/**
 * Create list response schema
 */
export const createListResponseSchema = <T extends z.ZodType>(
  itemSchema: T,
) =>
  z.object({
    data: z.array(itemSchema),
    meta: ResponseMetaWithPaginationSchema,
  })

/**
 * Create search response schema with facets
 */
export const createSearchResponseSchema = <T extends z.ZodType>(
  itemSchema: T,
) =>
  z.object({
    data: z.array(itemSchema),
    meta: ResponseMetaWithPaginationSchema,
    facets: FacetsMapSchema.optional(),
  })

/**
 * Create batch-get response schema (data array + batch summary in meta)
 */
export const createBatchResponseSchema = <T extends z.ZodType>(
  itemSchema: T,
) =>
  z.object({
    data: z.array(itemSchema),
    meta: ResponseMetaWithBatchSchema,
  })

// Re-export schemas for route definitions
export { ResearchSchema, ResearchVersionSchema }

// === Response Schemas for /research Routes ===

/**
 * Workflow action response data (submit, approve, reject, unpublish)
 */
export const WorkflowDataSchema = z.object({
  humId: z.string(),
  status: z.enum(RESEARCH_STATUS),
  dateModified: z.string(),
})
export type WorkflowData = z.infer<typeof WorkflowDataSchema>

export const WorkflowResponseSchema =
  createSingleResponseSchema(WorkflowDataSchema)
export type WorkflowResponse = z.infer<
  typeof WorkflowResponseSchema
>

/**
 * Owners response data (GET /research/{humId}/owners, admin only)
 */
export const OwnersDataSchema = z.object({
  humId: z.string(),
  owners: z.array(z.string()),
})
export type OwnersData = z.infer<typeof OwnersDataSchema>

export const OwnersResponseSchema =
  createSingleReadOnlyResponseSchema(OwnersDataSchema)
export type OwnersResponse = z.infer<typeof OwnersResponseSchema>

/**
 * Research detail response for authenticated users (GET /research/{humId})
 * `_seq_no`/`_primary_term` live in `meta` (see `singleResponse` helper).
 */
export const ResearchDetailResponseSchema = createSingleResponseSchema(
  ResearchDetailSchema,
)
export type ResearchDetailResponse = z.infer<
  typeof ResearchDetailResponseSchema
>

/**
 * Research create/update response (POST /research/new, PUT /research/{humId}/update)
 */
export const ResearchWithLockResponseSchema = createSingleResponseSchema(
  ResearchResponseSchema,
)
export type ResearchWithLockResponse = z.infer<
  typeof ResearchWithLockResponseSchema
>

/**
 * Research search/list response (GET /research, POST /research/search)
 */
export const ResearchSearchResponseSchema =
  createSearchResponseSchema(ResearchSummarySchema)
export type ResearchSearchResponse = z.infer<
  typeof ResearchSearchResponseSchema
>

/**
 * Research batch-get response (GET /research/batch)
 * Item schema matches the single-detail view (`ResearchDetailSchema`); lock
 * fields are not surfaced (batch is read-oriented, re-fetch detail to edit).
 */
export const ResearchBatchResponseSchema =
  createBatchResponseSchema(ResearchDetailSchema)
export type ResearchBatchResponse = z.infer<
  typeof ResearchBatchResponseSchema
>

/**
 * Research versions list response (GET /research/{humId}/versions)
 */
export const ResearchVersionsListResponseSchema =
  createListResponseSchema(ResearchVersionSchema)
export type ResearchVersionsListResponse = z.infer<
  typeof ResearchVersionsListResponseSchema
>

/**
 * Specific version detail response, read-only (GET /research/{humId}/versions/{version})
 */
export const VersionDetailResponseSchema =
  createSingleReadOnlyResponseSchema(VersionResponseSchema)
export type VersionDetailResponse = z.infer<typeof VersionDetailResponseSchema>

/**
 * Version create response (POST /research/{humId}/versions/new)
 */
export const VersionCreateResponseSchema = createSingleResponseSchema(
  VersionResponseSchema,
)
export type VersionCreateResponse = z.infer<typeof VersionCreateResponseSchema>

/**
 * Linked datasets list response (GET /research/{humId}/dataset)
 */
export const LinkedDatasetsListResponseSchema =
  createListResponseSchema(EsDatasetSchema)
export type LinkedDatasetsListResponse = z.infer<
  typeof LinkedDatasetsListResponseSchema
>

/**
 * Dataset create response (POST /research/{humId}/dataset/new)
 */
export const DatasetCreateResponseSchema =
  createSingleResponseSchema(EsDatasetSchema)
export type DatasetCreateResponse = z.infer<typeof DatasetCreateResponseSchema>

// === Response Schemas for /dataset Routes ===

/**
 * Dataset search/list response (GET /dataset, POST /dataset/search)
 */
export const DatasetSearchResponseSchema =
  createSearchResponseSchema(EsDatasetSchema)
export type DatasetSearchResponse = z.infer<typeof DatasetSearchResponseSchema>

/**
 * Dataset detail response (GET /dataset/{datasetId})
 */
export const DatasetDetailResponseSchema =
  createSingleResponseSchema(DatasetDocWithMergedSchema)
export type DatasetDetailResponse = z.infer<typeof DatasetDetailResponseSchema>

/**
 * Dataset batch-get response (GET /dataset/batch)
 * Item schema matches the single-detail view (`DatasetDocWithMergedSchema`);
 * lock fields are not surfaced (batch is read-oriented, re-fetch detail to edit).
 */
export const DatasetBatchResponseSchema =
  createBatchResponseSchema(DatasetDocWithMergedSchema)
export type DatasetBatchResponse = z.infer<typeof DatasetBatchResponseSchema>

/**
 * Dataset update response (PUT /dataset/{datasetId}/update)
 */
export const DatasetUpdateResponseSchema =
  createSingleResponseSchema(DatasetWithMetadataSchema)
export type DatasetUpdateResponse = z.infer<typeof DatasetUpdateResponseSchema>

/**
 * Dataset versions list response (GET /dataset/{datasetId}/versions)
 */
export const DatasetVersionsListResponseSchema =
  createListResponseSchema(DatasetVersionItemSchema)
export type DatasetVersionsListResponse = z.infer<typeof DatasetVersionsListResponseSchema>

/**
 * Dataset version detail response, read-only (GET /dataset/{datasetId}/versions/{version})
 */
export const DatasetVersionDetailResponseSchema =
  createSingleReadOnlyResponseSchema(DatasetDocWithMergedSchema)
export type DatasetVersionDetailResponse = z.infer<typeof DatasetVersionDetailResponseSchema>

/**
 * Linked researches list response (GET /dataset/{datasetId}/research)
 */
export const LinkedResearchesListResponseSchema =
  createListResponseSchema(ResearchDetailSchema)
export type LinkedResearchesListResponse = z.infer<typeof LinkedResearchesListResponseSchema>

// JGA Shinsei path params (JdsApplIdParamsSchema / JduApplIdParamsSchema / JduIdParamsSchema) live in `./path-params.ts`.

// DS
export const DsApplicationListResponseSchema =
  createListResponseSchema(DsApplicationTransformedSchema)
export type DsApplicationListResponse = z.infer<typeof DsApplicationListResponseSchema>

export const DsApplicationDetailResponseSchema =
  createSingleReadOnlyResponseSchema(DsApplicationTransformedSchema)
export type DsApplicationDetailResponse = z.infer<typeof DsApplicationDetailResponseSchema>

// DU
export const DuApplicationListResponseSchema =
  createListResponseSchema(DuApplicationTransformedSchema)
export type DuApplicationListResponse = z.infer<typeof DuApplicationListResponseSchema>

export const DuApplicationDetailResponseSchema =
  createSingleReadOnlyResponseSchema(DuApplicationTransformedSchema)
export type DuApplicationDetailResponse = z.infer<typeof DuApplicationDetailResponseSchema>
