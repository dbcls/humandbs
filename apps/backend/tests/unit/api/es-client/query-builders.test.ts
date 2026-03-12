/**
 * Tests for query builder pure functions
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  buildDatasetMultiMatchQuery,
  buildDatasetSortSpec,
  buildResearchDateRangeFilters,
  buildResearchMultiMatchQuery,
  buildResearchSortSpec,
  versionSortSpec,
} from "@/api/es-client/query-builders"

// === versionSortSpec ===

describe("versionSortSpec", () => {
  it("returns a _script sort with numeric type for desc", () => {
    const result = versionSortSpec("desc")

    expect(result).toEqual({
      _script: {
        type: "number",
        script: { source: "Integer.parseInt(doc['version'].value.substring(1))" },
        order: "desc",
      },
    })
  })

  it("returns a _script sort with numeric type for asc", () => {
    const result = versionSortSpec("asc")

    expect(result).toEqual({
      _script: {
        type: "number",
        script: { source: "Integer.parseInt(doc['version'].value.substring(1))" },
        order: "asc",
      },
    })
  })
})

// === buildDatasetSortSpec ===

describe("buildDatasetSortSpec", () => {
  it("returns _score + datasetId tiebreaker for relevance with query", () => {
    const result = buildDatasetSortSpec("relevance", "asc", true)

    expect(result).toEqual([
      { _score: { order: "desc" } },
      { datasetId: { order: "asc" } },
    ])
  })

  it("falls back to datasetId for relevance without query", () => {
    const result = buildDatasetSortSpec("relevance", "desc", false)

    expect(result).toEqual([{ datasetId: { order: "desc" } }])
  })

  it("sorts by releaseDate with missing _last and datasetId tiebreaker", () => {
    const result = buildDatasetSortSpec("releaseDate", "asc", false)

    expect(result).toEqual([
      { releaseDate: { order: "asc", missing: "_last" } },
      { datasetId: { order: "asc" } },
    ])
  })

  it("sorts by releaseDate desc", () => {
    const result = buildDatasetSortSpec("releaseDate", "desc", true)

    expect(result).toEqual([
      { releaseDate: { order: "desc", missing: "_last" } },
      { datasetId: { order: "asc" } },
    ])
  })

  it("sorts by datasetId with specified order", () => {
    const result = buildDatasetSortSpec("datasetId", "desc", false)

    expect(result).toEqual([{ datasetId: { order: "desc" } }])
  })

  // PBT: result is always a non-empty array
  it("always returns a non-empty array", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("datasetId" as const, "releaseDate" as const, "relevance" as const),
        fc.constantFrom("asc" as const, "desc" as const),
        fc.boolean(),
        (sort, order, hasQuery) => {
          const result = buildDatasetSortSpec(sort, order, hasQuery)

          return Array.isArray(result) && result.length > 0
        },
      ),
    )
  })

  // PBT: _score never appears when hasQuery=false
  it("never contains _score when hasQuery is false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("datasetId" as const, "releaseDate" as const, "relevance" as const),
        fc.constantFrom("asc" as const, "desc" as const),
        (sort, order) => {
          const result = buildDatasetSortSpec(sort, order, false)
          const json = JSON.stringify(result)

          return !json.includes("_score")
        },
      ),
    )
  })
})

// === buildResearchSortSpec ===

describe("buildResearchSortSpec", () => {
  it("returns _score + humId tiebreaker for relevance with query", () => {
    const result = buildResearchSortSpec("relevance", "asc", "ja", true)

    expect(result).toEqual([
      { _score: { order: "desc" } },
      { humId: { order: "asc" } },
    ])
  })

  it("falls back to humId for relevance without query", () => {
    const result = buildResearchSortSpec("relevance", "desc", "ja", false)

    expect(result).toEqual([{ humId: { order: "desc" } }])
  })

  it("sorts by title.ja.kw for lang=ja", () => {
    const result = buildResearchSortSpec("title", "asc", "ja", false)

    expect(result).toEqual([
      { "title.ja.kw": { order: "asc" } },
      { humId: { order: "asc" } },
    ])
  })

  it("sorts by title.en.kw for lang=en", () => {
    const result = buildResearchSortSpec("title", "desc", "en", false)

    expect(result).toEqual([
      { "title.en.kw": { order: "desc" } },
      { humId: { order: "asc" } },
    ])
  })

  it("maps releaseDate to dateModified", () => {
    const result = buildResearchSortSpec("releaseDate", "asc", "ja", false)

    expect(result).toEqual([
      { dateModified: { order: "asc", missing: "_last" } },
      { humId: { order: "asc" } },
    ])
  })

  it("maps dateModified to dateModified", () => {
    const result = buildResearchSortSpec("dateModified", "desc", "ja", false)

    expect(result).toEqual([
      { dateModified: { order: "desc", missing: "_last" } },
      { humId: { order: "asc" } },
    ])
  })

  it("sorts by datePublished with missing _last", () => {
    const result = buildResearchSortSpec("datePublished", "asc", "ja", false)

    expect(result).toEqual([
      { datePublished: { order: "asc", missing: "_last" } },
      { humId: { order: "asc" } },
    ])
  })

  it("sorts by humId as default fallback", () => {
    const result = buildResearchSortSpec("humId", "desc", "ja", false)

    expect(result).toEqual([{ humId: { order: "desc" } }])
  })

  // PBT: result is always a non-empty array
  it("always returns a non-empty array", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "humId" as const, "title" as const, "releaseDate" as const,
          "datePublished" as const, "dateModified" as const, "relevance" as const,
        ),
        fc.constantFrom("asc" as const, "desc" as const),
        fc.constantFrom("ja" as const, "en" as const),
        fc.boolean(),
        (sort, order, lang, hasQuery) => {
          const result = buildResearchSortSpec(sort, order, lang, hasQuery)

          return Array.isArray(result) && result.length > 0
        },
      ),
    )
  })

  // PBT: _score never appears when hasQuery=false
  it("never contains _score when hasQuery is false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "humId" as const, "title" as const, "releaseDate" as const,
          "datePublished" as const, "dateModified" as const, "relevance" as const,
        ),
        fc.constantFrom("asc" as const, "desc" as const),
        fc.constantFrom("ja" as const, "en" as const),
        (sort, order, lang) => {
          const result = buildResearchSortSpec(sort, order, lang, false)
          const json = JSON.stringify(result)

          return !json.includes("_score")
        },
      ),
    )
  })
})

// === buildDatasetMultiMatchQuery ===

describe("buildDatasetMultiMatchQuery", () => {
  it("returns multi_match with correct fields", () => {
    const result = buildDatasetMultiMatchQuery("cancer")

    expect(result).toEqual({
      multi_match: {
        query: "cancer",
        fields: [
          "typeOfData.ja^2",
          "typeOfData.en^2",
          "experiments.searchable.targets",
        ],
        type: "best_fields",
        fuzziness: "AUTO",
      },
    })
  })

  // PBT: query string is always preserved
  it("preserves the query string in output", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (q) => {
          const result = buildDatasetMultiMatchQuery(q)

          return result.multi_match?.query === q
        },
      ),
    )
  })
})

// === buildResearchMultiMatchQuery ===

describe("buildResearchMultiMatchQuery", () => {
  it("returns multi_match with correct fields", () => {
    const result = buildResearchMultiMatchQuery("genomics")

    expect(result).toEqual({
      multi_match: {
        query: "genomics",
        fields: [
          "title.ja^2",
          "title.en^2",
          "summary.aims.ja.text",
          "summary.aims.en.text",
          "summary.methods.ja.text",
          "summary.methods.en.text",
          "summary.targets.ja.text",
          "summary.targets.en.text",
        ],
        type: "best_fields",
        fuzziness: "AUTO",
      },
    })
  })

  // PBT: query string is always preserved
  it("preserves the query string in output", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (q) => {
          const result = buildResearchMultiMatchQuery(q)

          return result.multi_match?.query === q
        },
      ),
    )
  })
})

// === buildResearchDateRangeFilters ===

describe("buildResearchDateRangeFilters", () => {
  it("returns empty array when no params", () => {
    const result = buildResearchDateRangeFilters({})

    expect(result).toEqual([])
  })

  it("returns single filter for minDatePublished only", () => {
    const result = buildResearchDateRangeFilters({ minDatePublished: "2024-01-01" })

    expect(result).toEqual([
      { range: { datePublished: { gte: "2024-01-01" } } },
    ])
  })

  it("returns two filters for datePublished range", () => {
    const result = buildResearchDateRangeFilters({
      minDatePublished: "2024-01-01",
      maxDatePublished: "2024-12-31",
    })

    expect(result).toEqual([
      { range: { datePublished: { gte: "2024-01-01" } } },
      { range: { datePublished: { lte: "2024-12-31" } } },
    ])
  })

  it("returns four filters when all params provided", () => {
    const result = buildResearchDateRangeFilters({
      minDatePublished: "2024-01-01",
      maxDatePublished: "2024-12-31",
      minDateModified: "2024-06-01",
      maxDateModified: "2024-06-30",
    })

    expect(result).toHaveLength(4)
    expect(result).toEqual([
      { range: { datePublished: { gte: "2024-01-01" } } },
      { range: { datePublished: { lte: "2024-12-31" } } },
      { range: { dateModified: { gte: "2024-06-01" } } },
      { range: { dateModified: { lte: "2024-06-30" } } },
    ])
  })

  it("handles dateModified only", () => {
    const result = buildResearchDateRangeFilters({
      minDateModified: "2024-06-01",
      maxDateModified: "2024-06-30",
    })

    expect(result).toEqual([
      { range: { dateModified: { gte: "2024-06-01" } } },
      { range: { dateModified: { lte: "2024-06-30" } } },
    ])
  })

  // PBT: result length equals number of non-undefined params
  it("result length equals number of defined params", () => {
    const optionalDate = fc.option(fc.date().map(d => d.toISOString().slice(0, 10)), { nil: undefined })

    fc.assert(
      fc.property(
        optionalDate, optionalDate, optionalDate, optionalDate,
        (minPub, maxPub, minMod, maxMod) => {
          const params = {
            minDatePublished: minPub,
            maxDatePublished: maxPub,
            minDateModified: minMod,
            maxDateModified: maxMod,
          }
          const result = buildResearchDateRangeFilters(params)
          const definedCount = [minPub, maxPub, minMod, maxMod].filter(v => v !== undefined).length

          return result.length === definedCount
        },
      ),
    )
  })
})

// === PBT additions ===

describe("buildDatasetSortSpec (PBT additions)", () => {
  it("PBT: relevance + hasQuery=true -> first element has _score", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("asc" as const, "desc" as const),
        (order) => {
          const result = buildDatasetSortSpec("relevance", order, true)
          const arr = result as unknown as Record<string, unknown>[]
          return "_score" in arr[0]
        },
      ),
    )
  })
})

describe("buildResearchSortSpec (PBT additions)", () => {
  it("PBT: all sort kinds have humId tiebreaker as last element", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "humId" as const, "title" as const, "releaseDate" as const,
          "datePublished" as const, "dateModified" as const, "relevance" as const,
        ),
        fc.constantFrom("asc" as const, "desc" as const),
        fc.constantFrom("ja" as const, "en" as const),
        fc.boolean(),
        (sort, order, lang, hasQuery) => {
          const result = buildResearchSortSpec(sort, order, lang, hasQuery)
          const arr = result as unknown as Record<string, unknown>[]
          const last = arr[arr.length - 1]
          return "humId" in last || "_score" in last
        },
      ),
    )
  })
})

describe("versionSortSpec (PBT additions)", () => {
  it("PBT: order is reflected in result", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("asc" as const, "desc" as const),
        (order) => {
          const result = versionSortSpec(order) as Record<string, Record<string, unknown>>
          return result._script.order === order
        },
      ),
    )
  })
})
