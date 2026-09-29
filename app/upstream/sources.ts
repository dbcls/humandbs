/**
 * The eight things the portal caches from somewhere else.
 *
 * **They are split by upstream system, not by table.** What fails is a system:
 * the application database being unreachable implies nothing about DDBJ Search, and
 * a refresh that treated the two as one unit would leave the JGA dates stale
 * whenever the other one was slow. The dates share `accession_date` and the
 * files `accession_file_summary`, each told apart by its `source` column.
 *
 * The last two are what the screens that seed a draft read — the approved
 * branches of the data-submission applications, and what JGA holds about each
 * registered dataset — so that no screen connects to the application system.
 */
export const UPSTREAM_SOURCES = [
  "cau",
  "hum-accession",
  "jgad-date",
  "archive-date",
  "jgad-file",
  "archive-file",
  "ds-branch",
  "jgad-registration",
] as const

export type UpstreamSource = (typeof UPSTREAM_SOURCES)[number]

/**
 * The sources that read the JGA application system. Without a connection to it
 * they are skipped rather than failed: the database is not reachable outside
 * production, so an environment without it is a normal environment.
 */
export const APPLICATION_DB_SOURCES = [
  "cau",
  "hum-accession",
  "jgad-date",
  "jgad-file",
  "ds-branch",
  "jgad-registration",
] as const satisfies readonly UpstreamSource[]

export function isUpstreamSource(value: string): value is UpstreamSource {
  return (UPSTREAM_SOURCES as readonly string[]).includes(value)
}
