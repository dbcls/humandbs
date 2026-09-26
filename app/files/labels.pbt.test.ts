import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { fileLabelIn, sameFileLabel, typedFileLabel, type FileLabel } from "./labels"

const text = fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 12 }))
const label: fc.Arbitrary<FileLabel> = fc.record({ ja: text, en: text })
const locale = fc.constantFrom("ja" as const, "en" as const)
const blank = fc.array(fc.constantFrom(" ", "\t", "\n", "　"), { maxLength: 4 }).map((chars) => chars.join(""))

describe("fileLabelIn", () => {
  it("shows the page's own language wherever it is written", () => {
    fc.assert(fc.property(label, locale, (written, on) => {
      const own = on === "ja" ? written.ja : written.en
      if (own !== "") expect(fileLabelIn(written, on)).toBe(own)
    }))
  })

  it("shows the other language where the page's own is empty, in either direction", () => {
    fc.assert(fc.property(text, locale, (other, on) => {
      const written = on === "ja" ? { ja: "", en: other } : { ja: other, en: "" }
      expect(fileLabelIn(written, on)).toBe(other)
    }))
  })

  it("shows nothing for a file with no label", () => {
    fc.assert(fc.property(locale, (on) => {
      expect(fileLabelIn(undefined, on)).toBe("")
    }))
  })

  it("is empty only when both languages are", () => {
    fc.assert(fc.property(label, locale, (written, on) => {
      expect(fileLabelIn(written, on) === "").toBe(written.ja === "" && written.en === "")
    }))
  })
})

describe("typedFileLabel", () => {
  it("keeps each language without the whitespace around it, full-width spaces included", () => {
    fc.assert(fc.property(blank, text, blank, blank, text, blank, (a, ja, b, c, en, d) => {
      const kept = typedFileLabel(a + ja + b, c + en + d)
      if (kept !== null) expect(kept).toEqual({ ja: ja.trim(), en: en.trim() })
    }))
  })

  it("is nothing exactly when both languages are blank, which deletes the label", () => {
    fc.assert(fc.property(text, text, (ja, en) => {
      expect(typedFileLabel(ja, en) === null).toBe(ja.trim() === "" && en.trim() === "")
    }))
  })

  it("keeps a label written in one language only", () => {
    expect(typedFileLabel("辞書", "  ")).toEqual({ ja: "辞書", en: "" })
    expect(typedFileLabel("　", "Paper")).toEqual({ ja: "", en: "Paper" })
  })
})

describe("sameFileLabel", () => {
  it("is true of a label and itself, and of two absences", () => {
    fc.assert(fc.property(label, (written) => {
      expect(sameFileLabel(written, { ...written })).toBe(true)
    }))
    expect(sameFileLabel(null, null)).toBe(true)
  })

  it("tells a label from its absence and from any other label", () => {
    fc.assert(fc.property(label, label, (a, b) => {
      expect(sameFileLabel(a, b)).toBe(a.ja === b.ja && a.en === b.en)
      expect(sameFileLabel(a, null)).toBe(false)
    }))
  })
})
