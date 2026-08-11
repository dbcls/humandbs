import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { calendarDayOf } from "./archive"

/**
 * Upstream answers dates in more than one shape and the portal stores one:
 * a calendar day cut in JST (docs/data-model.md の「日付」). These are the laws
 * that says holds whatever the instant.
 */
const instants = fc.date({
  min: new Date("1990-01-01T00:00:00Z"),
  max: new Date("2040-01-01T00:00:00Z"),
  noInvalidDate: true,
})

const DAY_MS = 24 * 60 * 60 * 1000

describe("the day an upstream instant falls on", () => {
  it("is a calendar day for every instant", () => {
    fc.assert(fc.property(instants, (at) => {
      expect(calendarDayOf(at.toISOString())).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }))
  })

  it("does not depend on how the instant was written", () => {
    fc.assert(fc.property(instants, (at) => {
      const withOffset = at.toISOString().replace("Z", "+00:00")
      expect(calendarDayOf(withOffset)).toBe(calendarDayOf(at.toISOString()))
    }))
  })

  it("is the UTC day or the one after it, never further and never earlier", () => {
    fc.assert(fc.property(instants, (at) => {
      const day = calendarDayOf(at.toISOString())
      const utcDay = at.toISOString().slice(0, 10)
      const next = new Date(`${utcDay}T00:00:00Z`).getTime() + DAY_MS
      expect([utcDay, new Date(next).toISOString().slice(0, 10)]).toContain(day)
    }))
  })

  it("is idempotent: reading the day of a day gives that day back", () => {
    fc.assert(fc.property(instants, (at) => {
      const day = calendarDayOf(at.toISOString())
      expect(calendarDayOf(day)).toBe(day)
    }))
  })
})
