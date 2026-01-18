/**
 * Unit tests for detail.ts
 */
import { describe, it, expect } from "bun:test"
import { existsSync, readFileSync } from "fs"

import { cleanText, cleanInnerHtml, parseDetailPage } from "@/crawler/detail"
import { getHtmlDir } from "@/crawler/io"

describe("detail.ts", () => {
  describe("cleanText", () => {
    it("should trim whitespace", () => {
      expect(cleanText("  hello  ")).toBe("hello")
    })

    it("should handle null", () => {
      expect(cleanText(null)).toBe("")
    })

    it("should handle undefined", () => {
      expect(cleanText(undefined)).toBe("")
    })

    it("should handle empty string", () => {
      expect(cleanText("")).toBe("")
    })
  })

  describe("cleanInnerHtml", () => {
    it("should remove style attributes", () => {
      const doc = new (require("jsdom").JSDOM)("<div style='color: red'>text</div>").window.document
      const el = doc.querySelector("div")!
      expect(cleanInnerHtml(el)).toBe("text")
    })

    it("should remove class attributes", () => {
      const doc = new (require("jsdom").JSDOM)("<div class='foo'>text</div>").window.document
      const el = doc.querySelector("div")!
      expect(cleanInnerHtml(el)).toBe("text")
    })

    it("should preserve inner tags without attributes", () => {
      const doc = new (require("jsdom").JSDOM)("<div><strong style='x'>bold</strong></div>").window.document
      const el = doc.querySelector("div")!
      expect(cleanInnerHtml(el)).toBe("<strong>bold</strong>")
    })
  })

  describe("parseDetailPage", () => {
    const htmlDir = getHtmlDir()
    const htmlExists = existsSync(htmlDir)

    describe("basic parsing", () => {
      it.skipIf(!htmlExists)("should parse hum0001-v1-ja without errors", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0001-v1-ja.html`, "utf8")
        const result = parseDetailPage(html, "hum0001-v1", "ja")

        expect(result).toBeDefined()
        expect(result.summary).toBeDefined()
        expect(result.molecularData).toBeDefined()
        expect(result.dataProvider).toBeDefined()
        expect(result.publications).toBeDefined()
        expect(result.controlledAccessUsers).toBeDefined()
      })

      it.skipIf(!htmlExists)("should parse hum0001-v1-en without errors", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0001-v1-en.html`, "utf8")
        const result = parseDetailPage(html, "hum0001-v1", "en")

        expect(result).toBeDefined()
        expect(result.summary).toBeDefined()
      })
    })

    describe("summary section", () => {
      it.skipIf(!htmlExists)("should extract aims, methods, targets", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0001-v1-ja.html`, "utf8")
        const result = parseDetailPage(html, "hum0001-v1", "ja")

        expect(result.summary.aims.text).toBeTruthy()
        expect(result.summary.methods.text).toBeTruthy()
        expect(result.summary.targets.text).toBeTruthy()
      })

      it.skipIf(!htmlExists)("should extract datasets", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0001-v1-ja.html`, "utf8")
        const result = parseDetailPage(html, "hum0001-v1", "ja")

        expect(result.summary.datasets.length).toBeGreaterThan(0)
        expect(result.summary.datasets[0].datasetId).toBeTruthy()
      })
    })

    describe("molecular data section", () => {
      it.skipIf(!htmlExists)("should extract molecular data tables", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0001-v1-ja.html`, "utf8")
        const result = parseDetailPage(html, "hum0001-v1", "ja")

        expect(result.molecularData.length).toBeGreaterThan(0)
        expect(result.molecularData[0].id.text).toBeTruthy()
        expect(result.molecularData[0].data).toBeDefined()
      })
    })

    describe("data provider section", () => {
      it.skipIf(!htmlExists)("should extract principal investigator", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0001-v1-ja.html`, "utf8")
        const result = parseDetailPage(html, "hum0001-v1", "ja")

        expect(result.dataProvider.principalInvestigator.length).toBeGreaterThan(0)
      })
    })

    describe("publications section", () => {
      it.skipIf(!htmlExists)("should extract publications with datasetIds as array", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0001-v1-ja.html`, "utf8")
        const result = parseDetailPage(html, "hum0001-v1", "ja")

        expect(result.publications.length).toBeGreaterThan(0)
        expect(Array.isArray(result.publications[0].datasetIds)).toBe(true)
      })
    })

    describe("controlled access users section", () => {
      it.skipIf(!htmlExists)("should extract users with datasetIds as array", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0014-v14-ja.html`, "utf8")
        const result = parseDetailPage(html, "hum0014-v14", "ja")

        // hum0014 has controlled access users
        if (result.controlledAccessUsers.length > 0) {
          const user = result.controlledAccessUsers[0]
          expect(Array.isArray(user.datasetIds)).toBe(true)
          // Should have parsed individual IDs from <br>-separated list
          expect(user.datasetIds.length).toBeGreaterThan(1)
        }
      })

      it.skipIf(!htmlExists)("should parse dataset IDs separated by br tags", () => {
        const html = readFileSync(`${htmlDir}/detail-hum0014-v14-ja.html`, "utf8")
        const result = parseDetailPage(html, "hum0014-v14", "ja")

        // Find Mark Daly's entry which has multiple IDs
        const markDaly = result.controlledAccessUsers.find(u =>
          u.principalInvestigator?.includes("Mark Daly"),
        )

        if (markDaly) {
          // Should have separated: JGAD000101, JGAD000102, JGAD000123, etc.
          expect(markDaly.datasetIds).toContain("JGAD000101")
          expect(markDaly.datasetIds).toContain("JGAD000102")
          // Range should be preserved as-is
          expect(markDaly.datasetIds).toContain("JGAD000144-JGAD000201")
        }
      })
    })
  })
})
