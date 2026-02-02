/**
 * Elasticsearch client initialization and configuration
 *
 * This module provides:
 * - ES client singleton
 * - Index name constants
 * - Utility functions for ES operations
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"
import type { estypes } from "@elastic/elasticsearch"

// === Index Names ===

export const ES_INDEX = {
  research: "research",
  researchVersion: "research-version",
  dataset: "dataset",
} as const

// === Client Configuration ===

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "http://humandbs-elasticsearch-dev:9200"

const createEsClient = () => {
  return new Client({
    node: ES_HOST,
    Connection: HttpConnection,
  })
}

/**
 * Singleton ES client instance
 */
export const esClient = createEsClient()

// === Optimistic Lock Helpers ===

/**
 * Check if an error is an ES version conflict (409)
 */
export const isConflictError = (error: unknown): boolean => {
  if (error && typeof error === "object" && "meta" in error) {
    const esError = error as { meta?: { statusCode?: number } }
    return esError.meta?.statusCode === 409
  }
  return false
}

/**
 * Execute an ES update operation with optimistic locking
 * Returns null on conflict, throws on other errors
 */
export const withOptimisticLock = async <T>(
  operation: () => Promise<T>,
): Promise<T | null> => {
  try {
    return await operation()
  } catch (error: unknown) {
    if (isConflictError(error)) {
      return null
    }
    throw error
  }
}

// Re-export estypes for use in other modules
export type { estypes }
