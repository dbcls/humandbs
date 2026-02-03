import { describe, expect, it } from "bun:test"

import {
  DETAIL_PAGE_BASE_URL,
  HUMANDBS_BASE_URL,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  HEAD_TIMEOUT_MS,
  MAX_VERSION,
  genDetailUrl,
} from "@/crawler/config/urls"

describe("config/urls.ts", () => {
  // ===========================================================================
  // Constants
  // ===========================================================================
  describe("DETAIL_PAGE_BASE_URL", () => {
    it("should be the HumanDBs portal URL with trailing slash", () => {
      expect(DETAIL_PAGE_BASE_URL).toBe("https://humandbs.dbcls.jp/")
    })

    it("should end with a slash", () => {
      expect(DETAIL_PAGE_BASE_URL.endsWith("/")).toBe(true)
    })
  })

  describe("HUMANDBS_BASE_URL", () => {
    it("should be the HumanDBs portal URL without trailing slash", () => {
      expect(HUMANDBS_BASE_URL).toBe("https://humandbs.dbcls.jp")
    })

    it("should not end with a slash", () => {
      expect(HUMANDBS_BASE_URL.endsWith("/")).toBe(false)
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
    it("should be 32", () => {
      expect(MAX_CONCURRENCY).toBe(32)
    })
  })

  describe("HEAD_TIMEOUT_MS", () => {
    it("should be 2000ms", () => {
      expect(HEAD_TIMEOUT_MS).toBe(2000)
    })
  })

  describe("MAX_VERSION", () => {
    it("should be 50", () => {
      expect(MAX_VERSION).toBe(50)
    })
  })

  // ===========================================================================
  // genDetailUrl
  // ===========================================================================
  describe("genDetailUrl", () => {
    it("should generate Japanese detail URL correctly", () => {
      expect(genDetailUrl("hum0001-v1", "ja")).toBe("https://humandbs.dbcls.jp/hum0001-v1")
    })

    it("should generate English detail URL with /en/ prefix", () => {
      expect(genDetailUrl("hum0001-v1", "en")).toBe("https://humandbs.dbcls.jp/en/hum0001-v1")
    })

    it("should handle different humVersionIds for Japanese", () => {
      expect(genDetailUrl("hum0100-v2", "ja")).toBe("https://humandbs.dbcls.jp/hum0100-v2")
      expect(genDetailUrl("hum1234-v99", "ja")).toBe("https://humandbs.dbcls.jp/hum1234-v99")
    })

    it("should handle different humVersionIds for English", () => {
      expect(genDetailUrl("hum0100-v2", "en")).toBe("https://humandbs.dbcls.jp/en/hum0100-v2")
      expect(genDetailUrl("hum1234-v99", "en")).toBe("https://humandbs.dbcls.jp/en/hum1234-v99")
    })
  })
})
