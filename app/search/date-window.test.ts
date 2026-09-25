import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { DATE_WINDOW_YEARS, dateWindowFrom, dateWindows } from "./date-window"

/** A calendar day, as every date in the data and in the query language is written. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Every real day over three centuries, so the ones months disagree about turn up. */
const day = fc
  .integer({ min: 0, max: 100_000 })
  .map((since) => new Date(Date.UTC(1900, 0, 1 + since)).toISOString().slice(0, 10))

const years = fc.constantFrom(...DATE_WINDOW_YEARS)

describe("the day a date window opens on", () => {
  it("is a calendar day the query language can have, and one that exists", () => {
    fc.assert(fc.property(day, years, (today, back) => {
      const opened = dateWindowFrom(today, back)
      expect(opened).toMatch(CALENDAR_DAY)
      expect(new Date(`${opened}T00:00:00.000Z`).toISOString().slice(0, 10)).toBe(opened)
    }))
  })

  it("lands that many years earlier in the same month", () => {
    fc.assert(fc.property(day, years, (today, back) => {
      const opened = dateWindowFrom(today, back)
      expect(Number(opened.slice(0, 4))).toBe(Number(today.slice(0, 4)) - back)
      expect(opened.slice(5, 7)).toBe(today.slice(5, 7))
    }))
  })

  it("never opens later in the month than the day asked for", () => {
    // The 29th of February is the only day with no counterpart in a common
    // year, and letting it roll into March would open the window a day after
    // the reader asked for it.
    fc.assert(fc.property(day, years, (today, back) => {
      const opened = Number(dateWindowFrom(today, back).slice(8))
      expect(opened).toBeLessThanOrEqual(Number(today.slice(8)))
    }))
  })

  it("puts every window in the past, the longer one always the earlier", () => {
    fc.assert(fc.property(day, (today) => {
      const opened = DATE_WINDOW_YEARS.map((back) => dateWindowFrom(today, back))
      expect(opened.every((at) => at < today)).toBe(true)
      expect([...opened].sort().reverse()).toEqual(opened)
    }))
  })

  it("pulls a leap day back to the end of February", () => {
    expect(dateWindowFrom("2028-02-29", 1)).toBe("2027-02-28")
    expect(dateWindowFrom("2028-02-29", 5)).toBe("2023-02-28")
    expect(dateWindowFrom("2028-02-29", 10)).toBe("2018-02-28")
    // A leap day whose counterpart is one keeps it; 2100 is not a leap year.
    expect(dateWindowFrom("2024-02-29", 4)).toBe("2020-02-29")
    expect(dateWindowFrom("2104-02-29", 4)).toBe("2100-02-28")
  })

  it("opens the windows the panel offers over the data it holds", () => {
    expect(DATE_WINDOW_YEARS.map((back) => dateWindowFrom("2026-09-03", back)))
      .toEqual(["2025-09-03", "2021-09-03", "2016-09-03"])
  })
})

const LABELS = { all: "すべて", years: (back: number) => `${back} 年` }

function windows(from: string | null, to: string | null, today = "2026-09-23") {
  return dateWindows({
    today,
    from,
    to,
    labels: LABELS,
    lifted: "/files",
    opening: (day) => `/files?from=${day}`,
  })
}

describe("the windows over a range of days", () => {
  it("offers all, and the years in the order drawn, each going where it reports", () => {
    expect(windows(null, null)).toEqual([
      { label: "すべて", href: "/files", current: true },
      { label: "1 年", href: "/files?from=2025-09-23", current: false },
      { label: "5 年", href: "/files?from=2021-09-23", current: false },
      { label: "10 年", href: "/files?from=2016-09-23", current: false },
    ])
  })

  it("lights the window whose opening day is the whole of the range", () => {
    expect(windows("2021-09-23", null).map((one) => one.current)).toEqual([false, false, true, false])
  })

  it("lights nothing for a range that is nobody's window", () => {
    // Closed at the far end, a day off, or typed on another day.
    expect(windows("2021-09-23", "2026-09-23").some((one) => one.current)).toBe(false)
    expect(windows("2021-09-22", null).some((one) => one.current)).toBe(false)
    expect(windows("2021-09-23", null, "2026-09-24").some((one) => one.current)).toBe(false)
    expect(windows(null, "2026-09-23").some((one) => one.current)).toBe(false)
  })

  it("lights at most one window, and all exactly when the range requests nothing", () => {
    const end = fc.option(day, { nil: null })
    fc.assert(fc.property(day, end, end, (now, from, to) => {
      const lit = windows(from, to, now).filter((one) => one.current)
      expect(lit.length).toBeLessThanOrEqual(1)
      expect(lit[0]?.label === "すべて").toBe(from === null && to === null)
    }))
  })
})
