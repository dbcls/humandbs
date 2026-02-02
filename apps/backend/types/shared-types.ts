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

// Query parameters
export {
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchSearchQuerySchema,
  DatasetSearchQuerySchema,
} from "@/api/types"
export type {
  LangQuery,
  LangVersionQuery,
  ResearchSearchQuery,
  DatasetSearchQuery,
} from "@/api/types"

// Response types
export {
  ResearchSummarySchema,
  ResearchVersionsResponseSchema,
  DatasetVersionsResponseSchema,
  DatasetVersionItemSchema,
  ResearchSearchResponseSchema,
  DatasetSearchResponseSchema,
  FacetItemSchema,
  FacetsMapSchema,
} from "@/api/types"
export type {
  ResearchSummary,
  ResearchVersionsResponse,
  DatasetVersionsResponse,
  DatasetVersionItem,
  ResearchSearchResponse,
  DatasetSearchResponse,
  FacetItem,
  FacetsMap,
} from "@/api/types"

// ES document types (API response format)
export {
  EsDatasetDocSchema,
  EsResearchDocSchema,
  EsResearchVersionDocSchema,
  EsResearchDetailSchema,
} from "@/api/types"
export type {
  EsDatasetDoc,
  EsResearchDoc,
  EsResearchVersionDoc,
  EsResearchDetail,
} from "@/api/types"

// Path parameters
export { HumIdParamsSchema, DatasetIdParamsSchema } from "@/api/types"
export type { HumIdParams, DatasetIdParams } from "@/api/types"

// Simple response types
export {
  HealthResponseSchema,
  IsAdminResponseSchema,
  ErrorResponseSchema,
} from "@/api/types"
export type {
  HealthResponse,
  IsAdminResponse,
  ErrorResponse,
} from "@/api/types"
