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
