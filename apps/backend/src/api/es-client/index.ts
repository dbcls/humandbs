/**
 * Elasticsearch client barrel file
 *
 * Re-exports all public APIs from the es-client module.
 */

// Client and configuration
export { esClient, ES_INDEX, isConflictError } from "@/api/es-client/client"
export type { estypes } from "@/api/es-client/client"

// Authorization
export {
  buildStatusFilter,
  canAccessResearchDoc,
  getPublishedHumIds,
  checkRequestedStatus,
  validateStatusTransition,
  canPerformTransition,
} from "@/api/es-client/auth"
export type { RequestedStatusCheck } from "@/api/es-client/auth"

// Filters
export {
  NESTED_TERMS_FILTERS,
  NESTED_RANGE_FILTERS,
  ARRAY_FIELD_MAPPINGS,
  RANGE_FIELD_MAPPINGS,
} from "@/api/es-client/filters"
export type {
  NestedTermsFilter,
  NestedRangeFilter,
  ArrayFieldMapping,
  RangeFieldMapping,
} from "@/api/es-client/filters"

// Utilities
export { escapeEsWildcard, esTotal, uniq, mgetMap } from "@/api/es-client/utils"

// Query helpers
export {
  nestedTermsQuery,
  nestedRangeQuery,
  doubleNestedWildcardQuery,
  doubleNestedTermsQuery,
  nestedBooleanTermQuery,
} from "@/api/es-client/query-helpers"

// Helpers
export {
  splitComma,
  nestedFacetAgg,
  doubleNestedFacetAgg,
  platformFacetAgg,
} from "@/api/es-client/helpers"
export type { FacetCountField } from "@/api/es-client/helpers"

// Research operations
export {
  getResearchDoc,
  getResearchWithSeqNo,
  getResearchDetail,
  generateNextHumId,
  createResearch,
  updateResearch,
  updateResearchStatus,
  updateResearchUids,
  deleteResearch,
} from "@/api/es-client/research"

// Research version operations
export {
  getResearchVersion,
  getResearchVersionWithSeqNo,
  listResearchVersions,
  listResearchVersionsSorted,
  createResearchVersion,
  linkDatasetToResearch,
  unlinkDatasetFromResearch,
} from "@/api/es-client/research-version"

// Dataset operations
export {
  getDataset,
  getDatasetWithSeqNo,
  resolveLatestDatasetVersion,
  listDatasetVersions,
  generateDraftDatasetId,
  createDataset,
  updateDataset,
  deleteDataset,
  getResearchByDatasetId,
} from "@/api/es-client/dataset"

// Query builders (pure functions)
export {
  buildDatasetSortSpec,
  buildResearchSortSpec,
  classifyFreeTextQuery,
  hasFreeTextQuery,
  buildDatasetQueryClauses,
  buildResearchQueryClauses,
  datasetIdTokens,
  buildResearchDateRangeFilters,
} from "@/api/es-client/query-builders"

// Search operations
export {
  searchDatasets,
  searchResearches,
} from "@/api/es-client/search"

// Stats operations
export { getPublicStats } from "@/api/es-client/stats"
