import { describe, expect, it } from "bun:test"

import {
  normVersion,
  idResearch,
  idResearchVersion,
  idDataset,
  transformResearch,
  transformDataset,
} from "@/es/load-docs"

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

    it("should handle version with additional suffix", () => {
      // v1.2 should be treated as v1 (starts with v followed by digit)
      expect(normVersion("v1.2")).toBe("v1.2")
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

    it("should add default empty uids array when missing", () => {
      const doc = { humId: "hum0001" }
      const result = transformResearch(doc)
      expect(result.uids).toEqual([])
    })

    it("should preserve existing status", () => {
      const doc = { humId: "hum0001", status: "draft" }
      const result = transformResearch(doc)
      expect(result.status).toBe("draft")
    })

    it("should preserve existing uids", () => {
      const doc = { humId: "hum0001", uids: ["uid1", "uid2"] }
      const result = transformResearch(doc)
      expect(result.uids).toEqual(["uid1", "uid2"])
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
  // transformDataset
  // ===========================================================================
  describe("transformDataset", () => {
    it("should return document as-is (no transformation)", () => {
      const doc = {
        datasetId: "DRA001273",
        version: "v1",
        experiments: [
          {
            searchable: {
              platforms: [
                { vendor: "Illumina", model: "HiSeq 2500" },
                { vendor: "Thermo Fisher", model: "Ion PGM" },
              ],
            },
          },
        ],
      }
      const result = transformDataset(doc)
      expect(result).toEqual(doc)
    })

    it("should preserve platforms array for nested aggregation in API", () => {
      const doc = {
        datasetId: "DRA001273",
        version: "v1",
        experiments: [
          {
            searchable: {
              platforms: [{ vendor: "Illumina", model: "HiSeq 2500" }],
            },
          },
        ],
      }
      const result = transformDataset(doc)
      const searchable = (result.experiments as { searchable: Record<string, unknown> }[])[0].searchable
      expect(searchable.platforms).toEqual([{ vendor: "Illumina", model: "HiSeq 2500" }])
    })
  })
})
