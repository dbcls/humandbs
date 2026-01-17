import { describe, expect, it, afterEach } from "bun:test"
import { existsSync, rmSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import {
  genDetailUrl,
  genReleaseUrl,
  ensureDir,
  getResultsDirPath,
} from "@/crawler/io"

describe("io.ts", () => {
  describe("genDetailUrl", () => {
    it("should generate Japanese detail URL", () => {
      const url = genDetailUrl("hum0001-v1", "ja")
      expect(url).toBe("https://humandbs.dbcls.jp/hum0001-v1")
    })

    it("should generate English detail URL", () => {
      const url = genDetailUrl("hum0001-v1", "en")
      expect(url).toBe("https://humandbs.dbcls.jp/en/hum0001-v1")
    })

    it("should handle different humVersionIds", () => {
      expect(genDetailUrl("hum0123-v2", "ja")).toBe("https://humandbs.dbcls.jp/hum0123-v2")
      expect(genDetailUrl("hum0456-v10", "en")).toBe("https://humandbs.dbcls.jp/en/hum0456-v10")
    })
  })

  describe("genReleaseUrl", () => {
    it("should generate Japanese release URL", () => {
      const url = genReleaseUrl("hum0001-v1", "ja")
      expect(url).toBe("https://humandbs.dbcls.jp/hum0001-v1-release")
    })

    it("should generate English release URL", () => {
      const url = genReleaseUrl("hum0001-v1", "en")
      expect(url).toBe("https://humandbs.dbcls.jp/en/hum0001-v1-release")
    })

    it("should handle hum0329-v1 special case (ja)", () => {
      const url = genReleaseUrl("hum0329-v1", "ja")
      expect(url).toBe("https://humandbs.dbcls.jp/hum0329-v1-release-note")
    })

    it("should not apply hum0329-v1 special case for English", () => {
      const url = genReleaseUrl("hum0329-v1", "en")
      expect(url).toBe("https://humandbs.dbcls.jp/en/hum0329-v1-release")
    })
  })

  describe("ensureDir", () => {
    const testDir = join(tmpdir(), "humandbs-test-ensure-dir")

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
    })

    it("should create directory if it does not exist", () => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
      expect(existsSync(testDir)).toBe(false)
      ensureDir(testDir)
      expect(existsSync(testDir)).toBe(true)
    })

    it("should not throw if directory already exists", () => {
      mkdirSync(testDir, { recursive: true })
      expect(() => ensureDir(testDir)).not.toThrow()
    })
  })

  describe("getResultsDirPath", () => {
    it("should return path ending with crawler-results", () => {
      const path = getResultsDirPath()
      expect(path.endsWith("crawler-results")).toBe(true)
    })

    it("should return consistent path", () => {
      const path1 = getResultsDirPath()
      const path2 = getResultsDirPath()
      expect(path1).toBe(path2)
    })
  })
})
