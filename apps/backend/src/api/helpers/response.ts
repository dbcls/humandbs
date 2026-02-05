/**
 * Response Helper Functions
 *
 * Provides unified response formatting for all API endpoints.
 * These helpers ensure consistent response structure across the API.
 */

import type { Context } from "hono"

import { getRequestId } from "@/api/middleware/request-id"
import type {
  Pagination,
  SingleReadOnlyResponse,
  SingleResponse,
  ListResponse,
  SearchResponse,
} from "@/api/types/response"

/**
 * Create base meta information for responses
 */
function createBaseMeta(c: Context) {
  return {
    requestId: getRequestId(c),
    timestamp: new Date().toISOString(),
  }
}

/**
 * Create response for single editable resource (200 OK)
 *
 * Used for:
 * - GET single resource (with lock info for subsequent updates)
 * - PUT update resource (returns updated resource with new lock info)
 * - POST workflow actions (returns updated resource with new lock info)
 *
 * @param c - Hono context
 * @param data - The resource data
 * @param seqNo - Elasticsearch sequence number for optimistic locking
 * @param primaryTerm - Elasticsearch primary term for optimistic locking
 */
export function singleResponse<T>(
  c: Context,
  data: T,
  seqNo: number,
  primaryTerm: number,
) {
  const response: SingleResponse<T> = {
    data,
    meta: {
      ...createBaseMeta(c),
      _seq_no: seqNo,
      _primary_term: primaryTerm,
    },
  }
  return c.json(response, 200 as const)
}

/**
 * Create response for newly created resource (201 Created)
 *
 * Used for:
 * - POST create resource (returns created resource with lock info)
 *
 * @param c - Hono context
 * @param data - The resource data
 * @param seqNo - Elasticsearch sequence number for optimistic locking
 * @param primaryTerm - Elasticsearch primary term for optimistic locking
 */
export function createdResponse<T>(
  c: Context,
  data: T,
  seqNo: number,
  primaryTerm: number,
) {
  const response: SingleResponse<T> = {
    data,
    meta: {
      ...createBaseMeta(c),
      _seq_no: seqNo,
      _primary_term: primaryTerm,
    },
  }
  return c.json(response, 201 as const)
}

/**
 * Create response for single read-only resource
 *
 * Used for:
 * - GET historical versions (cannot be edited)
 * - GET aggregated data (stats, facets)
 * - GET current user info
 *
 * @param c - Hono context
 * @param data - The resource data
 */
export function singleReadOnlyResponse<T>(
  c: Context,
  data: T,
) {
  const response: SingleReadOnlyResponse<T> = {
    data,
    meta: createBaseMeta(c),
  }
  return c.json(response, 200 as const)
}

/**
 * Create response for list of resources
 *
 * Used for:
 * - GET /research (list all)
 * - GET /dataset (list all)
 * - GET /research/{humId}/versions (list versions)
 * - GET /research/{humId}/dataset (list datasets)
 *
 * @param c - Hono context
 * @param data - Array of resource items
 * @param pagination - Pagination metadata
 * @param status - HTTP status code (default: 200)
 */
export function listResponse<T>(
  c: Context,
  data: T[],
  pagination: Pagination,
  status: 200 = 200,
) {
  const response: ListResponse<T> = {
    data,
    meta: {
      ...createBaseMeta(c),
      pagination,
    },
  }
  return c.json(response, status)
}

/**
 * Create response for search results with optional facets
 *
 * Used for:
 * - POST /research/search
 * - POST /dataset/search
 *
 * @param c - Hono context
 * @param data - Array of search result items
 * @param pagination - Pagination metadata
 * @param facets - Optional facet aggregations
 * @param status - HTTP status code (default: 200)
 */
export function searchResponse<T, F = Record<string, { value: string; count: number }[]>>(
  c: Context,
  data: T[],
  pagination: Pagination,
  facets?: F,
  status: 200 = 200,
) {
  const response: SearchResponse<T, F> = {
    data,
    meta: {
      ...createBaseMeta(c),
      pagination,
    },
  }
  if (facets !== undefined) {
    response.facets = facets
  }
  return c.json(response, status)
}
