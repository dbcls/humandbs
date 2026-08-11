/**
 * Reading DDBJ Search's answer for an accession registered outside JGA.
 *
 * The pure half of that source: which resource an accession belongs to, and how
 * a timestamp it returns becomes a calendar day. The requests themselves are in
 * `ddbj-search.server.ts`, which is the boundary tests replace.
 */

/**
 * Which DDBJ Search resource answers for an accession.
 *
 * Only the prefixes the portal's datasets actually carry are listed. An
 * unrecognised one answers null and is left without a date rather than guessed
 * at — a wrong resource would return somebody else's entry, and the accessions
 * upstream does not know about are exactly what a missing date should say.
 */
const RESOURCE_BY_PREFIX: readonly (readonly [string, string])[] = [
  ["DRA", "sra-submission"],
  ["E-GEAD-", "gea"],
  ["MTBKS", "metabobank"],
  ["PRJDB", "bioproject"],
]

export function archiveResourceOf(accession: string): string | null {
  return RESOURCE_BY_PREFIX.find(([prefix]) => accession.startsWith(prefix))?.[1] ?? null
}

/** Whether this source is the one that answers for an accession at all. */
export function isArchiveAccession(accession: string): boolean {
  return archiveResourceOf(accession) !== null
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The calendar day a date from DDBJ Search falls on, cut in JST.
 *
 * The answers are not one shape: some resources return a full instant
 * (`2020-09-28T02:03:50Z`) and others a day already (`2022-10-28`). A day is
 * taken as it stands — it carries no time to move — and an instant is shifted
 * before the day is read off it, so an entry released in the evening UTC does
 * not show as the day before. The offset is a constant because JST has no
 * daylight saving.
 */
export function calendarDayOf(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  if (trimmed === "") return null
  if (CALENDAR_DAY.test(trimmed)) return trimmed

  const instant = new Date(trimmed)
  if (Number.isNaN(instant.getTime())) return null
  return new Date(instant.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}
