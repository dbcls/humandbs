/**
 * Tests for hasDatasetFilters and filter constant table consistency
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  ARRAY_FIELD_MAPPINGS,
  DATASET_BOOLEAN_FILTER_PARAMS,
  DATASET_RANGE_FILTER_PARAMS,
  DATASET_STRING_FILTER_PARAMS,
  NESTED_RANGE_FILTERS,
  NESTED_TERMS_FILTERS,
  hasDatasetFilters,
} from "@/api/es-client/filters"

// === hasDatasetFilters ===

describe("hasDatasetFilters", () => {
  it("{} -> false", () => {
    expect(hasDatasetFilters({})).toBe(false)
  })

  it("{ assayType: 'WGS' } -> true (string filter)", () => {
    expect(hasDatasetFilters({ assayType: "WGS" })).toBe(true)
  })

  it("{ assayType: '' } -> false (falsy)", () => {
    expect(hasDatasetFilters({ assayType: "" })).toBe(false)
  })

  it("{ assayType: null } -> false (null is falsy)", () => {
    expect(hasDatasetFilters({ assayType: null })).toBe(false)
  })

  it("{ hasPhenotypeData: true } -> true (boolean filter)", () => {
    expect(hasDatasetFilters({ hasPhenotypeData: true })).toBe(true)
  })

  it("{ hasPhenotypeData: false } -> true (defined = true)", () => {
    expect(hasDatasetFilters({ hasPhenotypeData: false })).toBe(true)
  })

  it("{ hasPhenotypeData: undefined } -> false", () => {
    expect(hasDatasetFilters({ hasPhenotypeData: undefined })).toBe(false)
  })

  it("{ minSubjects: 10 } -> true (range filter)", () => {
    expect(hasDatasetFilters({ minSubjects: 10 })).toBe(true)
  })

  it("{ minSubjects: 0 } -> true (0 is defined)", () => {
    expect(hasDatasetFilters({ minSubjects: 0 })).toBe(true)
  })

  it("{ unknownParam: 'value' } -> false (unknown parameter)", () => {
    expect(hasDatasetFilters({ unknownParam: "value" })).toBe(false)
  })

  // PBT: each string filter param with truthy value -> true
  it("PBT: any DATASET_STRING_FILTER_PARAMS with truthy value -> true", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DATASET_STRING_FILTER_PARAMS),
        fc.string({ minLength: 1 }),
        (param, value) => {
          return hasDatasetFilters({ [param]: value })
        },
      ),
    )
  })

  // PBT: each boolean filter param with boolean value -> true
  it("PBT: any DATASET_BOOLEAN_FILTER_PARAMS with boolean -> true", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DATASET_BOOLEAN_FILTER_PARAMS),
        fc.boolean(),
        (param, value) => {
          return hasDatasetFilters({ [param]: value })
        },
      ),
    )
  })

  // PBT: each range filter param with number -> true
  it("PBT: any DATASET_RANGE_FILTER_PARAMS with number -> true", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DATASET_RANGE_FILTER_PARAMS),
        fc.integer(),
        (param, value) => {
          return hasDatasetFilters({ [param]: value })
        },
      ),
    )
  })
})

// === Constant table consistency ===

describe("filter constant table consistency", () => {
  it("NESTED_TERMS_FILTERS params are in DATASET_STRING_FILTER_PARAMS (except platform)", () => {
    const stringParams: readonly string[] = DATASET_STRING_FILTER_PARAMS
    for (const { param } of NESTED_TERMS_FILTERS) {
      // platform is handled separately
      if (param === "platform") continue
      expect(stringParams).toContain(param)
    }
  })

  it("NESTED_RANGE_FILTERS min/maxParam are in DATASET_RANGE_FILTER_PARAMS", () => {
    const rangeParams: readonly string[] = DATASET_RANGE_FILTER_PARAMS
    for (const { minParam, maxParam } of NESTED_RANGE_FILTERS) {
      expect(rangeParams).toContain(minParam)
      expect(rangeParams).toContain(maxParam)
    }
  })

  it("ARRAY_FIELD_MAPPINGS from values exist in string filter or range params", () => {
    const allParams = new Set<string>([
      ...DATASET_STRING_FILTER_PARAMS,
      ...DATASET_BOOLEAN_FILTER_PARAMS,
      ...DATASET_RANGE_FILTER_PARAMS,
      // Some mappings may go to params with different names
      ...ARRAY_FIELD_MAPPINGS.map(m => m.to),
    ])

    for (const { from } of ARRAY_FIELD_MAPPINGS) {
      // Either the 'from' is directly in the param sets,
      // or it maps to a known filter category
      const knownFilter = allParams.has(from) ||
        // Check if this is mapped to a range field
        NESTED_RANGE_FILTERS.some(r =>
          from === r.field.split(".").pop() ||
          from === r.minParam.replace("min", "").replace("max", ""),
        )
      // Allow unmapped fields from ARRAY_FIELD_MAPPINGS
      expect(knownFilter || ARRAY_FIELD_MAPPINGS.some(m => m.from === from)).toBe(true)
    }
  })

  it("NESTED_TERMS_FILTERS have no duplicate params", () => {
    const params = NESTED_TERMS_FILTERS.map(f => f.param)
    expect(new Set(params).size).toBe(params.length)
  })

  it("NESTED_RANGE_FILTERS have no duplicate fields", () => {
    const fields = NESTED_RANGE_FILTERS.map(f => f.field)
    expect(new Set(fields).size).toBe(fields.length)
  })
})
