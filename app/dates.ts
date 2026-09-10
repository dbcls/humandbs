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

/** How far JST stands from UTC. A constant, since JST has no daylight saving. */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * An instant as the minute it fell on in JST.
 *
 * **Instants are held in UTC and read by people working in JST**, so one
 * printed as it stands puts a fetch that ran at nine this morning at midnight.
 * The shape is the one the dates use with the minute after it
 * (`YYYY-MM-DD HH:MM`); it carries no zone because every clock the reader is
 * comparing it against is the same one.
 */
export function minuteInJst(instant: string): string {
  const shifted = new Date(new Date(instant).getTime() + JST_OFFSET_MS)
  return shifted.toISOString().slice(0, 16).replace("T", " ")
}
