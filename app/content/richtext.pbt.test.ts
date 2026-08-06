import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { richTextArb } from "./arbitraries/content"
import { linkHref, toMarkdown, toPlainText } from "./richtext"

/** The forms `linkHref` is allowed to hand back, and nothing else. */
const ALLOWED = /^(https?:\/\/|mailto:|\/(?!\/))/i

/** Empty prose serialises to one empty line rather than to no line at all. */
function lineCount(text: string): number {
  return text.split("\n").length
}

describe("toPlainText", () => {
  it("writes exactly one line per line of the tree", () => {
    fc.assert(fc.property(richTextArb, (rich) => {
      expect(lineCount(toPlainText(rich))).toBe(Math.max(rich.length, 1))
    }))
  })

  it("carries the text of the spans and nothing besides the line breaks", () => {
    fc.assert(fc.property(richTextArb, (rich) => {
      const spans = rich.flatMap((line) => line.map((span) => span.text)).join("")
      expect(toPlainText(rich).replaceAll("\n", "")).toBe(spans)
    }))
  })
})

describe("toMarkdown", () => {
  it("writes exactly one line per line of the tree, however the text escapes", () => {
    fc.assert(fc.property(richTextArb, (rich) => {
      expect(lineCount(toMarkdown(rich))).toBe(Math.max(rich.length, 1))
    }))
  })
})

describe("linkHref", () => {
  it("hands back only a destination the page may follow", () => {
    fc.assert(fc.property(fc.string(), (href) => {
      const resolved = linkHref(href)
      if (resolved !== null) expect(ALLOWED.test(resolved)).toBe(true)
    }))
  })

  it("refuses a destination naming any scheme but those", () => {
    const scheme = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9+.-]{0,10}$/)
    fc.assert(fc.property(scheme, fc.string(), (name, rest) => {
      const lowered = name.toLowerCase()
      if (lowered === "http" || lowered === "https" || lowered === "mailto") return
      expect(linkHref(`${name}:${rest}`)).toBeNull()
    }))
  })
})
