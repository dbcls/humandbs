/**
 * Tests for mergeSearchableFields and addMergedSearchable
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { addMergedSearchable, mergeSearchableFields } from "@/api/utils/merge-searchable"
import type { SearchableExperimentFields, VariantCounts } from "@/es/types"

// === Helpers ===

const emptySearchable: SearchableExperimentFields = {
  subjectCount: null,
  subjectCountType: null,
  healthStatus: null,
  diseases: [],
  tissues: [],
  isTumor: null,
  cellLine: [],
  population: [],
  sex: null,
  ageGroup: null,
  assayType: [],
  libraryKits: [],
  platforms: [],
  readType: null,
  readLength: null,
  sequencingDepth: null,
  targetCoverage: null,
  referenceGenome: [],
  variantCounts: null,
  hasPhenotypeData: null,
  targets: null,
  fileTypes: [],
  processedDataTypes: [],
  dataVolumeGb: null,
  policies: [],
}

const makeSearchable = (overrides: Partial<SearchableExperimentFields> = {}): SearchableExperimentFields => ({
  ...emptySearchable,
  ...overrides,
})

const arbNullableNum = fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null })

const arbSearchable: fc.Arbitrary<SearchableExperimentFields> = fc.record({
  subjectCount: arbNullableNum,
  subjectCountType: fc.constantFrom(null, "individual", "sample", "mixed" as const),
  healthStatus: fc.constantFrom(null, "healthy", "affected", "mixed" as const),
  diseases: fc.array(fc.record({ label: fc.string(), icd10: fc.option(fc.string(), { nil: null }) }), { maxLength: 3 }),
  tissues: fc.array(fc.string(), { maxLength: 3 }),
  isTumor: fc.constantFrom(null, "tumor" as const, "normal" as const, "mixed" as const),
  cellLine: fc.array(fc.string(), { maxLength: 2 }),
  population: fc.array(fc.string(), { maxLength: 2 }),
  sex: fc.constantFrom(null, "male" as const, "female" as const, "mixed" as const),
  ageGroup: fc.constantFrom(null, "infant" as const, "child" as const, "adult" as const, "elderly" as const, "mixed" as const),
  assayType: fc.array(fc.string(), { maxLength: 3 }),
  libraryKits: fc.array(fc.string(), { maxLength: 2 }),
  platforms: fc.array(fc.record({
    vendor: fc.option(fc.string(), { nil: null }),
    model: fc.option(fc.string(), { nil: null }),
  }), { maxLength: 2 }),
  readType: fc.constantFrom(null, "single-end" as const, "paired-end" as const, "mixed" as const),
  readLength: arbNullableNum,
  sequencingDepth: arbNullableNum,
  targetCoverage: arbNullableNum,
  referenceGenome: fc.array(fc.string(), { maxLength: 2 }),
  variantCounts: fc.option(fc.record({
    snv: arbNullableNum,
    indel: arbNullableNum,
    cnv: arbNullableNum,
    sv: arbNullableNum,
    total: arbNullableNum,
  }), { nil: null }),
  hasPhenotypeData: fc.option(fc.boolean(), { nil: null }),
  targets: fc.option(fc.string(), { nil: null }),
  fileTypes: fc.array(fc.string(), { maxLength: 3 }),
  processedDataTypes: fc.array(fc.string(), { maxLength: 2 }),
  dataVolumeGb: arbNullableNum,
  policies: fc.array(fc.record({
    id: fc.constantFrom(
      "nbdc-policy" as const, "company-limitation-policy" as const,
      "cancer-research-policy" as const, "familial-policy" as const,
      "custom-policy" as const,
    ),
    name: fc.record({ ja: fc.string(), en: fc.string() }),
    url: fc.option(fc.string(), { nil: null }),
  }), { maxLength: 2 }),
})

// === Tests ===

describe("mergeSearchableFields", () => {
  // --- Empty input ---
  it("returns defaults for empty array", () => {
    const result = mergeSearchableFields([])

    expect(result.subjectCount).toBeNull()
    expect(result.tissues).toEqual([])
    expect(result.diseases).toEqual([])
    expect(result.platforms).toEqual([])
    expect(result.variantCounts).toBeNull()
    expect(result.hasPhenotypeData).toBeNull()
    expect(result.dataVolumeGb).toBeNull()
    expect(result.readLength).toBeNull()
    expect(result.policies).toEqual([])
  })

  // --- sumNullable (via subjectCount, dataVolumeGb) ---
  describe("sumNullable behavior", () => {
    it("[null] -> null", () => {
      const result = mergeSearchableFields([makeSearchable({ subjectCount: null })])
      expect(result.subjectCount).toBeNull()
    })

    it("[null, null] -> null", () => {
      const result = mergeSearchableFields([
        makeSearchable({ subjectCount: null }),
        makeSearchable({ subjectCount: null }),
      ])
      expect(result.subjectCount).toBeNull()
    })

    it("[1, 2, 3] -> 6", () => {
      const result = mergeSearchableFields([
        makeSearchable({ subjectCount: 1 }),
        makeSearchable({ subjectCount: 2 }),
        makeSearchable({ subjectCount: 3 }),
      ])
      expect(result.subjectCount).toBe(6)
    })

    it("[null, 5, null] -> 5", () => {
      const result = mergeSearchableFields([
        makeSearchable({ subjectCount: null }),
        makeSearchable({ subjectCount: 5 }),
        makeSearchable({ subjectCount: null }),
      ])
      expect(result.subjectCount).toBe(5)
    })

    it("PBT: sum >= each element", () => {
      fc.assert(
        fc.property(
          fc.array(arbNullableNum, { minLength: 1, maxLength: 5 }),
          (values) => {
            const searchables = values.map(v => makeSearchable({ subjectCount: v }))
            const result = mergeSearchableFields(searchables)
            const nonNull = values.filter((v): v is number => v !== null)
            if (nonNull.length === 0) {
              return result.subjectCount === null
            }
            return nonNull.every(v => result.subjectCount! >= v)
          },
        ),
      )
    })
  })

  // --- maxNullable (via readLength, sequencingDepth, targetCoverage) ---
  describe("maxNullable behavior", () => {
    it("[null] -> null", () => {
      const result = mergeSearchableFields([makeSearchable({ readLength: null })])
      expect(result.readLength).toBeNull()
    })

    it("[3, 1, 2] -> 3", () => {
      const result = mergeSearchableFields([
        makeSearchable({ readLength: 3 }),
        makeSearchable({ readLength: 1 }),
        makeSearchable({ readLength: 2 }),
      ])
      expect(result.readLength).toBe(3)
    })

    it("[null, 7] -> 7", () => {
      const result = mergeSearchableFields([
        makeSearchable({ readLength: null }),
        makeSearchable({ readLength: 7 }),
      ])
      expect(result.readLength).toBe(7)
    })

    it("PBT: result >= all elements", () => {
      fc.assert(
        fc.property(
          fc.array(arbNullableNum, { minLength: 1, maxLength: 5 }),
          (values) => {
            const searchables = values.map(v => makeSearchable({ readLength: v }))
            const result = mergeSearchableFields(searchables)
            const nonNull = values.filter((v): v is number => v !== null)
            if (nonNull.length === 0) {
              return result.readLength === null
            }
            return nonNull.every(v => result.readLength! >= v)
          },
        ),
      )
    })
  })

  // --- orNullable (via hasPhenotypeData) ---
  describe("orNullable behavior", () => {
    it("[null] -> null", () => {
      const result = mergeSearchableFields([makeSearchable({ hasPhenotypeData: null })])
      expect(result.hasPhenotypeData).toBeNull()
    })

    it("[false] -> false", () => {
      const result = mergeSearchableFields([makeSearchable({ hasPhenotypeData: false })])
      expect(result.hasPhenotypeData).toBe(false)
    })

    it("[false, true] -> true", () => {
      const result = mergeSearchableFields([
        makeSearchable({ hasPhenotypeData: false }),
        makeSearchable({ hasPhenotypeData: true }),
      ])
      expect(result.hasPhenotypeData).toBe(true)
    })

    it("[null, false] -> false", () => {
      const result = mergeSearchableFields([
        makeSearchable({ hasPhenotypeData: null }),
        makeSearchable({ hasPhenotypeData: false }),
      ])
      expect(result.hasPhenotypeData).toBe(false)
    })

    it("PBT: if any true then result is true", () => {
      fc.assert(
        fc.property(
          fc.array(fc.option(fc.boolean(), { nil: null }), { minLength: 1, maxLength: 5 }),
          (values) => {
            const searchables = values.map(v => makeSearchable({ hasPhenotypeData: v }))
            const result = mergeSearchableFields(searchables)
            const hasTrue = values.some(v => v === true)
            if (hasTrue) return result.hasPhenotypeData === true
            return true
          },
        ),
      )
    })
  })

  // --- uniqueStrings (via tissues, assayType) ---
  describe("uniqueStrings behavior", () => {
    it("deduplicates strings", () => {
      const result = mergeSearchableFields([
        makeSearchable({ tissues: ["Blood", "Liver"] }),
        makeSearchable({ tissues: ["Blood", "Brain"] }),
      ])
      expect(result.tissues).toEqual(["Blood", "Liver", "Brain"])
    })

    it("preserves empty arrays", () => {
      const result = mergeSearchableFields([makeSearchable({ tissues: [] })])
      expect(result.tissues).toEqual([])
    })
  })

  // --- uniqueObjects (via diseases, platforms, policies) ---
  describe("uniqueObjects behavior", () => {
    it("deduplicates identical objects", () => {
      const disease = { label: "Cancer", icd10: "C00" }
      const result = mergeSearchableFields([
        makeSearchable({ diseases: [disease] }),
        makeSearchable({ diseases: [disease] }),
      ])
      expect(result.diseases).toEqual([disease])
    })

    it("objects with different key order are NOT deduplicated (JSON.stringify limitation)", () => {
      const d1 = { label: "Cancer", icd10: "C00" }
      const d2 = JSON.parse("{\"icd10\":\"C00\",\"label\":\"Cancer\"}") as typeof d1
      const result = mergeSearchableFields([
        makeSearchable({ diseases: [d1] }),
        makeSearchable({ diseases: [d2] }),
      ])
      // JSON.stringify produces different strings for different key orders
      expect(result.diseases.length).toBe(2)
    })
  })

  // --- sumVariantCounts ---
  describe("sumVariantCounts behavior", () => {
    it("all null -> null", () => {
      const result = mergeSearchableFields([
        makeSearchable({ variantCounts: null }),
        makeSearchable({ variantCounts: null }),
      ])
      expect(result.variantCounts).toBeNull()
    })

    it("partial null -> sums non-null fields", () => {
      const vc1: VariantCounts = { snv: 10, indel: null, cnv: 5, sv: null, total: 15 }
      const vc2: VariantCounts = { snv: 20, indel: 3, cnv: null, sv: null, total: 23 }
      const result = mergeSearchableFields([
        makeSearchable({ variantCounts: vc1 }),
        makeSearchable({ variantCounts: vc2 }),
      ])
      expect(result.variantCounts).toEqual({
        snv: 30,
        indel: 3,
        cnv: 5,
        sv: null,
        total: 38,
      })
    })

    it("PBT: result fields sum correctly", () => {
      const arbVc = fc.record({
        snv: arbNullableNum,
        indel: arbNullableNum,
        cnv: arbNullableNum,
        sv: arbNullableNum,
        total: arbNullableNum,
      })

      fc.assert(
        fc.property(
          fc.array(arbVc, { minLength: 1, maxLength: 3 }),
          (vcs) => {
            const searchables = vcs.map(vc => makeSearchable({ variantCounts: vc }))
            const result = mergeSearchableFields(searchables)

            for (const field of ["snv", "indel", "cnv", "sv", "total"] as const) {
              const values = vcs.map(vc => vc[field])
              const nonNull = values.filter((v): v is number => v !== null)
              const expected = nonNull.length === 0 ? null : nonNull.reduce((a, b) => a + b, 0)
              if (result.variantCounts![field] !== expected) return false
            }
            return true
          },
        ),
      )
    })
  })

  // --- PBT: commutativity ---
  it("PBT: sum/max/or fields are commutative", () => {
    fc.assert(
      fc.property(
        arbSearchable,
        arbSearchable,
        (a, b) => {
          const ab = mergeSearchableFields([a, b])
          const ba = mergeSearchableFields([b, a])

          return (
            ab.subjectCount === ba.subjectCount &&
            ab.dataVolumeGb === ba.dataVolumeGb &&
            ab.readLength === ba.readLength &&
            ab.sequencingDepth === ba.sequencingDepth &&
            ab.targetCoverage === ba.targetCoverage &&
            ab.hasPhenotypeData === ba.hasPhenotypeData
          )
        },
      ),
    )
  })

  // --- PBT: identity element ---
  it("PBT: merge([empty, x]) sum fields == merge([x])", () => {
    fc.assert(
      fc.property(
        arbSearchable,
        (x) => {
          const withEmpty = mergeSearchableFields([emptySearchable, x])
          const alone = mergeSearchableFields([x])

          return (
            withEmpty.subjectCount === alone.subjectCount &&
            withEmpty.dataVolumeGb === alone.dataVolumeGb
          )
        },
      ),
    )
  })

  // --- PBT: idempotency for uniqueStrings ---
  it("PBT: merge([a]) uniqueStrings fields == merge([a, a])", () => {
    fc.assert(
      fc.property(
        arbSearchable,
        (a) => {
          const once = mergeSearchableFields([a])
          const twice = mergeSearchableFields([a, a])

          // uniqueStrings fields should be identical after dedup
          return (
            JSON.stringify(once.tissues.sort()) === JSON.stringify(twice.tissues.sort()) &&
            JSON.stringify(once.assayType.sort()) === JSON.stringify(twice.assayType.sort()) &&
            JSON.stringify(once.fileTypes.sort()) === JSON.stringify(twice.fileTypes.sort())
          )
        },
      ),
    )
  })
})

describe("addMergedSearchable", () => {
  it("experiments: undefined -> empty merge result", () => {
    const dataset = { experiments: undefined }
    const result = addMergedSearchable(dataset)

    expect(result.mergedSearchable.subjectCount).toBeNull()
    expect(result.mergedSearchable.tissues).toEqual([])
  })

  it("experiments: [] -> empty merge result", () => {
    const dataset = { experiments: [] }
    const result = addMergedSearchable(dataset)

    expect(result.mergedSearchable.subjectCount).toBeNull()
  })

  it("experiments with missing searchable -> skipped", () => {
    const dataset = {
      experiments: [
        { searchable: makeSearchable({ subjectCount: 10 }) },
        { other: "field" },
        { searchable: makeSearchable({ subjectCount: 5 }) },
      ],
    }
    const result = addMergedSearchable(dataset)

    expect(result.mergedSearchable.subjectCount).toBe(15)
  })

  it("preserves original dataset fields", () => {
    const dataset = { id: "test", name: "Test Dataset", experiments: [] }
    const result = addMergedSearchable(dataset)

    expect(result.id).toBe("test")
    expect(result.name).toBe("Test Dataset")
    expect(result.mergedSearchable).toBeDefined()
  })
})
