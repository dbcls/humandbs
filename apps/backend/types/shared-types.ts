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
export { LANG_TYPES } from "@/api/types"
export type { LangType } from "@/api/types"

// Facets
export {
  FacetValueSchema,
  FacetsMapSchema,
  DATASET_FACET_NAMES,
  RESEARCH_FACET_NAMES,
} from "@/api/types"
export type {
  FacetValue,
  FacetsMap,
  DatasetFacetName,
  ResearchFacetName,
  TypedFacetsMap,
} from "@/api/types"

// Query parameters
export {
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchSearchQuerySchema,
  DatasetSearchQuerySchema,
  ResearchListingQuerySchema,
  DatasetListingQuerySchema,
} from "@/api/types"
export type {
  LangQuery,
  LangVersionQuery,
  ResearchSearchQuery,
  DatasetSearchQuery,
  ResearchListingQuery,
  DatasetListingQuery,
} from "@/api/types"

// Filters (POST search)
export {
  RangeFilterSchema,
  DatasetFiltersSchema,
  ResearchSearchBodySchema,
  DatasetSearchBodySchema,
} from "@/api/types"
export type {
  RangeFilter,
  DatasetFilters,
  ResearchSearchBody,
  DatasetSearchBody,
} from "@/api/types"

// Response types
export {
  ResearchSummarySchema,
  ResearchVersionsResponseSchema,
  DatasetVersionsResponseSchema,
  DatasetVersionItemSchema,
  ResearchSearchResponseSchema,
  DatasetSearchResponseSchema,
} from "@/api/types"
export type {
  ResearchSummary,
  ResearchVersionsResponse,
  DatasetVersionsResponse,
  DatasetVersionItem,
  ResearchSearchResponse,
  DatasetSearchResponse,
} from "@/api/types"

// ES document types (API response format)
// Note: Exported with both Es-prefixed names (internal) and clean names (external API)
export {
  EsDatasetDocSchema,
  EsResearchDocSchema,
  EsResearchVersionDocSchema,
  EsResearchDetailSchema,
  // Clean aliases without Es prefix
  EsDatasetDocSchema as DatasetDocSchema,
  EsResearchDocSchema as ResearchDocSchema,
  EsResearchVersionDocSchema as ResearchVersionDocSchema,
  EsResearchDetailSchema as ResearchDetailSchema,
} from "@/api/types"
export type {
  EsDatasetDoc,
  EsResearchDoc,
  EsResearchVersionDoc,
  EsResearchDetail,
  // Clean aliases without Es prefix
  EsDatasetDoc as DatasetDoc,
  EsResearchDoc as ResearchDoc,
  EsResearchVersionDoc as ResearchVersionDoc,
  EsResearchDetail as ResearchDetail,
} from "@/api/types"

// Path parameters
export {
  HumIdParamsSchema,
  DatasetIdParamsSchema,
  VersionParamsSchema,
  DatasetVersionParamsSchema,
} from "@/api/types"
export type {
  HumIdParams,
  DatasetIdParams,
  VersionParams,
  DatasetVersionParams,
} from "@/api/types"

// Stats
export {
  StatsResponseSchema,
  StatsFacetCountSchema,
} from "@/api/types"
export type {
  StatsResponse,
  StatsFacetCount,
} from "@/api/types"

// Error responses
export {
  ProblemDetailsSchema,
} from "@/api/types"
export type {
  ProblemDetails,
} from "@/api/types"

// All facets response
export {
  AllFacetsResponseSchema,
  FacetFieldResponseSchema,
} from "@/api/types"
export type {
  AllFacetsResponse,
  FacetFieldResponse,
} from "@/api/types"

// Simple response types
export {
  HealthResponseSchema,
  IsAdminResponseSchema,
} from "@/api/types"
export type {
  HealthResponse,
  IsAdminResponse,
} from "@/api/types"
