/**
 * Tests for buildDatasetFilterClauses and helper functions
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  buildDatasetFilterClauses,
  buildNestedRangeFilters,
  buildNestedTermsFilters,
} from "@/api/es-client/search"

// === buildNestedTermsFilters ===

describe("buildNestedTermsFilters", () => {
  it("empty params -> []", () => {
    expect(buildNestedTermsFilters({})).toEqual([])
  })

  it("assayType: 'WGS' -> 1 nested terms query", () => {
    const result = buildNestedTermsFilters({ assayType: "WGS" })

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty("nested")
    expect(result[0].nested!.path).toBe("experiments")
    const terms = (result[0].nested!.query as Record<string, Record<string, string[]>>).terms
    expect(terms["experiments.searchable.assayType"]).toEqual(["WGS"])
  })

  it("assayType: 'WGS,WES', tissues: 'Blood' -> 2 queries", () => {
    const result = buildNestedTermsFilters({ assayType: "WGS,WES", tissues: "Blood" })

    expect(result).toHaveLength(2)
  })

  it("empty string value -> skipped", () => {
    const result = buildNestedTermsFilters({ assayType: "" })
    expect(result).toEqual([])
  })

  it("non-string value -> skipped", () => {
    const result = buildNestedTermsFilters({ assayType: 123 })
    expect(result).toEqual([])
  })
})

// === buildNestedRangeFilters ===

describe("buildNestedRangeFilters", () => {
  it("empty params -> []", () => {
    expect(buildNestedRangeFilters({})).toEqual([])
  })

  it("minSubjects: 10 -> nested range gte", () => {
    const result = buildNestedRangeFilters({ minSubjects: 10 })

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty("nested")
    const range = (result[0].nested!.query as Record<string, Record<string, Record<string, number>>>).range
    expect(range["experiments.searchable.subjectCount"]).toEqual({ gte: 10 })
  })

  it("minSubjects: 10, maxSubjects: 100 -> 2 queries", () => {
    const result = buildNestedRangeFilters({ minSubjects: 10, maxSubjects: 100 })

    expect(result).toHaveLength(2)
  })

  it("undefined value -> skipped", () => {
    const result = buildNestedRangeFilters({ minSubjects: undefined })
    expect(result).toEqual([])
  })

  it("null value -> skipped", () => {
    const result = buildNestedRangeFilters({ minSubjects: null })
    expect(result).toEqual([])
  })
})

// === buildDatasetFilterClauses ===

describe("buildDatasetFilterClauses", () => {
  // Minimal valid params (required by DatasetSearchQuery / ResearchSearchQuery)
  const baseParams = { page: 1, limit: 10, sort: "datasetId" as const, order: "asc" as const, lang: "ja" as const, q: "", includeFacets: false, includeRawHtml: false }

  it("empty params -> []", () => {
    const result = buildDatasetFilterClauses(baseParams)
    expect(result).toEqual([])
  })

  it("humId filter -> term.humId", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, humId: "hum0001" })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ term: { humId: "hum0001" } })
  })

  it("criteria filter -> terms.criteria", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, criteria: "Controlled-access (Type I)" })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ terms: { criteria: ["Controlled-access (Type I)"] } })
  })

  it("typeOfData -> wildcard (ja + en)", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, typeOfData: "NGS" })

    expect(result).toHaveLength(1)
    const bool = result[0].bool!
    expect(bool.should).toHaveLength(2)
    expect(bool.minimum_should_match).toBe(1)
  })

  it("releaseDate range -> range.releaseDate", () => {
    const result = buildDatasetFilterClauses({
      ...baseParams,
      minReleaseDate: "2024-01-01",
      maxReleaseDate: "2024-12-31",
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ range: { releaseDate: { gte: "2024-01-01" } } })
    expect(result[1]).toEqual({ range: { releaseDate: { lte: "2024-12-31" } } })
  })

  it("platform 'Illumina||NovaSeq' -> double-nested vendor+model", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, platform: "Illumina||NovaSeq" })

    expect(result).toHaveLength(1)
    const platformClause = result[0]
    expect(platformClause).toHaveProperty("bool")

    const should = platformClause.bool!.should as Record<string, unknown>[]
    expect(should).toHaveLength(1)

    // Verify it has vendor + model must clause
    const nested = should[0] as Record<string, Record<string, Record<string, unknown>>>
    const innerQuery = nested.nested.query as Record<string, Record<string, Record<string, Record<string, unknown>>>>
    const mustArr = innerQuery.nested.query.bool.must as Record<string, unknown>[]
    expect(mustArr).toHaveLength(2)
  })

  it("platform 'Illumina' (single) -> should [vendor OR model]", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, platform: "Illumina" })

    expect(result).toHaveLength(1)
    const platformClause = result[0]
    const should = platformClause.bool!.should as Record<string, unknown>[]
    expect(should).toHaveLength(1)

    const nested = should[0] as Record<string, Record<string, Record<string, unknown>>>
    const innerQuery = nested.nested.query as Record<string, Record<string, Record<string, Record<string, unknown>>>>
    const innerShould = innerQuery.nested.query.bool.should as Record<string, unknown>[]
    expect(innerShould).toHaveLength(2)
  })

  it("isTumor -> nestedTermQuery", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, isTumor: "tumor" })

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty("nested")
    expect(result[0].nested!.path).toBe("experiments")
  })

  it("hasPhenotypeData -> nestedBooleanTermQuery", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, hasPhenotypeData: true })

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty("nested")
  })

  it("disease -> doubleNestedWildcardQuery", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, disease: "Cancer" })

    expect(result).toHaveLength(1)
    const outer = result[0].nested!
    expect(outer.path).toBe("experiments")
  })

  it("diseaseIcd10 -> prefix + double nested", () => {
    const result = buildDatasetFilterClauses({ ...baseParams, diseaseIcd10: "C00" })

    expect(result).toHaveLength(1)
    const bool = result[0].bool!
    expect(bool.should).toHaveLength(1)
    expect(bool.minimum_should_match).toBe(1)
  })

  it("multiple filters -> all in must array", () => {
    const result = buildDatasetFilterClauses({
      ...baseParams,
      humId: "hum0001",
      criteria: "Type I",
      assayType: "WGS",
      disease: "Cancer",
    })

    // humId(1) + criteria(1) + assayType(1) + disease(1)
    expect(result).toHaveLength(4)
  })

  it("PBT: no filter params -> always empty", () => {
    fc.assert(
      fc.property(
        fc.record({
          page: fc.integer({ min: 1, max: 10 }),
          limit: fc.integer({ min: 1, max: 100 }),
          sort: fc.constantFrom("datasetId" as const),
          order: fc.constantFrom("asc" as const, "desc" as const),
          lang: fc.constantFrom("ja" as const, "en" as const),
          q: fc.constant(""),
          includeFacets: fc.boolean(),
          includeRawHtml: fc.boolean(),
        }),
        (params) => {
          const result = buildDatasetFilterClauses(params)
          return result.length === 0
        },
      ),
    )
  })
})
