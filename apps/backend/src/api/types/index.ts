/**
 * API types barrel file
 *
 * Re-exports all type definitions from the api/types module.
 *
 * Dependency flow: crawler/types → es/types → api/types
 */

// === Response Types ===
export {
  // Pagination
  PaginationSchema,
  createPagination,
  // Base meta
  BaseResponseMetaSchema,
  // Meta variants
  ResponseMetaReadOnlySchema,
  ResponseMetaWithLockSchema,
  ResponseMetaWithPaginationSchema,
  BatchSummarySchema,
  ResponseMetaWithBatchSchema,
} from "./response"
export type {
  Pagination,
  BaseResponseMeta,
  ResponseMetaReadOnly,
  ResponseMetaWithLock,
  ResponseMetaWithPagination,
  BatchSummary,
  ResponseMetaWithBatch,
  SingleReadOnlyResponse,
  SingleResponse,
  ListResponse,
  SearchResponse,
  BatchResponse,
} from "./response"

// === Common ===
export { LANG_TYPES, booleanFromString, VersionStringSchema, VERSION_STRING_REGEX } from "./common"
export type { LangType } from "./common"

// === Errors ===
export { ERROR_CODES, ProblemDetailsSchema } from "./errors"
export type { ErrorCode, ProblemDetails } from "./errors"

// === Stats ===
export { StatsFacetCountSchema, StatsResponseSchema } from "./stats"
export type { StatsFacetCount, StatsResponse } from "./stats"

// === Path Params ===
export {
  HumIdParamsSchema,
  DatasetIdParamsSchema,
  VersionParamsSchema,
  DatasetVersionParamsSchema,
  JdsIdParamsSchema,
  JduIdParamsSchema,
  JdsApplIdParamsSchema,
  JduApplIdParamsSchema,
} from "./path-params"
export type {
  HumIdParams,
  DatasetIdParams,
  VersionParams,
  DatasetVersionParams,
  JdsIdParams,
  JduIdParams,
  JdsApplIdParams,
  JduApplIdParams,
} from "./path-params"

// === Authentication ===
export { JwtClaimsSchema, AuthUserSchema } from "./auth"
export type { JwtClaims, AuthUser } from "./auth"

// === Workflow ===
export {
  ResearchStatusSchema,
  RESEARCH_STATUS,
  STATUS_ACTIONS,
  StatusTransitions,
} from "./workflow"
export type { ResearchStatus, StatusAction } from "./workflow"

// === Facets ===
export {
  DATASET_FACET_NAMES,
  RESEARCH_FACET_NAMES,
  isValidFacetName,
  FacetValueSchema,
  FacetsMapSchema,
} from "./facets"
export type {
  DatasetFacetName,
  ResearchFacetName,
  FacetValue,
  FacetsMap,
} from "./facets"

// === ES Documents ===
export {
  DatasetRefSchema,
  EsDatasetSchema,
  EsResearchSchema,
  ResearchVersionSchema,
} from "./es-docs"
export type {
  DatasetRef,
  EsDataset,
  EsResearch,
  ResearchVersion,
  Experiment,
  Person,
  Grant,
  Publication,
  Summary,
} from "./es-docs"

// === JGA Shinsei (sourced directly from crawler/types) ===
export {
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
} from "../../crawler/types/jga-shinsei"
export type {
  DsApplicationTransformed,
  DuApplicationTransformed,
} from "../../crawler/types/jga-shinsei"

// === Templates ===
export {
  EXTERNAL_ID_REGEX,
  RelatedAccessionsSchema,
  TemplateDatasetParamsSchema,
  ResearchTemplateDataSchema,
  ResearchTemplateResponseSchema,
  DatasetTemplateDataSchema,
  DatasetTemplateResponseSchema,
} from "./templates"
export type {
  RelatedAccessions,
  TemplateDatasetParams,
  ResearchTemplateData,
  ResearchTemplateResponse,
  DatasetTemplateData,
  DatasetTemplateResponse,
} from "./templates"

// === API View Models ===
export {
  ResearchDetailSchema,
  DatasetVersionItemSchema,
  MergedSearchableSchema,
  DatasetDocWithMergedSchema,
} from "./views"
export type {
  ResearchDetail,
  DatasetVersionItem,
  MergedSearchable,
  DatasetDocWithMerged,
} from "./views"

// === Query Parameters ===
export {
  PaginationQuerySchema,
  LangVersionQuerySchema,
  LangQuerySchema,
  ResearchListingQuerySchema,
  ResearchSearchQuerySchema,
  DatasetListingQuerySchema,
  DatasetSearchQuerySchema,
  DatasetBatchQuerySchema,
  ResearchBatchQuerySchema,
  FacetFilterQuerySchema,
  ResearchSummarySchema,
  JgaShinseiDsListQuerySchema,
  JgaShinseiDuListQuerySchema,
} from "./query-params"
export type {
  LangVersionQuery,
  LangQuery,
  ResearchListingQuery,
  ResearchSearchQuery,
  DatasetListingQuery,
  DatasetSearchQuery,
  DatasetBatchQuery,
  ResearchBatchQuery,
  FacetFilterQuery,
  ResearchSummary,
  JgaShinseiDsListQuery,
  JgaShinseiDuListQuery,
} from "./query-params"

// === Filters ===
export {
  RangeFilterSchema,
  DatasetFiltersSchema,
  ResearchSearchBodySchema,
  DatasetSearchBodySchema,
} from "./filters"
export type {
  RangeFilter,
  DatasetFilters,
  ResearchSearchBody,
  DatasetSearchBody,
} from "./filters"

// === Request/Response ===
export {
  // Experiment/Dataset schemas
  ExperimentSchemaBase,
  ApiDatasetSchema,
  // Research API
  CreateResearchRequestSchema,
  UpdateResearchRequestSchema,
  ResearchWithStatusSchema,
  ResearchResponseSchema,
  // UIDs API
  UpdateUidsRequestSchema,
  // Version API
  CreateVersionRequestSchema,
  VersionResponseSchema,
  // Dataset API
  CreateDatasetRequestSchema,
  UpdateDatasetRequestSchema,
  DatasetWithMetadataSchema,
  CreateDatasetForResearchRequestSchema,
  // Facet responses
  FacetValueWithCountSchema,
  FacetFieldResponseSchema,
  AllFacetsResponseSchema,
  // Simple responses
  HealthResponseSchema,
  IsAdminResponseSchema,
  // Re-exported schemas
  ResearchSchema,
  // Response schema factories
  createSingleResponseSchema,
  createSingleReadOnlyResponseSchema,
  createListResponseSchema,
  createSearchResponseSchema,
  createBatchResponseSchema,
  // Response schemas for /research routes
  WorkflowDataSchema,
  WorkflowResponseSchema,
  UidsDataSchema,
  UidsResponseSchema,
  ResearchDetailResponseSchema,
  ResearchBatchResponseSchema,
  ResearchWithLockResponseSchema,
  ResearchSearchResponseSchema,
  ResearchVersionsListResponseSchema,
  VersionDetailResponseSchema,
  VersionCreateResponseSchema,
  LinkedDatasetsListResponseSchema,
  DatasetCreateResponseSchema,
  // Response schemas for /dataset routes
  DatasetSearchResponseSchema,
  DatasetDetailResponseSchema,
  DatasetBatchResponseSchema,
  DatasetUpdateResponseSchema,
  DatasetVersionsListResponseSchema,
  DatasetVersionDetailResponseSchema,
  LinkedResearchesListResponseSchema,
  // JGA Shinsei
  DsApplicationListResponseSchema,
  DsApplicationDetailResponseSchema,
  DuApplicationListResponseSchema,
  DuApplicationDetailResponseSchema,
} from "./request-response"
export type {
  CreateResearchRequest,
  UpdateResearchRequest,
  ResearchWithStatus,
  ResearchResponse,
  UpdateUidsRequest,
  CreateVersionRequest,
  VersionResponse,
  CreateDatasetRequest,
  UpdateDatasetRequest,
  DatasetWithMetadata,
  CreateDatasetForResearchRequest,
  FacetValueWithCount,
  FacetFieldResponse,
  AllFacetsResponse,
  HealthResponse,
  IsAdminResponse,
  // Response types for /research routes
  WorkflowData,
  WorkflowResponse,
  UidsData,
  UidsResponse,
  ResearchDetailResponse,
  ResearchBatchResponse,
  ResearchWithLockResponse,
  ResearchSearchResponse,
  ResearchVersionsListResponse,
  VersionDetailResponse,
  VersionCreateResponse,
  LinkedDatasetsListResponse,
  DatasetCreateResponse,
  // Response types for /dataset routes
  DatasetSearchResponse,
  DatasetDetailResponse,
  DatasetBatchResponse,
  DatasetUpdateResponse,
  DatasetVersionsListResponse,
  DatasetVersionDetailResponse,
  LinkedResearchesListResponse,
  // JGA Shinsei
  DsApplicationListResponse,
  DsApplicationDetailResponse,
  DuApplicationListResponse,
  DuApplicationDetailResponse,
} from "./request-response"
