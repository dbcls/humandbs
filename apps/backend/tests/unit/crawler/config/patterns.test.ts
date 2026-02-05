/**
 * Tests for ID pattern validation
 *
 * Covers:
 * - isValidDatasetId: boundary values, error cases, PBT
 * - extractIdsByType: basic extraction, GEA URL handling
 */

import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { extractIdsByType, isValidDatasetId } from "@/crawler/config/patterns"

describe("isValidDatasetId", () => {
  describe("boundary values - valid cases", () => {
    it.each([
      // JGAD digit count - valid
      ["JGAD000001", true, "6 digits - exact"],

      // JGAS digit count - valid
      ["JGAS000001", true, "6 digits - exact"],

      // DRA digit count - valid
      ["DRA000001", true, "6 digits - exact"],

      // GEA digit count - valid
      ["E-GEAD-999", true, "3 digits - exact"],
      ["E-GEAD-9999", true, "4 digits - also valid"],

      // BP (BioProject) digit count - valid
      ["PRJDB00001", true, "5 digits - exact"],

      // METABO digit count - valid
      ["MTBKS001", true, "3 digits - exact"],

      // Empty string
      ["", false, "empty string"],
    ] as const)("%s -> %s (%s)", (input, expected, _desc) => {
      expect(isValidDatasetId(input)).toBe(expected)
    })
  })

  describe("boundary values - too few digits", () => {
    it.each([
      ["JGAD00001", false, "JGAD 5 digits - too few"],
      ["JGAS00001", false, "JGAS 5 digits - too few"],
      ["DRA00001", false, "DRA 5 digits - too few"],
      ["E-GEAD-99", false, "GEA 2 digits - too few"],
      ["PRJDB0001", false, "BP 4 digits - too few"],
      ["MTBKS01", false, "METABO 2 digits - too few"],
    ] as const)("%s -> %s (%s)", (input, expected, _desc) => {
      expect(isValidDatasetId(input)).toBe(expected)
    })
  })

  describe("too many digits (now correctly rejected)", () => {
    // After fix: exact match required, extra digits are rejected
    it.each([
      ["JGAD0000001", false, "7 digits - rejected"],
      ["JGAS0000001", false, "7 digits - rejected"],
      ["DRA0000001", false, "7 digits - rejected"],
      ["E-GEAD-99999", false, "5 digits - rejected"],
      ["PRJDB000001", false, "6 digits - rejected"],
      ["MTBKS0001", false, "4 digits - rejected"],
    ] as const)("%s -> %s (%s)", (input, expected, _desc) => {
      expect(isValidDatasetId(input)).toBe(expected)
    })
  })

  describe("error cases - truly invalid", () => {
    it.each([
      // Prefix only
      ["JGAD", false, "prefix only - JGAD"],
      ["JGAS", false, "prefix only - JGAS"],
      ["DRA", false, "prefix only - DRA"],
      ["E-GEAD-", false, "prefix only - GEA"],

      // Digits only
      ["000001", false, "digits only"],

      // Wrong separators
      ["JGAD_000001", false, "underscore in JGAD"],
      ["JGAD-000001", false, "hyphen in JGAD"],
      ["JGAD 000001", false, "space in JGAD"],

      // Case sensitivity
      ["jgad000001", false, "lowercase JGAD"],
      ["Jgad000001", false, "mixed case JGAD"],
      ["jgas000001", false, "lowercase JGAS"],
      ["dra000001", false, "lowercase DRA"],
      ["e-gead-999", false, "lowercase GEA"],

      // Invalid prefixes
      ["JGAX000001", false, "invalid prefix JGAX"],
      ["JGA000001", false, "old format JGA"],
      ["INVALID000001", false, "completely invalid prefix"],

      // At sign and hash
      ["JGAD@000001", false, "at sign"],
      ["JGAD#000001", false, "hash"],

      // Unicode
      ["JGAD０００００１", false, "full-width digits"],
    ] as const)("%s -> %s (%s)", (input, expected, _desc) => {
      expect(isValidDatasetId(input)).toBe(expected)
    })
  })

  describe("spaces and suffixes handling", () => {
    // After fix: trim is applied, but suffixes are rejected
    it.each([
      // Spaces are trimmed, so these pass
      [" JGAD000001", true, "leading space - trimmed and valid"],
      ["JGAD000001 ", true, "trailing space - trimmed and valid"],
      [" JGAD000001 ", true, "surrounding spaces - trimmed and valid"],
      // Suffixes are rejected (exact match required)
      ["JGAD000001!", false, "exclamation mark suffix - rejected"],
      ["\u200BJGAD000001", false, "zero-width space prefix - rejected"],
    ] as const)("%s -> %s (%s)", (input, expected, _desc) => {
      expect(isValidDatasetId(input)).toBe(expected)
    })
  })

  describe("properties (PBT)", () => {
    it("should always return boolean", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = isValidDatasetId(input)
          expect(typeof result).toBe("boolean")
        }),
      )
    })

    it("valid JGAD IDs should pass", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 999999 }), (num) => {
          const id = `JGAD${num.toString().padStart(6, "0")}`
          expect(isValidDatasetId(id)).toBe(true)
        }),
      )
    })

    it("valid JGAS IDs should pass", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 999999 }), (num) => {
          const id = `JGAS${num.toString().padStart(6, "0")}`
          expect(isValidDatasetId(id)).toBe(true)
        }),
      )
    })

    it("valid DRA IDs should pass", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 999999 }), (num) => {
          const id = `DRA${num.toString().padStart(6, "0")}`
          expect(isValidDatasetId(id)).toBe(true)
        }),
      )
    })

    it("valid GEA IDs should pass (3-4 digits)", () => {
      fc.assert(
        fc.property(fc.integer({ min: 100, max: 9999 }), (num) => {
          const id = `E-GEAD-${num}`
          expect(isValidDatasetId(id)).toBe(true)
        }),
      )
    })

    it("valid BP IDs should pass", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 99999 }), (num) => {
          const id = `PRJDB${num.toString().padStart(5, "0")}`
          expect(isValidDatasetId(id)).toBe(true)
        }),
      )
    })

    it("valid METABO IDs should pass", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 999 }), (num) => {
          const id = `MTBKS${num.toString().padStart(3, "0")}`
          expect(isValidDatasetId(id)).toBe(true)
        }),
      )
    })

    it("random strings without valid prefixes should fail", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !(/^(JGAD|JGAS|DRA|ERA|SRP|SRR|SRX|SRS|E-GEAD-|PRJDB|MTBKS|hum\d)/.exec(s))),
          (input) => {
            expect(isValidDatasetId(input)).toBe(false)
          },
        ),
      )
    })
  })
})

describe("extractIdsByType", () => {
  describe("basic extraction", () => {
    it("should extract JGAD ID from text", () => {
      const result = extractIdsByType("Sample JGAD000001 data")
      expect(result.JGAD).toEqual(["JGAD000001"])
    })

    it("should extract multiple JGAD IDs", () => {
      const result = extractIdsByType("JGAD000001 and JGAD000002")
      expect(result.JGAD).toEqual(["JGAD000001", "JGAD000002"])
    })

    it("should extract mixed ID types", () => {
      const result = extractIdsByType("JGAD000001 DRA000001 E-GEAD-123")
      expect(result.JGAD).toEqual(["JGAD000001"])
      expect(result.DRA).toEqual(["DRA000001"])
      expect(result.GEA).toEqual(["E-GEAD-123"])
    })

    it("should return empty object for no matches", () => {
      const result = extractIdsByType("no valid IDs here")
      expect(result).toEqual({})
    })

    it("should handle empty string", () => {
      const result = extractIdsByType("")
      expect(result).toEqual({})
    })
  })

  describe("GEA URL handling", () => {
    it("should extract final GEA ID from URL path", () => {
      const url = "https://ddbj.nig.ac.jp/public/ddbj_database/gea/experiment/E-GEAD-1000/E-GEAD-1121/"
      const result = extractIdsByType(url)
      expect(result.GEA).toEqual(["E-GEAD-1121"])
    })

    it("should not include bucket directory ID from URL", () => {
      const url = "https://ddbj.nig.ac.jp/public/ddbj_database/gea/experiment/E-GEAD-1000/E-GEAD-1121/"
      const result = extractIdsByType(url)
      // Should NOT include E-GEAD-1000 (bucket directory)
      expect(result.GEA).not.toContain("E-GEAD-1000")
    })

    it("should extract GEA IDs from both URL and text", () => {
      const text = "See E-GEAD-999 at https://ddbj.nig.ac.jp/public/ddbj_database/gea/experiment/E-GEAD-1000/E-GEAD-1121/"
      const result = extractIdsByType(text)
      expect(result.GEA).toContain("E-GEAD-999")
      expect(result.GEA).toContain("E-GEAD-1121")
      expect(result.GEA).not.toContain("E-GEAD-1000")
    })
  })

  describe("deduplication", () => {
    it("should return same ID twice when appearing multiple times (no dedup)", () => {
      // Note: Current implementation does NOT deduplicate
      // This documents actual behavior
      const result = extractIdsByType("JGAD000001 and JGAD000001 again")
      expect(result.JGAD).toEqual(["JGAD000001", "JGAD000001"])
    })
  })
})
