import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { richTextArb } from "./arbitraries/content"
import { parseRichText, type RichTextSyntax } from "./parse.server"
import { toMarkdown } from "./richtext"
import type { RichText } from "./types"

/** The tree of a source the save path accepted, or nothing when it refused. */
function accepted(source: string): RichText | null {
  const result = parseRichText(source)
  return result.ok ? result.value : null
}

/** One construct prose cannot hold, written the way an author would write it. */
const REFUSABLE: { syntax: RichTextSyntax, source: string }[] = [
  { syntax: "heading", source: "# heading" },
  { syntax: "list", source: "- item" },
  { syntax: "list", source: "3. item" },
  { syntax: "quote", source: "> quoted" },
  { syntax: "code", source: "`code`" },
  { syntax: "emphasis", source: "**bold**" },
  { syntax: "emphasis", source: "~~struck~~" },
  { syntax: "table", source: "| a | b |\n| --- | --- |" },
  { syntax: "html", source: "<sup>2</sup>" },
  { syntax: "html", source: "<br>" },
  { syntax: "image", source: "![alt](/a.png)" },
  { syntax: "rule", source: "***" },
]

const plainLineArb = fc.stringMatching(/^[a-zA-Z0-9 ]{1,20}$/)

describe("what the save path accepts", () => {
  it("accepts everything the serialiser writes for prose it produced itself", () => {
    fc.assert(fc.property(richTextArb, (rich) => {
      const once = accepted(toMarkdown(rich))
      fc.pre(once !== null)
      expect(accepted(toMarkdown(once))).not.toBeNull()
    }))
  })

  it("gives back the same prose when prose it produced is saved again unchanged", () => {
    fc.assert(fc.property(richTextArb, (rich) => {
      const once = accepted(toMarkdown(rich))
      fc.pre(once !== null)
      expect(accepted(toMarkdown(once))).toEqual(once)
    }))
  })

  it("refuses a source holding a construct prose cannot hold, wherever it sits", () => {
    fc.assert(fc.property(
      fc.constantFrom(...REFUSABLE),
      fc.array(plainLineArb, { maxLength: 2 }),
      fc.array(plainLineArb, { maxLength: 2 }),
      (refusable, before, after) => {
        const source = [...before, refusable.source, ...after].join("\n\n")
        const result = parseRichText(source)
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.problems.map((problem) => problem.syntax)).toContain(refusable.syntax)
      },
    ))
  })
})

describe("the shape of what the save path produces", () => {
  it("holds no empty span and no line padded with whitespace", () => {
    fc.assert(fc.property(fc.string(), (source) => {
      const tree = accepted(source)
      fc.pre(tree !== null)
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
      const tree = accepted(source)
      fc.pre(tree !== null)
      expect(tree.at(-1)?.length ?? 1).not.toBe(0)
    }))
  })

  it("carries every reported problem with a line the author can find", () => {
    fc.assert(fc.property(fc.string(), (source) => {
      const result = parseRichText(source)
      if (result.ok) return
      const lineCount = source.split("\n").length
      for (const problem of result.problems) {
        expect(problem.line).toBeGreaterThanOrEqual(1)
        expect(problem.line).toBeLessThanOrEqual(lineCount)
      }
    }))
  })
})
