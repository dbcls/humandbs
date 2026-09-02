import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { writtenBound } from "./facets.server"

/** What a reader could type back into a range input, and nothing else. */
const TYPEABLE = /^-?[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?$/

const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e12, max: 1e12 })

/** The written form read back as a number, with the grouping taken out. */
function read(written: string): number {
  return Number(written.replaceAll(",", ""))
}

describe("the span a range facet suggests", () => {
  it("never writes a number the way a program would", () => {
    fc.assert(fc.property(finite, fc.constantFrom("down" as const, "up" as const), (value, towards) => {
      expect(writtenBound(value, towards)).toMatch(TYPEABLE)
    }))
  })

  it("rounds outwards, so the pair still holds what it describes", () => {
    fc.assert(fc.property(finite, (value) => {
      expect(read(writtenBound(value, "down"))).toBeLessThanOrEqual(value)
      expect(read(writtenBound(value, "up"))).toBeGreaterThanOrEqual(value)
    }))
  })

  it("stays close enough to be a hint about the same order of magnitude", () => {
    fc.assert(fc.property(finite.filter((value) => value !== 0), (value) => {
      const off = Math.abs(read(writtenBound(value, "down")) - value)
      expect(off).toBeLessThanOrEqual(Math.max(1, Math.abs(value) * 0.1))
    }))
  })

  it("writes the values the data actually holds", () => {
    // A kilobyte held in gigabytes, which is where the exponent came from.
    expect(writtenBound(9.5367431640625e-7, "down")).toBe("0.00000095")
    expect(writtenBound(266240, "up")).toBe("266,240")
    expect(writtenBound(150, "down")).toBe("150")
    expect(writtenBound(1872937, "up")).toBe("1,872,937")
  })

  it("says nothing it cannot say about zero and the ends of the number line", () => {
    expect(writtenBound(0, "down")).toBe("0")
    expect(writtenBound(0, "up")).toBe("0")
    expect(writtenBound(Number.NaN, "down")).toBe("0")
    expect(writtenBound(Number.POSITIVE_INFINITY, "up")).toBe("0")
  })

  it("keeps a negative number negative", () => {
    expect(read(writtenBound(-0.25, "down"))).toBeLessThanOrEqual(-0.25)
    expect(writtenBound(-1500, "down")).toBe("-1,500")
  })
})
