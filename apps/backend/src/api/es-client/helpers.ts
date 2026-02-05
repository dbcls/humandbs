/**
 * Common helper functions for ES operations
 *
 * This module provides:
 * - String manipulation utilities
 * - Access control helpers
 * - Aggregation builders
 */
import type { estypes } from "@elastic/elasticsearch"

import { canAccessResearchDoc } from "@/api/es-client/auth"
import type { AuthUser, EsDatasetDoc, EsResearchDoc } from "@/api/types"

// === String Utilities ===

/** Split comma-separated string into array, trimming and filtering empty values */
export const splitComma = (s: string | undefined): string[] =>
  s ? s.split(",").map(v => v.trim()).filter(Boolean) : []

// === Access Control Helpers ===

/**
 * Check if user can access a Dataset based on parent Research status
 */
export const canAccessDataset = async (
  authUser: AuthUser | null,
  dataset: EsDatasetDoc,
  getResearchDoc: (humId: string) => Promise<EsResearchDoc | null>,
): Promise<boolean> => {
  if (authUser?.isAdmin) return true

  // Get parent Research and check access
  const researchDoc = await getResearchDoc(dataset.humId)
  if (!researchDoc) return false

  return canAccessResearchDoc(authUser, researchDoc)
}

// === Aggregation Builders ===

/** Helper to create nested aggregation with reverse_nested for dataset count */
export const nestedFacetAgg = (field: string, size = 50): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    values: {
      terms: { field, size },
      aggs: { dataset_count: { reverse_nested: {} } },
    },
  },
})

/** Helper to create double-nested aggregation (for diseases, policies) */
export const doubleNestedFacetAgg = (
  innerPath: string,
  field: string,
  size = 50,
): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    inner: {
      nested: { path: innerPath },
      aggs: {
        values: {
          terms: { field, size },
          aggs: { dataset_count: { reverse_nested: {} } },
        },
      },
    },
  },
})

/** Helper to create platform composite aggregation (vendor + model) */
export const platformFacetAgg = (size = 50): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    vendorModel: {
      composite: {
        size,
        sources: [
          { vendor: { terms: { field: "experiments.searchable.platformVendor", missing_bucket: true } } },
          { model: { terms: { field: "experiments.searchable.platformModel", missing_bucket: true } } },
        ],
      },
      aggs: { dataset_count: { reverse_nested: {} } },
    },
  },
})
