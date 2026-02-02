/**
 * Elasticsearch utility functions
 *
 * This module provides:
 * - Common utility functions for ES operations
 * - Batch retrieval helpers
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
 * Remove duplicates from array
 */
export const uniq = <T>(arr: T[]): T[] => {
  return Array.from(new Set(arr))
}

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
