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

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "elasticsearch"
const ES_PORT = process.env.HUMANDBS_ES_PORT ?? "9200"
const ES_NODE = `http://${ES_HOST}:${ES_PORT}`

const createEsClient = () => {
  return new Client({
    node: ES_NODE,
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
 * Check if an error is a document already exists error (409 from op_type: create)
 *
 * When using op_type: "create", ES returns 409 with error type "version_conflict_engine_exception"
 * and reason containing "[<id>]: version conflict, document already exists"
 */
export const isDocumentExistsError = (error: unknown): boolean => {
  if (error && typeof error === "object" && "meta" in error) {
    const esError = error as {
      meta?: {
        statusCode?: number
        body?: { error?: { type?: string; reason?: string } }
      }
    }
    if (esError.meta?.statusCode !== 409) return false

    const errorType = esError.meta?.body?.error?.type
    const reason = esError.meta?.body?.error?.reason ?? ""

    // op_type: "create" returns version_conflict_engine_exception with "document already exists" in reason
    return (
      errorType === "version_conflict_engine_exception" &&
      reason.includes("document already exists")
    )
  }
  return false
}

// Re-export estypes for use in other modules
export type { estypes }
