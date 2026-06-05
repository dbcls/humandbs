/**
 * Tests for query builder pure functions
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { classifyIdToken } from "@/api/es-client/id-patterns"
import {
  buildDatasetQueryClauses,
  buildDatasetSortSpec,
  buildResearchDateRangeFilters,
  buildResearchQueryClauses,
  buildResearchSortSpec,
  classifyFreeTextQuery,
  hasFreeTextQuery,
  resolveDatasetSort,
  resolveResearchSort,
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

// === resolveResearchSort / resolveDatasetSort ===

describe("resolveResearchSort", () => {
  it("returns the explicit sort when provided", () => {
    expect(resolveResearchSort("title", true)).toBe("title")
    expect(resolveResearchSort("releaseDate", false)).toBe("releaseDate")
    expect(resolveResearchSort("relevance", false)).toBe("relevance")
  })

  it("falls back to 'relevance' when sort is undefined and a query is present", () => {
    expect(resolveResearchSort(undefined, true)).toBe("relevance")
  })

  it("falls back to 'humId' when both sort and query are missing", () => {
    expect(resolveResearchSort(undefined, false)).toBe("humId")
  })

  it("PBT: an explicit sort is preserved regardless of hasQuery", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("humId" as const, "title" as const, "releaseDate" as const, "datePublished" as const, "dateModified" as const, "relevance" as const),
        fc.boolean(),
        (sort, hasQuery) => resolveResearchSort(sort, hasQuery) === sort,
      ),
      { numRuns: 50 },
    )
  })
})

describe("resolveDatasetSort", () => {
  it("returns the explicit sort when provided", () => {
    expect(resolveDatasetSort("datasetId", true)).toBe("datasetId")
    expect(resolveDatasetSort("releaseDate", false)).toBe("releaseDate")
    expect(resolveDatasetSort("relevance", false)).toBe("relevance")
  })

  it("falls back to 'relevance' when sort is undefined and a query is present", () => {
    expect(resolveDatasetSort(undefined, true)).toBe("relevance")
  })

  it("falls back to 'datasetId' when both sort and query are missing", () => {
    expect(resolveDatasetSort(undefined, false)).toBe("datasetId")
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

  it("sorts by versionReleaseDate with missing _last and datasetId tiebreaker", () => {
    const result = buildDatasetSortSpec("versionReleaseDate", "asc", false)

    expect(result).toEqual([
      { versionReleaseDate: { order: "asc", missing: "_last" } },
      { datasetId: { order: "asc" } },
    ])
  })

  it("sorts by versionReleaseDate desc", () => {
    const result = buildDatasetSortSpec("versionReleaseDate", "desc", true)

    expect(result).toEqual([
      { versionReleaseDate: { order: "desc", missing: "_last" } },
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
        fc.constantFrom("datasetId" as const, "releaseDate" as const, "versionReleaseDate" as const, "relevance" as const),
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
        fc.constantFrom("datasetId" as const, "releaseDate" as const, "versionReleaseDate" as const, "relevance" as const),
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

// === Free-text query parsing & clause building ===

const dump = (v: unknown): string => JSON.stringify(v)

interface IdFieldClause {
  bool: {
    should: {
      term?: Record<string, { boost: number }>
      prefix?: Record<string, { boost: number }>
    }[]
  }
}

describe("classifyIdToken", () => {
  it("classifies research humId tokens", () => {
    expect(classifyIdToken("hum0001")).toBe("humId")
    expect(classifyIdToken("HUM0001")).toBe("humId")
    expect(classifyIdToken("hum000")).toBe("humId")
  })

  it("classifies every datasetId namespace observed in the corpus", () => {
    const datasetIds = [
      "JGAD000001",
      "DRA000908",
      "E-GEAD-1051",
      "MTBKS213",
      "PRJDB10452",
      "hum0013.v1.freq.v1",
      "hum0009v1.CpG.v1",
    ]
    for (const id of datasetIds) expect(classifyIdToken(id)).toBe("datasetId")
  })

  it("does NOT classify gene / assembly names as IDs (they stay text)", () => {
    for (const t of ["BRCA1", "HIF-1", "TP53", "GRCh38", "cancer", "RNA-seq", "p53"]) {
      expect(classifyIdToken(t)).toBeNull()
    }
  })

  it("keeps a bare humId and the dotted NBDC datasetId disjoint", () => {
    expect(classifyIdToken("hum0013")).toBe("humId")
    expect(classifyIdToken("hum0013.v1.freq.v1")).toBe("datasetId")
  })
})

describe("classifyFreeTextQuery", () => {
  it("routes a single humId to an ID token with no text part", () => {
    const p = classifyFreeTextQuery("hum0003")
    expect(p.idTokens).toEqual([{ field: "humId", value: "hum0003" }])
    expect(p.bareWords).toEqual([])
    expect(p.phraseTokens).toEqual([])
  })

  it("routes symbol-bearing datasetIds to ID tokens, not phrases (eval order)", () => {
    for (const id of ["E-GEAD-1051", "hum0013.v1.freq.v1", "JGAD000001"]) {
      const p = classifyFreeTextQuery(id)
      expect(p.idTokens).toEqual([{ field: "datasetId", value: id }])
      expect(p.phraseTokens).toEqual([])
    }
  })

  it("splits a mixed ID + word query into a filter and text", () => {
    const p = classifyFreeTextQuery("JGAD000001 RNA-seq")
    expect(p.idTokens).toEqual([{ field: "datasetId", value: "JGAD000001" }])
    expect(p.phraseTokens).toEqual(["RNA-seq"])
    expect(p.bareWords).toEqual([])
  })

  it("keeps bare multi-word as bareWords with the last eligible for prefix", () => {
    const p = classifyFreeTextQuery("lung cancer")
    expect(p.bareWords).toEqual(["lung", "cancer"])
    expect(p.idTokens).toEqual([])
    expect(p.lastIsBare).toBe(true)
  })

  it("treats a symbol-bearing non-ID word as a phrase token (gene name)", () => {
    const p = classifyFreeTextQuery("HIF-1")
    expect(p.phraseTokens).toEqual(["HIF-1"])
    expect(p.bareWords).toEqual([])
    expect(p.idTokens).toEqual([])
  })

  it("keeps a quoted run as one phrase token and disables the trailing prefix", () => {
    const p = classifyFreeTextQuery("cancer \"whole genome\"")
    expect(p.bareWords).toEqual(["cancer"])
    expect(p.phraseTokens).toEqual(["whole genome"])
    expect(p.lastIsBare).toBe(false)
  })

  it("yields an empty parse (no clauses) for blank input", () => {
    for (const q of ["", "   ", "\t"]) {
      expect(hasFreeTextQuery(classifyFreeTextQuery(q))).toBe(false)
    }
  })
})

describe("buildDatasetQueryClauses", () => {
  it("ID query uses term/prefix on the id field and never all_text", () => {
    const s = dump(buildDatasetQueryClauses(classifyFreeTextQuery("hum0003")))
    expect(s).toContain("\"humId\"")
    expect(s).toContain("hum0003")
    expect(s).not.toContain("all_text")
    expect(s).not.toContain("fuzziness")
  })

  it("ID clause keeps term boost above prefix boost", () => {
    const clauses = buildDatasetQueryClauses(classifyFreeTextQuery("JGAD000001")) as unknown as IdFieldClause[]
    const should = clauses[0].bool.should
    const term = should.find(c => c.term)?.term?.datasetId.boost ?? 0
    const prefix = should.find(c => c.prefix)?.prefix?.datasetId.boost ?? 0
    expect(term).toBeGreaterThan(prefix)
  })

  it("text query is AND over all_text with no fuzziness", () => {
    const s = dump(buildDatasetQueryClauses(classifyFreeTextQuery("lung cancer")))
    expect(s).toContain("all_text")
    expect(s).toContain("\"operator\":\"and\"")
    expect(s).not.toContain("fuzziness")
  })

  it("appends match_phrase_prefix for the trailing bare word (>= 2 chars)", () => {
    expect(dump(buildDatasetQueryClauses(classifyFreeTextQuery("lung canc")))).toContain("phrase_prefix")
  })

  it("does not append a trailing prefix for a 1-char last word", () => {
    expect(dump(buildDatasetQueryClauses(classifyFreeTextQuery("cancer a")))).not.toContain("phrase_prefix")
  })

  it("does not append a trailing prefix when the last token is quoted", () => {
    expect(dump(buildDatasetQueryClauses(classifyFreeTextQuery("\"whole genome\"")))).not.toContain("phrase_prefix")
  })

  it("phrases a symbol word (no split, no prefix)", () => {
    const s = dump(buildDatasetQueryClauses(classifyFreeTextQuery("HIF-1")))
    expect(s).toContain("\"type\":\"phrase\"")
    expect(s).not.toContain("phrase_prefix")
  })

  it("mixed ID + word keeps both the datasetId filter and the text clause", () => {
    const s = dump(buildDatasetQueryClauses(classifyFreeTextQuery("JGAD000001 RNA-seq")))
    expect(s).toContain("JGAD000001")
    expect(s).toContain("RNA-seq")
  })

  it("returns no clauses for an empty query", () => {
    expect(buildDatasetQueryClauses(classifyFreeTextQuery(""))).toEqual([])
  })
})

describe("buildResearchQueryClauses", () => {
  it("humId query filters by humId, never all_text, never datasetId", () => {
    const s = dump(buildResearchQueryClauses(classifyFreeTextQuery("hum0001"), []))
    expect(s).toContain("hum0001")
    expect(s).not.toContain("all_text")
    expect(s).not.toContain("datasetId")
  })

  it("datasetId query narrows by resolved parent humIds (no all_text)", () => {
    const s = dump(buildResearchQueryClauses(classifyFreeTextQuery("JGAD000002"), ["hum0001"]))
    expect(s).toContain("hum0001")
    expect(s).not.toContain("all_text")
  })

  it("a datasetId resolving to zero parents narrows to nothing (not match-all)", () => {
    const s = dump(buildResearchQueryClauses(classifyFreeTextQuery("JGAD999999"), []))
    expect(s).toContain("\"terms\":{\"humId\":[]}")
  })

  it("mixed ID + word keeps the humId filter AND the text clause", () => {
    const s = dump(buildResearchQueryClauses(classifyFreeTextQuery("hum0001 cancer"), []))
    expect(s).toContain("hum0001")
    expect(s).toContain("all_text")
    expect(s).toContain("\"operator\":\"and\"")
  })

  it("never emits a datasetId field clause (Research has no datasetId)", () => {
    expect(dump(buildResearchQueryClauses(classifyFreeTextQuery("cancer genomics"), []))).not.toContain("datasetId")
  })

  it("returns no clauses for an empty query", () => {
    expect(buildResearchQueryClauses(classifyFreeTextQuery(""), [])).toEqual([])
  })
})

describe("free-text query invariants (PBT)", () => {
  const idArb = fc.constantFrom(
    "hum0001", "JGAD000001", "DRA000908", "E-GEAD-1051", "MTBKS213", "PRJDB10452", "hum0013.v1.freq.v1",
  )

  // ID route guarantees a body string never pulls in an ID query (the reason
  // fuzziness was dropped).
  it("PBT: an ID-shaped query never produces an all_text clause", () => {
    fc.assert(
      fc.property(idArb, (id) => {
        const parsed = classifyFreeTextQuery(id)
        const d = dump(buildDatasetQueryClauses(parsed))
        const r = dump(buildResearchQueryClauses(parsed, ["hum0001"]))

        return !d.includes("all_text") && !r.includes("all_text")
      }),
    )
  })

  it("PBT: no clause ever carries fuzziness", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (q) => {
        const parsed = classifyFreeTextQuery(q)
        const d = dump(buildDatasetQueryClauses(parsed))
        const r = dump(buildResearchQueryClauses(parsed, []))

        return !d.includes("fuzziness") && !r.includes("fuzziness")
      }),
    )
  })

  // A gene symbol with a separator must be phrased, never AND-split into tokens
  // that inflate hit counts.
  it("PBT: a symbol-bearing non-ID word is phrased, never AND-split", () => {
    const geneArb = fc.tuple(
      fc.constantFrom("BRCA", "HIF", "TP", "CD", "IL", "FOXP", "EGFR", "KRAS"),
      fc.integer({ min: 1, max: 99 }),
    ).map(([sym, n]) => `${sym}-${n}`)
    fc.assert(
      fc.property(geneArb, (gene) => {
        const parsed = classifyFreeTextQuery(gene)

        return classifyIdToken(gene) === null
          && parsed.phraseTokens.includes(gene)
          && parsed.bareWords.length === 0
      }),
    )
  })

  // Hostile / boundary inputs must build a structurally-valid clause array without
  // throwing or injecting.
  it("PBT: hostile / boundary inputs build a clause array without throwing", () => {
    const reserved = fc.constantFrom(
      "+", "-", "=", "&", "|", ">", "<", "!", "(", ")", "{", "}", "[", "]",
      "^", "\"", "~", "*", "?", ":", "\\", "/",
    )
    const hostile = fc.oneof(
      fc.array(reserved, { minLength: 1, maxLength: 32 }).map(a => a.join("")),
      fc.constantFrom("\n", "\r\n", "\t", " \t\n "),
      fc.constantFrom("🌸", "👩‍🔬", "𝕏"),
      fc.string({ minLength: 1024, maxLength: 2048 }),
      fc.constantFrom("\0", "abc\0def"),
      fc.constantFrom("   ", "\t\t", "  \t  "),
    )
    fc.assert(
      fc.property(hostile, (q) => {
        const parsed = classifyFreeTextQuery(q)
        const d = buildDatasetQueryClauses(parsed)
        const r = buildResearchQueryClauses(parsed, [])

        return Array.isArray(d) && Array.isArray(r)
      }),
      { numRuns: 80 },
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
    // Constrain to a valid ISO range so toISOString() never throws (fc.date() default
    // includes invalid dates such as 'Invalid Date' which break .toISOString()).
    const optionalDate = fc.option(
      fc.date({ min: new Date("1900-01-01"), max: new Date("2100-12-31"), noInvalidDate: true })
        .map(d => d.toISOString().slice(0, 10)),
      { nil: undefined },
    )

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
          // Implementation treats nullish (null and undefined) values as "absent"
          const definedCount = [minPub, maxPub, minMod, maxMod].filter(v => v != null).length

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
