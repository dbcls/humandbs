/**
 * ResearchSummarySchema validation tests
 *
 * Verifies that the title field accepts BilingualText format
 * and rejects plain string format (breaking change guard).
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { ResearchSummarySchema } from "@/api/types"

const validBase = {
  humId: "hum0001",
  lang: "ja" as const,
  versions: [{ version: "v1", releaseDate: "2024-01-01" }],
  methods: "methods text",
  datasetIds: ["JGAD000001"],
  typeOfData: ["NGS"],
  platforms: ["Illumina"],
  targets: "targets text",
  dataProvider: ["Provider A"],
  criteria: "Controlled-access (Type I)",
}

describe("ResearchSummarySchema", () => {
  describe("title field accepts BilingualText", () => {
    it("accepts title with both ja and en", () => {
      const result = ResearchSummarySchema.safeParse({
        ...validBase,
        title: { ja: "日本語タイトル", en: "English title" },
      })

      expect(result.success).toBe(true)
    })

    it("accepts title with ja only (en=null)", () => {
      const result = ResearchSummarySchema.safeParse({
        ...validBase,
        title: { ja: "日本語タイトル", en: null },
      })

      expect(result.success).toBe(true)
    })

    it("accepts title with en only (ja=null)", () => {
      const result = ResearchSummarySchema.safeParse({
        ...validBase,
        title: { ja: null, en: "English title" },
      })

      expect(result.success).toBe(true)
    })

    it("accepts title with both null", () => {
      const result = ResearchSummarySchema.safeParse({
        ...validBase,
        title: { ja: null, en: null },
      })

      expect(result.success).toBe(true)
    })
  })

  describe("title field rejects invalid formats", () => {
    it("rejects plain string title", () => {
      const result = ResearchSummarySchema.safeParse({
        ...validBase,
        title: "plain string",
      })

      expect(result.success).toBe(false)
    })

    it("rejects missing title", () => {
      const result = ResearchSummarySchema.safeParse(validBase)

      expect(result.success).toBe(false)
    })

    it("rejects title missing en key", () => {
      const result = ResearchSummarySchema.safeParse({
        ...validBase,
        title: { ja: "日本語" },
      })

      expect(result.success).toBe(false)
    })

    it("rejects title missing ja key", () => {
      const result = ResearchSummarySchema.safeParse({
        ...validBase,
        title: { en: "English" },
      })

      expect(result.success).toBe(false)
    })
  })

  // PBT: any BilingualText with nullable strings is accepted
  it("accepts arbitrary BilingualText values", () => {
    const bilingualText = fc.record({
      ja: fc.option(fc.string(), { nil: null }),
      en: fc.option(fc.string(), { nil: null }),
    })

    fc.assert(
      fc.property(bilingualText, (title) => {
        const result = ResearchSummarySchema.safeParse({ ...validBase, title })

        return result.success
      }),
    )
  })
})
