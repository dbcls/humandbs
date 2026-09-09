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
