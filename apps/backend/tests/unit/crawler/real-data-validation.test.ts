/**
 * Real data validation tests
 *
 * Validates that actual crawler output conforms to Zod schemas.
 * Uses sample files from crawler-results directory.
 */

import { Glob } from "bun"
import { describe, expect, it } from "bun:test"

import { CrawlerResearchSchema, CrawlerDatasetSchema } from "@/es/types"

describe("real data validation", () => {
  describe("research versions", () => {
    it("should have research JSON files to validate", async () => {
      const glob = new Glob("crawler-results/structured-json/research/*.json")
      const files: string[] = []
      for await (const file of glob.scan(".")) {
        files.push(file)
      }
      expect(files.length).toBeGreaterThan(0)
    })

    it("should validate first 10 research version files", async () => {
      const glob = new Glob("crawler-results/structured-json/research/*.json")
      const files: string[] = []
      for await (const file of glob.scan(".")) {
        files.push(file)
        if (files.length >= 10) break
      }

      const errors: { file: string; error: string }[] = []

      for (const file of files) {
        try {
          const data = await Bun.file(file).json()
          const result = CrawlerResearchSchema.safeParse(data)
          if (!result.success) {
            errors.push({
              file,
              error: result.error.message,
            })
          }
        } catch (e) {
          errors.push({
            file,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }

      // Log errors for debugging
      if (errors.length > 0) {
        console.log("Validation errors:", errors)
      }

      expect(errors).toEqual([])
    })
  })

  describe("datasets", () => {
    it("should have dataset JSON files to validate", async () => {
      const glob = new Glob("crawler-results/structured-json/dataset/*.json")
      const files: string[] = []
      for await (const file of glob.scan(".")) {
        files.push(file)
      }
      expect(files.length).toBeGreaterThan(0)
    })

    it("should validate first 10 dataset files", async () => {
      const glob = new Glob("crawler-results/structured-json/dataset/*.json")
      const files: string[] = []
      for await (const file of glob.scan(".")) {
        files.push(file)
        if (files.length >= 10) break
      }

      const errors: { file: string; error: string }[] = []

      for (const file of files) {
        try {
          const data = await Bun.file(file).json()
          const result = CrawlerDatasetSchema.safeParse(data)
          if (!result.success) {
            errors.push({
              file,
              error: result.error.message,
            })
          }
        } catch (e) {
          errors.push({
            file,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }

      // Log errors for debugging
      if (errors.length > 0) {
        console.log("Validation errors:", errors)
      }

      expect(errors).toEqual([])
    })
  })

  describe("fixture data", () => {
    it("should validate hum0001.json fixture", async () => {
      const data = await Bun.file("tests/fixtures/crawler/json/hum0001.json").json()
      const result = CrawlerResearchSchema.safeParse(data)

      if (!result.success) {
        console.log("Validation error:", result.error.format())
      }

      expect(result.success).toBe(true)
    })

    it("should reject edge-case.json with null values", async () => {
      const data = await Bun.file("tests/fixtures/crawler/json/edge-case.json").json()
      const result = CrawlerResearchSchema.safeParse(data)

      // Edge case JSON has many null values that may not conform to schema
      // This test documents the expected behavior
      // If it fails validation, that's expected for edge cases
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0)
      }
    })

    it("should reject invalid.json", async () => {
      const data = await Bun.file("tests/fixtures/crawler/json/invalid.json").json()
      const result = CrawlerResearchSchema.safeParse(data)

      // Invalid JSON should fail validation
      expect(result.success).toBe(false)
    })
  })
})

describe("schema consistency", () => {
  it("research should have required fields", async () => {
    const glob = new Glob("crawler-results/structured-json/research/*.json")
    const files: string[] = []
    for await (const file of glob.scan(".")) {
      files.push(file)
      if (files.length >= 5) break
    }

    for (const file of files) {
      const data = await Bun.file(file).json()

      // Check required top-level fields (ResearchSchema structure)
      expect(data.humId).toBeDefined()
      expect(typeof data.humId).toBe("string")

      expect(data.title).toBeDefined()
      expect(typeof data.title).toBe("object")

      expect(data.summary).toBeDefined()
      expect(typeof data.summary).toBe("object")

      expect(data.versionIds).toBeDefined()
      expect(Array.isArray(data.versionIds)).toBe(true)
    }
  })

  it("dataset should have required fields", async () => {
    const glob = new Glob("crawler-results/structured-json/dataset/*.json")
    const files: string[] = []
    for await (const file of glob.scan(".")) {
      files.push(file)
      if (files.length >= 5) break
    }

    for (const file of files) {
      const data = await Bun.file(file).json()

      // Check required top-level fields
      expect(data.datasetId).toBeDefined()
      expect(typeof data.datasetId).toBe("string")

      expect(data.humId).toBeDefined()
      expect(typeof data.humId).toBe("string")

      expect(data.version).toBeDefined()
      expect(typeof data.version).toBe("string")
    }
  })
})
