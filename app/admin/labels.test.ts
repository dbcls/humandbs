import { describe, expect, it } from "vitest"

import fc from "fast-check"

import { isNhaId, isPortalIssuedId, nhaId, nhaNumber } from "./labels"

/**
 * Whether a dataset may carry a file selection turns on this alone
 * (docs/data-model.md's section on files).
 */
describe("whether an id is one the portal issued", () => {
  it("calls an NHA id portal-issued", () => {
    expect(isPortalIssuedId("NHA000001")).toBe(true)
    expect(isPortalIssuedId("NHA999999")).toBe(true)
  })

  it("calls a hum-prefixed id portal-issued, which is how the older ones are spelled", () => {
    expect(isPortalIssuedId("hum0009.v1.CpG.v1")).toBe(true)
    expect(isPortalIssuedId("hum0014-NHA001")).toBe(true)
  })

  it("does not take an id that only begins with NHA for the portal's", () => {
    expect(isPortalIssuedId("NHA00001")).toBe(false)
    expect(isPortalIssuedId("NHA0000001")).toBe(false)
    expect(isPortalIssuedId("NHA000001.v1")).toBe(false)
    expect(isPortalIssuedId("nha000001")).toBe(false)
    expect(isPortalIssuedId("NHAX00001")).toBe(false)
  })

  it("calls every archive accession external", () => {
    expect(isPortalIssuedId("JGAD000123")).toBe(false)
    expect(isPortalIssuedId("DRA000456")).toBe(false)
    expect(isPortalIssuedId("E-GEAD-789")).toBe(false)
    expect(isPortalIssuedId("MTBKS123")).toBe(false)
    expect(isPortalIssuedId("PRJDB1234")).toBe(false)
  })

  it("calls a dataset with no primary pinned external", () => {
    expect(isPortalIssuedId(null)).toBe(false)
  })
})

describe("the spelling of an NHA id", () => {
  it("pads the number to six digits", () => {
    expect(nhaId(1)).toBe("NHA000001")
    expect(nhaId(42)).toBe("NHA000042")
    expect(nhaId(999_999)).toBe("NHA999999")
  })

  it("refuses a number the six digits cannot hold, rather than growing a seventh", () => {
    expect(() => nhaId(1_000_000)).toThrow(RangeError)
    expect(() => nhaId(0)).toThrow(RangeError)
    expect(() => nhaId(-1)).toThrow(RangeError)
    expect(() => nhaId(1.5)).toThrow(RangeError)
  })

  it("reads back the number it was made from, and nothing from any other spelling", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 999_999 }), (number) => {
      const label = nhaId(number)
      return isNhaId(label) && nhaNumber(label) === number
    }))
    expect(nhaNumber("JGAD000001")).toBeNull()
    expect(nhaNumber("hum0014-NHA001")).toBeNull()
    expect(nhaNumber("NHA000001 ")).toBeNull()
  })
})
