/**
 * What the management screen says about the caches.
 *
 * Every source is listed, including ones that have never been fetched, because
 * the answer people need is "is anything stalled" and a source missing from the
 * list would read as one fewer thing to worry about. A failure keeps the last
 * success beside it: the cache still holds that fetch's rows, and how old they
 * are is the whole point of showing this (docs/editing.md の「管理画面」).
 */

import type { Executor } from "~/db/client.server"
import { upstreamRefresh } from "~/db/schema"

import { UPSTREAM_SOURCES, type UpstreamSource } from "./sources"

export interface UpstreamStatusRow {
  source: UpstreamSource
  attemptedAt: string | null
  succeededAt: string | null
  rowCount: number | null
  failure: string | null
}

export async function upstreamStatus(db: Executor): Promise<UpstreamStatusRow[]> {
  const rows = await db.select().from(upstreamRefresh)
  const bySource = new Map(rows.map((row) => [row.source, row]))
  return UPSTREAM_SOURCES.map((source) => {
    const row = bySource.get(source)
    return {
      source,
      attemptedAt: row?.attemptedAt.toISOString() ?? null,
      succeededAt: row?.succeededAt?.toISOString() ?? null,
      rowCount: row?.rowCount ?? null,
      failure: row?.failure ?? null,
    }
  })
}
