import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { asV1Stored, sameWords } from "./research-pages"

/** Text built from what v1 rewrote and what it left. */
const pieceArb = fc.constantFrom(
  "NGS", "がん", "Exome", "a", "B", "3", " ", "\u3000", "\u00a0", "\u200b", "\n", "（", "）", "(", ")", "：", ":", "／",
  "‘", "’", "“", "”", "‐", "–", "—", "、", ",", "，", "https://example.org/",
)
const textArb = fc.array(pieceArb, { maxLength: 10 }).map((pieces) => pieces.join(""))

describe("sameWords", () => {
  it("gives what v1 stored the words of what the page wrote", () => {
    fc.assert(fc.property(textArb, (text) => {
      expect(sameWords(asV1Stored(text))).toBe(sameWords(text))
    }))
  })

  it("changes nothing the second time", () => {
    fc.assert(fc.property(textArb, (text) => {
      expect(sameWords(sameWords(text))).toBe(sameWords(text))
    }))
  })
})
