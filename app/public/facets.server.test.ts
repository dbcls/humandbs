import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { DATE_PRESET_YEARS, datePresetFrom } from "./facets.server"

/** A calendar day, as every date in the data and in the query language is written. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Every real day over three centuries, so the ones months disagree about turn up. */
const day = fc
  .integer({ min: 0, max: 100_000 })
  .map((since) => new Date(Date.UTC(1900, 0, 1 + since)).toISOString().slice(0, 10))

const years = fc.constantFrom(...DATE_PRESET_YEARS)

describe("the day a date window opens on", () => {
  it("is a calendar day the query language can carry", () => {
    fc.assert(fc.property(day, years, (today, back) => {
      expect(datePresetFrom(today, back)).toMatch(CALENDAR_DAY)
    }))
  })

  it("lands that many years earlier in the same month", () => {
    fc.assert(fc.property(day, years, (today, back) => {
      const opened = datePresetFrom(today, back)
      expect(Number(opened.slice(0, 4))).toBe(Number(today.slice(0, 4)) - back)
      expect(opened.slice(5, 7)).toBe(today.slice(5, 7))
    }))
  })

  it("never opens later in the month than the day asked for", () => {
    // The 29th of February is the only day with no counterpart in a common
    // year, and letting it roll into March would open the window a day after
    // the reader asked for it.
    fc.assert(fc.property(day, years, (today, back) => {
      const opened = Number(datePresetFrom(today, back).slice(8))
      expect(opened).toBeLessThanOrEqual(Number(today.slice(8)))
    }))
  })

  it("puts every window in the past, the longer one always the earlier", () => {
    fc.assert(fc.property(day, (today) => {
      const opened = DATE_PRESET_YEARS.map((back) => datePresetFrom(today, back))
      expect(opened.every((at) => at < today)).toBe(true)
      expect([...opened].sort().reverse()).toEqual(opened)
    }))
  })

  it("pulls a leap day back to the end of February", () => {
    expect(datePresetFrom("2028-02-29", 1)).toBe("2027-02-28")
    expect(datePresetFrom("2028-02-29", 5)).toBe("2023-02-28")
    expect(datePresetFrom("2028-02-29", 10)).toBe("2018-02-28")
    // A leap day whose counterpart is one keeps it; 2100 is not a leap year.
    expect(datePresetFrom("2024-02-29", 4)).toBe("2020-02-29")
    expect(datePresetFrom("2104-02-29", 4)).toBe("2100-02-28")
  })

  it("opens the windows the panel offers over the data it holds", () => {
    expect(DATE_PRESET_YEARS.map((back) => datePresetFrom("2026-09-03", back)))
      .toEqual(["2025-09-03", "2021-09-03", "2016-09-03"])
  })
})
