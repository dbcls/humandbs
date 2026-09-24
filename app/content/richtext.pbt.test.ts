import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { richTextArb } from "./arbitraries/content"
import { parseRichText } from "./parse.server"
import { linkHref, toMarkdown, toPlainText } from "./richtext"

/** The forms `linkHref` is allowed to hand back, and nothing else. */
const ALLOWED = /^(https?:\/\/|mailto:|#|\/(?!\/))/i

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

describe("a link right after a `!`", () => {
  const href = fc.constantFrom("https://ddbj.nig.ac.jp/", "/policies", "https://doi.org/10.1/x")
  // Words and the marks that end a sentence: a line that opens with block
  // syntax (`>`, `- `, `#`) is kept as its characters by design, link and all
  // (`parse.server.ts`), which is not what is asked here.
  const word = fc.stringMatching(/^[A-Za-z0-9ぁ-んァ-ン一-龥][A-Za-z0-9ぁ-んァ-ン一-龥!?.。、]{0,5}$/)

  it("comes back a link, not the markdown of an image written out", () => {
    fc.assert(fc.property(word, word, href, (before, text, to) => {
      const rich = [[{ text: `${before}!` }, { text, href: to }]]
      const back = parseRichText(toMarkdown(rich))
      expect(back.flat().some((span) => span.href === to && span.text === text)).toBe(true)
      expect(toPlainText(back)).toBe(toPlainText(rich))
    }))
  })
})

describe("a line holding a link", () => {
  const opener = fc.constantFrom(">", "#", "## ", "- ", "+ ", "* ", "1. ", "2) ", "```", "~~~", "> quote ")
  const href = fc.constantFrom("https://ddbj.nig.ac.jp/", "/policies")

  it("keeps its link and comes back as itself, whatever block syntax its text opens with", () => {
    fc.assert(fc.property(opener, fc.stringMatching(/^[a-z0-9]{0,4}$/), href, (start, tail, to) => {
      const rich = [[{ text: `${start}${tail}`.trim() }, { text: "L", href: to }]]
      expect(parseRichText(toMarkdown(rich))).toEqual(rich)
    }))
  })

  it("keeps its link under a line that opens a quote", () => {
    fc.assert(fc.property(fc.stringMatching(/^[a-z0-9]{1,4}$/), href, (quoted, to) => {
      const back = parseRichText(`>${quoted}\n[L](${to})`)
      expect(back[1]).toEqual([{ text: "L", href: to }])
    }))
  })
})
