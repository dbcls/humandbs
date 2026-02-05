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
} from "@/api/types/response"
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
} from "@/api/types/response"

// === Common ===
export { LANG_TYPES, booleanFromString } from "@/api/types/common"
export type { LangType } from "@/api/types/common"

// === Authentication ===
export {
  JwtClaimsSchema,
  AuthUserSchema,
} from "@/api/types/auth"
export type {
  JwtClaims,
  AuthUser,
} from "@/api/types/auth"

// === Workflow ===
export {
  ResearchStatusSchema,
  RESEARCH_STATUS,
  STATUS_ACTIONS,
  StatusTransitions,
} from "@/api/types/workflow"
export type { ResearchStatus, StatusAction } from "@/api/types/workflow"
export type { EsResearchStatus } from "@/api/types/workflow"

// === Facets ===
export {
  DATASET_FACET_NAMES,
  RESEARCH_FACET_NAMES,
  isValidFacetName,
  FacetValueSchema,
  FacetsMapSchema,
} from "@/api/types/facets"
export type {
  DatasetFacetName,
  ResearchFacetName,
  FacetValue,
  FacetsMap,
  TypedFacetsMap,
} from "@/api/types/facets"

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
} from "@/api/types/es-docs"
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
} from "@/api/types/es-docs"

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
} from "@/api/types/query-params"
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
} from "@/api/types/query-params"

// === Filters ===
export {
  RangeFilterSchema,
  DatasetFiltersSchema,
  ResearchSearchBodySchema,
  DatasetSearchBodySchema,
} from "@/api/types/filters"
export type {
  RangeFilter,
  DatasetFilters,
  ResearchSearchBody,
  DatasetSearchBody,
} from "@/api/types/filters"

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
} from "@/api/types/request-response"
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
} from "@/api/types/request-response"
