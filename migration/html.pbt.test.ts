import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { renderMarkdown } from "~/public/markdown.server"

import { htmlToMarkdown } from "./html"

/**
 * The conservation law the conversion has to obey: what the renderer will
 * refuse must not be what the migration produces. Anything the converter leaves
 * as raw HTML would be dropped silently the first time the page is drawn, so
 * the two are checked against each other rather than each on its own.
 */
const FRAGMENTS = [
  "<p>ふつうの段落</p>",
  "<p>a <strong>b</strong> c</p>",
  "<p><a href=\"/faq\">link</a></p>",
  "<p>1.73m<sup>2</sup></p>",
  "<p>&nbsp;</p>",
  "<ul><li>one</li><li>two</li></ul>",
  "<ol><li>one</li></ol>",
  "<h2>heading</h2>",
  "<h1>top</h1>",
  "<u>underlined</u>",
  "<span style=\"font-size: 15pt\">styled</span>",
  "<br>",
  "<div><p>nested</p></div>",
  "<table><tbody><tr><td rowspan=\"2\">A</td><td>1</td></tr><tr><td>2</td></tr></tbody></table>",
  "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>",
  "既存の markdown の **強調**",
  "[markdown link](/nbdc-policy)",
  "| a | b |\n| - | - |\n| 1 | 2 |",
]

const source = fc.array(fc.constantFrom(...FRAGMENTS), { minLength: 1, maxLength: 6 })
  .map((parts) => parts.join("\n\n"))

const TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*[\s/>]/

describe("サイトコンテンツの変換の保存則", () => {
  it("変換の出力に生 HTML が残らない", () => {
    fc.assert(fc.property(source, (html) => {
      expect(TAG.test(htmlToMarkdown(html))).toBe(false)
    }))
  })

  it("非空の本文が空にならない", () => {
    const nonEmpty = source.filter((html) => htmlToMarkdown(html) !== "")
    fc.assert(fc.property(nonEmpty, (html) => {
      expect(renderMarkdown(htmlToMarkdown(html))).not.toBe("")
    }))
  })

  it("表のセルの中身が 1 つも落ちない", () => {
    const table = fc.tuple(
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 3 }),
    ).map(([rows, columns, span]) => {
      const cells: string[] = []
      let n = 0
      for (let r = 0; r < rows; r += 1) {
        const row: string[] = []
        for (let c = 0; c < columns; c += 1) {
          n += 1
          row.push(r === 0 && c === 0 ? `<td rowspan="${span}">v${n}</td>` : `<td>v${n}</td>`)
        }
        cells.push(`<tr>${row.join("")}</tr>`)
      }
      return { html: `<table><tbody>${cells.join("")}</tbody></table>`, count: n }
    })

    fc.assert(fc.property(table, ({ html, count }) => {
      const markdown = htmlToMarkdown(html)
      for (let i = 1; i <= count; i += 1) expect(markdown).toContain(`v${i}`)
    }))
  })
})
