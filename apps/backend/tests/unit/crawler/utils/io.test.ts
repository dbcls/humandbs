import { describe, expect, it } from "bun:test"
import { existsSync } from "fs"
import { join } from "path"

import {
  getResultsDir,
  fileExists,
  getHtmlDir,
  getParsedDir,
  getNormalizedDir,
  getEnrichedDir,
  getExtractedDir,
  getExternalCacheDir,
  parsedFilePath,
  normalizedFilePath,
} from "@/crawler/utils/io"

describe("utils/io.ts", () => {
  // ===========================================================================
  // getResultsDir
  // ===========================================================================
  describe("getResultsDir", () => {
    it("should return a path ending with crawler-results", () => {
      const dir = getResultsDir()
      expect(dir.endsWith("crawler-results")).toBe(true)
    })

    it("should return a path under the project root (contains package.json in parent)", () => {
      const dir = getResultsDir()
      // The parent of crawler-results should contain package.json
      const projectRoot = dir.replace("/crawler-results", "")
      expect(existsSync(join(projectRoot, "package.json"))).toBe(true)
    })
  })

  // ===========================================================================
  // fileExists
  // ===========================================================================
  describe("fileExists", () => {
    it("should return true for existing file", () => {
      // package.json should exist in the project
      const projectRoot = getResultsDir().replace("/crawler-results", "")
      expect(fileExists(join(projectRoot, "package.json"))).toBe(true)
    })

    it("should return false for non-existing file", () => {
      expect(fileExists("/non-existing-path/file.txt")).toBe(false)
    })
  })

  // ===========================================================================
  // Directory path functions
  // ===========================================================================
  describe("getHtmlDir", () => {
    it("should return a path ending with html", () => {
      const dir = getHtmlDir()
      expect(dir.endsWith("html")).toBe(true)
    })

    it("should be under crawler-results", () => {
      const dir = getHtmlDir()
      expect(dir).toContain("crawler-results")
    })
  })

  describe("getParsedDir", () => {
    it("should return a path ending with detail-json", () => {
      const dir = getParsedDir()
      expect(dir.endsWith("detail-json")).toBe(true)
    })

    it("should be under crawler-results", () => {
      const dir = getParsedDir()
      expect(dir).toContain("crawler-results")
    })
  })

  describe("getNormalizedDir", () => {
    it("should return a path ending with normalized-json", () => {
      const dir = getNormalizedDir()
      expect(dir.endsWith("normalized-json")).toBe(true)
    })
  })

  describe("getEnrichedDir", () => {
    it("should return a path ending with enriched", () => {
      const dir = getEnrichedDir()
      expect(dir.endsWith("enriched")).toBe(true)
    })
  })

  describe("getExtractedDir", () => {
    it("should return a path ending with extracted", () => {
      const dir = getExtractedDir()
      expect(dir.endsWith("extracted")).toBe(true)
    })
  })

  describe("getExternalCacheDir", () => {
    it("should return a path ending with external-cache", () => {
      const dir = getExternalCacheDir()
      expect(dir.endsWith("external-cache")).toBe(true)
    })
  })

  // ===========================================================================
  // File path generation functions
  // ===========================================================================
  describe("parsedFilePath", () => {
    it("should generate correct path for Japanese", () => {
      const path = parsedFilePath("hum0001-v1", "ja")
      expect(path).toContain("detail-json")
      expect(path.endsWith("hum0001-v1-ja.json")).toBe(true)
    })

    it("should generate correct path for English", () => {
      const path = parsedFilePath("hum0001-v1", "en")
      expect(path).toContain("detail-json")
      expect(path.endsWith("hum0001-v1-en.json")).toBe(true)
    })

    it("should handle different humVersionIds", () => {
      const path = parsedFilePath("hum0100-v5", "ja")
      expect(path.endsWith("hum0100-v5-ja.json")).toBe(true)
    })
  })

  describe("normalizedFilePath", () => {
    it("should generate correct path for Japanese", () => {
      const path = normalizedFilePath("hum0001-v1", "ja")
      expect(path).toContain("normalized-json")
      expect(path.endsWith("hum0001-v1-ja.json")).toBe(true)
    })

    it("should generate correct path for English", () => {
      const path = normalizedFilePath("hum0001-v1", "en")
      expect(path).toContain("normalized-json")
      expect(path.endsWith("hum0001-v1-en.json")).toBe(true)
    })
  })

})
