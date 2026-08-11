/**
 * The four things the portal caches from somewhere else.
 *
 * **They are split by upstream system, not by table.** What fails is a system:
 * the application database being unreachable says nothing about DDBJ Search, and
 * a refresh that treated the two as one unit would leave the JGA dates stale
 * whenever the other one was slow. Two of them share `accession_date` and are
 * told apart by its `source` column (docs/data-model.md の「外部キャッシュ」).
 */
export const UPSTREAM_SOURCES = [
  "cau",
  "hum-accession",
  "jgad-date",
  "archive-date",
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
] as const satisfies readonly UpstreamSource[]

export function isUpstreamSource(value: string): value is UpstreamSource {
  return (UPSTREAM_SOURCES as readonly string[]).includes(value)
}
