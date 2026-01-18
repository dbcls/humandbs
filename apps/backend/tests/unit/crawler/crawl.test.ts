/**
 * Unit tests for crawl.ts
 */
import { describe, it, expect } from "bun:test"
import { existsSync } from "fs"

import { findLatestVersionFromHtml, findAllHumIdsFromHtml, crawlOne } from "@/crawler/crawl"
import { getHtmlDir } from "@/crawler/io"

describe("crawl.ts", () => {
  const htmlDir = getHtmlDir()
  const htmlExists = existsSync(htmlDir)

  describe("findLatestVersionFromHtml", () => {
    it.skipIf(!htmlExists)("should find latest version for existing humId", () => {
      // hum0001 should have at least v1
      const version = findLatestVersionFromHtml("hum0001")
      expect(version).toBeGreaterThanOrEqual(1)
    })

    it("should return 0 for non-existent humId", () => {
      const version = findLatestVersionFromHtml("hum9999")
      expect(version).toBe(0)
    })
  })

  describe("findAllHumIdsFromHtml", () => {
    it.skipIf(!htmlExists)("should find humIds from HTML files", () => {
      const humIds = findAllHumIdsFromHtml()
      expect(humIds.length).toBeGreaterThan(0)
      expect(humIds[0]).toMatch(/^hum\d+$/)
    })

    it.skipIf(!htmlExists)("should return sorted humIds", () => {
      const humIds = findAllHumIdsFromHtml()
      const sorted = [...humIds].sort()
      expect(humIds).toEqual(sorted)
    })
  })

  describe("crawlOne", () => {
    // Note: crawlOne writes files, so actual parsing tests are in integration tests

    it("should handle missing HTML file", () => {
      const result = crawlOne("hum9999-v1", "ja")
      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })

    it("should return error for invalid humVersionId format", () => {
      const result = crawlOne("invalid", "ja")
      expect(result.success).toBe(false)
    })
  })

  describe("findLatestVersionFromHtml edge cases", () => {
    it("should return 0 for empty string humId", () => {
      const version = findLatestVersionFromHtml("")
      expect(version).toBe(0)
    })

    it("should return 0 for humId with invalid format", () => {
      const version = findLatestVersionFromHtml("invalid-id")
      expect(version).toBe(0)
    })
  })

  describe("findAllHumIdsFromHtml edge cases", () => {
    it.skipIf(!htmlExists)("should not include duplicate humIds", () => {
      const humIds = findAllHumIdsFromHtml()
      const uniqueIds = new Set(humIds)
      expect(humIds.length).toBe(uniqueIds.size)
    })

    it.skipIf(!htmlExists)("should only include valid humId format", () => {
      const humIds = findAllHumIdsFromHtml()
      for (const id of humIds) {
        expect(id).toMatch(/^hum\d+$/)
      }
    })
  })
})
