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
} from "./response"
export type {
  Pagination,
  BaseResponseMeta,
  ResponseMetaReadOnly,
  ResponseMetaWithLock,
  ResponseMetaWithPagination,
  SingleReadOnlyResponse,
  SingleResponse,
  ListResponse,
  SearchResponse,
} from "./response"

// === Common ===
export { LANG_TYPES, booleanFromString } from "./common"
export type { LangType } from "./common"

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
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
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
  DsApplicationTransformed,
  DuApplicationTransformed,
} from "./es-docs"

// === API View Models ===
export {
  ResearchDetailSchema,
  ResearchDetailPublicSchema,
  DatasetVersionItemSchema,
  MergedSearchableSchema,
  DatasetDocWithMergedSchema,
} from "./views"
export type {
  ResearchDetail,
  ResearchDetailPublic,
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
  FacetFilterQuerySchema,
  ResearchSummarySchema,
} from "./query-params"
export type {
  LangVersionQuery,
  LangQuery,
  ResearchListingQuery,
  ResearchSearchQuery,
  DatasetListingQuery,
  DatasetSearchQuery,
  FacetFilterQuery,
  ResearchSummary,
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
  // Error schemas
  ERROR_CODES,
  ProblemDetailsSchema,
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
  // Path params
  HumIdParamsSchema,
  DatasetIdParamsSchema,
  VersionParamsSchema,
  DatasetVersionParamsSchema,
  // Simple responses
  HealthResponseSchema,
  IsAdminResponseSchema,
  // Stats API
  StatsFacetCountSchema,
  StatsResponseSchema,
  // Re-exported schemas
  ResearchSchema,
  // Response schema factories
  createSingleResponseSchema,
  createSingleReadOnlyResponseSchema,
  createListResponseSchema,
  createSearchResponseSchema,
  // Response schemas for /research routes
  WorkflowDataSchema,
  WorkflowResponseSchema,
  UidsDataSchema,
  UidsResponseSchema,
  ResearchDetailResponseSchema,
  ResearchDetailPublicResponseSchema,
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
  DatasetUpdateResponseSchema,
  DatasetVersionsListResponseSchema,
  DatasetVersionDetailResponseSchema,
  LinkedResearchesListResponseSchema,
  // JGA Shinsei
  JdsIdParamsSchema,
  JduIdParamsSchema,
  DsApplicationListResponseSchema,
  DsApplicationDetailResponseSchema,
  DuApplicationListResponseSchema,
  DuApplicationDetailResponseSchema,
} from "./request-response"
export type {
  ErrorCode,
  ProblemDetails,
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
  HumIdParams,
  DatasetIdParams,
  VersionParams,
  DatasetVersionParams,
  HealthResponse,
  IsAdminResponse,
  StatsFacetCount,
  StatsResponse,
  // Response types for /research routes
  WorkflowData,
  WorkflowResponse,
  UidsData,
  UidsResponse,
  ResearchDetailResponse,
  ResearchDetailPublicResponse,
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
  DatasetUpdateResponse,
  DatasetVersionsListResponse,
  DatasetVersionDetailResponse,
  LinkedResearchesListResponse,
  // JGA Shinsei
  JdsIdParams,
  JduIdParams,
  DsApplicationListResponse,
  DsApplicationDetailResponse,
  DuApplicationListResponse,
  DuApplicationDetailResponse,
} from "./request-response"
