import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { JST_OFFSET_MS, lastBoundaryInJst } from "./dates"

/** The minutes that divide a day, which is what the boundaries are asked with. */
const DIVISORS = Array.from({ length: 1440 }, (_, at) => at + 1).filter((minutes) => 1440 % minutes === 0)

const instant = fc.date({ min: new Date("2020-01-01T00:00:00Z"), max: new Date("2040-01-01T00:00:00Z"), noInvalidDate: true })

describe("lastBoundaryInJst", () => {
  it("is at or before the instant, and no more than one interval before it", () => {
    fc.assert(fc.property(instant, fc.constantFrom(...DIVISORS), (at, minutes) => {
      const boundary = lastBoundaryInJst(at, minutes)
      expect(boundary.getTime()).toBeLessThanOrEqual(at.getTime())
      expect(at.getTime() - boundary.getTime()).toBeLessThan(minutes * 60_000)
    }))
  })

  it("falls on a multiple of the interval counted from midnight in JST, and is its own boundary", () => {
    fc.assert(fc.property(instant, fc.constantFrom(...DIVISORS), (at, minutes) => {
      const boundary = lastBoundaryInJst(at, minutes)
      const sinceMidnight = (boundary.getTime() + JST_OFFSET_MS) % (24 * 60 * 60_000)
      expect(sinceMidnight % (minutes * 60_000)).toBe(0)
      expect(lastBoundaryInJst(boundary, minutes)).toEqual(boundary)
    }))
  })
})
