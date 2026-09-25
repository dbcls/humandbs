/**
 * Today, as a calendar day.
 *
 * **The day is cut in JST**, which is the day the data itself is written in:
 * every date on a row is a JST calendar day (`upstream/archive.ts` の
 * `calendarDayOf`). Taking it from an ISO instant would give the UTC day, which
 * is the day before between midnight and nine in the morning — the hours a
 * release actually goes out in.
 *
 * The format is the one every date in the data uses (`YYYY-MM-DD`); `en-CA`
 * is the locale that writes it.
 */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date())
}

/** How far JST is from UTC. A constant, since JST has no daylight saving. */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * An instant as the minute it fell on in JST.
 *
 * **Instants are held in UTC and read by people working in JST**, so one
 * printed unconverted puts a fetch that ran at nine this morning at midnight.
 * The shape is the one the dates use with the minute after it
 * (`YYYY-MM-DD HH:MM`); it has no zone because every clock the reader is
 * comparing it against is the same one.
 */
export function minuteInJst(instant: string): string {
  const shifted = new Date(new Date(instant).getTime() + JST_OFFSET_MS)
  return shifted.toISOString().slice(0, 16).replace("T", " ")
}

/**
 * Now, as the second it falls on in JST.
 *
 * **An announcement's date is a JST wall clock in a column that has no
 * zone** (`app/db/schema/site.ts`), so a value made for one is written in that
 * same clock rather than converted on the way out. `en-CA` writes the date the
 * way the column holds it and puts the time after a comma, which is the one
 * thing to undo.
 */
export function nowInJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()).replace(", ", " ")
}

/**
 * A stored stamp as the minute it identifies. **The minute is as fine as anything
 * on screen goes** — the second is neither typed nor read, and printing it puts
 * two characters of noise in every row of a listing.
 */
export function minuteOf(stamp: string): string {
  return stamp.slice(0, 16)
}

/**
 * A stored stamp as the day it falls on.
 *
 * **The public side is given the day and nothing finer.** The minute an item
 * went up is a fact about the publishing — it is what a schedule is set by, and
 * what a curator reads back to check it — while what the reader dates the item
 * by is the day. A column of minutes also makes the ones the migration brought
 * in (all on the hour) read as if they meant something.
 */
export function dayOf(stamp: string): string {
  return stamp.slice(0, 10)
}

/** A stored stamp in the shape a `datetime-local` field takes. */
export function asLocalInput(stamp: string): string {
  return stamp.slice(0, 16).replace(" ", "T")
}

const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/**
 * What a `datetime-local` field sent, as a stamp to store — or `null` if it is
 * not one, which is what anything but the screen's own form can send.
 *
 * **The shape is not enough.** `2026-02-31T09:00` is the right shape and not a
 * day, and a date that does not exist reaches the database as one it refuses,
 * which fails the whole write rather than this field. `Date` rolls such a day
 * over into the next month instead of refusing it, so the value is read back
 * and has to be the one that went in.
 *
 * The field sends the minute and the column keeps seconds, so the zero is
 * written here rather than left for the database to invent.
 */
export function stampFromLocalInput(value: string): string | null {
  if (!LOCAL_INPUT.test(value)) return null
  const at = new Date(`${value}:00.000Z`)
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 16) !== value) return null
  return `${value.replace("T", " ")}:00`
}

/**
 * An instant as the calendar day it fell on in JST.
 *
 * **The day a file was written is read on the same clock as every other day on
 * a row.** The store responds with an instant, and the UTC day of that instant is
 * the day before between midnight and nine in the morning — the hours an upload
 * made at the start of a working day would be filed under yesterday.
 */
export function dayInJst(instant: string): string {
  return minuteInJst(instant).slice(0, 10)
}

const DAY_INPUT = /^\d{4}-\d{2}-\d{2}$/

/**
 * What a `date` field sent, as the day it identifies — or `null` if it is not one,
 * which is what anything but the screen's own form can send.
 *
 * **The shape is not enough**, for the reason `stampFromLocalInput` gives: a day
 * that does not exist has the right shape, and `Date` rolls it over into the
 * next month rather than refusing it, so the value is read back and has to be
 * the one that went in.
 */
export function dayFromInput(value: string): string | null {
  if (!DAY_INPUT.test(value)) return null
  const at = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== value) return null
  return value
}
