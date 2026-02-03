/**
 * Tests for molecular data header mapping table
 *
 * Covers:
 * - loadMolDataMappingTable: TSV file loading
 * - buildMolDataHeaderMapping: mapping construction and caching
 * - normalizeMolDataKey: key normalization
 * - clearMappingCache: cache clearing
 */

import { describe, expect, it, beforeEach } from "bun:test"

import {
  loadMolDataMappingTable,
  buildMolDataHeaderMapping,
  normalizeMolDataKey,
  clearMappingCache,
} from "@/crawler/processors/mapping-table"

describe("processors/mapping-table.ts", () => {
  // Clear cache before each test to ensure consistent state
  beforeEach(() => {
    clearMappingCache()
  })

  // ===========================================================================
  // loadMolDataMappingTable
  // ===========================================================================
  describe("loadMolDataMappingTable", () => {
    it("should load mapping table from TSV file", () => {
      const table = loadMolDataMappingTable()
      expect(Array.isArray(table)).toBe(true)
      expect(table.length).toBeGreaterThan(0)
    })

    it("should return rows with all required fields", () => {
      const table = loadMolDataMappingTable()
      for (const row of table) {
        expect(row.ja_raw).toBeDefined()
        expect(row.en_raw).toBeDefined()
        expect(row.ja_norm).toBeDefined()
        expect(row.en_norm).toBeDefined()
      }
    })

    it("should have non-empty values in each field", () => {
      const table = loadMolDataMappingTable()
      for (const row of table) {
        expect(row.ja_raw.length).toBeGreaterThan(0)
        expect(row.en_raw.length).toBeGreaterThan(0)
        expect(row.ja_norm.length).toBeGreaterThan(0)
        expect(row.en_norm.length).toBeGreaterThan(0)
      }
    })

    it("should return consistent data structure on multiple loads", () => {
      const table1 = loadMolDataMappingTable()
      const table2 = loadMolDataMappingTable()
      expect(table1.length).toBe(table2.length)
      // Check first row content is same
      if (table1.length > 0) {
        expect(table1[0]).toEqual(table2[0])
      }
    })
  })

  // ===========================================================================
  // buildMolDataHeaderMapping
  // ===========================================================================
  describe("buildMolDataHeaderMapping", () => {
    it("should build mapping with jaMap, enMap, and normJaToEnMap", () => {
      const mapping = buildMolDataHeaderMapping()
      expect(mapping.jaMap).toBeInstanceOf(Map)
      expect(mapping.enMap).toBeInstanceOf(Map)
      expect(mapping.normJaToEnMap).toBeInstanceOf(Map)
    })

    it("should have entries in all maps", () => {
      const mapping = buildMolDataHeaderMapping()
      expect(mapping.jaMap.size).toBeGreaterThan(0)
      expect(mapping.enMap.size).toBeGreaterThan(0)
      expect(mapping.normJaToEnMap.size).toBeGreaterThan(0)
    })

    it("should return cached mapping on subsequent calls", () => {
      const mapping1 = buildMolDataHeaderMapping()
      const mapping2 = buildMolDataHeaderMapping()
      expect(mapping1).toBe(mapping2) // Same reference
    })

    it("should return fresh mapping after clearMappingCache", () => {
      const mapping1 = buildMolDataHeaderMapping()
      clearMappingCache()
      const mapping2 = buildMolDataHeaderMapping()
      expect(mapping1).not.toBe(mapping2) // Different reference
    })

    it("maps should have consistent sizes", () => {
      const mapping = buildMolDataHeaderMapping()
      const table = loadMolDataMappingTable()
      // Map size may be smaller than table length due to duplicate keys
      // (later entries overwrite earlier ones)
      expect(mapping.jaMap.size).toBeLessThanOrEqual(table.length)
      expect(mapping.enMap.size).toBeLessThanOrEqual(table.length)
      // But should have at least some entries
      expect(mapping.jaMap.size).toBeGreaterThan(0)
      expect(mapping.enMap.size).toBeGreaterThan(0)
    })

    it("jaMap should map to ja_norm values", () => {
      const mapping = buildMolDataHeaderMapping()
      const table = loadMolDataMappingTable()
      for (const row of table) {
        expect(mapping.jaMap.get(row.ja_raw)).toBe(row.ja_norm)
      }
    })

    it("enMap values should be from table (last wins for duplicates)", () => {
      const mapping = buildMolDataHeaderMapping()
      const table = loadMolDataMappingTable()
      // Build expected map with last-wins semantics
      const expectedEnMap = new Map<string, string>()
      for (const row of table) {
        expectedEnMap.set(row.en_raw, row.en_norm)
      }
      // Verify each entry in enMap matches expected
      for (const [key, value] of mapping.enMap) {
        const expected = expectedEnMap.get(key)
        expect(expected).toBeDefined()
        expect(value).toBe(expected!)
      }
    })

    it("normJaToEnMap should map ja_norm to en_norm", () => {
      const mapping = buildMolDataHeaderMapping()
      const table = loadMolDataMappingTable()
      for (const row of table) {
        expect(mapping.normJaToEnMap.get(row.ja_norm)).toBe(row.en_norm)
      }
    })
  })

  // ===========================================================================
  // normalizeMolDataKey
  // ===========================================================================
  describe("normalizeMolDataKey", () => {
    it("should normalize Japanese raw key to English normalized key", () => {
      const mapping = buildMolDataHeaderMapping()
      const table = loadMolDataMappingTable()
      if (table.length > 0) {
        const firstRow = table[0]
        const result = normalizeMolDataKey(firstRow.ja_raw, "ja", mapping)
        expect(result).toBe(firstRow.en_norm)
      }
    })

    it("should normalize English raw key to English normalized key", () => {
      const mapping = buildMolDataHeaderMapping()
      const table = loadMolDataMappingTable()
      if (table.length > 0) {
        const firstRow = table[0]
        const result = normalizeMolDataKey(firstRow.en_raw, "en", mapping)
        expect(result).toBe(firstRow.en_norm)
      }
    })

    it("should return null for unknown Japanese key", () => {
      const result = normalizeMolDataKey("unknown-key-xyz", "ja")
      expect(result).toBeNull()
    })

    it("should return null for unknown English key", () => {
      const result = normalizeMolDataKey("unknown-key-xyz", "en")
      expect(result).toBeNull()
    })

    it("should work without providing mapping (builds internally)", () => {
      const table = loadMolDataMappingTable()
      if (table.length > 0) {
        const firstRow = table[0]
        clearMappingCache()
        const result = normalizeMolDataKey(firstRow.ja_raw, "ja")
        expect(result).toBe(firstRow.en_norm)
      }
    })

    it("should handle all table entries for Japanese", () => {
      const mapping = buildMolDataHeaderMapping()
      const table = loadMolDataMappingTable()
      for (const row of table) {
        const result = normalizeMolDataKey(row.ja_raw, "ja", mapping)
        expect(result).toBe(row.en_norm)
      }
    })

    it("should handle all table entries for English (last wins for duplicates)", () => {
      const mapping = buildMolDataHeaderMapping()
      const table = loadMolDataMappingTable()
      // Build expected map with last-wins semantics
      const expectedEnMap = new Map<string, string>()
      for (const row of table) {
        expectedEnMap.set(row.en_raw, row.en_norm)
      }
      // Verify normalizeMolDataKey returns expected values
      for (const [key, expected] of expectedEnMap) {
        const result = normalizeMolDataKey(key, "en", mapping)
        expect(result).toBe(expected)
      }
    })

    describe("error cases", () => {
      it("should return null for empty string (ja)", () => {
        expect(normalizeMolDataKey("", "ja")).toBeNull()
      })

      it("should return null for empty string (en)", () => {
        expect(normalizeMolDataKey("", "en")).toBeNull()
      })

      it("should return null for whitespace only (ja)", () => {
        expect(normalizeMolDataKey("   ", "ja")).toBeNull()
      })

      it("should return null for whitespace only (en)", () => {
        expect(normalizeMolDataKey("   ", "en")).toBeNull()
      })

      it("should return null for random unicode (ja)", () => {
        expect(normalizeMolDataKey("🎉🎊🎁", "ja")).toBeNull()
      })

      it("should return null for random unicode (en)", () => {
        expect(normalizeMolDataKey("🎉🎊🎁", "en")).toBeNull()
      })
    })
  })

  // ===========================================================================
  // clearMappingCache
  // ===========================================================================
  describe("clearMappingCache", () => {
    it("should clear the cached mapping", () => {
      // First, build the mapping to populate cache
      const mapping1 = buildMolDataHeaderMapping()

      // Clear the cache
      clearMappingCache()

      // Build again - should be a new instance
      const mapping2 = buildMolDataHeaderMapping()

      expect(mapping1).not.toBe(mapping2)
    })

    it("should be safe to call multiple times", () => {
      clearMappingCache()
      clearMappingCache()
      clearMappingCache()
      // Should not throw
      const mapping = buildMolDataHeaderMapping()
      expect(mapping).toBeDefined()
    })

    it("should be safe to call before any build", () => {
      // clearMappingCache is already called in beforeEach
      // This test verifies it doesn't break subsequent operations
      const mapping = buildMolDataHeaderMapping()
      expect(mapping).toBeDefined()
      expect(mapping.jaMap.size).toBeGreaterThan(0)
    })
  })
})
