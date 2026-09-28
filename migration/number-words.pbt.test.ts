import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Bilingual, NumberValue } from "~/content/types"
import { resolveOptionalBilingual, type Locale } from "~/i18n/locale"

import { prefixedNumber, type SourceNumber } from "./number-words"

/** What a page showed for a number that held a label and a note: `label: 12 unit (note)`. */
function shownBefore(number: SourceNumber, locale: Locale, english: (word: string) => string): string {
  const label = resolveOptionalBilingual(number.label, locale)
  const note = resolveOptionalBilingual(number.note, locale)
  const word = number.inputUnit === null ? null : (locale === "en" ? english(number.inputUnit) : number.inputUnit)
  const said = word === null ? "1" : `1${/^[x×%倍]$/i.test(word) ? "" : " "}${word}`
  return `${label === null ? "" : `${label.text}: `}${said}${note === null ? "" : ` (${note.text})`}`
}

/** What a page shows for a number that holds a prefix and a suffix: the three joined. */
function shownAfter(number: NumberValue, locale: Locale): string {
  const prefix = resolveOptionalBilingual(number.prefix, locale)
  const suffix = resolveOptionalBilingual(number.suffix, locale)
  const unit = number.inputUnit
  const said = unit === null ? "1" : `1${/^[x×%倍]$/i.test(unit) ? "" : " "}${unit}`
  return `${prefix?.text ?? ""}${said}${suffix?.text ?? ""}`
}

const ENGLISH: Readonly<Record<string, string>> = { プローブ: "probes", 遺伝子: "genes", バリアント: "variants" }

const side = fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 8 }).filter((one) => one.trim() !== ""))
const pair: fc.Arbitrary<Bilingual | null> = fc.option(fc.record({ ja: side, en: side }), { nil: null })
const word = fc.option(fc.constantFrom("SNVs", "variants", "プローブ", "遺伝子", "バリアント", "x", "%", "bp"), { nil: null })

const sourceNumber: fc.Arbitrary<SourceNumber> = fc.record({ label: pair, note: pair, word }).map(({ label, note, word }) => ({
  label,
  value: 1,
  unit: word,
  inputValue: 1,
  inputUnit: word,
  high: null,
  inputHigh: null,
  note,
}))

/** A note in one language only, behind a count's word: the suffix cannot fall back for the note alone. */
function noteHalfBehindWord(number: SourceNumber, counts: boolean): boolean {
  const note = number.note
  return counts && number.inputUnit !== null && note !== null && (note.ja === "") !== (note.en === "")
}

describe("prefixedNumber", () => {
  it("shows every number as the page showed it before, in both languages", () => {
    fc.assert(fc.property(sourceNumber, fc.boolean(), fc.constantFrom<Locale>("ja", "en"), (number, counts, locale) => {
      fc.pre(!noteHalfBehindWord(number, counts))
      const english = (one: string) => (counts ? ENGLISH[one] ?? one : one)
      expect(shownAfter(prefixedNumber(number, counts), locale)).toBe(shownBefore(number, locale, english))
    }))
  })

  it("leaves a count with no unit, and a key that converts with the unit it had", () => {
    fc.assert(fc.property(sourceNumber, fc.boolean(), (number, counts) => {
      const converted = prefixedNumber(number, counts)
      expect(converted.inputUnit).toBe(counts ? null : number.inputUnit)
      expect(converted.unit).toBe(counts ? null : number.unit)
      expect(converted.value).toBe(number.value)
    }))
  })
})
