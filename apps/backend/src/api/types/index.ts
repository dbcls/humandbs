/**
 * API types barrel file
 *
 * Re-exports all type definitions from the api/types module.
 *
 * Dependency flow: crawler/types → es/types → api/types
 */

// === Unified Response Types ===
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
  SearchResponse as UnifiedSearchResponse,
} from "./response"

// === Common ===
export { LANG_TYPES, booleanFromString } from "./common"
export type { LangType } from "./common"

// === Authentication ===
export {
  JwtClaimsSchema,
  AuthUserSchema,
} from "./auth"
export type {
  JwtClaims,
  AuthUser,
} from "./auth"

// === Workflow ===
export {
  ResearchStatusSchema,
  RESEARCH_STATUS,
  STATUS_ACTIONS,
  StatusTransitions,
} from "./workflow"
export type { ResearchStatus, StatusAction } from "./workflow"
export type { EsResearchStatus } from "./workflow"

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
  TypedFacetsMap,
} from "./facets"

// === ES Documents ===
export {
  DatasetRefSchema,
  EsDatasetDocSchema,
  EsDatasetDocWithMergedSchema,
  MergedSearchableSchema,
  EsResearchVersionDocSchema,
  EsResearchDocSchema,
  EsResearchDetailSchema,
  DatasetVersionItemSchema,
} from "./es-docs"
export type {
  DatasetRef,
  EsDatasetDoc,
  EsDatasetDocWithMerged,
  MergedSearchable,
  EsResearchVersionDoc,
  EsResearchDoc,
  EsResearchDetail,
  DatasetVersionItem,
  // Re-exported from es/types
  EsDataset,
  EsResearch,
  EsResearchVersion,
  EsExperiment,
  EsPerson,
  EsGrant,
  EsPublication,
  EsSummary,
} from "./es-docs"

// === Query Parameters ===
export {
  LangVersionQuerySchema,
  LangQuerySchema,
  ResearchListingQuerySchema,
  ResearchSearchQuerySchema,
  DatasetListingQuerySchema,
  DatasetSearchQuerySchema,
  ResearchSummarySchema,
  SearchQuerySchema,
  ResearchListQuerySchema,
  DatasetListQuerySchema,
} from "./query-params"
export type {
  LangVersionQuery,
  LangQuery,
  ResearchListingQuery,
  ResearchSearchQuery,
  DatasetListingQuery,
  DatasetSearchQuery,
  ResearchSummary,
  SearchQuery,
  ResearchListQuery,
  DatasetListQuery,
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
  DatasetSchema,
  // Error schemas
  ERROR_CODES,
  ProblemDetailsSchema,
  // Response meta
  ResponseMetaSchema,
  // Research API
  CreateResearchRequestSchema,
  UpdateResearchRequestSchema,
  ResearchWithStatusSchema,
  ResearchResponseSchema,
  ResearchListResponseSchema,
  // UIDs API
  UpdateUidsRequestSchema,
  UpdateUidsResponseSchema,
  // Version API
  CreateVersionRequestSchema,
  VersionResponseSchema,
  VersionsListResponseSchema,
  ResearchVersionsResponseSchema,
  DatasetVersionsResponseSchema,
  // Dataset API
  CreateDatasetRequestSchema,
  UpdateDatasetRequestSchema,
  DatasetWithMetadataSchema,
  DatasetListResponseSchema,
  CreateDatasetForResearchRequestSchema,
  // Link API
  LinkedDatasetsResponseSchema,
  LinkedResearchesResponseSchema,
  // Workflow API
  WorkflowResponseSchema,
  // Search responses
  ResearchSearchResponseSchema,
  DatasetSearchResponseSchema,
  SearchResearchResultSchema,
  SearchDatasetResultSchema,
  SearchResponseSchema,
  FacetsResponseSchema,
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
  ResearchVersionSchema,
  // Unified response schema factories
  createUnifiedSingleResponseSchema,
  createUnifiedSingleReadOnlyResponseSchema,
  createUnifiedListResponseSchema,
  createUnifiedSearchResponseSchema,
  // Unified response schemas for /research routes
  WorkflowDataSchema,
  WorkflowUnifiedResponseSchema,
  UidsDataSchema,
  UidsUnifiedResponseSchema,
  ResearchDetailResponseSchema,
  ResearchWithLockResponseSchema,
  ResearchSearchUnifiedResponseSchema,
  ResearchVersionsListResponseSchema,
  VersionDetailResponseSchema,
  VersionCreateResponseSchema,
  LinkedDatasetsListResponseSchema,
  DatasetCreateResponseSchema,
} from "./request-response"
export type {
  ErrorCode,
  ProblemDetails,
  ResponseMeta,
  CreateResearchRequest,
  UpdateResearchRequest,
  ResearchWithStatus,
  ResearchResponse,
  ResearchListResponse,
  UpdateUidsRequest,
  UpdateUidsResponse,
  CreateVersionRequest,
  VersionResponse,
  VersionsListResponse,
  ResearchVersionsResponse,
  DatasetVersionsResponse,
  CreateDatasetRequest,
  UpdateDatasetRequest,
  DatasetWithMetadata,
  DatasetListResponse,
  CreateDatasetForResearchRequest,
  LinkedDatasetsResponse,
  LinkedResearchesResponse,
  WorkflowResponse,
  ResearchSearchResponse,
  DatasetSearchResponse,
  SearchResearchResult,
  SearchDatasetResult,
  SearchResponse,
  FacetsResponse,
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
  // Unified response types for /research routes
  WorkflowData,
  WorkflowUnifiedResponse,
  UidsData,
  UidsUnifiedResponse,
  ResearchDetailResponse,
  ResearchWithLockResponse,
  ResearchSearchUnifiedResponse,
  ResearchVersionsListResponse,
  VersionDetailResponse,
  VersionCreateResponse,
  LinkedDatasetsListResponse,
  DatasetCreateResponse,
} from "./request-response"
