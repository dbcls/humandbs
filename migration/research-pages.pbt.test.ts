import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { alike, asV1Stored, researchPages, sameWords, type Likeness } from "./research-pages"

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

const likenessArb = fc.constantFrom<Likeness>("spaced", "bare", "commas aside")

describe("alike", () => {
  it("finds a text alike itself and is symmetric", () => {
    fc.assert(fc.property(textArb, textArb, likenessArb, (a, b, how) => {
      expect(alike(a, a, how)).toBe(true)
      expect(alike(a, b, how)).toBe(alike(b, a, how))
    }))
  })

  it("finds texts alike when spaced whenever they are alike bare, never the other way round", () => {
    fc.assert(fc.property(textArb, textArb, (a, b) => {
      if (alike(a, b, "spaced")) expect(alike(a, b, "bare")).toBe(true)
      if (alike(a, b, "bare")) expect(alike(a, b, "commas aside")).toBe(true)
    }))
  })
})

/** A page of paragraphs, some with a field name, a bullet or a link. */
const lineArb = fc.tuple(
  fc.constantFrom("", "<strong>目的：</strong>", "- ", "・ "),
  fc.array(fc.constantFrom("がん", "（", "）", "(", ")", "：", "Exome", " ", "、", "’", "5"), { minLength: 1, maxLength: 6 }).map((pieces) => pieces.join("")),
  fc.boolean(),
).map(([head, text, linked]) =>
  // A link with no text shows its address instead (`richtext-html.ts`), which is not what this models.
  `<p>${head}${linked && text.trim() !== "" ? `<a href="https://example.org/">${text}</a>` : text}</p>`)

describe("researchPages passages", () => {
  it("gives stretches with exactly the words asked for", () => {
    fc.assert(fc.property(fc.array(lineArb, { minLength: 1, maxLength: 5 }), fc.nat(), fc.nat(), (lines, from, length) => {
      const pages = researchPages([{ site: "prod", articles: [{ title: "hum0001.v1", catid: 10, state: 1, introtext: lines.join("") }] }])
      // A page's line as the words read it: trimmed, without the bullet typed before its text.
      const shown = (line: string) => line.trim().replace(/^[-・]\s+/, "")
      const words = sameWords(lines.map((line) => shown(line.replace(/<[^>]*>/g, ""))).join("\n"))
      const start = from % Math.max(words.length, 1)
      const asked = words.slice(start, start + 1 + (length % 8))
      const found = [...pages.passages("hum0001", "ja", asked, { version: 1, site: "prod" })]
      expect(found.length > 0).toBe(asked !== "")
      for (const one of found) {
        const text = one.map((line) => shown(line.map((span) => span.text).join(""))).join("\n")
        expect(sameWords(text)).toBe(sameWords(asked))
      }
    }))
  })
})
