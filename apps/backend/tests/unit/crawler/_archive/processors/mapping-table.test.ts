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
  })

  // ===========================================================================
  // normalizeMolDataKey
  // ===========================================================================
  describe("normalizeMolDataKey", () => {
    it("should normalize Japanese raw key to English normalized key", () => {
      const mapping = buildMolDataHeaderMapping()
      // Find a key to test with
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
  })
})
