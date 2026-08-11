/**
 * Today, as a calendar day.
 *
 * **The day is cut in JST**, because that is when the people who publish are
 * working. Taking it from an ISO instant would give the UTC day, which is the
 * day before between midnight and nine in the morning — the hours a release
 * actually goes out in.
 *
 * The format is the one every date in the data uses (`YYYY-MM-DD`); `en-CA`
 * is the locale that writes it.
 */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date())
}
