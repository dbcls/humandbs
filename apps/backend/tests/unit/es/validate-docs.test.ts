import { describe, expect, it, spyOn } from "bun:test"

import { transformResearch } from "@/es/load-docs"
import { EsResearchSchema, EsDatasetSchema, ResearchVersionSchema } from "@/es/types"
import { validateDocs, printReport } from "@/es/validate-docs"
import type { ValidationResult } from "@/es/validate-docs"

// === Fixtures ===

const bilingualText = (ja: string, en: string) => ({ ja, en })

const textValue = (text: string) => ({ text, rawHtml: text })

const bilingualTextValue = (ja: string, en: string) => ({
  ja: textValue(ja),
  en: textValue(en),
})

const validResearchRaw = {
  humId: "hum0001",
  url: bilingualText("https://example.com/ja", "https://example.com/en"),
  title: bilingualText("タイトル", "Title"),
  summary: {
    aims: bilingualTextValue("目的", "Aims"),
    methods: bilingualTextValue("方法", "Methods"),
    targets: bilingualTextValue("対象", "Targets"),
    url: { ja: [], en: [] },
  },
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  controlledAccessUser: [],
  versionIds: ["hum0001.v1"],
  latestVersion: "v1",
  datePublished: "2024-01-01",
  dateModified: "2024-06-01",
  // Note: status and uids are NOT present; transformResearch adds defaults
}

const validResearchVersionRaw = {
  humId: "hum0001",
  humVersionId: "hum0001.v1",
  version: "v1",
  versionReleaseDate: "2024-01-01",
  datasets: [],
  releaseNote: bilingualTextValue("リリースノート", "Release note"),
}

const validDatasetRaw = {
  datasetId: "JGAD000001",
  version: "v1",
  versionReleaseDate: "2024-01-01",
  humId: "hum0001",
  humVersionId: "hum0001.v1",
  releaseDate: "2024-01-01",
  criteria: "Unrestricted-access",
  typeOfData: bilingualText("ゲノムデータ", "Genome data"),
  experiments: [],
}

// === Tests ===

describe("es/validate-docs.ts", () => {
  // ===========================================================================
  // validateDocs
  // ===========================================================================
  describe("validateDocs", () => {
    it("should pass for valid research documents (with transform)", () => {
      const docs = [{ fileName: "hum0001.json", data: validResearchRaw }]
      const result = validateDocs("Research", docs, EsResearchSchema, transformResearch)

      expect(result.total).toBe(1)
      expect(result.passed).toBe(1)
      expect(result.errors).toEqual([])
    })

    it("should pass for valid research-version documents", () => {
      const docs = [{ fileName: "hum0001-v1.json", data: validResearchVersionRaw }]
      const result = validateDocs("Research Version", docs, ResearchVersionSchema)

      expect(result.total).toBe(1)
      expect(result.passed).toBe(1)
      expect(result.errors).toEqual([])
    })

    it("should pass for valid dataset documents", () => {
      const docs = [{ fileName: "JGAD000001-v1.json", data: validDatasetRaw }]
      const result = validateDocs("Dataset", docs, EsDatasetSchema)

      expect(result.total).toBe(1)
      expect(result.passed).toBe(1)
      expect(result.errors).toEqual([])
    })

    it("should report errors for invalid documents", () => {
      const invalidDoc = { datasetId: 123 } // missing required fields, wrong type
      const docs = [{ fileName: "bad.json", data: invalidDoc }]
      const result = validateDocs("Dataset", docs, EsDatasetSchema)

      expect(result.total).toBe(1)
      expect(result.passed).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].fileName).toBe("bad.json")
      expect(result.errors[0].issues.length).toBeGreaterThan(0)
    })

    it("should report per-file errors when mix of valid and invalid", () => {
      const docs = [
        { fileName: "good.json", data: validDatasetRaw },
        { fileName: "bad.json", data: { datasetId: 123 } },
      ]
      const result = validateDocs("Dataset", docs, EsDatasetSchema)

      expect(result.total).toBe(2)
      expect(result.passed).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].fileName).toBe("bad.json")
    })

    it("should apply transform before validation (research defaults)", () => {
      // Without transform, missing status/uids would fail EsResearchSchema
      const docWithoutDefaults = { ...validResearchRaw }
      const docs = [{ fileName: "hum0001.json", data: docWithoutDefaults }]

      // Without transform → fail (no status/uids)
      const resultNoTransform = validateDocs("Research", docs, EsResearchSchema)
      expect(resultNoTransform.passed).toBe(0)
      expect(resultNoTransform.errors).toHaveLength(1)

      // With transform → pass
      const resultWithTransform = validateDocs("Research", docs, EsResearchSchema, transformResearch)
      expect(resultWithTransform.passed).toBe(1)
      expect(resultWithTransform.errors).toEqual([])
    })

    it("should handle empty document list", () => {
      const result = validateDocs("Research", [], EsResearchSchema)

      expect(result.total).toBe(0)
      expect(result.passed).toBe(0)
      expect(result.errors).toEqual([])
    })

    it("should include Zod issue paths in errors", () => {
      const invalidDoc = {
        ...validDatasetRaw,
        criteria: "invalid-criteria",
      }
      const docs = [{ fileName: "bad-criteria.json", data: invalidDoc }]
      const result = validateDocs("Dataset", docs, EsDatasetSchema)

      expect(result.errors).toHaveLength(1)
      const issue = result.errors[0].issues.find((i) =>
        i.path.includes("criteria"),
      )
      expect(issue).toBeDefined()
    })
  })

  // ===========================================================================
  // printReport
  // ===========================================================================
  describe("printReport", () => {
    it("should return true when all results pass", () => {
      const results: ValidationResult[] = [
        { label: "Research", total: 5, passed: 5, errors: [] },
        { label: "Dataset", total: 3, passed: 3, errors: [] },
      ]

      expect(printReport(results)).toBe(true)
    })

    it("should display FAILED for results with errors", () => {
      const parsed = EsDatasetSchema.safeParse({ datasetId: 123 })
      const issues = parsed.success ? [] : parsed.error.issues

      const results: ValidationResult[] = [
        {
          label: "Dataset",
          total: 3,
          passed: 2,
          errors: [{ fileName: "bad.json", issues }],
        },
      ]

      const logs: string[] = []
      const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "))
      })

      printReport(results)

      spy.mockRestore()

      expect(logs.some((l) => l.includes("FAILED"))).toBe(true)
    })

    it("should return false when any result has errors", () => {
      // Generate a real Zod issue via safeParse
      const parsed = EsDatasetSchema.safeParse({ datasetId: 123 })
      const issues = parsed.success ? [] : parsed.error.issues

      const results: ValidationResult[] = [
        { label: "Research", total: 5, passed: 5, errors: [] },
        {
          label: "Dataset",
          total: 3,
          passed: 2,
          errors: [{ fileName: "bad.json", issues }],
        },
      ]

      expect(printReport(results)).toBe(false)
    })

    it("should return true for empty results", () => {
      expect(printReport([])).toBe(true)
    })
  })
})
