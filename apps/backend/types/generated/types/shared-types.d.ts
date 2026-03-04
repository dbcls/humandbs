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
export { LANG_TYPES } from "../src/api/types";
export type { LangType } from "../src/api/types";
export { FacetValueSchema, FacetsMapSchema, DATASET_FACET_NAMES, RESEARCH_FACET_NAMES, isValidFacetName, } from "../src/api/types";
export type { FacetValue, FacetsMap, DatasetFacetName, ResearchFacetName, } from "../src/api/types";
export { LangQuerySchema, LangVersionQuerySchema, ResearchSearchQuerySchema, DatasetSearchQuerySchema, FacetFilterQuerySchema, ResearchListingQuerySchema, DatasetListingQuerySchema, } from "../src/api/types";
export type { LangQuery, LangVersionQuery, ResearchSearchQuery, DatasetSearchQuery, FacetFilterQuery, ResearchListingQuery, DatasetListingQuery, } from "../src/api/types";
export { RangeFilterSchema, DatasetFiltersSchema, ResearchSearchBodySchema, DatasetSearchBodySchema, } from "../src/api/types";
export type { RangeFilter, DatasetFilters, ResearchSearchBody, DatasetSearchBody, } from "../src/api/types";
export { ResearchSummarySchema, DatasetVersionItemSchema, } from "../src/api/types";
export type { ResearchSummary, DatasetVersionItem, } from "../src/api/types";
export { DatasetRefSchema, EsDatasetDocSchema, EsResearchDocSchema, EsResearchVersionDocSchema, EsResearchDetailSchema, EsDatasetDocSchema as DatasetDocSchema, EsResearchDocSchema as ResearchDocSchema, EsResearchVersionDocSchema as ResearchVersionDocSchema, EsResearchDetailSchema as ResearchDetailSchema, } from "../src/api/types";
export type { DatasetRef, EsDatasetDoc, EsResearchDoc, EsResearchVersionDoc, EsResearchDetail, EsExperiment, EsPerson, EsGrant, EsPublication, EsSummary, EsDatasetDoc as DatasetDoc, EsResearchDoc as ResearchDoc, EsResearchVersionDoc as ResearchVersionDoc, EsResearchDetail as ResearchDetail, } from "../src/api/types";
export { HumIdParamsSchema, DatasetIdParamsSchema, VersionParamsSchema, DatasetVersionParamsSchema, } from "../src/api/types";
export type { HumIdParams, DatasetIdParams, VersionParams, DatasetVersionParams, } from "../src/api/types";
export { StatsResponseSchema, StatsFacetCountSchema } from "../src/api/types";
export type { StatsResponse, StatsFacetCount } from "../src/api/types";
export { ERROR_CODES, ProblemDetailsSchema } from "../src/api/types";
export type { ErrorCode, ProblemDetails } from "../src/api/types";
export { AllFacetsResponseSchema, FacetFieldResponseSchema, } from "../src/api/types";
export type { AllFacetsResponse, FacetFieldResponse } from "../src/api/types";
export { HealthResponseSchema, IsAdminResponseSchema } from "../src/api/types";
export type { HealthResponse, IsAdminResponse } from "../src/api/types";
export { ResearchStatusSchema, RESEARCH_STATUS, STATUS_ACTIONS, StatusTransitions } from "../src/api/types";
export type { ResearchStatus, StatusAction } from "../src/api/types";
export { PaginationSchema, BaseResponseMetaSchema, ResponseMetaReadOnlySchema, ResponseMetaWithLockSchema, ResponseMetaWithPaginationSchema, } from "../src/api/types";
export type { Pagination, BaseResponseMeta, ResponseMetaReadOnly, ResponseMetaWithLock, ResponseMetaWithPagination, SingleReadOnlyResponse, SingleResponse, ListResponse, SearchResponse, } from "../src/api/types";
export { DatasetSchema, CreateResearchRequestSchema, UpdateResearchRequestSchema, CreateVersionRequestSchema, UpdateUidsRequestSchema, ExperimentSchemaBase, CreateDatasetForResearchRequestSchema, } from "../src/api/types";
export type { CreateResearchRequest, UpdateResearchRequest, CreateVersionRequest, UpdateUidsRequest, CreateDatasetForResearchRequest, } from "../src/api/types";
export { ResearchResponseSchema, ResearchWithStatusSchema, VersionResponseSchema, } from "../src/api/types";
export type { ResearchResponse, ResearchWithStatus, VersionResponse, } from "../src/api/types";
export { ResearchDetailResponseSchema, ResearchWithLockResponseSchema, ResearchSearchResponseSchema, ResearchVersionsListResponseSchema, VersionDetailResponseSchema, VersionCreateResponseSchema, LinkedDatasetsListResponseSchema, DatasetCreateResponseSchema, WorkflowDataSchema, WorkflowResponseSchema, UidsDataSchema, UidsResponseSchema, } from "../src/api/types";
export type { ResearchDetailResponse, ResearchWithLockResponse, ResearchSearchResponse, ResearchVersionsListResponse, VersionDetailResponse, VersionCreateResponse, LinkedDatasetsListResponse, DatasetCreateResponse, WorkflowData, WorkflowResponse, UidsData, UidsResponse, } from "../src/api/types";
export { EsDatasetDocWithMergedSchema, MergedSearchableSchema, EsDatasetDocWithMergedSchema as DatasetDocWithMergedSchema, } from "../src/api/types";
export type { EsDatasetDocWithMerged, MergedSearchable, EsDatasetDocWithMerged as DatasetDocWithMerged, } from "../src/api/types";
export { UpdateDatasetRequestSchema } from "../src/api/types";
export type { UpdateDatasetRequest } from "../src/api/types";
export { DatasetWithMetadataSchema } from "../src/api/types";
export type { DatasetWithMetadata } from "../src/api/types";
export { DatasetSearchResponseSchema, DatasetDetailResponseSchema, DatasetUpdateResponseSchema, DatasetVersionsListResponseSchema, DatasetVersionDetailResponseSchema, LinkedResearchesListResponseSchema, } from "../src/api/types";
export type { DatasetSearchResponse, DatasetDetailResponse, DatasetUpdateResponse, DatasetVersionsListResponse, DatasetVersionDetailResponse, LinkedResearchesListResponse, } from "../src/api/types";
//# sourceMappingURL=shared-types.d.ts.map