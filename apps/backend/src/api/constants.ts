/**
 * API Constants
 *
 * Centralized constants for pagination, caching, and Elasticsearch settings.
 */

// === Pagination ===

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const

// === Batch Retrieval ===

export const BATCH = {
  /** Max number of IDs accepted per batch-get request (GET /dataset/batch, /research/batch). */
  MAX_IDS: 100,
} as const

// === Cache TTL (in milliseconds) ===

export const CACHE_TTL = {
  /** JWKS cache - 5 minutes (short TTL with retry on verification failure) */
  JWKS: 5 * 60 * 1000,
  /** Admin UIDs cache - 1 minute (shorter for faster updates) */
  ADMIN_UIDS: 60 * 1000,
  /** Distribution cache - 1 hour (dblink relations rarely change) */
  DISTRIBUTION: 60 * 60 * 1000,
  /** Ownership cache - 1 hour (JGA DB ownership data changes rarely) */
  OWNERSHIP: 60 * 60 * 1000,
} as const

// === Error Messages ===

export const ERROR_MESSAGES = {
  UNAUTHORIZED: "Authentication required",
  FORBIDDEN: "Not authorized",
  FORBIDDEN_ADMIN: "Admin access required",
  NOT_FOUND: (resource: string, id: string) => `${resource} ${id} not found`,
  CONFLICT: "Resource was modified by another request",
  INTERNAL_ERROR: "Internal Server Error",
} as const
