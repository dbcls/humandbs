import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { afterParts, beforeParts, diffSentences, diffText, pieces, sentences } from "./passage-diff"

/** Text drawn from a small alphabet, so the two sides share runs often. */
const text = fc.array(
  fc.constantFrom("a", "b", "cat", " ", "の", "解析", "、", "\n", "🧬", "DNA"),
  { maxLength: 40 },
).map((parts) => parts.join(""))

const joined = (parts: readonly { text: string }[]) => parts.map((part) => part.text).join("")

describe("diffText", () => {
  it("reads back as the earlier text on the one side and the later on the other", () => {
    fc.assert(fc.property(text, text, (before, after) => {
      const parts = diffText(before, after)
      expect(joined(beforeParts(parts))).toBe(before)
      expect(joined(afterParts(parts))).toBe(after)
    }))
  })

  it("marks nothing between a text and itself", () => {
    fc.assert(fc.property(text, (same) => {
      expect(diffText(same, same).every((part) => part.kind === "same")).toBe(true)
    }))
  })

  it("never leaves two runs of one kind side by side, nor an empty run", () => {
    fc.assert(fc.property(text, text, (before, after) => {
      const parts = diffText(before, after)
      for (const [at, part] of parts.entries()) {
        expect(part.text).not.toBe("")
        if (at > 0) expect(parts[at - 1]?.kind).not.toBe(part.kind)
      }
    }))
  })

  it("puts what was lost before what was gained within one change", () => {
    fc.assert(fc.property(text, text, (before, after) => {
      const parts = diffText(before, after)
      for (const [at, part] of parts.entries()) {
        if (at > 0 && part.kind === "del") expect(parts[at - 1]?.kind).not.toBe("ins")
      }
    }))
  })

  it("splits a text into pieces that put it back together", () => {
    fc.assert(fc.property(fc.string({ unit: "grapheme" }), (any) => {
      expect(pieces(any).join("")).toBe(any)
    }))
  })
})

/** Sentences drawn so that the two sides share some and not others. */
const passage = fc.array(
  fc.constantFrom("血液を解析する。", "組織を調べる。", "The data is new. ", "It grew.\n", "未確定", "1.5 倍になった。"),
  { maxLength: 8 },
).map((parts) => parts.join(""))

describe("diffSentences", () => {
  it("reads back as the earlier passage on the one side and the later on the other", () => {
    fc.assert(fc.property(passage, passage, (before, after) => {
      const rows = diffSentences(before, after)
      const left = rows.map((row) => (row.kind === "same" ? row.text : row.before ?? "")).join("")
      const right = rows.map((row) => (row.kind === "same" ? row.text : row.after ?? "")).join("")
      expect(left).toBe(before)
      expect(right).toBe(after)
    }))
  })

  it("compares piece by piece exactly the lines both sides have", () => {
    fc.assert(fc.property(passage, passage, (before, after) => {
      for (const row of diffSentences(before, after)) {
        if (row.kind === "changed") expect(row.parts !== null).toBe(row.before !== null && row.after !== null)
      }
    }))
  })

  it("marks nothing between a passage and itself", () => {
    fc.assert(fc.property(passage, (same) => {
      expect(diffSentences(same, same).every((row) => row.kind === "same")).toBe(true)
    }))
  })

  it("cuts any text into sentences that put it back together", () => {
    fc.assert(fc.property(fc.string({ unit: "grapheme" }), (any) => {
      expect(sentences(any).join("")).toBe(any)
      expect(sentences(any).every((one) => one !== "")).toBe(true)
    }))
  })
})
