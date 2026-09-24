import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { countryName } from "./country"

/**
 * Applicants type the same country and state in whatever case and spacing they
 * like, and fill the state line with anything at all. These are the laws the
 * naming holds whatever they typed.
 */
const known = fc.constantFrom(
  ["USA", "MA"],
  ["United States", "Massachusetts"],
  ["Canada", "Quebec"],
  ["Australia", "Victoria"],
  ["Japan", ""],
  ["South Korea", ""],
)

function scramble(value: string, upper: boolean[], padding: string): string {
  const cased = Array.from(value, (char, i) => (upper[i % upper.length] ? char.toUpperCase() : char.toLowerCase()))
  return `${padding}${cased.join("")}${padding}`
}

const casing = fc.array(fc.boolean(), { minLength: 1, maxLength: 8 })
const padding = fc.constantFrom("", " ", "  ", "\t")

describe("countryName under the applicant's spelling", () => {
  it("does not depend on case or surrounding space", () => {
    fc.assert(fc.property(known, casing, casing, padding, ([country, region], a, b, pad) => {
      expect(countryName(scramble(country, a, pad), scramble(region, b, pad)))
        .toEqual(countryName(country, region))
    }))
  })

  it("never fails, and gives both languages or neither", () => {
    fc.assert(fc.property(fc.string(), fc.string(), (country, region) => {
      const name = countryName(country, region)
      expect(name.ja === "").toBe(name.en === "")
    }))
  })

  it("never lets the state line change the country of an unlisted federation", () => {
    fc.assert(fc.property(fc.string(), (region) => {
      expect(countryName("Germany", region)).toEqual({ ja: "ドイツ", en: "Germany" })
    }))
  })

  it("keeps the country whatever the state line holds", () => {
    fc.assert(fc.property(fc.string(), (region) => {
      const name = countryName("USA", region)
      expect(name.ja.startsWith("アメリカ合衆国")).toBe(true)
      expect(name.en.endsWith("United States")).toBe(true)
    }))
  })
})
