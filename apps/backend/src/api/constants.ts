/**
 * API Constants
 *
 * Centralized constants for pagination, caching, and Elasticsearch settings.
 */

// === Pagination ===

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
} as const

// === Cache TTL (in milliseconds) ===

export const CACHE_TTL = {
  /** JWKS cache - 1 hour */
  JWKS: 3600 * 1000,
  /** Admin UIDs cache - 1 minute (shorter for faster updates) */
  ADMIN_UIDS: 60 * 1000,
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
