import { describe, expect, it } from "bun:test"
import { JSDOM } from "jsdom"

import {
  fromDotToHyphen,
  validateTableHeaders,
  parseReleaseTable,
  findReleaseDetails,
  parseReleasePage,
} from "@/crawler/parsers/release"
import type { RawRelease } from "@/crawler/types"

describe("parsers/release.ts", () => {
  // ===========================================================================
  // fromDotToHyphen
  // ===========================================================================
  describe("fromDotToHyphen", () => {
    it("should convert dot to hyphen in version format", () => {
      expect(fromDotToHyphen("hum0006.v1")).toBe("hum0006-v1")
    })

    it("should convert multiple dots to hyphens", () => {
      expect(fromDotToHyphen("hum0006.v1.extra")).toBe("hum0006-v1-extra")
    })

    it("should return unchanged string without dots", () => {
      expect(fromDotToHyphen("hum0006-v1")).toBe("hum0006-v1")
    })

    it("should handle empty string", () => {
      expect(fromDotToHyphen("")).toBe("")
    })
  })

  // ===========================================================================
  // validateTableHeaders
  // ===========================================================================
  describe("validateTableHeaders", () => {
    it("should return true for valid Japanese headers", () => {
      const headers = ["Research ID", "公開日", "内容"]
      expect(validateTableHeaders(headers, "ja")).toBe(true)
    })

    it("should return true for valid English headers", () => {
      const headers = ["Research ID", "Release Date", "Type of Data"]
      expect(validateTableHeaders(headers, "en")).toBe(true)
    })

    it("should return false for invalid Japanese headers", () => {
      const headers = ["研究ID", "日付", "内容"]
      expect(validateTableHeaders(headers, "ja")).toBe(false)
    })

    it("should return false for invalid English headers", () => {
      const headers = ["ID", "Date", "Data"]
      expect(validateTableHeaders(headers, "en")).toBe(false)
    })

    it("should return false for wrong number of headers", () => {
      const headers = ["Research ID", "公開日"]
      expect(validateTableHeaders(headers, "ja")).toBe(false)
    })
  })

  // ===========================================================================
  // parseReleaseTable
  // ===========================================================================
  describe("parseReleaseTable", () => {
    it("should parse release table with valid data", () => {
      const html = `
        <table>
          <thead>
            <tr>
              <th>Research ID</th>
              <th>公開日</th>
              <th>内容</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>hum0001.v1</td>
              <td>2024/1/15</td>
              <td>初回リリース</td>
            </tr>
            <tr>
              <td>hum0001.v2</td>
              <td>2024/6/20</td>
              <td>データ追加</td>
            </tr>
          </tbody>
        </table>
      `
      const dom = new JSDOM(html)
      const table = dom.window.document.querySelector("table")!

      const result = parseReleaseTable(table, "ja", "hum0001-v2")

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        humVersionId: "hum0001.v1",
        releaseDate: "2024/1/15",
        content: "初回リリース",
      })
      expect(result[1]).toEqual({
        humVersionId: "hum0001.v2",
        releaseDate: "2024/6/20",
        content: "データ追加",
      })
    })

    it("should skip rows with less than 3 cells", () => {
      const html = `
        <table>
          <thead>
            <tr>
              <th>Research ID</th>
              <th>公開日</th>
              <th>内容</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>hum0001.v1</td>
              <td>2024/1/15</td>
            </tr>
            <tr>
              <td>hum0001.v2</td>
              <td>2024/6/20</td>
              <td>データ追加</td>
            </tr>
          </tbody>
        </table>
      `
      const dom = new JSDOM(html)
      const table = dom.window.document.querySelector("table")!

      const result = parseReleaseTable(table, "ja", "hum0001-v2")

      expect(result).toHaveLength(1)
      expect(result[0].humVersionId).toBe("hum0001.v2")
    })

    it("should return empty array for table without tbody", () => {
      const html = `
        <table>
          <thead>
            <tr>
              <th>Research ID</th>
              <th>公開日</th>
              <th>内容</th>
            </tr>
          </thead>
        </table>
      `
      const dom = new JSDOM(html)
      const table = dom.window.document.querySelector("table")!

      const result = parseReleaseTable(table, "ja", "hum0001-v1")

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // findReleaseDetails
  // ===========================================================================
  describe("findReleaseDetails", () => {
    it("should attach release notes to matching releases", () => {
      const html = `
        <div>
          <p>hum0001.v1</p>
          <p>This is the first release with initial data.</p>
          <p>Additional details about v1.</p>
          <p>hum0001.v2</p>
          <p>Second release with more data.</p>
        </div>
      `
      const dom = new JSDOM(html)
      const container = dom.window.document.querySelector("div") as Element

      const releases: Partial<RawRelease>[] = [
        { humVersionId: "hum0001.v1", releaseDate: "2024/1/15", content: "初回" },
        { humVersionId: "hum0001.v2", releaseDate: "2024/6/20", content: "追加" },
      ]

      findReleaseDetails(container, releases, "hum0001-v2", "en")

      expect(releases[0].releaseNote).toBeDefined()
      expect(releases[0].releaseNote?.text).toContain("first release")
      expect(releases[0].releaseNote?.text).toContain("Additional details")

      expect(releases[1].releaseNote).toBeDefined()
      expect(releases[1].releaseNote?.text).toContain("Second release")
    })

    it("should stop at Note: section", () => {
      const html = `
        <div>
          <p>hum0001.v1</p>
          <p>Release note content.</p>
          <p>Note: This is a footnote.</p>
          <p>More footnote content.</p>
        </div>
      `
      const dom = new JSDOM(html)
      const container = dom.window.document.querySelector("div") as Element

      const releases: Partial<RawRelease>[] = [
        { humVersionId: "hum0001.v1", releaseDate: "2024/1/15", content: "初回" },
      ]

      findReleaseDetails(container, releases, "hum0001-v1", "en")

      expect(releases[0].releaseNote?.text).toContain("Release note content")
      expect(releases[0].releaseNote?.text).not.toContain("footnote")
    })

    it("should handle releases without detail sections", () => {
      const html = `
        <div>
          <p>Some unrelated content</p>
        </div>
      `
      const dom = new JSDOM(html)
      const container = dom.window.document.querySelector("div") as Element

      const releases: Partial<RawRelease>[] = [
        { humVersionId: "hum0001.v1", releaseDate: "2024/1/15", content: "初回" },
      ]

      findReleaseDetails(container, releases, "hum0001-v1", "en")

      expect(releases[0].releaseNote).toBeUndefined()
    })
  })

  // ===========================================================================
  // parseReleasePage
  // ===========================================================================
  describe("parseReleasePage", () => {
    it("should parse complete release page", () => {
      const html = `
        <html>
          <body>
            <div id="jsn-mainbody">
              <div class="item-page">
                <div class="articleBody">
                  <table>
                    <thead>
                      <tr>
                        <th>Research ID</th>
                        <th>公開日</th>
                        <th>内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>hum0001.v1</td>
                        <td>2024/1/15</td>
                        <td>初回リリース</td>
                      </tr>
                    </tbody>
                  </table>
                  <p>hum0001.v1</p>
                  <p>詳細なリリースノートです。</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `

      const result = parseReleasePage(html, "hum0001-v1", "ja")

      expect(result).toHaveLength(1)
      expect(result[0].humVersionId).toBe("hum0001-v1")
      expect(result[0].releaseDate).toBe("2024/1/15")
      expect(result[0].content).toBe("初回リリース")
      expect(result[0].releaseNote?.text).toContain("詳細なリリースノート")
    })

    it("should convert dot to hyphen in humVersionId", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <table>
                <thead>
                  <tr>
                    <th>Research ID</th>
                    <th>Release Date</th>
                    <th>Type of Data</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>hum0001.v1</td>
                    <td>2024/1/15</td>
                    <td>Initial release</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseReleasePage(html, "hum0001-v1", "en")

      expect(result[0].humVersionId).toBe("hum0001-v1")
    })

    it("should return empty array when no container found", () => {
      const html = "<html><body><div>No article body</div></body></html>"

      const result = parseReleasePage(html, "hum0001-v1", "ja")

      expect(result).toEqual([])
    })

    it("should return empty array when no table found", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <p>No table here</p>
            </div>
          </body>
        </html>
      `

      const result = parseReleasePage(html, "hum0001-v1", "ja")

      expect(result).toEqual([])
    })

    it("should return empty array when table has no data rows", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <table>
                <thead>
                  <tr>
                    <th>Research ID</th>
                    <th>公開日</th>
                    <th>内容</th>
                  </tr>
                </thead>
                <tbody>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseReleasePage(html, "hum0001-v1", "ja")

      expect(result).toEqual([])
    })

    it("should exclude releaseNote when not present", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <table>
                <thead>
                  <tr>
                    <th>Research ID</th>
                    <th>公開日</th>
                    <th>内容</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>hum0001.v1</td>
                    <td>2024/1/15</td>
                    <td>初回リリース</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseReleasePage(html, "hum0001-v1", "ja")

      expect(result).toHaveLength(1)
      expect(result[0].releaseNote).toBeUndefined()
    })
  })
})
