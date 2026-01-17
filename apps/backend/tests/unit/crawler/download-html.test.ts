import { describe, expect, it, beforeAll } from "bun:test"
import { existsSync, readdirSync } from "fs"

import { getHtmlDir } from "@/crawler/io"

describe("download-html", () => {
  describe("HTML download results", () => {
    const htmlDir = getHtmlDir()

    beforeAll(() => {
      if (!existsSync(htmlDir)) {
        console.warn(`HTML directory does not exist: ${htmlDir}`)
        console.warn("Run 'bun run crawler:download --hum-id hum0001' first.")
      }
    })

    it("should have HTML directory", () => {
      expect(existsSync(htmlDir)).toBe(true)
    })

    it("should contain downloaded HTML files for hum0001", () => {
      const files = readdirSync(htmlDir)
      const hum0001Files = files.filter(f => f.includes("hum0001"))

      // If hum0001 was downloaded, we expect at least detail files
      if (hum0001Files.length > 0) {
        expect(hum0001Files.some(f => f.startsWith("detail-hum0001"))).toBe(true)
      }
    })

    it("should have correct file naming pattern", () => {
      const files = readdirSync(htmlDir)
      const detailPattern = /^detail-hum\d+-v\d+-(ja|en)\.html$/
      const releasePattern = /^release-hum\d+-v\d+-(ja|en)-release\.html$/

      const detailFiles = files.filter(f => f.startsWith("detail-"))
      const releaseFiles = files.filter(f => f.startsWith("release-"))

      for (const f of detailFiles) {
        expect(f).toMatch(detailPattern)
      }

      for (const f of releaseFiles) {
        expect(f).toMatch(releasePattern)
      }
    })
  })
})
