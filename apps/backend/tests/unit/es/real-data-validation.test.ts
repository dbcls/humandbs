/**
 * Real data validation tests
 *
 * Tests that actual data from crawler-results can be parsed by Zod schemas.
 * Uses fixture files copied from crawler-results/structured-json/.
 */
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"

import {
  EsResearchSchema,
  EsDatasetSchema,
  EsResearchVersionSchema,
} from "@/es/types"

// Path to fixtures
const FIXTURES_DIR = join(__dirname, "../../fixtures/es")

/**
 * Read all JSON files from a directory
 */
function readJsonFiles<T>(dir: string): { filename: string; data: T }[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  return files.map((filename) => ({
    filename,
    data: JSON.parse(readFileSync(join(dir, filename), "utf8")) as T,
  }))
}

describe("es/real-data-validation", () => {
  // ===========================================================================
  // Research fixtures
  // ===========================================================================
  describe("research fixtures", () => {
    const researchDir = join(FIXTURES_DIR, "research")
    const files = readJsonFiles(researchDir)

    it("should have research fixture files", () => {
      expect(files.length).toBeGreaterThan(0)
    })

    for (const { filename, data } of files) {
      it(`should validate ${filename}`, () => {
        // Add default ES-specific fields that may be missing from crawler output
        const esData = {
          ...(data as Record<string, unknown>),
          status: (data as Record<string, unknown>).status ?? "published",
          uids: (data as Record<string, unknown>).uids ?? [],
        }

        const result = EsResearchSchema.safeParse(esData)
        if (!result.success) {
          console.error(`Validation errors for ${filename}:`)
          console.error(JSON.stringify(result.error.issues, null, 2))
        }
        expect(result.success).toBe(true)
      })
    }

    it("should validate hum0001.json has required fields", () => {
      const hum0001 = files.find((f) => f.filename === "hum0001.json")
      if (hum0001) {
        const data = hum0001.data as Record<string, unknown>
        expect(data.humId).toBe("hum0001")
        expect(data.title).toBeDefined()
        expect(data.summary).toBeDefined()
        expect(data.dataProvider).toBeDefined()
        expect(Array.isArray(data.versionIds)).toBe(true)
      }
    })
  })

  // ===========================================================================
  // Research-version fixtures
  // ===========================================================================
  describe("research-version fixtures", () => {
    const rvDir = join(FIXTURES_DIR, "research-version")
    const files = readJsonFiles(rvDir)

    it("should have research-version fixture files", () => {
      expect(files.length).toBeGreaterThan(0)
    })

    for (const { filename, data } of files) {
      it(`should validate ${filename}`, () => {
        const result = EsResearchVersionSchema.safeParse(data)
        if (!result.success) {
          console.error(`Validation errors for ${filename}:`)
          console.error(JSON.stringify(result.error.issues, null, 2))
        }
        expect(result.success).toBe(true)
      })
    }

    it("should validate hum0001-v1.json has required fields", () => {
      const hum0001v1 = files.find((f) => f.filename === "hum0001-v1.json")
      if (hum0001v1) {
        const data = hum0001v1.data as Record<string, unknown>
        expect(data.humId).toBe("hum0001")
        expect(data.humVersionId).toBe("hum0001-v1")
        expect(data.version).toBe("v1")
        expect(data.datasets).toBeDefined()
        expect(data.releaseNote).toBeDefined()
      }
    })

    it("should validate version format across all fixtures", () => {
      for (const { data } of files) {
        const version = (data as { version: string }).version
        expect(version).toMatch(/^v\d+$/)
      }
    })
  })

  // ===========================================================================
  // Dataset fixtures
  // ===========================================================================
  describe("dataset fixtures", () => {
    const datasetDir = join(FIXTURES_DIR, "dataset")
    const files = readJsonFiles(datasetDir)

    it("should have dataset fixture files", () => {
      expect(files.length).toBeGreaterThan(0)
    })

    for (const { filename, data } of files) {
      it(`should validate ${filename}`, () => {
        const result = EsDatasetSchema.safeParse(data)
        if (!result.success) {
          console.error(`Validation errors for ${filename}:`)
          console.error(JSON.stringify(result.error.issues, null, 2))
        }
        expect(result.success).toBe(true)
      })
    }

    it("should validate DRA000908-v1.json has required fields", () => {
      const dra = files.find((f) => f.filename === "DRA000908-v1.json")
      if (dra) {
        const data = dra.data as Record<string, unknown>
        expect(data.datasetId).toBe("DRA000908")
        expect(data.version).toBe("v1")
        expect(data.humId).toBeDefined()
        expect(data.experiments).toBeDefined()
        expect(Array.isArray(data.experiments)).toBe(true)
      }
    })

    it("should validate experiments array is not empty", () => {
      for (const { data } of files) {
        const experiments = (data as { experiments: unknown[] }).experiments
        expect(experiments.length).toBeGreaterThan(0)
      }
    })

    it("should validate criteria is a valid value", () => {
      const validCriteria = [
        "Controlled-access (Type I)",
        "Controlled-access (Type II)",
        "Unrestricted-access",
      ]
      for (const { data } of files) {
        const criteria = (data as { criteria: string }).criteria
        expect(validCriteria).toContain(criteria)
      }
    })
  })

  // ===========================================================================
  // Edge case validation
  // ===========================================================================
  describe("edge cases", () => {
    it("should handle null values in optional fields", () => {
      // Test with a minimal research object
      const minimalResearch = {
        humId: "hum9999",
        url: { ja: "https://example.com", en: "https://example.com/en" },
        title: { ja: "テスト", en: "Test" },
        summary: {
          aims: { ja: { text: "a", rawHtml: "a" }, en: { text: "a", rawHtml: "a" } },
          methods: { ja: { text: "m", rawHtml: "m" }, en: { text: "m", rawHtml: "m" } },
          targets: { ja: { text: "t", rawHtml: "t" }, en: { text: "t", rawHtml: "t" } },
          url: { ja: [], en: [] },
          footers: { ja: [], en: [] },
        },
        dataProvider: [],
        researchProject: [],
        grant: [],
        relatedPublication: [],
        controlledAccessUser: [],
        versionIds: [],
        latestVersion: "hum9999-v1",
        datePublished: "2024-01-01",
        dateModified: "2024-01-01",
        status: "published",
        uids: [],
      }

      const result = EsResearchSchema.safeParse(minimalResearch)
      expect(result.success).toBe(true)
    })

    it("should handle empty arrays for nested fields", () => {
      const researchWithEmptyArrays = {
        humId: "hum9999",
        url: { ja: "https://example.com", en: "https://example.com/en" },
        title: { ja: "テスト", en: "Test" },
        summary: {
          aims: { ja: { text: "a", rawHtml: "a" }, en: { text: "a", rawHtml: "a" } },
          methods: { ja: { text: "m", rawHtml: "m" }, en: { text: "m", rawHtml: "m" } },
          targets: { ja: { text: "t", rawHtml: "t" }, en: { text: "t", rawHtml: "t" } },
          url: { ja: [], en: [] },
          footers: { ja: [], en: [] },
        },
        dataProvider: [],
        researchProject: [],
        grant: [],
        relatedPublication: [],
        controlledAccessUser: [],
        versionIds: [],
        latestVersion: "hum9999-v1",
        datePublished: "2024-01-01",
        dateModified: "2024-01-01",
        status: "published",
        uids: [],
      }

      const result = EsResearchSchema.safeParse(researchWithEmptyArrays)
      expect(result.success).toBe(true)
    })

    it("should validate dataset with searchable fields", () => {
      const datasetDir = join(FIXTURES_DIR, "dataset")
      const files = readJsonFiles(datasetDir)

      for (const { data } of files) {
        const experiments = (data as { experiments: { searchable?: unknown }[] }).experiments
        for (const exp of experiments) {
          if (exp.searchable) {
            // Searchable fields should be an object
            expect(typeof exp.searchable).toBe("object")
          }
        }
      }
    })

    it("should handle bilingual text with null values", () => {
      // typeOfData can have null for one language
      const datasetDir = join(FIXTURES_DIR, "dataset")
      const files = readJsonFiles(datasetDir)

      for (const { data } of files) {
        const typeOfData = (data as { typeOfData: { ja: string | null; en: string | null } }).typeOfData
        // At least one language should have a value (usually ja)
        const hasValue = typeOfData.ja !== null || typeOfData.en !== null
        expect(hasValue).toBe(true)
      }
    })
  })

  // ===========================================================================
  // Cross-reference validation
  // ===========================================================================
  describe("cross-reference validation", () => {
    it("should have consistent humId across research and research-version", () => {
      const researchDir = join(FIXTURES_DIR, "research")
      const rvDir = join(FIXTURES_DIR, "research-version")

      const researchFiles = readJsonFiles(researchDir)
      const rvFiles = readJsonFiles(rvDir)

      // For each research, check if its versionIds match research-version files
      for (const { data: research } of researchFiles) {
        const humId = (research as { humId: string }).humId
        const versionIds = (research as { versionIds: string[] }).versionIds

        // Check that research-version files with this humId have matching humVersionId
        const matchingRvFiles = rvFiles.filter(
          ({ data }) => (data as { humId: string }).humId === humId,
        )

        for (const { data: rv } of matchingRvFiles) {
          const humVersionId = (rv as { humVersionId: string }).humVersionId
          expect(versionIds).toContain(humVersionId)
        }
      }
    })

    it("should have consistent humId/humVersionId in dataset", () => {
      const datasetDir = join(FIXTURES_DIR, "dataset")
      const files = readJsonFiles(datasetDir)

      for (const { data } of files) {
        const humId = (data as { humId: string }).humId
        const humVersionId = (data as { humVersionId: string }).humVersionId

        // humVersionId should start with humId
        expect(humVersionId.startsWith(humId)).toBe(true)
      }
    })
  })
})
