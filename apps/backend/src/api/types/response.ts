/**
 * Unified Response Type Definitions
 *
 * This module provides:
 * - Base response meta schemas (requestId, timestamp)
 * - Pagination schema
 * - Response meta with optimistic locking fields
 * - Generic response wrapper factories
 *
 * All API responses should use these schemas for consistency.
 */
import { z } from "zod"

// === Pagination ===

/**
 * Pagination metadata for list responses
 */
export const PaginationSchema = z.object({
  page: z.number().int().positive()
    .describe("Current page number (1-indexed)"),
  limit: z.number().int().positive()
    .describe("Number of items per page"),
  total: z.number().int().nonnegative()
    .describe("Total number of items matching the query"),
  totalPages: z.number().int().nonnegative()
    .describe("Total number of pages available"),
  hasNext: z.boolean()
    .describe("Whether there is a next page"),
  hasPrev: z.boolean()
    .describe("Whether there is a previous page"),
})
export type Pagination = z.infer<typeof PaginationSchema>

/**
 * Create pagination object from total count and query params
 */
export function createPagination(total: number, page: number, limit: number): Pagination {
  const totalPages = Math.ceil(total / limit)
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  }
}

// === Base Response Meta ===

/**
 * Base meta information for all responses
 * Contains requestId and timestamp for traceability
 */
export const BaseResponseMetaSchema = z.object({
  requestId: z.string()
    .describe("Unique request identifier for tracing and debugging"),
  timestamp: z.string()
    .describe("ISO 8601 timestamp when the response was generated"),
})
export type BaseResponseMeta = z.infer<typeof BaseResponseMetaSchema>

// === Response Meta Variants ===

/**
 * Meta information for single read-only resource responses
 * No optimistic locking fields (resource cannot be edited)
 */
export const ResponseMetaReadOnlySchema = BaseResponseMetaSchema
export type ResponseMetaReadOnly = z.infer<typeof ResponseMetaReadOnlySchema>

/**
 * Meta information for single editable resource responses
 * Contains optimistic locking fields for concurrent edit detection
 */
export const ResponseMetaWithLockSchema = BaseResponseMetaSchema.extend({
  _seq_no: z.number().int().nonnegative()
    .describe("Elasticsearch sequence number for optimistic concurrency control. Include in update requests to prevent overwriting concurrent changes."),
  _primary_term: z.number().int().positive()
    .describe("Elasticsearch primary term for optimistic concurrency control. Include in update requests along with _seq_no."),
})
export type ResponseMetaWithLock = z.infer<typeof ResponseMetaWithLockSchema>

/**
 * Meta information for list responses
 * Contains pagination information
 */
export const ResponseMetaWithPaginationSchema = BaseResponseMetaSchema.extend({
  pagination: PaginationSchema,
})
export type ResponseMetaWithPagination = z.infer<typeof ResponseMetaWithPaginationSchema>

// === Response Type Aliases ===

/**
 * Single read-only resource response type
 */
export interface SingleReadOnlyResponse<T> {
  data: T
  meta: ResponseMetaReadOnly
}

/**
 * Single editable resource response type
 */
export interface SingleResponse<T> {
  data: T
  meta: ResponseMetaWithLock
}

/**
 * List response type
 */
export interface ListResponse<T> {
  data: T[]
  meta: ResponseMetaWithPagination
}

/**
 * Search response type with facets
 */
export interface SearchResponse<T, F = Record<string, { value: string; count: number }[]>> {
  data: T[]
  meta: ResponseMetaWithPagination
  facets?: F
}
