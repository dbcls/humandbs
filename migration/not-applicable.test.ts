import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { RichText, Slot } from "~/content/types"

import { markNotApplicable } from "./not-applicable"

const prose = (...lines: string[]): Slot<RichText> => ({ state: "value", value: lines.map((line) => [{ text: line }]) })
const slot = (ja: Slot<RichText>, en: Slot<RichText>) => ({ keyId: "k", value: { kind: "text", text: { ja, en } } })

describe("markNotApplicable", () => {
  it("turns a value that is NA and nothing else into not-applicable, per language", () => {
    const { content, marked } = markNotApplicable({ values: [slot(prose("NA"), prose(" N/A "))] })

    expect(content.values[0]?.value.text).toEqual({ ja: { state: "not-applicable" }, en: { state: "not-applicable" } })
    expect(marked).toBe(2)
  })

  it("leaves NA inside a longer value, and words that answer the question", () => {
    const input = { values: [slot(prose("Illumina: NA", "Nanopore: -"), prose("none")), slot(prose("無"), prose("NAs"))] }

    expect(markNotApplicable(input)).toEqual({ content: input, marked: 0 })
  })

  it("leaves states other than a value as they are", () => {
    const input = { values: [slot({ state: "unknown" }, { state: "not-applicable" })] }

    expect(markNotApplicable(input)).toEqual({ content: input, marked: 0 })
  })

  it("changes nothing in content with no NA", () => {
    const words = fc.string({ maxLength: 12 }).filter((s) => !/^\s*(NA|N\/A)\s*$/.test(s))
    fc.assert(fc.property(fc.array(fc.tuple(words, words), { maxLength: 5 }), (pairs) => {
      const input = { values: pairs.map(([ja, en]) => slot(prose(ja), prose(en))) }
      expect(markNotApplicable(input)).toEqual({ content: input, marked: 0 })
    }))
  })
})
