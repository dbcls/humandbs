import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { MAX_PAGE, parsePageNumber } from "./paging"

describe("parsePageNumber", () => {
  it("reads every page number written in plain decimal as that number", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: MAX_PAGE }), (page) => {
      expect(parsePageNumber(String(page))).toBe(page)
    }))
  })

  it("reads an absent page as the first", () => {
    expect(parsePageNumber(null)).toBe(1)
  })

  it("refuses the notations Number() would read as a page", () => {
    for (const value of ["0x10", "1e3", "0b1", "0o7", "+2", "02", " 2", "2 ", "1.0", "1.5", "0", "-1", "", "Infinity", "NaN"]) {
      expect(parsePageNumber(value), value).toBeNull()
    }
  })

  it("refuses a page past the bound instead of answering with an unsafe integer", () => {
    expect(parsePageNumber(String(MAX_PAGE + 1))).toBeNull()
    expect(parsePageNumber("99999999999999999999")).toBeNull()
  })
})
