/**
 * Shared types for frontend consumption
 *
 * This module re-exports types from the backend API layer that are
 * needed by the frontend. Import from this file in frontend code
 * to ensure type consistency between frontend and backend.
 *
 * Note: This file intentionally re-exports from api/types rather than
 * defining types directly, to maintain a single source of truth.
 */

// === Re-exports from api/types ===

// Lang type
export { LANG_TYPES } from "../src/api/types";
export type { LangType } from "../src/api/types";

// Facets
export {
  FacetValueSchema,
  FacetsMapSchema,
  DATASET_FACET_NAMES,
  RESEARCH_FACET_NAMES,
  isValidFacetName,
} from "../src/api/types";
export type {
  FacetValue,
  FacetsMap,
  DatasetFacetName,
  ResearchFacetName,
} from "../src/api/types";

// Query parameters
export {
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchSearchQuerySchema,
  DatasetSearchQuerySchema,
  FacetFilterQuerySchema,
  ResearchListingQuerySchema,
  DatasetListingQuerySchema,
} from "../src/api/types";
export type {
  LangQuery,
  LangVersionQuery,
  ResearchSearchQuery,
  DatasetSearchQuery,
  FacetFilterQuery,
  ResearchListingQuery,
  DatasetListingQuery,
} from "../src/api/types";

// Filters (POST search)
export {
  RangeFilterSchema,
  DatasetFiltersSchema,
  ResearchSearchBodySchema,
  DatasetSearchBodySchema,
} from "../src/api/types";
export type {
  RangeFilter,
  DatasetFilters,
  ResearchSearchBody,
  DatasetSearchBody,
} from "../src/api/types";

// Response data types (used inside unified response wrappers)
export {
  ResearchSummarySchema,
  DatasetVersionItemSchema,
} from "../src/api/types";
export type {
  ResearchSummary,
  DatasetVersionItem,
} from "../src/api/types";

// ES document types (API response format)
// Note: Exported with both Es-prefixed names (internal) and clean names (external API)
export {
  DatasetRefSchema,
  EsDatasetDocSchema,
  EsResearchDocSchema,
  EsResearchVersionDocSchema,
  EsResearchDetailSchema,
  // Clean aliases without Es prefix
  EsDatasetDocSchema as DatasetDocSchema,
  EsResearchDocSchema as ResearchDocSchema,
  EsResearchVersionDocSchema as ResearchVersionDocSchema,
  EsResearchDetailSchema as ResearchDetailSchema,
} from "../src/api/types";
export type {
  DatasetRef,
  EsDatasetDoc,
  EsResearchDoc,
  EsResearchVersionDoc,
  EsResearchDetail,
  // Sub-document types embedded in API responses
  EsExperiment,
  EsPerson,
  EsGrant,
  EsPublication,
  EsSummary,
  // Clean aliases without Es prefix
  EsDatasetDoc as DatasetDoc,
  EsResearchDoc as ResearchDoc,
  EsResearchVersionDoc as ResearchVersionDoc,
  EsResearchDetail as ResearchDetail,
} from "../src/api/types";

// Path parameters
export {
  HumIdParamsSchema,
  DatasetIdParamsSchema,
  VersionParamsSchema,
  DatasetVersionParamsSchema,
} from "../src/api/types";
export type {
  HumIdParams,
  DatasetIdParams,
  VersionParams,
  DatasetVersionParams,
} from "../src/api/types";

// Stats
export { StatsResponseSchema, StatsFacetCountSchema } from "../src/api/types";
export type { StatsResponse, StatsFacetCount } from "../src/api/types";

// Error responses
export { ERROR_CODES, ProblemDetailsSchema } from "../src/api/types";
export type { ErrorCode, ProblemDetails } from "../src/api/types";

// All facets response
export {
  AllFacetsResponseSchema,
  FacetFieldResponseSchema,
} from "../src/api/types";
export type { AllFacetsResponse, FacetFieldResponse } from "../src/api/types";

// Simple response types
export { HealthResponseSchema, IsAdminResponseSchema } from "../src/api/types";
export type { HealthResponse, IsAdminResponse } from "../src/api/types";

// Workflow status
export { ResearchStatusSchema, RESEARCH_STATUS, STATUS_ACTIONS, StatusTransitions } from "../src/api/types";
export type { ResearchStatus, StatusAction } from "../src/api/types";

// Response meta and pagination
export {
  PaginationSchema,
  BaseResponseMetaSchema,
  ResponseMetaReadOnlySchema,
  ResponseMetaWithLockSchema,
  ResponseMetaWithPaginationSchema,
} from "../src/api/types";
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
} from "../src/api/types";

// Request/data schemas
export {
  DatasetSchema,
  CreateResearchRequestSchema,
  UpdateResearchRequestSchema,
  CreateVersionRequestSchema,
  UpdateUidsRequestSchema,
  ExperimentSchemaBase,
  CreateDatasetForResearchRequestSchema,
} from "../src/api/types";
export type {
  CreateResearchRequest,
  UpdateResearchRequest,
  CreateVersionRequest,
  UpdateUidsRequest,
  CreateDatasetForResearchRequest,
} from "../src/api/types";

// Additional response schemas for /research routes
export {
  ResearchResponseSchema,
  ResearchWithStatusSchema,
  VersionResponseSchema,
} from "../src/api/types";
export type {
  ResearchResponse,
  ResearchWithStatus,
  VersionResponse,
} from "../src/api/types";

// Response schemas for /research routes
export {
  ResearchDetailResponseSchema,
  ResearchWithLockResponseSchema,
  ResearchSearchResponseSchema,
  ResearchVersionsListResponseSchema,
  VersionDetailResponseSchema,
  VersionCreateResponseSchema,
  LinkedDatasetsListResponseSchema,
  DatasetCreateResponseSchema,
  WorkflowDataSchema,
  WorkflowResponseSchema,
  UidsDataSchema,
  UidsResponseSchema,
} from "../src/api/types";
export type {
  ResearchDetailResponse,
  ResearchWithLockResponse,
  ResearchSearchResponse,
  ResearchVersionsListResponse,
  VersionDetailResponse,
  VersionCreateResponse,
  LinkedDatasetsListResponse,
  DatasetCreateResponse,
  WorkflowData,
  WorkflowResponse,
  UidsData,
  UidsResponse,
} from "../src/api/types";

// Dataset document with merged searchable fields
export {
  EsDatasetDocWithMergedSchema,
  MergedSearchableSchema,
  // Clean alias without Es prefix
  EsDatasetDocWithMergedSchema as DatasetDocWithMergedSchema,
} from "../src/api/types";
export type {
  EsDatasetDocWithMerged,
  MergedSearchable,
  EsDatasetDocWithMerged as DatasetDocWithMerged,
} from "../src/api/types";

// Dataset request schemas
export { UpdateDatasetRequestSchema } from "../src/api/types";
export type { UpdateDatasetRequest } from "../src/api/types";

// Dataset with metadata (update response data shape)
export { DatasetWithMetadataSchema } from "../src/api/types";
export type { DatasetWithMetadata } from "../src/api/types";

// Response schemas for /dataset routes
export {
  DatasetSearchResponseSchema,
  DatasetDetailResponseSchema,
  DatasetUpdateResponseSchema,
  DatasetVersionsListResponseSchema,
  DatasetVersionDetailResponseSchema,
  LinkedResearchesListResponseSchema,
} from "../src/api/types";
export type {
  DatasetSearchResponse,
  DatasetDetailResponse,
  DatasetUpdateResponse,
  DatasetVersionsListResponse,
  DatasetVersionDetailResponse,
  LinkedResearchesListResponse,
} from "../src/api/types";
