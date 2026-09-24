import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { RichText } from "~/content/types"

import { folded, lineDictionary, restoreLineBreaks } from "./line-breaks"

/** Words free of HTML-significant characters, some of them written in full-width forms. */
const wordArb = fc.constantFrom("NGS", "（WGS）", "(Exome)", "メチル化アレイ", "gliomas", "ＡＢＣ", "3,156", "“x”", "ｶﾞﾝ")
const lineArb = fc.array(wordArb, { minLength: 1, maxLength: 4 }).map((words) => words.join(" "))
const linesArb = fc.array(lineArb, { minLength: 2, maxLength: 5 })

const spanArb = fc.record({ text: fc.string({ minLength: 1, maxLength: 12 }).filter((text) => !text.includes("\n")), href: fc.option(fc.constant("https://example.org/"), { nil: undefined }) })
  .map(({ text, href }) => href === undefined ? { text } : { text, href })
const richArb: fc.Arbitrary<RichText> = fc.array(fc.array(spanArb, { maxLength: 3 }), { maxLength: 4 })

/** A one-line value split into spans at arbitrary offsets, some of them links. */
function spansOf(text: string, offsets: number[]): RichText[number] {
  const cuts = [...new Set(offsets.map((n) => n % (text.length + 1)))].sort((a, b) => a - b)
  const bounds = [0, ...cuts, text.length]
  return bounds.slice(1).map((end, i) => text.slice(bounds[i], end))
    .filter((piece) => piece !== "")
    .map((piece, i) => i % 2 === 1 ? { text: piece, href: "https://example.org/" } : { text: piece })
}

function characters(rich: RichText): string {
  return folded(rich.flat().map((span) => span.text).join(""))
}

describe("restoreLineBreaks", () => {
  it("gives back the article's lines for the value v1 flattened them into, however the spans fall", () => {
    fc.assert(fc.property(linesArb, fc.array(fc.nat(), { maxLength: 4 }), (lines, offsets) => {
      const dictionary = lineDictionary([`<td>${lines.join("<br>")}</td>`])
      const flattened = lines.join(" ")

      const { rich, restored } = restoreLineBreaks([spansOf(flattened, offsets)], dictionary)

      expect(restored).toBe(1)
      expect(rich.map((line) => line.map((span) => span.text).join(""))).toEqual(lines)
    }))
  })

  it("never changes the characters or where the links point", () => {
    fc.assert(fc.property(fc.array(linesArb, { maxLength: 3 }), richArb, (blocks, rich) => {
      const dictionary = lineDictionary(blocks.map((lines) => `<td>${lines.join("<br>")}</td>`))

      const out = restoreLineBreaks(rich, dictionary).rich

      expect(characters(out)).toBe(characters(rich))
      const linked = (value: RichText) => folded(value.flat().filter((span) => span.href !== undefined).map((span) => span.text).join(""))
      expect(linked(out)).toBe(linked(rich))
      expect(out.flat().every((span) => span.text !== "" && !span.text.includes("\n"))).toBe(true)
    }))
  })

  it("leaves rich text alone when no article has more than one line", () => {
    fc.assert(fc.property(fc.array(lineArb, { maxLength: 3 }), richArb, (paragraphs, rich) => {
      const dictionary = lineDictionary(paragraphs.map((line) => `<p>${line}</p>`))

      expect(restoreLineBreaks(rich, dictionary)).toEqual({ rich, restored: 0 })
    }))
  })
})
