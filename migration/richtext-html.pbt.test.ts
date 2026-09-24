import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { recoverRichText } from "./richtext-html"
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
