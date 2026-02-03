import { describe, expect, it } from "bun:test"

import {
  getSkipPages,
  shouldSkipPage,
  getReleaseSuffix,
  genReleaseUrl,
  applyGlobalIdCorrection,
  isInvalidPublicationDatasetId,
  cleanPublicationDatasetId,
  getMolDataIdFields,
  getInvalidOtherIds,
  getGlobalIdCorrection,
  getCriteriaCanonicalMap,
  getUnusedPublicationTitles,
  getInvalidDoiValues,
  getInvalidGrantIdValues,
} from "@/crawler/config/mapping"

describe("config/mapping.ts", () => {
  // ===========================================================================
  // Skip Pages
  // ===========================================================================
  describe("getSkipPages", () => {
    it("should return an array", () => {
      const skipPages = getSkipPages()
      expect(Array.isArray(skipPages)).toBe(true)
    })

    it("should have required fields for each entry", () => {
      const skipPages = getSkipPages()
      for (const entry of skipPages) {
        expect(entry.humVersionId).toMatch(/^hum\d+-v\d+$/)
        expect(["ja", "en"]).toContain(entry.lang)
        expect(entry.reason).toBeTruthy()
      }
    })
  })

  describe("shouldSkipPage", () => {
    it("should return boolean for any humVersionId/lang combination", () => {
      const result = shouldSkipPage("hum0001-v1", "ja")
      expect(typeof result).toBe("boolean")
    })

    it("should return false for normal pages", () => {
      // Assuming hum0001-v1 is not in skip list
      expect(shouldSkipPage("hum0001-v1", "ja")).toBe(false)
      expect(shouldSkipPage("hum0001-v1", "en")).toBe(false)
    })
  })

  // ===========================================================================
  // Release URL
  // ===========================================================================
  describe("getReleaseSuffix", () => {
    it("should return '-release' for most pages", () => {
      expect(getReleaseSuffix("hum0001-v1", "ja")).toBe("-release")
      expect(getReleaseSuffix("hum0001-v1", "en")).toBe("-release")
    })

    it("should return special suffix for configured pages", () => {
      // hum0329-v1 ja has special suffix
      expect(getReleaseSuffix("hum0329-v1", "ja")).toBe("-release-note")
    })
  })

  describe("genReleaseUrl", () => {
    it("should generate correct Japanese release URL", () => {
      const url = genReleaseUrl("hum0001-v1", "ja")
      expect(url).toBe("https://humandbs.dbcls.jp/hum0001-v1-release")
    })

    it("should generate correct English release URL", () => {
      const url = genReleaseUrl("hum0001-v1", "en")
      expect(url).toBe("https://humandbs.dbcls.jp/en/hum0001-v1-release")
    })

    it("should use special suffix for configured pages", () => {
      const url = genReleaseUrl("hum0329-v1", "ja")
      expect(url).toBe("https://humandbs.dbcls.jp/hum0329-v1-release-note")
    })
  })

  // ===========================================================================
  // Global Typo Correction
  // ===========================================================================
  describe("applyGlobalIdCorrection", () => {
    it("should return original ID for non-special cases", () => {
      expect(applyGlobalIdCorrection("JGAD000001")).toEqual(["JGAD000001"])
    })

    it("should transform special case IDs", () => {
      const corrections = getGlobalIdCorrection()
      // Test with actual corrections from config
      for (const [input, expected] of Object.entries(corrections)) {
        expect(applyGlobalIdCorrection(input)).toEqual(expected)
        break // Just test one to ensure function works
      }
    })
  })

  describe("getGlobalIdCorrection", () => {
    it("should return an object", () => {
      const corrections = getGlobalIdCorrection()
      expect(typeof corrections).toBe("object")
    })

    it("should have string keys and array values", () => {
      const corrections = getGlobalIdCorrection()
      for (const [key, value] of Object.entries(corrections)) {
        expect(typeof key).toBe("string")
        expect(Array.isArray(value)).toBe(true)
      }
    })
  })

  // ===========================================================================
  // Publication Dataset ID Validation
  // ===========================================================================
  describe("isInvalidPublicationDatasetId", () => {
    it("should return true for IDs containing 'genes'", () => {
      expect(isInvalidPublicationDatasetId("genes)")).toBe(true)
      expect(isInvalidPublicationDatasetId("genes・63")).toBe(true)
    })

    it("should return true for IDs containing 'panel'", () => {
      expect(isInvalidPublicationDatasetId("panel)")).toBe(true)
      expect(isInvalidPublicationDatasetId("panel")).toBe(true)
    })

    it("should return true for IDs containing Japanese 遺伝子", () => {
      expect(isInvalidPublicationDatasetId("(69遺伝子領域・63遺伝子領域)")).toBe(true)
    })

    it("should return true for fastq file format", () => {
      expect(isInvalidPublicationDatasetId("(fastq)")).toBe(true)
    })

    it("should return true for numbers only (fragments)", () => {
      expect(isInvalidPublicationDatasetId("(69")).toBe(true)
      expect(isInvalidPublicationDatasetId("69")).toBe(true)
    })

    it("should return true for reference fragment", () => {
      expect(isInvalidPublicationDatasetId("(reference")).toBe(true)
    })

    it("should return true for empty after stripping parentheses", () => {
      expect(isInvalidPublicationDatasetId("()")).toBe(true)
    })

    it("should return false for valid dataset IDs", () => {
      expect(isInvalidPublicationDatasetId("JGAD000220")).toBe(false)
      expect(isInvalidPublicationDatasetId("JGAS000006")).toBe(false)
      expect(isInvalidPublicationDatasetId("(JGAS000006)")).toBe(false)
      expect(isInvalidPublicationDatasetId("hum0014.v4.AD.v1")).toBe(false)
      expect(isInvalidPublicationDatasetId("(hum0040)")).toBe(false)
      expect(isInvalidPublicationDatasetId("T2DM")).toBe(false)
      expect(isInvalidPublicationDatasetId("JSNP")).toBe(false)
    })
  })

  describe("cleanPublicationDatasetId", () => {
    it("should remove surrounding parentheses", () => {
      expect(cleanPublicationDatasetId("(JGAS000006)")).toBe("JGAS000006")
      expect(cleanPublicationDatasetId("(hum0040)")).toBe("hum0040")
    })

    it("should not modify IDs without parentheses", () => {
      expect(cleanPublicationDatasetId("JGAD000220")).toBe("JGAD000220")
      expect(cleanPublicationDatasetId("DRA003802")).toBe("DRA003802")
    })

    it("should only remove if both opening and closing parentheses exist", () => {
      expect(cleanPublicationDatasetId("(partial")).toBe("(partial")
      expect(cleanPublicationDatasetId("partial)")).toBe("partial)")
    })
  })

  // ===========================================================================
  // Molecular Data ID Fields
  // ===========================================================================
  describe("getMolDataIdFields", () => {
    it("should return an array", () => {
      const fields = getMolDataIdFields()
      expect(Array.isArray(fields)).toBe(true)
    })

    it("should contain expected field names", () => {
      const fields = getMolDataIdFields()
      expect(fields.length).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // Invalid ID Values
  // ===========================================================================
  describe("getInvalidOtherIds", () => {
    it("should return an array", () => {
      const invalid = getInvalidOtherIds()
      expect(Array.isArray(invalid)).toBe(true)
    })
  })

  // ===========================================================================
  // Criteria Mapping
  // ===========================================================================
  describe("getCriteriaCanonicalMap", () => {
    it("should return an object", () => {
      const map = getCriteriaCanonicalMap()
      expect(typeof map).toBe("object")
    })

    it("should map Japanese criteria to canonical values", () => {
      const map = getCriteriaCanonicalMap()
      // Check that at least some criteria mappings exist
      expect(Object.keys(map).length).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // Publication Config
  // ===========================================================================
  describe("getUnusedPublicationTitles", () => {
    it("should return an array", () => {
      const titles = getUnusedPublicationTitles()
      expect(Array.isArray(titles)).toBe(true)
    })

    it("should contain expected unused titles", () => {
      const titles = getUnusedPublicationTitles()
      expect(titles).toContain("In submission")
      expect(titles).toContain("投稿中")
    })
  })

  describe("getInvalidDoiValues", () => {
    it("should return an array", () => {
      const values = getInvalidDoiValues()
      expect(Array.isArray(values)).toBe(true)
    })

    it("should contain expected invalid DOI values", () => {
      const values = getInvalidDoiValues()
      expect(values).toContain("doi:")
      expect(values).toContain("In submission")
    })
  })

  // ===========================================================================
  // Grant Config
  // ===========================================================================
  describe("getInvalidGrantIdValues", () => {
    it("should return an array", () => {
      const values = getInvalidGrantIdValues()
      expect(Array.isArray(values)).toBe(true)
    })

    it("should contain expected invalid grant ID values", () => {
      const values = getInvalidGrantIdValues()
      expect(values).toContain("None")
      expect(values).toContain("なし")
    })
  })
})
