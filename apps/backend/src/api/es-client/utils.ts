/**
 * Elasticsearch utility functions
 *
 * This module provides:
 * - Common utility functions for ES operations
 * - Batch retrieval helpers
 * - Optimistic-locked write helpers
 */
import { esClient } from "@/api/es-client/client"

// === Utility Functions ===

/**
 * Extract total count from ES response
 */
export const esTotal = (t: number | { value: number } | undefined) => {
  return typeof t === "number" ? t : t?.value ?? 0
}

/**
 * Escape Elasticsearch wildcard query special characters.
 *
 * The ES `wildcard` query treats `*`, `?`, and `\` as syntax. When user input
 * is embedded into a `wildcard` value (e.g. `*${value}*` for partial match),
 * unescaped `*` / `?` let the caller widen the match to "anything", which can
 * be used to inflate ES CPU cost on already-leading-wildcard queries.
 *
 * Reference: Elasticsearch query DSL — wildcard query.
 */
export const escapeEsWildcard = (value: string): string => {
  return value.replace(/[\\*?]/g, m => `\\${m}`)
}

/**
 * Remove duplicates from array
 */
export const uniq = <T>(arr: T[]): T[] => {
  return Array.from(new Set(arr))
}

/**
 * Request body for a partial update guarded by `if_seq_no` / `if_primary_term`.
 *
 * `detect_noop: false` keeps ES from skipping a write whose `doc` already equals
 * the stored source. A skipped write returns `result: "noop"` and leaves
 * `_seq_no` untouched, so the lock value the caller just spent stays valid and
 * their next update passes the guard instead of being rejected — two concurrent
 * editors would both succeed. Updates carrying only the date-granular
 * `dateModified` hit that on every same-day edit.
 */
export const lockedUpdateBody = <T>(doc: T) => ({ doc, detect_noop: false })

/**
 * Batch get documents by IDs and return as Map
 */
export const mgetMap = async <T>(
  index: string,
  ids: string[],
  parse: (doc: unknown) => T,
): Promise<Map<string, T>> => {
  if (ids.length === 0) return new Map()
  const { docs } = await esClient.mget<T>({
    index,
    body: { ids: uniq(ids) },
  })
  const m = new Map<string, T>()
  for (const doc of docs as { found?: boolean; _id?: string; _source?: unknown }[]) {
    if (doc.found && doc._id && doc._source) {
      m.set(doc._id, parse(doc._source))
    }
  }
  return m
}
