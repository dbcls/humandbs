import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Element } from "hast"

import { parseFragment, recoverRichText, richTextFromCell } from "./richtext-html"
import { richTextFromMarkdown } from "./richtext"

/**
 * Words free of markdown- and HTML-significant characters, so a line built
 * out of them means the same thing whether it is read as v1's flattened
 * `text` or as the `rawHtml` it came from — the property under test is the
 * recovery, not the parsers underneath it.
 */
const wordArb = fc.constantFrom(
  "apple", "banana", "word_with_underscore", "word-with-dash", "日本語", "café123", "dog",
)
const lineArb = fc.array(wordArb, { minLength: 1, maxLength: 4 }).map((words) => words.join(" "))
const linesArb = fc.array(lineArb, { minLength: 1, maxLength: 5 })
const langArb = fc.constantFrom<"ja" | "en">("ja", "en")

/** What v1 would have flattened these lines into, joining them with a space. */
function flattenedText(lines: string[]): string {
  return lines.join(" ")
}

/** What `rawHtml` looks like when it still has the line breaks `text` lost. */
function toRawHtml(lines: string[]): string {
  return `<span>${lines.join("<br>")}</span>`
}

function plain(value: ReturnType<typeof recoverRichText>["value"]): string {
  return value.map((line) => line.map((span) => span.text).join("")).join(" ")
}

describe("recoverRichText", () => {
  it("recovers every word of a `text` that its rawHtml agrees with", () => {
    fc.assert(fc.property(linesArb, langArb, (lines, lang) => {
      const text = flattenedText(lines)
      const result = recoverRichText({ text, rawHtml: toRawHtml(lines), lang })
      expect(result.source).toBe("rawHtml")
      expect(plain(result.value)).toBe(text)
    }))
  })

  it("never holds fewer lines than parsing the flattened `text` on its own would", () => {
    fc.assert(fc.property(linesArb, langArb, (lines, lang) => {
      const text = flattenedText(lines)
      const result = recoverRichText({ text, rawHtml: toRawHtml(lines), lang })
      expect(result.value.length).toBeGreaterThanOrEqual(richTextFromMarkdown(text).length)
    }))
  })
})

/** A part of a cell's line: words, or a link whose destination v2 may not have. */
interface Part { words: string, link: "none" | "article" | "anchor" | "external" }

const partArb: fc.Arbitrary<Part> = fc.record({
  words: fc.constantFrom("こちら", "The way to Process", "JGAS000504", "形質数：220", "apple"),
  link: fc.constantFrom<Part["link"]>("none", "article", "anchor", "external"),
})
const cellLinesArb = fc.array(fc.array(partArb, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 3 })
/** Where v1's text pointed the words of a link: nowhere, v2's page, the old portal's page, or another site. */
const v1AddressArb = fc.constantFrom(null, "/processed-data-wgs", "/en/processed-data-wgs", "/hum0197-v3-220", "https://ddbj.nig.ac.jp/")

function cellHtml(lines: Part[][]): string {
  const href = { article: "index.php?option=com_content&amp;id=2278", anchor: "#JGAS000504", external: "https://example.org/" }
  return lines.map((parts) => `<p>${parts.map((part, at) =>
    `${at > 0 ? " " : ""}${part.link === "none" ? part.words : `<a href="${href[part.link]}">${part.words}</a>`}`).join("")}</p>`).join("")
}

function v1Text(lines: Part[][], addresses: (string | null)[]): string {
  let next = 0
  return lines.map((parts) => parts.map((part) => {
    const address = addresses[next++ % addresses.length] ?? null
    return part.link === "none" || address === null ? part.words : `[${part.words}](${address})`
  }).join(" ")).join("\n")
}

describe("a link of the page that names no v2 destination", () => {
  it("keeps the cell's words as they are, whatever address v1's text gave them", () => {
    fc.assert(fc.property(cellLinesArb, fc.array(v1AddressArb, { minLength: 1, maxLength: 6 }), fc.constantFrom<"ja" | "en">("ja", "en"), (lines, addresses, lang) => {
      const cell = parseFragment(`<div>${cellHtml(lines)}</div>`).children[0] as Element
      const result = recoverRichText({ text: v1Text(lines, addresses), rawHtml: null, lang }, { pageCell: () => cell, sitePages: new Set(["processed-data-wgs"]) })

      expect(plain(result.value)).toBe(plain(richTextFromCell(cell).value))
    }))
  })

  it("links only to an address the page resolved or one v2 has that v1's text gave", () => {
    fc.assert(fc.property(cellLinesArb, fc.array(v1AddressArb, { minLength: 1, maxLength: 6 }), (lines, addresses) => {
      const cell = parseFragment(`<div>${cellHtml(lines)}</div>`).children[0] as Element
      const result = recoverRichText({ text: v1Text(lines, addresses), rawHtml: null, lang: "ja" }, { pageCell: () => cell, sitePages: new Set(["processed-data-wgs"]) })
      const hrefs = result.value.flatMap((line) => line.flatMap((span) => span.href === undefined ? [] : [span.href]))

      expect(hrefs.every((href) => ["https://example.org/", "/processed-data-wgs", "/en/processed-data-wgs", "https://ddbj.nig.ac.jp/"].includes(href))).toBe(true)
    }))
  })
})
