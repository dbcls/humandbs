import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { richTextFromMarkdown, richTextFromPlain } from "./richtext"

/**
 * Markdown built out of pieces, so that the walk is asked about headings,
 * lists, raw HTML and escapes rather than only about the letters `fc.string`
 * happens to draw.
 */
const markdownArb = fc.array(
  fc.constantFrom(
    "text", "対象", "  ", "\n", "\n\n", "#", "## ", "- ", "1. ", "> ", "**", "_", "`",
    "[a](/b)", "[](x)", "<br>", "<sup>2</sup>", "\\<", "|", "    indented", "---",
  ),
  { maxLength: 12 },
).map((parts) => parts.join(""))

const sourceArb = fc.oneof(markdownArb, fc.string())

describe("richTextFromMarkdown", () => {
  it("never puts a newline inside a span, whatever the source holds", () => {
    fc.assert(fc.property(sourceArb, (source) => {
      for (const line of richTextFromMarkdown(source)) {
        for (const span of line) expect(span.text).not.toContain("\n")
      }
    }))
  })

  it("never emits a span with no text, which would render as nothing", () => {
    fc.assert(fc.property(sourceArb, (source) => {
      for (const line of richTextFromMarkdown(source)) {
        for (const span of line) expect(span.text).not.toBe("")
      }
    }))
  })

  it("leaves no blank line at either end", () => {
    fc.assert(fc.property(sourceArb, (source) => {
      const rich = richTextFromMarkdown(source)
      if (rich.length === 0) return
      expect(rich.at(0)?.length).not.toBe(0)
      expect(rich.at(-1)?.length).not.toBe(0)
    }))
  })
})

describe("richTextFromPlain", () => {
  it("keeps every line of the value it was given", () => {
    fc.assert(fc.property(fc.string(), (value) => {
      const lines = richTextFromPlain(value).map((line) => line.map((s) => s.text).join(""))
      expect(lines).toEqual(value.split("\n").map((line) => line.trim()).filter((l) => l !== ""))
    }))
  })
})
