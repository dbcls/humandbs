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
} from "./response";
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
} from "./response";

// === Common ===
export { LANG_TYPES, booleanFromString } from "./common";
export type { LangType } from "./common";

// === Authentication ===
export { JwtClaimsSchema, AuthUserSchema } from "./auth";
export type { JwtClaims, AuthUser } from "./auth";

// === Workflow ===
export {
  ResearchStatusSchema,
  RESEARCH_STATUS,
  STATUS_ACTIONS,
  StatusTransitions,
} from "./workflow";
export type { ResearchStatus, StatusAction } from "./workflow";
export type { EsResearchStatus } from "./workflow";

// === Facets ===
export {
  DATASET_FACET_NAMES,
  RESEARCH_FACET_NAMES,
  isValidFacetName,
  FacetValueSchema,
  FacetsMapSchema,
} from "./facets";
export type {
  DatasetFacetName,
  ResearchFacetName,
  FacetValue,
  FacetsMap,
} from "./facets";

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
} from "./es-docs";
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
} from "./es-docs";

// === Query Parameters ===
export {
  LangVersionQuerySchema,
  LangQuerySchema,
  ResearchListingQuerySchema,
  ResearchSearchQuerySchema,
  DatasetListingQuerySchema,
  DatasetSearchQuerySchema,
  FacetFilterQuerySchema,
  ResearchSummarySchema,
  SearchQuerySchema,
  ResearchListQuerySchema,
  DatasetListQuerySchema,
} from "./query-params";
export type {
  LangVersionQuery,
  LangQuery,
  ResearchListingQuery,
  ResearchSearchQuery,
  DatasetListingQuery,
  DatasetSearchQuery,
  FacetFilterQuery,
  ResearchSummary,
  SearchQuery,
  ResearchListQuery,
  DatasetListQuery,
} from "./query-params";

// === Filters ===
export {
  RangeFilterSchema,
  DatasetFiltersSchema,
  ResearchSearchBodySchema,
  DatasetSearchBodySchema,
} from "./filters";
export type {
  RangeFilter,
  DatasetFilters,
  ResearchSearchBody,
  DatasetSearchBody,
} from "./filters";

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
  // UIDs API
  UpdateUidsRequestSchema,
  // Version API
  CreateVersionRequestSchema,
  VersionResponseSchema,
  VersionsListResponseSchema,
  // Dataset API
  CreateDatasetRequestSchema,
  UpdateDatasetRequestSchema,
  DatasetWithMetadataSchema,
  DatasetListResponseSchema,
  CreateDatasetForResearchRequestSchema,
  // Link API
  LinkedDatasetsResponseSchema,
  LinkedResearchesResponseSchema,
  // Search responses
  SearchResearchResultSchema,
  SearchDatasetResultSchema,
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
} from "./request-response";
export type {
  ErrorCode,
  ProblemDetails,
  ResponseMeta,
  CreateResearchRequest,
  UpdateResearchRequest,
  ResearchWithStatus,
  ResearchResponse,
  UpdateUidsRequest,
  CreateVersionRequest,
  VersionResponse,
  VersionsListResponse,
  CreateDatasetRequest,
  UpdateDatasetRequest,
  DatasetWithMetadata,
  DatasetListResponse,
  CreateDatasetForResearchRequest,
  LinkedDatasetsResponse,
  LinkedResearchesResponse,
  SearchResearchResult,
  SearchDatasetResult,
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
  // Response types for /research routes
  WorkflowData,
  WorkflowResponse,
  UidsData,
  UidsResponse,
  ResearchDetailResponse,
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
} from "./request-response";
