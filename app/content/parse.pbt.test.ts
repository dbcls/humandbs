import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { richTextArb } from "./arbitraries/content"
import { parseRichText } from "./parse.server"
import { toMarkdown, toPlainText } from "./richtext"

/** One construct prose cannot hold, written the way an author would write it. */
const KEPT_AS_WRITTEN = [
  "# heading",
  "- item",
  "3. item",
  "> quoted",
  "`code`",
  "**bold**",
  "~~struck~~",
  "| a | b |\n| --- | --- |",
  "<sup>2</sup>",
  "<br>",
  "![alt](/a.png)",
  "***",
]

const plainLineArb = fc.stringMatching(/^[a-zA-Z0-9 ]{1,20}$/)

describe("what the save path produces", () => {
  it("gives back the same prose when prose it produced is saved again unchanged", () => {
    fc.assert(fc.property(richTextArb, (rich) => {
      const once = parseRichText(toMarkdown(rich))
      expect(parseRichText(toMarkdown(once))).toEqual(once)
    }))
  })

  it("keeps a construct prose cannot hold as the characters written, wherever it sits", () => {
    fc.assert(fc.property(
      fc.constantFrom(...KEPT_AS_WRITTEN),
      fc.array(plainLineArb, { maxLength: 2 }),
      fc.array(plainLineArb, { maxLength: 2 }),
      (kept, before, after) => {
        const source = [...before, kept, ...after].join("\n\n")
        expect(toPlainText(parseRichText(source))).toContain(kept)
      },
    ))
  })
})

describe("the shape of what the save path produces", () => {
  it("holds no empty span and no line padded with whitespace", () => {
    fc.assert(fc.property(fc.string(), (source) => {
      const tree = parseRichText(source)
      for (const line of tree) {
        for (const span of line) {
          expect(span.text).not.toBe("")
          expect(span.text).not.toContain("\n")
        }
        const first = line[0]
        const last = line.at(-1)
        if (first !== undefined) expect(first.text).toBe(first.text.replace(/^\s+/, ""))
        if (last !== undefined) expect(last.text).toBe(last.text.replace(/\s+$/, ""))
      }
    }))
  })

  it("never ends on an empty line, so trailing blank lines do not accumulate", () => {
    fc.assert(fc.property(fc.string(), (source) => {
      expect(parseRichText(source).at(-1)?.length ?? 1).not.toBe(0)
    }))
  })
})
