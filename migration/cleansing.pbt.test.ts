import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { RichText } from "~/content/types"

import { cleanseCharacters, cleanseContent, cleanseEnglish, cleansePunctuation, cleanseRich, noCounts, pairedBrackets } from "./cleansing"

/** Text built from the characters the rules act on, and ones they must leave. */
const pieceArb = fc.constantFrom(
  "a", "B", "3", "ＡＢ", "１２", "⽇", " ", "　", " ", "\\_", "（", "）", "、", "がん", "\u0005", "\t", "-", "こ\u3099", "\u309a",
)
const textArb = fc.array(pieceArb, { maxLength: 6 }).map((pieces) => pieces.join(""))
const spanArb = fc.record({ text: textArb, href: fc.option(fc.constant("https://example.org/ＡＢ"), { nil: undefined }) })
  .map(({ text, href }) => href === undefined ? { text } : { text, href })
const richArb: fc.Arbitrary<RichText> = fc.array(fc.array(spanArb, { maxLength: 3 }), { maxLength: 6 })

function isEditorShape(rich: RichText): boolean {
  return rich.every((line, i) =>
    line.every((span) => span.text !== "")
    && !/^\s/.test(line[0]?.text ?? "") && !/\s$/.test(line.at(-1)?.text ?? "")
    && !(line.length === 0 && (i === 0 || i === rich.length - 1 || rich[i - 1]?.length === 0)))
}

describe("cleanseRich", () => {
  it("returns prose in the shape the editor saves it in", () => {
    fc.assert(fc.property(richArb, (rich) => {
      expect(isEditorShape(cleanseRich(rich, noCounts()))).toBe(true)
    }))
  })

  it("changes nothing the second time", () => {
    fc.assert(fc.property(richArb, (rich) => {
      const once = cleanseRich(rich, noCounts())
      expect(cleanseRich(once, noCounts())).toEqual(once)
    }))
  })

  it("keeps every character other than spaces, in order, and every link", () => {
    fc.assert(fc.property(richArb, (rich) => {
      const visible = (r: RichText) => r.flat().map((span) => span.text).join("").replace(/\s/g, "")
      const links = (r: RichText) => r.flat().filter((span) => span.href !== undefined && span.text.trim() !== "").map((span) => span.href)
      const out = cleanseRich(rich, noCounts())
      expect(visible(out)).toBe(visible(rich))
      expect(links(out)).toEqual(links(rich))
    }))
  })
})

describe("cleanseCharacters", () => {
  it("changes nothing the second time", () => {
    fc.assert(fc.property(textArb, (text) => {
      const once = cleanseCharacters(text, noCounts())
      expect(cleanseCharacters(once, noCounts())).toBe(once)
    }))
  })

  it("leaves no full-width letter, digit, slash or space, Kangxi radical or control character other than a tab", () => {
    fc.assert(fc.property(textArb, (text) => {
      // eslint-disable-next-line no-control-regex
      expect(cleanseCharacters(text, noCounts())).not.toMatch(/[０-９Ａ-Ｚａ-ｚ／\u3000⼀-⿟\u0000-\u0008\u000b-\u001f]/)
    }))
  })

  it("leaves no kana and voicing mark that are one letter apart", () => {
    fc.assert(fc.property(textArb, (text) => {
      const pairs = cleanseCharacters(text, noCounts()).match(/[\u3041-\u30ff][\u3099\u309a]/g) ?? []
      expect(pairs.filter((pair) => pair.normalize("NFC").length === 1)).toEqual([])
    }))
  })
})

/** Text of brackets of both widths among words. */
const bracketsArb = fc.array(fc.constantFrom("（", "）", "(", ")", "a", "がん", " "), { maxLength: 12 }).map((pieces) => pieces.join(""))

describe("pairedBrackets", () => {
  it("changes only the width of closing brackets", () => {
    fc.assert(fc.property(bracketsArb, (text) => {
      const folded = (s: string) => s.replace(/）/g, ")")
      expect(folded(pairedBrackets(text, noCounts()))).toBe(folded(text))
    }))
  })

  it("changes nothing the second time", () => {
    fc.assert(fc.property(bracketsArb, (text) => {
      const once = pairedBrackets(text, noCounts())
      const counts = noCounts()
      expect(pairedBrackets(once, counts)).toBe(once)
      expect(counts.brackets).toBe(0)
    }))
  })

  it("leaves text whose brackets all have one width as it is", () => {
    fc.assert(fc.property(bracketsArb, (text) => {
      const half = text.replace(/（/g, "(").replace(/）/g, ")")
      expect(pairedBrackets(half, noCounts())).toBe(half)
    }))
  })
})

describe("cleanseEnglish", () => {
  it("leaves no full-width bracket and no space inside a bracket", () => {
    fc.assert(fc.property(bracketsArb, (text) => {
      const out = cleanseEnglish(text, noCounts())
      expect(out).not.toMatch(/[（）]|\( | \)/)
    }))
  })

  it("changes nothing the second time", () => {
    fc.assert(fc.property(bracketsArb, (text) => {
      const once = cleanseEnglish(text, noCounts())
      expect(cleanseEnglish(once, noCounts())).toBe(once)
    }))
  })
})

describe("cleanseContent", () => {
  const pairArb = fc.record({
    ja: fc.record({ state: fc.constant("value" as const), value: richArb }),
    en: fc.record({ state: fc.constant("value" as const), value: richArb }),
  })

  it("changes nothing the second time", () => {
    fc.assert(fc.property(fc.array(pairArb, { maxLength: 3 }), (pairs) => {
      const once = cleanseContent({ values: pairs }).content
      expect(cleanseContent(once).content).toEqual(once)
    }))
  })

  it("never changes a link's address", () => {
    fc.assert(fc.property(fc.array(pairArb, { maxLength: 3 }), (pairs) => {
      const hrefs = (node: unknown) => new Set(JSON.stringify(node).match(/"href":"[^"]*"/g) ?? [])
      const before = hrefs({ values: pairs })
      for (const href of hrefs(cleanseContent({ values: pairs }).content)) expect(before.has(href)).toBe(true)
    }))
  })
})

const punctuationArb = fc.array(fc.constantFrom("a", "が", "ー", "−", " ", "‘", "’", "“", "”", "‐", "‑", "‒", "–", "—", "―", "－", "'", "\"", "-"), { maxLength: 8 })
  .map((pieces) => pieces.join(""))

describe("cleansePunctuation", () => {
  it("leaves no typographic quote mark or dash, keeps every other character, and changes nothing the second time", () => {
    fc.assert(fc.property(punctuationArb, (text) => {
      const once = cleansePunctuation(text, noCounts())
      expect(once).not.toMatch(/[‘’“”‐‑‒–—―－]/)
      expect(once.length).toBe(text.length)
      expect(once.replace(/['"-]/g, "")).toBe(text.replace(/[‘’“”‐‑‒–—―－'"-]/g, ""))
      expect(cleansePunctuation(once, noCounts())).toBe(once)
    }))
  })
})
