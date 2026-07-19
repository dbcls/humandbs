/**
 * Common helper functions for ES operations
 *
 * This module provides:
 * - String manipulation utilities
 * - Aggregation builders
 */
import type { estypes } from "@elastic/elasticsearch"

// === String Utilities ===

/** Split comma-separated string into array, trimming and filtering empty values */
export const splitComma = (s: string | undefined): string[] =>
  s ? s.split(",").map(v => v.trim()).filter(Boolean) : []

// === Aggregation Builders ===

/**
 * Field used for the cardinality count inside facet aggregations.
 * - "datasetId": count unique Datasets (used by Dataset list facets)
 * - "humId": count unique Researches (used by Research list facets)
 */
export type FacetCountField = "datasetId" | "humId"

/** Helper to create nested aggregation with reverse_nested + cardinality for unique entity count */
export const nestedFacetAgg = (
  field: string,
  countField: FacetCountField,
  size = 500,
): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    values: {
      terms: { field, size },
      aggs: {
        dataset_count: {
          reverse_nested: {},
          aggs: {
            unique: { cardinality: { field: countField } },
          },
        },
      },
    },
  },
})

/** Helper to create double-nested aggregation (for diseases, policies) */
export const doubleNestedFacetAgg = (
  innerPath: string,
  field: string,
  countField: FacetCountField,
  size = 500,
): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    inner: {
      nested: { path: innerPath },
      aggs: {
        values: {
          terms: { field, size },
          aggs: {
            dataset_count: {
              reverse_nested: {},
              aggs: {
                unique: { cardinality: { field: countField } },
              },
            },
          },
        },
      },
    },
  },
})

/** Helper to create platform multi_terms aggregation (vendor + model, double-nested) */
export const platformFacetAgg = (
  countField: FacetCountField,
  size = 500,
): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    inner: {
      nested: { path: "experiments.searchable.platforms" },
      aggs: {
        vendorModel: {
          multi_terms: {
            size,
            terms: [
              { field: "experiments.searchable.platforms.vendor" },
              { field: "experiments.searchable.platforms.model" },
            ],
          },
          aggs: {
            dataset_count: {
              reverse_nested: {},
              aggs: {
                unique: { cardinality: { field: countField } },
              },
            },
          },
        },
      },
    },
  },
})

/** Helper to create top-level facet aggregation with cardinality for unique entity count */
export const topLevelFacetAgg = (
  field: string,
  countField: FacetCountField,
  size = 10,
): estypes.AggregationsAggregationContainer => ({
  terms: { field, size },
  aggs: {
    dataset_count: { cardinality: { field: countField } },
  },
})
