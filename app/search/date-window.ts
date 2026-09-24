/**
 * The windows a range of days offers as one press.
 *
 * **One set for the public facets and the management panes**, so a reader who
 * learned the windows over one range of days finds the same four over every
 * other. Apart from any screen for the reason the page sizes are
 * (`./page-size.ts`): the server works out which window is in force and the
 * screen draws it, and the two have to agree on what a window is.
 *
 * **What the address carries is the absolute day**, so a link that is shared or
 * bookmarked keeps meaning what it meant when it was made. Which window is in
 * force is worked back out from that day against today, so a bookmark read on
 * another day matches none of them — it still holds the same rows.
 */

/** How far back the windows reach, in the order drawn. */
export const DATE_WINDOW_YEARS = [1, 5, 10] as const

export interface DateWindow {
  label: string
  /** The listing with this window in force, or with the range lifted for "all". */
  href: string
  current: boolean
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * The day a window opens on: the same calendar day, `years` earlier.
 *
 * **The 29th of February has no counterpart in a common year.** The day is
 * pulled back to the end of the month rather than let roll into March, so the
 * window a reader is offered never opens later than the one they asked for.
 */
export function dateWindowFrom(today: string, years: number): string {
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number)
  const opened = year - years
  const leap = opened % 4 === 0 && (opened % 100 !== 0 || opened % 400 === 0)
  const last = month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1] ?? 31
  const pad = (value: number, width: number) => String(value).padStart(width, "0")
  return `${pad(opened, 4)}-${pad(month, 2)}-${pad(Math.min(day, last), 2)}`
}

/**
 * The windows over a range of days, with the one in force lit.
 *
 * **A window is in force when it is the whole of the condition**: the same
 * opening day, and nothing closing it. A reader who typed those two dates by
 * hand gets the window lit, which is the same search. "All" is lit when the
 * range asks nothing, and a range that is nobody's window lights none of them.
 */
export function dateWindows(input: {
  today: string
  /** The range in force, each end `null` when it is open. */
  from: string | null
  to: string | null
  labels: { all: string, years: (years: number) => string }
  /** The listing with the range lifted. */
  lifted: string
  /** The listing narrowed to the days from this one on. */
  opening: (from: string) => string
}): DateWindow[] {
  const { today, from, to, labels, lifted, opening } = input
  return [
    { label: labels.all, href: lifted, current: from === null && to === null },
    ...DATE_WINDOW_YEARS.map((years) => {
      const day = dateWindowFrom(today, years)
      return { label: labels.years(years), href: opening(day), current: from === day && to === null }
    }),
  ]
}
