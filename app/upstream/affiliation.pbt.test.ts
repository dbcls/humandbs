import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { affiliationOf, joinAffiliation, type StatedAffiliation } from "./affiliation"

const part = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.constantFrom("", " ", "N/A", "unknown", "missing", "(Filled by DDBJ)", "外科", "A 大学", "Surgery,", "A University"),
)
const name = fc.constantFrom("", "Tanaka", "TANAKA", "Suzuki", "Kim")
const statedAffiliation = fc.record<StatedAffiliation>({
  piLastEn: name,
  divisionJa: part,
  institutionJa: part,
  divisionEn: part,
  institutionEn: part,
})

const ja = (s: StatedAffiliation): string => joinAffiliation(s.divisionJa, s.institutionJa)
const en = (s: StatedAffiliation): string => joinAffiliation(s.divisionEn, s.institutionEn)

describe("joinAffiliation", () => {
  it("never ends with the separator or a space, whatever was typed", () => {
    fc.assert(fc.property(part, part, (division, institution) => {
      expect(joinAffiliation(division, institution)).not.toMatch(/[\s,、]$/u)
    }))
  })

  it("reads a placeholder as nothing written", () => {
    const placeholder = fc.constantFrom("N/A", "n/a", "NA", "unknown", "missing", "(Filled by DDBJ)")
    fc.assert(fc.property(placeholder, part, (typed, other) => {
      expect(joinAffiliation(typed, other)).toBe(joinAffiliation("", other))
      expect(joinAffiliation(other, typed)).toBe(joinAffiliation(other, ""))
    }))
  })
})

describe("affiliationOf", () => {
  it("keeps the initial application's values whenever its English is written", () => {
    fc.assert(fc.property(statedAffiliation, fc.array(statedAffiliation, { maxLength: 5 }), (initial, others) => {
      fc.pre(en(initial) !== "")
      expect(affiliationOf(initial, others)).toEqual({ ja: ja(initial), en: en(initial) })
    }))
  })

  it("never changes the Japanese the initial application wrote", () => {
    fc.assert(fc.property(statedAffiliation, fc.array(statedAffiliation, { maxLength: 5 }), (initial, others) => {
      fc.pre(ja(initial) !== "")
      expect(affiliationOf(initial, others).ja).toBe(ja(initial))
    }))
  })

  it("uses both languages of one and the same submission when it fills both", () => {
    fc.assert(fc.property(statedAffiliation, fc.array(statedAffiliation, { maxLength: 5 }), (initial, others) => {
      fc.pre(ja(initial) === "" && en(initial) === "")
      const shown = affiliationOf(initial, others)
      if (shown.ja === "" && shown.en === "") return
      expect(others.some((other) => ja(other) === shown.ja && en(other) === shown.en)).toBe(true)
    }))
  })

  it("uses nothing from submissions that name another investigator", () => {
    fc.assert(fc.property(statedAffiliation, fc.array(statedAffiliation, { maxLength: 5 }), (initial, others) => {
      const strangers = others.filter((other) => other.piLastEn.trim().toLowerCase() !== initial.piLastEn.trim().toLowerCase())
      expect(affiliationOf(initial, strangers)).toEqual({ ja: ja(initial), en: en(initial) })
    }))
  })
})
