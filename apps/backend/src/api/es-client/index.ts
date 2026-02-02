/**
 * Elasticsearch client barrel file
 *
 * Re-exports all public APIs from the es-client module.
 */

// Client and configuration
export { esClient, ES_INDEX, isConflictError, withOptimisticLock } from "@/api/es-client/client"
export type { estypes } from "@/api/es-client/client"

// Authorization
export {
  buildStatusFilter,
  canAccessResearchDoc,
  getPublishedHumIds,
  validateStatusTransition,
  canPerformTransition,
} from "@/api/es-client/auth"

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
export { esTotal, uniq, mgetMap } from "@/api/es-client/utils"

// Query helpers
export {
  nestedTermsQuery,
  nestedTermQuery,
  nestedWildcardQuery,
  nestedExistsQuery,
  nestedRangeQuery,
  doubleNestedWildcardQuery,
  doubleNestedTermsQuery,
  nestedBooleanTermQuery,
} from "@/api/es-client/query-helpers"

// Helpers
export {
  splitComma,
  canAccessDataset,
  nestedFacetAgg,
  doubleNestedFacetAgg,
  platformFacetAgg,
} from "@/api/es-client/helpers"

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
  getPendingReviews,
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
  listDatasetVersions,
  generateDraftDatasetId,
  createDataset,
  updateDataset,
  replaceDatasetId,
  deleteDataset,
  getResearchByDatasetId,
} from "@/api/es-client/dataset"

// Search operations
export {
  searchDatasets,
  searchResearches,
} from "@/api/es-client/search"
