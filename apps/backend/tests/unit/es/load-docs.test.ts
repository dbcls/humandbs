import { describe, expect, it } from "bun:test"

import {
  normVersion,
  idResearch,
  idResearchVersion,
  idDataset,
  transformResearch,
  makeDatasetDateModifiedTransform,
  makeDatasetTransform,
} from "@/es/load-docs"
import { extractDataText } from "@/es/types"

describe("es/load-docs.ts", () => {
  // ===========================================================================
  // normVersion
  // ===========================================================================
  describe("normVersion", () => {
    it("should return v-prefixed string for number input", () => {
      expect(normVersion(1)).toBe("v1")
      expect(normVersion(10)).toBe("v10")
      expect(normVersion(100)).toBe("v100")
    })

    it("should return as-is for v-prefixed string", () => {
      expect(normVersion("v1")).toBe("v1")
      expect(normVersion("v10")).toBe("v10")
      expect(normVersion("v100")).toBe("v100")
    })

    it("should add v-prefix for numeric string", () => {
      expect(normVersion("1")).toBe("v1")
      expect(normVersion("10")).toBe("v10")
      expect(normVersion("100")).toBe("v100")
    })

    it("should trim whitespace", () => {
      expect(normVersion(" v1 ")).toBe("v1")
      expect(normVersion(" 1 ")).toBe("v1")
    })

    it("should throw for invalid version format", () => {
      expect(() => normVersion("invalid")).toThrow("Invalid version format")
      expect(() => normVersion("abc")).toThrow("Invalid version format")
      expect(() => normVersion("")).toThrow("Invalid version format")
    })

    it("should throw for version with additional suffix", () => {
      expect(() => normVersion("v1.2")).toThrow("Invalid version format")
      expect(() => normVersion("v1abc")).toThrow("Invalid version format")
      expect(() => normVersion("1abc")).toThrow("Invalid version format")
    })
  })

  // ===========================================================================
  // idResearch
  // ===========================================================================
  describe("idResearch", () => {
    it("should return humId as-is", () => {
      expect(idResearch("hum0001")).toBe("hum0001")
      expect(idResearch("hum0100")).toBe("hum0100")
      expect(idResearch("hum1000")).toBe("hum1000")
    })
  })

  // ===========================================================================
  // idResearchVersion
  // ===========================================================================
  describe("idResearchVersion", () => {
    it("should combine humId and version with hyphen", () => {
      expect(idResearchVersion("hum0001", "v1")).toBe("hum0001-v1")
      expect(idResearchVersion("hum0001", "v10")).toBe("hum0001-v10")
    })

    it("should normalize version when combining", () => {
      expect(idResearchVersion("hum0001", "1")).toBe("hum0001-v1")
      expect(idResearchVersion("hum0001", " v1 ")).toBe("hum0001-v1")
    })
  })

  // ===========================================================================
  // idDataset
  // ===========================================================================
  describe("idDataset", () => {
    it("should combine datasetId and version with hyphen", () => {
      expect(idDataset("JGAD000001", "v1")).toBe("JGAD000001-v1")
      expect(idDataset("JGAD000001", "v10")).toBe("JGAD000001-v10")
    })

    it("should normalize version when combining", () => {
      expect(idDataset("JGAD000001", "1")).toBe("JGAD000001-v1")
      expect(idDataset("JGAD000001", " v1 ")).toBe("JGAD000001-v1")
    })

    it("should handle different dataset ID formats", () => {
      expect(idDataset("hum0001.v1.WGS.v1", "v1")).toBe("hum0001.v1.WGS.v1-v1")
      expect(idDataset("JGAS000001", "v2")).toBe("JGAS000001-v2")
    })
  })

  // ===========================================================================
  // transformResearch
  // ===========================================================================
  describe("transformResearch", () => {
    it("should add default status 'published' when missing", () => {
      const doc = { humId: "hum0001" }
      const result = transformResearch(doc)
      expect(result.status).toBe("published")
    })

    it("should preserve existing status", () => {
      const doc = { humId: "hum0001", status: "draft" }
      const result = transformResearch(doc)
      expect(result.status).toBe("draft")
    })

    it("should preserve all other fields", () => {
      const doc = {
        humId: "hum0001",
        title: { ja: "研究タイトル", en: "Research Title" },
        datePublished: "2024-01-01",
      }
      const result = transformResearch(doc)
      expect(result.humId).toBe("hum0001")
      expect(result.title).toEqual({ ja: "研究タイトル", en: "Research Title" })
      expect(result.datePublished).toBe("2024-01-01")
    })

    it("should not mutate original document", () => {
      const doc = { humId: "hum0001" }
      const original = { ...doc }
      transformResearch(doc)
      expect(doc).toEqual(original)
    })
  })

  // ===========================================================================
  // makeDatasetDateModifiedTransform
  // ===========================================================================
  describe("makeDatasetDateModifiedTransform", () => {
    const raw = (docs: { datasetId: string; version: string; versionReleaseDate?: string }[]) =>
      docs.map((data, i) => ({ fileName: `${data.datasetId}-${data.version}-${i}.json`, data }))

    it("stamps the max versionReleaseDate across a datasetId onto every version doc", () => {
      const docs = [
        { datasetId: "JGAD000001", version: "v1", versionReleaseDate: "2018-04-04" },
        { datasetId: "JGAD000001", version: "v2", versionReleaseDate: "2025-05-09" },
        { datasetId: "JGAD000001", version: "v3", versionReleaseDate: "2020-08-17" },
      ]
      const transform = makeDatasetDateModifiedTransform(raw(docs))
      for (const d of docs) {
        // Every version doc gets the same (max) value -> version-invariant.
        expect(transform(d).dateModified).toBe("2025-05-09")
      }
    })

    it("keeps datasetIds independent", () => {
      const transform = makeDatasetDateModifiedTransform(raw([
        { datasetId: "JGAD000001", version: "v1", versionReleaseDate: "2020-01-01" },
        { datasetId: "JGAD000002", version: "v1", versionReleaseDate: "2024-12-31" },
      ]))
      expect(transform({ datasetId: "JGAD000001", version: "v1", versionReleaseDate: "2020-01-01" }).dateModified).toBe("2020-01-01")
      expect(transform({ datasetId: "JGAD000002", version: "v1", versionReleaseDate: "2024-12-31" }).dateModified).toBe("2024-12-31")
    })

    it("falls back to the doc's own versionReleaseDate for an unknown datasetId", () => {
      const transform = makeDatasetDateModifiedTransform(raw([
        { datasetId: "JGAD000001", version: "v1", versionReleaseDate: "2020-01-01" },
      ]))
      expect(transform({ datasetId: "JGAD999999", version: "v1", versionReleaseDate: "2019-06-06" }).dateModified).toBe("2019-06-06")
    })

    it("treats a missing versionReleaseDate as empty so a present date wins", () => {
      const transform = makeDatasetDateModifiedTransform(raw([
        { datasetId: "JGAD000001", version: "v1" },
        { datasetId: "JGAD000001", version: "v2", versionReleaseDate: "2022-02-02" },
      ]))
      expect(transform({ datasetId: "JGAD000001", version: "v1" }).dateModified).toBe("2022-02-02")
    })

    it("preserves all other fields and does not mutate the input", () => {
      const transform = makeDatasetDateModifiedTransform(raw([
        { datasetId: "JGAD000001", version: "v1", versionReleaseDate: "2020-01-01" },
      ]))
      const doc = { datasetId: "JGAD000001", version: "v1", versionReleaseDate: "2020-01-01", humId: "hum0001" }
      const original = { ...doc }
      const result = transform(doc)
      expect(result.humId).toBe("hum0001")
      expect(result.versionReleaseDate).toBe("2020-01-01")
      expect(doc).toEqual(original)
    })
  })

  // ===========================================================================
  // extractDataText
  // ===========================================================================
  describe("extractDataText", () => {
    it("concatenates ja and en text from all data entries", () => {
      const data = {
        Method: {
          ja: { text: "マッピング方法 Novoalign" },
          en: { text: "Mapping method Novoalign" },
        },
        Platform: {
          ja: { text: "Illumina HiSeq" },
          en: { text: "Illumina HiSeq" },
        },
      }
      const result = extractDataText(data)
      expect(result).toContain("Novoalign")
      expect(result).toContain("マッピング方法")
      expect(result).toContain("Illumina HiSeq")
    })

    it("skips null values", () => {
      const data = {
        Method: null,
        Platform: { ja: { text: "HiSeq" }, en: null },
      }
      const result = extractDataText(data)
      expect(result).toBe("HiSeq")
    })

    it("skips entries where text is empty or missing", () => {
      const data = {
        A: { ja: { text: "" }, en: { text: "" } },
        B: { ja: null, en: null },
      }
      expect(extractDataText(data)).toBe("")
    })

    it("returns empty string for empty data object", () => {
      expect(extractDataText({})).toBe("")
    })

    it("handles entries with only ja or only en", () => {
      const jaOnly = { A: { ja: { text: "日本語" }, en: null } }
      expect(extractDataText(jaOnly)).toBe("日本語")

      const enOnly = { A: { ja: null, en: { text: "English" } } }
      expect(extractDataText(enOnly)).toBe("English")
    })
  })

  // ===========================================================================
  // makeDatasetTransform
  // ===========================================================================
  describe("makeDatasetTransform", () => {
    it("stamps both dateModified and dataText on dataset docs", () => {
      const rawDocs = [
        {
          fileName: "JGAD000001-v1.json",
          data: {
            datasetId: "JGAD000001",
            version: "v1",
            versionReleaseDate: "2024-01-01",
            experiments: [
              {
                data: {
                  Method: {
                    ja: { text: "BWA", rawHtml: null },
                    en: { text: "BWA", rawHtml: null },
                  },
                },
              },
            ],
          },
        },
      ]

      const transform = makeDatasetTransform(rawDocs)
      const result = transform(rawDocs[0].data)

      expect(result.dateModified).toBe("2024-01-01")
      const experiments = result.experiments as Record<string, unknown>[]
      expect(experiments[0].dataText).toContain("BWA")
    })

    it("handles experiments with empty data", () => {
      const rawDocs = [
        {
          fileName: "JGAD000001-v1.json",
          data: {
            datasetId: "JGAD000001",
            version: "v1",
            versionReleaseDate: "2024-01-01",
            experiments: [{ data: {} }],
          },
        },
      ]

      const transform = makeDatasetTransform(rawDocs)
      const result = transform(rawDocs[0].data)
      const experiments = result.experiments as Record<string, unknown>[]
      expect(experiments[0].dataText).toBe("")
    })
  })

})
