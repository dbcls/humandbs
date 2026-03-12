/**
 * Tests for Elasticsearch query helper functions
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  doubleNestedTermsQuery,
  doubleNestedWildcardQuery,
  nestedBooleanTermQuery,
  nestedRangeQuery,
  nestedTermQuery,
  nestedTermsQuery,
} from "@/api/es-client/query-helpers"

// === nestedTermsQuery ===

describe("nestedTermsQuery", () => {
  it("builds nested terms structure", () => {
    const result = nestedTermsQuery("experiments", "experiments.searchable.assayType", ["WGS", "WES"])

    expect(result).toEqual({
      nested: {
        path: "experiments",
        query: { terms: { "experiments.searchable.assayType": ["WGS", "WES"] } },
      },
    })
  })

  it("handles empty values array", () => {
    const result = nestedTermsQuery("experiments", "field", [])

    expect(result.nested!.query).toEqual({ terms: { field: [] } })
  })
})

// === nestedRangeQuery ===

describe("nestedRangeQuery", () => {
  it("builds range with gte", () => {
    const result = nestedRangeQuery("experiments", "experiments.searchable.subjectCount", { gte: 10 })

    expect(result).toEqual({
      nested: {
        path: "experiments",
        query: { range: { "experiments.searchable.subjectCount": { gte: 10 } } },
      },
    })
  })

  it("builds range with gte and lte", () => {
    const result = nestedRangeQuery("experiments", "field", { gte: 5, lte: 100 })

    expect(result.nested!.query).toEqual({ range: { field: { gte: 5, lte: 100 } } })
  })
})

// === doubleNestedWildcardQuery ===

describe("doubleNestedWildcardQuery", () => {
  it("wraps value with * and sets case_insensitive", () => {
    const result = doubleNestedWildcardQuery(
      "experiments",
      "experiments.searchable.diseases",
      "experiments.searchable.diseases.label",
      "cancer",
    )

    expect(result).toEqual({
      nested: {
        path: "experiments",
        query: {
          nested: {
            path: "experiments.searchable.diseases",
            query: {
              wildcard: {
                "experiments.searchable.diseases.label": {
                  value: "*cancer*",
                  case_insensitive: true,
                },
              },
            },
          },
        },
      },
    })
  })
})

// === doubleNestedTermsQuery ===

describe("doubleNestedTermsQuery", () => {
  it("builds double-nested terms structure", () => {
    const result = doubleNestedTermsQuery(
      "experiments",
      "experiments.searchable.policies",
      "experiments.searchable.policies.id",
      ["nbdc-policy"],
    )

    expect(result).toEqual({
      nested: {
        path: "experiments",
        query: {
          nested: {
            path: "experiments.searchable.policies",
            query: { terms: { "experiments.searchable.policies.id": ["nbdc-policy"] } },
          },
        },
      },
    })
  })
})

// === nestedTermQuery ===

describe("nestedTermQuery", () => {
  it("builds nested term for single value", () => {
    const result = nestedTermQuery("experiments", "experiments.searchable.isTumor", "tumor")

    expect(result).toEqual({
      nested: {
        path: "experiments",
        query: { term: { "experiments.searchable.isTumor": "tumor" } },
      },
    })
  })
})

// === nestedBooleanTermQuery ===

describe("nestedBooleanTermQuery", () => {
  it("builds nested term for boolean value", () => {
    const result = nestedBooleanTermQuery("experiments", "experiments.searchable.hasPhenotypeData", true)

    expect(result).toEqual({
      nested: {
        path: "experiments",
        query: { term: { "experiments.searchable.hasPhenotypeData": true } },
      },
    })
  })

  it("handles false value", () => {
    const result = nestedBooleanTermQuery("experiments", "field", false)
    expect(result.nested!.query).toEqual({ term: { field: false } })
  })
})

// === PBT ===

describe("PBT: path consistency", () => {
  const arbPath = fc.stringMatching(/^[a-z][a-z.]*$/)

  it("nestedTermsQuery: path matches result.nested.path", () => {
    fc.assert(
      fc.property(
        arbPath,
        fc.string(),
        fc.array(fc.string(), { maxLength: 3 }),
        (path, field, values) => {
          const result = nestedTermsQuery(path, field, values)
          return result.nested!.path === path
        },
      ),
    )
  })

  it("nestedTermsQuery: values appear in result", () => {
    fc.assert(
      fc.property(
        arbPath,
        fc.string(),
        fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
        (path, field, values) => {
          const result = nestedTermsQuery(path, field, values)
          const terms = (result.nested!.query as Record<string, Record<string, string[]>>).terms[field]
          return JSON.stringify(terms) === JSON.stringify(values)
        },
      ),
    )
  })

  it("nestedRangeQuery: path matches result.nested.path", () => {
    fc.assert(
      fc.property(
        arbPath,
        fc.string(),
        (path, field) => {
          const result = nestedRangeQuery(path, field, { gte: 0 })
          return result.nested!.path === path
        },
      ),
    )
  })

  it("doubleNestedWildcardQuery: outerPath matches result.nested.path", () => {
    fc.assert(
      fc.property(
        arbPath,
        arbPath,
        fc.string(),
        fc.string(),
        (outerPath, innerPath, field, value) => {
          const result = doubleNestedWildcardQuery(outerPath, innerPath, field, value)
          return result.nested!.path === outerPath
        },
      ),
    )
  })

  it("all nested functions: path is preserved", () => {
    fc.assert(
      fc.property(
        arbPath,
        fc.string(),
        (path, field) => {
          const r1 = nestedTermsQuery(path, field, ["a"])
          const r2 = nestedRangeQuery(path, field, { gte: 0 })
          const r3 = nestedTermQuery(path, field, "a")
          const r4 = nestedBooleanTermQuery(path, field, true)
          return (
            r1.nested!.path === path &&
            r2.nested!.path === path &&
            r3.nested!.path === path &&
            r4.nested!.path === path
          )
        },
      ),
    )
  })
})
