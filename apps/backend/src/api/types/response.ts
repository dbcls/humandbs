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
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
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
  requestId: z.string(),
  timestamp: z.string(),
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
  _seq_no: z.number().int().nonnegative(),
  _primary_term: z.number().int().positive(),
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

// === Generic Response Wrappers ===

/**
 * Create schema for single read-only resource response
 *
 * Response format:
 * {
 *   data: T,
 *   meta: { requestId, timestamp }
 * }
 */
export const createSingleReadOnlyResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: ResponseMetaReadOnlySchema,
  })

/**
 * Create schema for single editable resource response
 *
 * Response format:
 * {
 *   data: T,
 *   meta: { requestId, timestamp, _seq_no, _primary_term }
 * }
 */
export const createSingleResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: ResponseMetaWithLockSchema,
  })

/**
 * Create schema for list response
 *
 * Response format:
 * {
 *   data: T[],
 *   meta: { requestId, timestamp, pagination: {...} }
 * }
 */
export const createListResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: ResponseMetaWithPaginationSchema,
  })

/**
 * Create schema for search response with optional facets
 *
 * Response format:
 * {
 *   data: T[],
 *   meta: { requestId, timestamp, pagination: {...} },
 *   facets?: { [fieldName]: { value, count }[] }
 * }
 */
export const createSearchResponseSchema = <T extends z.ZodType, F extends z.ZodType>(
  itemSchema: T,
  facetsSchema?: F,
) =>
  z.object({
    data: z.array(itemSchema),
    meta: ResponseMetaWithPaginationSchema,
    facets: facetsSchema ? facetsSchema.optional() : z.record(z.string(), z.array(z.object({
      value: z.string(),
      count: z.number(),
    }))).optional(),
  })

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
