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
 * A source with no connection to reach is skipped, not failed, and leaves no
 * record: the table answers how the last fetch went, and no fetch was made
 * (docs/data-model.md の「外部キャッシュ」).
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"
import type { Pool } from "pg"

import { isPortalIssuedId } from "~/admin/labels"
import { loadConfig, type ApplicationDbConfig } from "~/config.server"
import type { Database, Executor, Transaction } from "~/db/client.server"
import { accessionDate, cauEntry, humAccession, labelPin, upstreamRefresh } from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { archiveResourceOf, calendarDayOf } from "./archive"
import {
  fetchCauEntries,
  fetchHumAccessions,
  fetchJgadDates,
  openApplicationDb,
  type AccessionDateUpstreamRow,
} from "./application-db.server"
import { fetchArchiveEntry } from "./ddbj-search.server"
import { APPLICATION_DB_SOURCES, UPSTREAM_SOURCES, type UpstreamSource } from "./sources"

const CHUNK = 500

/**
 * DDBJ Search is asked for one accession at a time and there is no bulk form,
 * so the requests are spaced. Fewer than a hundred accessions need it, which
 * makes the whole source about half a minute.
 */
const REQUEST_INTERVAL_MS = 250

export type SourceOutcome
  = | { source: UpstreamSource, status: "written", rowCount: number }
    | { source: UpstreamSource, status: "failed", failure: string }
    | { source: UpstreamSource, status: "skipped" }

/** A fetch that came back, holding its rows until the transaction opens. */
interface Fetched {
  rowCount: number
  write: (tx: Transaction) => Promise<void>
}

export function needsApplicationDb(source: UpstreamSource): boolean {
  return (APPLICATION_DB_SOURCES as readonly UpstreamSource[]).includes(source)
}

export async function runUpstreamRefresh(
  db: Database,
  sources: readonly UpstreamSource[] = UPSTREAM_SOURCES,
): Promise<SourceOutcome[]> {
  const applicationDb = loadConfig(process.env).applicationDb
  // Opened only if one of the sources asked for reads it, so refreshing the
  // archive dates alone does not reach for another project's database.
  const pool = applicationDb !== null && sources.some(needsApplicationDb)
    ? openApplicationDb(applicationDb)
    : null

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
        written.set(source, fetched)
        outcomes.push({ source, status: "written", rowCount: fetched.rowCount })
      } catch (error) {
        outcomes.push({ source, status: "failed", failure: reasonOf(error) })
      }
    }
  } finally {
    await pool?.end()
  }

  const at = new Date()
  await db.transaction(async (tx) => {
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

  // The three below are only reached with a connection; the caller skips them
  // otherwise, and this says so to the type checker rather than by comment.
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

  const rows = firstPerKey(
    await fetchJgadDates(pool, applicationDb.schema),
    (row) => row.accession,
  )
  return { rowCount: rows.length, write: (tx) => writeDates(tx, source, rows) }
}

/**
 * The dates DDBJ Search answers for, for the accessions the portal has pinned.
 *
 * Unlike the JGA half this cannot take everything upstream holds — there is no
 * listing, only one request per accession — so the set is what the pin ledger
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
      // still that fetch's rows, so saying otherwise would misreport the data.
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
 * An attempt older than the timeout is treated as abandoned, which is how a
 * source recovers from a process that stopped mid-fetch.
 */
export async function claimDueSources(
  db: Database,
  sources: readonly UpstreamSource[],
  now: Date,
  interval: { refreshMs: number, attemptTimeoutMs: number },
): Promise<UpstreamSource[]> {
  const dueBefore = new Date(now.getTime() - interval.refreshMs)
  const abandonedBefore = new Date(now.getTime() - interval.attemptTimeoutMs)

  const claimed: UpstreamSource[] = []
  for (const source of sources) {
    const rows = await db
      .insert(upstreamRefresh)
      .values({ source, attemptedAt: now })
      .onConflictDoUpdate({
        target: upstreamRefresh.source,
        set: { attemptedAt: now },
        setWhere: and(
          sql`${upstreamRefresh.attemptedAt} < ${abandonedBefore}`,
          or(
            isNull(upstreamRefresh.succeededAt),
            sql`${upstreamRefresh.succeededAt} < ${dueBefore}`,
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
