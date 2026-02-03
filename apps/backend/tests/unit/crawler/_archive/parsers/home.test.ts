import { describe, expect, it } from "bun:test"
import { readFileSync } from "fs"
import { join, dirname } from "path"

import { parseHomeHtml, parseHomeTitles } from "@/crawler/parsers/home"

const fixturesDir = join(dirname(import.meta.path), "../../../fixtures/crawler")
const homeHtml = readFileSync(join(fixturesDir, "home.html"), "utf8")

describe("parsers/home.ts", () => {
  describe("parseHomeHtml", () => {
    it("should extract humIds from HTML", () => {
      const humIds = parseHomeHtml(homeHtml)

      expect(Array.isArray(humIds)).toBe(true)
      expect(humIds.length).toBeGreaterThan(0)
    })

    it("should return humIds in correct format (humNNNN)", () => {
      const humIds = parseHomeHtml(homeHtml)
      const humIdPattern = /^hum\d{4}$/

      for (const humId of humIds) {
        expect(humId).toMatch(humIdPattern)
      }
    })

    it("should return sorted humIds", () => {
      const humIds = parseHomeHtml(homeHtml)
      const sorted = [...humIds].sort()

      expect(humIds).toEqual(sorted)
    })

    it("should return unique humIds (deduplicate versions)", () => {
      const humIds = parseHomeHtml(homeHtml)
      const unique = [...new Set(humIds)]

      expect(humIds.length).toBe(unique.length)
    })

    it("should extract expected humIds from fixture", () => {
      const humIds = parseHomeHtml(homeHtml)

      expect(humIds).toContain("hum0001")
      expect(humIds).toContain("hum0002")
      expect(humIds).toContain("hum0003")
      expect(humIds).toContain("hum0100")
    })

    it("should handle both relative and absolute URLs", () => {
      const humIds = parseHomeHtml(homeHtml)
      // hum0100 has a full URL in fixture
      expect(humIds).toContain("hum0100")
      // hum0001 has a relative URL
      expect(humIds).toContain("hum0001")
    })

    it("should return empty array for empty HTML", () => {
      const humIds = parseHomeHtml("<html><body></body></html>")
      expect(humIds).toEqual([])
    })

    it("should return empty array for HTML without target table", () => {
      const html = "<html><body><table><tr><td>No target table</td></tr></table></body></html>"
      const humIds = parseHomeHtml(html)
      expect(humIds).toEqual([])
    })

    it("should return empty array for HTML with table but no valid links", () => {
      const html = `
        <html><body>
          <table id="list-of-all-researches">
            <tbody>
              <tr><th><a href="/invalid">invalid</a></th></tr>
            </tbody>
          </table>
        </body></html>
      `
      const humIds = parseHomeHtml(html)
      expect(humIds).toEqual([])
    })
  })

  describe("parseHomeTitles", () => {
    it("should extract humId to title mapping", () => {
      const mapping = parseHomeTitles(homeHtml)

      expect(typeof mapping).toBe("object")
      expect(Object.keys(mapping).length).toBeGreaterThan(0)
    })

    it("should have humId keys in correct format", () => {
      const mapping = parseHomeTitles(homeHtml)
      const humIdPattern = /^hum\d{4}$/

      for (const humId of Object.keys(mapping)) {
        expect(humId).toMatch(humIdPattern)
      }
    })

    it("should have non-empty title values", () => {
      const mapping = parseHomeTitles(homeHtml)

      for (const title of Object.values(mapping)) {
        expect(title.length).toBeGreaterThan(0)
      }
    })

    it("should extract expected titles from fixture", () => {
      const mapping = parseHomeTitles(homeHtml)

      expect(mapping.hum0001).toBe("Test Research Title 1")
      expect(mapping.hum0003).toBe("Test Research Title 3")
    })

    it("should use last occurrence for duplicate humIds (later version wins)", () => {
      const mapping = parseHomeTitles(homeHtml)
      // hum0002 appears twice (v1 and v2), last one should be used
      expect(mapping.hum0002).toBe("Test Research Title 2 (Updated)")
    })

    it("should return empty object for empty HTML", () => {
      const mapping = parseHomeTitles("<html><body></body></html>")
      expect(mapping).toEqual({})
    })

    it("should return empty object for HTML without target table", () => {
      const html = "<html><body><table><tr><td>No target table</td></tr></table></body></html>"
      const mapping = parseHomeTitles(html)
      expect(mapping).toEqual({})
    })
  })
})
