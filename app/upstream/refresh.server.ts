/**
 * Refreshing the caches of what other systems own.
 *
 * **Every source is fetched on its own and they cannot take each other down.**
 * A source that throws leaves its rows exactly as they were, because a system
 * that is briefly silent cannot be told apart from one that deleted a value,
 * and falling to the deleting side would blank published pages.
 *
 * **What did come back is written in one transaction, and the search rows are
 * rebuilt inside it.** The dates the listings show are baked into those rows, so
 * a refresh that did not rebuild them would change the caches without changing
 * anything anybody can see. One transaction rather than one per source is what
 * keeps that rebuild to a single pass.
 *
 * **A source that comes back with fewer than half the rows it wrote last time
 * is failed too.** A system being stopped or restored can answer with part of
 * its tables, and writing that would blank as much as an outage would; a
 * shrink that is real is written from the command line (`allowShrink`).
 *
 * A source with no connection to reach is skipped, not failed, and leaves no
 * record: the table records how the last fetch went, and no fetch was made.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"
import type { Pool } from "pg"

import { isPortalIssuedId } from "~/admin/labels"
import { lockAllResearches } from "~/admin/locks.server"
import { loadConfig, type ApplicationDbConfig } from "~/config.server"
import type { Database, Executor, Transaction } from "~/db/client.server"
import {
  accessionDate,
  accessionFileSummary,
  cauEntry,
  dsBranch,
  humAccession,
  jgadRegistration,
  labelPin,
  upstreamRefresh,
} from "~/db/schema"
import { lastBoundaryInJst } from "~/dates"
import { syncFileFormatTerms } from "~/files/format-terms.server"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { archiveResourceOf, calendarDayOf } from "./archive"
import { archiveFilesKindOf, readArchiveFiles } from "./archive-files"
import {
  fetchCauEntries,
  fetchDsBranches,
  fetchHumAccessions,
  fetchJgadDates,
  fetchJgadFileGroups,
  fetchJgadRegistrations,
  openApplicationDb,
  type AccessionDateUpstreamRow,
} from "./application-db.server"
import { fetchArchiveEntry } from "./ddbj-search.server"
import { summarizeJgadFiles, summarizeListedFiles, type FileSummaries } from "./file-summary"
import { publicFiles } from "./public-files.server"
import { APPLICATION_DB_SOURCES, UPSTREAM_SOURCES, type UpstreamSource } from "./sources"

const CHUNK = 500

/**
 * DDBJ Search is asked for one accession at a time and there is no bulk form,
 * so the requests are spaced. Fewer than a hundred accessions need it, which
 * makes the whole source about half a minute.
 */
const REQUEST_INTERVAL_MS = 250

export type SourceOutcome
  = | {
    source: UpstreamSource
    status: "written"
    rowCount: number
    /** For the file sources: how many files ended in each extension that made no format. */
    unknownExtensions?: [string, number][]
  }
  | { source: UpstreamSource, status: "failed", failure: string }
  | { source: UpstreamSource, status: "skipped" }

/** A fetch that came back, holding its rows until the transaction opens. */
interface Fetched {
  rowCount: number
  unknownExtensions?: [string, number][]
  write: (tx: Transaction) => Promise<void>
}

export function needsApplicationDb(source: UpstreamSource): boolean {
  return (APPLICATION_DB_SOURCES as readonly UpstreamSource[]).includes(source)
}

export interface RefreshOptions {
  /**
   * Write a source even when it came back with fewer than half the rows it
   * wrote last time. Only the command line sets it, for a shrink somebody has
   * checked is real.
   */
  allowShrink?: boolean
}

/**
 * Whether a fetch came back with fewer than half the rows the last one wrote.
 * Nothing shrinks from a source that has never written, or last wrote none.
 */
export function shrankByHalf(rowCount: number, previous: number | null): boolean {
  return previous !== null && rowCount * 2 < previous
}

export async function runUpstreamRefresh(
  db: Database,
  sources: readonly UpstreamSource[] = UPSTREAM_SOURCES,
  options: RefreshOptions = {},
): Promise<SourceOutcome[]> {
  const applicationDb = loadConfig(process.env).applicationDb
  // Opened only if one of the sources asked for reads it, so refreshing the
  // archive dates alone does not reach for another project's database.
  const pool = applicationDb !== null && sources.some(needsApplicationDb)
    ? openApplicationDb(applicationDb)
    : null

  const previous = new Map(
    (await db.select({ source: upstreamRefresh.source, rowCount: upstreamRefresh.rowCount }).from(upstreamRefresh))
      .map((row) => [row.source, row.rowCount]),
  )

  const outcomes: SourceOutcome[] = []
  const written = new Map<UpstreamSource, Fetched>()
  try {
    for (const source of sources) {
      if (needsApplicationDb(source) && (pool === null || applicationDb === null)) {
        outcomes.push({ source, status: "skipped" })
        continue
      }
      try {
        const fetched = await fetchSource(source, db, pool, applicationDb)
        const before = previous.get(source) ?? null
        if (options.allowShrink !== true && shrankByHalf(fetched.rowCount, before)) {
          outcomes.push({
            source,
            status: "failed",
            failure: `returned ${String(fetched.rowCount)} rows, fewer than half of the ${String(before)} written last time`,
          })
          continue
        }
        written.set(source, fetched)
        outcomes.push({
          source,
          status: "written",
          rowCount: fetched.rowCount,
          ...(fetched.unknownExtensions === undefined ? {} : { unknownExtensions: fetched.unknownExtensions }),
        })
      } catch (error) {
        outcomes.push({ source, status: "failed", failure: reasonOf(error) })
      }
    }
  } finally {
    await pool?.end()
  }

  const at = new Date()
  await db.transaction(async (tx) => {
    // Rebuilding the search rows rewrites them for every research, so all
    // research rows are locked first (`locks.server.ts`).
    if (written.size > 0) await lockAllResearches(tx, "key share")
    for (const fetched of written.values()) await fetched.write(tx)
    if (written.size > 0) await rebuildSearchDocs(tx)
    for (const outcome of outcomes) await record(tx, outcome, at)
  })

  return outcomes
}

async function fetchSource(
  source: UpstreamSource,
  db: Database,
  pool: Pool | null,
  applicationDb: ApplicationDbConfig | null,
): Promise<Fetched> {
  if (source === "archive-date") {
    const rows = await fetchArchiveDates(db)
    return { rowCount: rows.length, write: (tx) => writeDates(tx, source, rows) }
  }

  if (source === "archive-file") {
    return fileSummariesFetched(source, await fetchArchiveFiles(db))
  }

  // The six below are only reached with a connection; the caller skips them
  // otherwise, and this makes that known to the type checker rather than by comment.
  if (pool === null || applicationDb === null) {
    throw new Error("the application system is not configured")
  }

  if (source === "cau") {
    const rows = await fetchCauEntries(pool, applicationDb.schema)
    return {
      rowCount: rows.length,
      write: async (tx) => {
        await tx.delete(cauEntry)
        await insertChunked(rows, (chunk) => tx.insert(cauEntry).values(chunk))
      },
    }
  }

  if (source === "hum-accession") {
    const rows = firstPerKey(
      await fetchHumAccessions(pool, applicationDb.schema),
      (row) => row.accession,
    )
    return {
      rowCount: rows.length,
      write: async (tx) => {
        await tx.delete(humAccession)
        await insertChunked(rows, (chunk) => tx.insert(humAccession).values(chunk))
      },
    }
  }

  if (source === "jgad-file") {
    return fileSummariesFetched(source, summarizeJgadFiles(await fetchJgadFileGroups(pool, applicationDb.schema)))
  }

  if (source === "ds-branch") {
    const rows = await fetchDsBranches(pool, applicationDb.schema)
    return {
      rowCount: rows.length,
      write: async (tx) => {
        await tx.delete(dsBranch)
        await insertChunked(rows, (chunk) => tx.insert(dsBranch).values(chunk))
      },
    }
  }

  if (source === "jgad-registration") {
    const rows = await fetchJgadRegistrations(pool, applicationDb.schema)
    return {
      rowCount: rows.length,
      write: async (tx) => {
        await tx.delete(jgadRegistration)
        await insertChunked(rows, (chunk) => tx.insert(jgadRegistration).values(chunk))
      },
    }
  }

  const rows = firstPerKey(
    await fetchJgadDates(pool, applicationDb.schema),
    (row) => row.accession,
  )
  return { rowCount: rows.length, write: (tx) => writeDates(tx, source, rows) }
}

/**
 * The pinned datasets of DRA, GEA and MetaboBank, as the DDBJ public file
 * server distributes them. Like the dates, only primary labels: a secondary
 * one is an old name for a dataset already covered. One accession at a time;
 * a DRA submission's own files are asked for a few at a time
 * (`archive-files.ts`).
 */
async function fetchArchiveFiles(db: Executor): Promise<FileSummaries> {
  const pinned = await db
    .select({ label: labelPin.label })
    .from(labelPin)
    .where(and(eq(labelPin.kind, "dataset"), eq(labelPin.isPrimary, true)))
  const wanted = [...new Set(pinned.map((row) => row.label))]
    .filter((label) => archiveFilesKindOf(label) !== null)
    .sort()
  const listed = []
  for (const accession of wanted) {
    listed.push({ accession, files: await readArchiveFiles(accession, publicFiles) })
  }
  return summarizeListedFiles(listed)
}

function fileSummariesFetched(source: UpstreamSource, summaries: FileSummaries): Fetched {
  return {
    rowCount: summaries.rows.length,
    unknownExtensions: [...summaries.unknown].sort(([a, m], [b, n]) => n - m || a.localeCompare(b)),
    write: async (tx) => {
      // The terms have to be the list's before the search rows are rebuilt from these.
      await syncFileFormatTerms(tx, { removeUnlisted: false })
      const accessions = summaries.rows.map((row) => row.accession)
      await tx.delete(accessionFileSummary).where(
        accessions.length === 0
          ? eq(accessionFileSummary.source, source)
          : or(eq(accessionFileSummary.source, source), inArray(accessionFileSummary.accession, accessions)),
      )
      await insertChunked(
        summaries.rows.map((row) => ({ ...row, source })),
        (chunk) => tx.insert(accessionFileSummary).values(chunk),
      )
    },
  }
}

/**
 * The dates DDBJ Search holds for the accessions the portal has pinned.
 *
 * Unlike the JGA half this cannot take everything upstream holds — there is no
 * listing, only one request per accession — so the set is what the `label_pin` table
 * names. **Only primary labels**, because the projection resolves a dataset's
 * date by its primary and an accession kept as a secondary is an old name for
 * something already covered.
 */
async function fetchArchiveDates(db: Executor): Promise<AccessionDateUpstreamRow[]> {
  const pinned = await db
    .select({ label: labelPin.label })
    .from(labelPin)
    .where(and(eq(labelPin.kind, "dataset"), eq(labelPin.isPrimary, true)))

  const wanted = [...new Set(pinned.map((row) => row.label))]
    .filter((label) => !isPortalIssuedId(label))
    .flatMap((label) => {
      const resource = archiveResourceOf(label)
      return resource === null ? [] : [{ label, resource }]
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const rows: AccessionDateUpstreamRow[] = []
  for (const [index, { label, resource }] of wanted.entries()) {
    if (index > 0) await pause(REQUEST_INTERVAL_MS)
    const entry = await fetchArchiveEntry(resource, label)
    // Upstream not holding an accession is an answer, not an outage: the row
    // goes away with the rest of the source's rows.
    if (entry === null) continue
    rows.push({
      accession: label,
      datePublished: calendarDayOf(entry.datePublished),
      dateModified: calendarDayOf(entry.dateModified),
    })
  }
  return rows
}

/**
 * Replacing one source's share of the dates.
 *
 * Two upstreams write this table, so the delete is by source — and also by the
 * accessions coming in, which is what lets a row change hands. The development
 * data seeds dates from the v1 dump under a source of its own, and the first
 * real refresh has to be able to take those rows over rather than collide with
 * them.
 */
async function writeDates(
  tx: Transaction,
  source: UpstreamSource,
  rows: AccessionDateUpstreamRow[],
): Promise<void> {
  const accessions = rows.map((row) => row.accession)
  await tx.delete(accessionDate).where(
    accessions.length === 0
      ? eq(accessionDate.source, source)
      : or(eq(accessionDate.source, source), inArray(accessionDate.accession, accessions)),
  )
  await insertChunked(
    rows.map((row) => ({ ...row, source })),
    (chunk) => tx.insert(accessionDate).values(chunk),
  )
}

async function record(tx: Transaction, outcome: SourceOutcome, at: Date): Promise<void> {
  if (outcome.status === "skipped") return

  const succeeded = outcome.status === "written"
  await tx
    .insert(upstreamRefresh)
    .values({
      source: outcome.source,
      attemptedAt: at,
      succeededAt: succeeded ? at : null,
      rowCount: succeeded ? outcome.rowCount : null,
      failure: succeeded ? null : outcome.failure,
    })
    .onConflictDoUpdate({
      target: upstreamRefresh.source,
      // A failure keeps the last success where it is. What the cache holds is
      // still that fetch's rows, so indicating otherwise would misreport the data.
      set: succeeded
        ? { attemptedAt: at, succeededAt: at, rowCount: outcome.rowCount, failure: null }
        : { attemptedAt: at, failure: outcome.failure },
    })
}

/**
 * Claiming a source that is due.
 *
 * The row is the lock. Several application processes run the same loop, so the
 * claim has to be one statement: whoever's update returns a row does the work.
 *
 * **A source is due once the clock passes a boundary it has not succeeded
 * since.** The boundaries are multiples of the interval counted from midnight in
 * JST (`lastBoundaryInJst`), so the refreshes fall on the same clock times every
 * day. It is claimed at the first look past the boundary, and after that only
 * once the last attempt is `retryMs` old — which is how a source that failed is
 * tried again, and how one whose process stopped mid-fetch is recovered, without
 * an attempt still in flight being started a second time.
 */
export async function claimDueSources(
  db: Database,
  sources: readonly UpstreamSource[],
  now: Date,
  interval: { minutes: number, retryMs: number },
): Promise<UpstreamSource[]> {
  const boundary = lastBoundaryInJst(now, interval.minutes)
  const retryBefore = new Date(now.getTime() - interval.retryMs)

  const claimed: UpstreamSource[] = []
  for (const source of sources) {
    const rows = await db
      .insert(upstreamRefresh)
      .values({ source, attemptedAt: now })
      .onConflictDoUpdate({
        target: upstreamRefresh.source,
        set: { attemptedAt: now },
        setWhere: and(
          or(
            isNull(upstreamRefresh.succeededAt),
            sql`${upstreamRefresh.succeededAt} < ${boundary}`,
          ),
          or(
            sql`${upstreamRefresh.attemptedAt} < ${boundary}`,
            sql`${upstreamRefresh.attemptedAt} < ${retryBefore}`,
          ),
        ),
      })
      .returning({ source: upstreamRefresh.source })
    if (rows.length > 0) claimed.push(source)
  }
  return claimed
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function firstPerKey<Row>(rows: Row[], keyOf: (row: Row) => string): Row[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = keyOf(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function insertChunked<Row>(
  rows: Row[],
  insert: (chunk: Row[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK))
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
