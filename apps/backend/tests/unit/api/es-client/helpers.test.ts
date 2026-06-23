/**
 * Tests for facet aggregation helpers.
 *
 * These aggregations share the same shape but differ in the cardinality
 * field used to count unique entities per bucket:
 *   - "datasetId" → unique Datasets (Dataset list facets)
 *   - "humId"     → unique Researches (Research list facets)
 *
 * The tests below lock in that contract so that accidentally swapping the
 * field or dropping the parameter from a helper fails loudly.
 */
import { describe, expect, it } from "bun:test"

import type { FacetCountField } from "@/api/es-client/helpers"
import {
  doubleNestedFacetAgg,
  nestedFacetAgg,
  platformFacetAgg,
  topLevelFacetAgg,
} from "@/api/es-client/helpers"

const COUNT_FIELDS: FacetCountField[] = ["datasetId", "humId"]

describe("nestedFacetAgg", () => {
  it.each(COUNT_FIELDS)("countField=%s は cardinality に反映される", (countField) => {
    const agg = nestedFacetAgg("experiments.searchable.assayType", countField)

    expect(agg.nested).toEqual({ path: "experiments" })
    expect(agg.aggs?.values).toMatchObject({
      terms: { field: "experiments.searchable.assayType", size: 500 },
      aggs: {
        dataset_count: {
          reverse_nested: {},
          aggs: {
            unique: { cardinality: { field: countField } },
          },
        },
      },
    })
  })

  it("size のデフォルトは 500、指定すれば上書きされる", () => {
    const def = nestedFacetAgg("f", "datasetId")
    const small = nestedFacetAgg("f", "datasetId", 5)

    expect((def.aggs?.values as { terms: { size: number } }).terms.size).toBe(500)
    expect((small.aggs?.values as { terms: { size: number } }).terms.size).toBe(5)
  })
})

describe("doubleNestedFacetAgg", () => {
  it.each(COUNT_FIELDS)("countField=%s は内側 cardinality に反映される", (countField) => {
    const agg = doubleNestedFacetAgg(
      "experiments.searchable.diseases",
      "experiments.searchable.diseases.label",
      countField,
    )

    expect(agg.nested).toEqual({ path: "experiments" })
    expect(agg.aggs?.inner).toMatchObject({
      nested: { path: "experiments.searchable.diseases" },
      aggs: {
        values: {
          terms: { field: "experiments.searchable.diseases.label", size: 500 },
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
  })
})

describe("platformFacetAgg", () => {
  it.each(COUNT_FIELDS)("countField=%s は multi_terms の cardinality に反映される", (countField) => {
    const agg = platformFacetAgg(countField)

    expect(agg.nested).toEqual({ path: "experiments" })
    expect(agg.aggs?.inner).toMatchObject({
      nested: { path: "experiments.searchable.platforms" },
      aggs: {
        vendorModel: {
          multi_terms: {
            size: 500,
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
    })
  })
})

describe("topLevelFacetAgg", () => {
  it.each(COUNT_FIELDS)("countField=%s は top-level cardinality に反映される", (countField) => {
    const agg = topLevelFacetAgg("criteria", countField)

    expect(agg).toMatchObject({
      terms: { field: "criteria", size: 10 },
      aggs: {
        dataset_count: { cardinality: { field: countField } },
      },
    })
  })

  it("size のデフォルトは 10、指定すれば上書きされる", () => {
    const def = topLevelFacetAgg("criteria", "datasetId")
    const big = topLevelFacetAgg("criteria", "datasetId", 100)

    expect((def.terms as { size: number }).size).toBe(10)
    expect((big.terms as { size: number }).size).toBe(100)
  })
})
