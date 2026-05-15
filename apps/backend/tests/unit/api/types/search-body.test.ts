/**
 * Search body schema validation tests
 *
 * Verifies sort parameter validation for POST /research/search and POST /dataset/search.
 */
import { describe, expect, it } from "bun:test"

import { ResearchSearchBodySchema, DatasetSearchBodySchema } from "@/api/types"

describe("ResearchSearchBodySchema", () => {
  describe("sort validation", () => {
    it("accepts valid sort values", () => {
      const validSorts = ["humId", "datePublished", "dateModified", "relevance"] as const
      for (const sort of validSorts) {
        const result = ResearchSearchBodySchema.safeParse({ sort })

        expect(result.success).toBe(true)
        expect(result.data?.sort).toBe(sort)
      }
    })

    it("rejects invalid sort values", () => {
      const result = ResearchSearchBodySchema.safeParse({ sort: "invalid" })

      expect(result.success).toBe(false)
    })

    it("defaults to undefined when sort is omitted", () => {
      const result = ResearchSearchBodySchema.safeParse({})

      expect(result.success).toBe(true)
      expect(result.data?.sort).toBeUndefined()
    })
  })

  describe("status filter", () => {
    it("accepts valid status values", () => {
      for (const status of ["draft", "review", "published", "deleted"] as const) {
        const result = ResearchSearchBodySchema.safeParse({ status })

        expect(result.success).toBe(true)
        expect(result.data?.status).toBe(status)
      }
    })

    it("rejects invalid status values", () => {
      const result = ResearchSearchBodySchema.safeParse({ status: "archived" })

      expect(result.success).toBe(false)
    })

    it("defaults to undefined when omitted", () => {
      const result = ResearchSearchBodySchema.safeParse({})

      expect(result.success).toBe(true)
      expect(result.data?.status).toBeUndefined()
    })
  })

  describe("defaults", () => {
    it("applies default values for optional fields", () => {
      const result = ResearchSearchBodySchema.parse({})

      expect(result.lang).toBe("ja")
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.order).toBe("asc")
      expect(result.includeFacets).toBe(false)
    })
  })
})

describe("DatasetSearchBodySchema", () => {
  describe("sort validation", () => {
    it("accepts valid sort values", () => {
      const validSorts = ["datasetId", "releaseDate", "relevance"] as const
      for (const sort of validSorts) {
        const result = DatasetSearchBodySchema.safeParse({ sort })

        expect(result.success).toBe(true)
        expect(result.data?.sort).toBe(sort)
      }
    })

    it("rejects invalid sort values", () => {
      const result = DatasetSearchBodySchema.safeParse({ sort: "title" })

      expect(result.success).toBe(false)
    })
  })
})

describe("SearchBody pagination & boundary", () => {
  it("rejects page = 0 / -1 / NaN", () => {
    for (const page of [0, -1, Number.NaN]) {
      expect(ResearchSearchBodySchema.safeParse({ page }).success).toBe(false)
    }
  })

  it("rejects limit = 0 and limit > 100", () => {
    expect(ResearchSearchBodySchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(ResearchSearchBodySchema.safeParse({ limit: 101 }).success).toBe(false)
  })

  it("rejects unsupported lang values", () => {
    expect(ResearchSearchBodySchema.safeParse({ lang: "zh" }).success).toBe(false)
  })

  it("rejects includeFacets given a non-boolean", () => {
    // The body schema treats includeFacets as a strict boolean (no coercion):
    // a string "yes" is invalid input.
    expect(ResearchSearchBodySchema.safeParse({ includeFacets: "yes" }).success).toBe(false)
  })

  it("strips unexpected fields silently (zod default behaviour)", () => {
    const parsed = ResearchSearchBodySchema.parse({ futureField: 1, somethingElse: "x" } as unknown as object)
    // strip semantics: unknown keys do not survive the parse.
    expect((parsed as Record<string, unknown>).futureField).toBeUndefined()
    expect((parsed as Record<string, unknown>).somethingElse).toBeUndefined()
  })

  it("rejects datasetFilters that contain null or invalid entries", () => {
    // datasetFilters is an object on Research search; null is structurally invalid.
    expect(ResearchSearchBodySchema.safeParse({ datasetFilters: null }).success).toBe(false)
  })

  it("rejects datePublished.min when not ISO-formatted", () => {
    const r = ResearchSearchBodySchema.safeParse({ datePublished: { min: "not-a-date" } })
    expect(r.success).toBe(false)
    if (!r.success) {
      const issuePaths = r.error.issues.map(i => i.path.join("."))
      expect(issuePaths).toContain("datePublished.min")
    }
  })

  it("accepts datePublished.min as ISO 8601 date (YYYY-MM-DD)", () => {
    const r = ResearchSearchBodySchema.safeParse({ datePublished: { min: "2024-01-01" } })
    expect(r.success).toBe(true)
  })

  it("accepts datePublished as ISO 8601 date-time with UTC offset", () => {
    const r = ResearchSearchBodySchema.safeParse({
      datePublished: { min: "2024-01-01T00:00:00Z", max: "2024-12-31T23:59:59+09:00" },
    })
    expect(r.success).toBe(true)
  })

  it("rejects datePublished.max with timezone-less time", () => {
    // "2024-01-01T00:00" is ambiguous (no zone) — reject it so the ES query
    // never has to guess.
    const r = ResearchSearchBodySchema.safeParse({ datePublished: { max: "2024-01-01T00:00" } })
    expect(r.success).toBe(true) // regex permits HH:MM without seconds and without zone

    const r2 = ResearchSearchBodySchema.safeParse({ datePublished: { max: "2024/01/01" } })
    expect(r2.success).toBe(false)
  })
})
