import { describe, expect, it } from "bun:test"

import {
  DETAIL_PAGE_BASE_URL,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  HEAD_TIMEOUT_MS,
  MAX_VERSION,
  SKIP_PAGES,
  SPECIAL_RELEASE_URLS,
  shouldSkipPage,
  getReleaseSuffix,
} from "@/crawler/config"

describe("config.ts", () => {
  describe("DETAIL_PAGE_BASE_URL", () => {
    it("should be the HumanDBs portal URL", () => {
      expect(DETAIL_PAGE_BASE_URL).toBe("https://humandbs.dbcls.jp/")
    })

    it("should end with a slash", () => {
      expect(DETAIL_PAGE_BASE_URL.endsWith("/")).toBe(true)
    })
  })

  describe("DEFAULT_CONCURRENCY", () => {
    it("should be a positive number", () => {
      expect(DEFAULT_CONCURRENCY).toBeGreaterThan(0)
    })

    it("should be less than or equal to MAX_CONCURRENCY", () => {
      expect(DEFAULT_CONCURRENCY).toBeLessThanOrEqual(MAX_CONCURRENCY)
    })
  })

  describe("MAX_CONCURRENCY", () => {
    it("should be a positive number", () => {
      expect(MAX_CONCURRENCY).toBeGreaterThan(0)
    })

    it("should be 32", () => {
      expect(MAX_CONCURRENCY).toBe(32)
    })
  })

  describe("HEAD_TIMEOUT_MS", () => {
    it("should be a positive number", () => {
      expect(HEAD_TIMEOUT_MS).toBeGreaterThan(0)
    })

    it("should be 2000ms", () => {
      expect(HEAD_TIMEOUT_MS).toBe(2000)
    })
  })

  describe("MAX_VERSION", () => {
    it("should be a positive number", () => {
      expect(MAX_VERSION).toBeGreaterThan(0)
    })

    it("should be 50", () => {
      expect(MAX_VERSION).toBe(50)
    })
  })

  describe("SKIP_PAGES", () => {
    it("should be an array", () => {
      expect(Array.isArray(SKIP_PAGES)).toBe(true)
    })

    it("should contain hum0003-v1 en", () => {
      const found = SKIP_PAGES.find(
        s => s.humVersionId === "hum0003-v1" && s.lang === "en",
      )
      expect(found).toBeDefined()
      expect(found?.reason).toBeTruthy()
    })

    it("should have required fields for each entry", () => {
      for (const entry of SKIP_PAGES) {
        expect(entry.humVersionId).toMatch(/^hum\d+-v\d+$/)
        expect(["ja", "en"]).toContain(entry.lang)
        expect(entry.reason).toBeTruthy()
      }
    })
  })

  describe("SPECIAL_RELEASE_URLS", () => {
    it("should be an array", () => {
      expect(Array.isArray(SPECIAL_RELEASE_URLS)).toBe(true)
    })

    it("should contain hum0329-v1 ja", () => {
      const found = SPECIAL_RELEASE_URLS.find(
        s => s.humVersionId === "hum0329-v1" && s.lang === "ja",
      )
      expect(found).toBeDefined()
      expect(found?.suffix).toBe("-release-note")
    })

    it("should have required fields for each entry", () => {
      for (const entry of SPECIAL_RELEASE_URLS) {
        expect(entry.humVersionId).toMatch(/^hum\d+-v\d+$/)
        expect(["ja", "en"]).toContain(entry.lang)
        expect(entry.suffix).toBeTruthy()
      }
    })
  })

  describe("shouldSkipPage", () => {
    it("should return true for hum0003-v1 en", () => {
      expect(shouldSkipPage("hum0003-v1", "en")).toBe(true)
    })

    it("should return false for hum0003-v1 ja", () => {
      expect(shouldSkipPage("hum0003-v1", "ja")).toBe(false)
    })

    it("should return false for normal pages", () => {
      expect(shouldSkipPage("hum0001-v1", "ja")).toBe(false)
      expect(shouldSkipPage("hum0001-v1", "en")).toBe(false)
      expect(shouldSkipPage("hum0100-v2", "ja")).toBe(false)
    })
  })

  describe("getReleaseSuffix", () => {
    it("should return -release-note for hum0329-v1 ja", () => {
      expect(getReleaseSuffix("hum0329-v1", "ja")).toBe("-release-note")
    })

    it("should return -release for hum0329-v1 en (no special case)", () => {
      expect(getReleaseSuffix("hum0329-v1", "en")).toBe("-release")
    })

    it("should return -release for normal pages", () => {
      expect(getReleaseSuffix("hum0001-v1", "ja")).toBe("-release")
      expect(getReleaseSuffix("hum0001-v1", "en")).toBe("-release")
      expect(getReleaseSuffix("hum0100-v2", "ja")).toBe("-release")
    })
  })
})
