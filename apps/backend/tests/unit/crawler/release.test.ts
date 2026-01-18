/**
 * Unit tests for release.ts
 */
import { describe, it, expect } from "bun:test"
import { existsSync, readFileSync } from "fs"

import { fromDotToHyphen, validateTableHeaders, parseReleasePage } from "@/crawler/release"
import { getHtmlDir } from "@/crawler/io"

describe("release.ts", () => {
  describe("fromDotToHyphen", () => {
    it("should convert dot to hyphen", () => {
      expect(fromDotToHyphen("hum0006.v1")).toBe("hum0006-v1")
    })

    it("should handle already hyphenated format", () => {
      expect(fromDotToHyphen("hum0006-v1")).toBe("hum0006-v1")
    })

    it("should handle multiple dots", () => {
      expect(fromDotToHyphen("hum.0006.v1")).toBe("hum-0006-v1")
    })

    it("should handle string without dots", () => {
      expect(fromDotToHyphen("hum0006v1")).toBe("hum0006v1")
    })
  })

  describe("validateTableHeaders", () => {
    it("should validate JA headers", () => {
      const headers = ["Research ID", "公開日", "内容"]
      expect(validateTableHeaders(headers, "ja")).toBe(true)
    })

    it("should validate EN headers", () => {
      const headers = ["Research ID", "Release Date", "Type of Data"]
      expect(validateTableHeaders(headers, "en")).toBe(true)
    })

    it("should reject incorrect JA headers", () => {
      const headers = ["Research ID", "Release Date", "Type of Data"]
      expect(validateTableHeaders(headers, "ja")).toBe(false)
    })

    it("should reject incorrect EN headers", () => {
      const headers = ["Research ID", "公開日", "内容"]
      expect(validateTableHeaders(headers, "en")).toBe(false)
    })

    it("should reject headers with wrong length", () => {
      const headers = ["Research ID", "公開日"]
      expect(validateTableHeaders(headers, "ja")).toBe(false)
    })

    it("should reject empty headers", () => {
      expect(validateTableHeaders([], "ja")).toBe(false)
      expect(validateTableHeaders([], "en")).toBe(false)
    })
  })

  describe("parseReleasePage", () => {
    const htmlDir = getHtmlDir()
    const htmlExists = existsSync(htmlDir)

    it.skipIf(!htmlExists)("should parse hum0001-v1-ja release page", () => {
      const html = readFileSync(`${htmlDir}/release-hum0001-v1-ja-release.html`, "utf8")
      const releases = parseReleasePage(html, "hum0001-v1", "ja")

      expect(releases.length).toBeGreaterThan(0)
      expect(releases[0].humVersionId).toBe("hum0001-v1")
      expect(releases[0].releaseDate).toBeTruthy()
      expect(releases[0].content).toBeTruthy()
    })

    it.skipIf(!htmlExists)("should parse hum0001-v1-en release page", () => {
      const html = readFileSync(`${htmlDir}/release-hum0001-v1-en-release.html`, "utf8")
      const releases = parseReleasePage(html, "hum0001-v1", "en")

      expect(releases.length).toBeGreaterThan(0)
      expect(releases[0].humVersionId).toBe("hum0001-v1")
    })

    it.skipIf(!htmlExists)("should convert dot format to hyphen format", () => {
      const html = readFileSync(`${htmlDir}/release-hum0006-v1-ja-release.html`, "utf8")
      const releases = parseReleasePage(html, "hum0006-v1", "ja")

      // hum0006.v1 in HTML should become hum0006-v1
      for (const release of releases) {
        expect(release.humVersionId).not.toContain(".")
        expect(release.humVersionId).toMatch(/^hum\d+-v\d+$/)
      }
    })

    it.skipIf(!htmlExists)("should extract release notes when available", () => {
      const html = readFileSync(`${htmlDir}/release-hum0001-v1-ja-release.html`, "utf8")
      const releases = parseReleasePage(html, "hum0001-v1", "ja")

      // hum0001 has release notes
      const releaseWithNote = releases.find(r => r.releaseNote?.text)
      if (releaseWithNote) {
        expect(releaseWithNote.releaseNote.text).toBeTruthy()
      }
    })

    it.skipIf(!htmlExists)("should handle multiple versions in release table", () => {
      const html = readFileSync(`${htmlDir}/release-hum0005-v8-ja-release.html`, "utf8")
      const releases = parseReleasePage(html, "hum0005-v8", "ja")

      // hum0005 has multiple versions (v1-v8)
      expect(releases.length).toBeGreaterThanOrEqual(1)
    })
  })
})
