import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { isDecimalNumber, isRealDate } from "./dsl"

/**
 * The two value checks sit between the address and a SQL cast. A value they
 * pass has to be one the database takes as a `date` or a `numeric`, and one
 * that reads back the way it was written.
 */
describe("isRealDate", () => {
  it("accepts every day of years 0001 to 9999", () => {
    const day = fc.date({ min: new Date("0001-01-01T00:00:00Z"), max: new Date("9999-12-31T00:00:00Z"), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10))
    fc.assert(fc.property(day, (value) => {
      expect(isRealDate(value)).toBe(true)
    }))
  })

  it("refuses year 0000, which the database's date does not have", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }), (month, day) => {
      const value = `0000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      expect(isRealDate(value)).toBe(false)
    }))
  })

  it("refuses the edges of the calendar and shapes that are not one day", () => {
    for (const value of ["0000-01-01", "0001-00-01", "2023-02-29", "2020-13-01", "10000-01-01", "+002020-01-01", "2020-1-01", " 2020-01-01"]) {
      expect(isRealDate(value), value).toBe(false)
    }
    expect(isRealDate("0001-01-01")).toBe(true)
    expect(isRealDate("2024-02-29")).toBe(true)
    expect(isRealDate("9999-12-31")).toBe(true)
  })
})

describe("isDecimalNumber", () => {
  it("accepts a plain decimal and reads it back as written", () => {
    const written = fc.tuple(
      fc.boolean(),
      fc.integer({ min: 0, max: 999_999_999_999 }),
      fc.option(fc.integer({ min: 0, max: 999 }).map(String)),
    ).map(([negative, whole, fraction]) => `${negative && whole !== 0 ? "-" : ""}${whole}${fraction === null ? "" : `.${fraction}`}`)
    fc.assert(fc.property(written, (value) => {
      expect(isDecimalNumber(value)).toBe(true)
    }))
  })

  it("refuses the other notations Number() would read", () => {
    for (const value of ["0x10", "0b11", "0o7", "1e3", "1E3", "Infinity", "-Infinity", "NaN", "+5", ".5", "5.", "1_000", " 5", "5 ", "", "007", "-0x10", "1,000"]) {
      expect(isDecimalNumber(value), value).toBe(false)
    }
  })

  it("refuses a number past what a double holds exactly", () => {
    expect(isDecimalNumber("9007199254740991")).toBe(true)
    expect(isDecimalNumber("9007199254740992")).toBe(false)
    expect(isDecimalNumber("99999999999999999999")).toBe(false)
    expect(isDecimalNumber("-99999999999999999999")).toBe(false)
  })
})
