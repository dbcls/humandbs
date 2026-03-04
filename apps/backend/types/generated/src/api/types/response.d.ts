/**
 * Response Type Definitions
 *
 * This module provides:
 * - Base response meta schemas (requestId, timestamp)
 * - Pagination schema
 * - Response meta with optimistic locking fields
 * - Generic response wrapper factories
 *
 * All API responses should use these schemas for consistency.
 */
import { z } from "zod";
/**
 * Pagination metadata for list responses
 */
export declare const PaginationSchema: z.ZodObject<{
    page: z.ZodNumber;
    limit: z.ZodNumber;
    total: z.ZodNumber;
    totalPages: z.ZodNumber;
    hasNext: z.ZodBoolean;
    hasPrev: z.ZodBoolean;
}, z.core.$strip>;
export type Pagination = z.infer<typeof PaginationSchema>;
/**
 * Create pagination object from total count and query params
 */
export declare function createPagination(total: number, page: number, limit: number): Pagination;
/**
 * Base meta information for all responses
 * Contains requestId and timestamp for traceability
 */
export declare const BaseResponseMetaSchema: z.ZodObject<{
    requestId: z.ZodString;
    timestamp: z.ZodString;
}, z.core.$strip>;
export type BaseResponseMeta = z.infer<typeof BaseResponseMetaSchema>;
/**
 * Meta information for single read-only resource responses
 * No optimistic locking fields (resource cannot be edited)
 */
export declare const ResponseMetaReadOnlySchema: z.ZodObject<{
    requestId: z.ZodString;
    timestamp: z.ZodString;
}, z.core.$strip>;
export type ResponseMetaReadOnly = z.infer<typeof ResponseMetaReadOnlySchema>;
/**
 * Meta information for single editable resource responses
 * Contains optimistic locking fields for concurrent edit detection
 */
export declare const ResponseMetaWithLockSchema: z.ZodObject<{
    requestId: z.ZodString;
    timestamp: z.ZodString;
    _seq_no: z.ZodNumber;
    _primary_term: z.ZodNumber;
}, z.core.$strip>;
export type ResponseMetaWithLock = z.infer<typeof ResponseMetaWithLockSchema>;
/**
 * Meta information for list responses
 * Contains pagination information
 */
export declare const ResponseMetaWithPaginationSchema: z.ZodObject<{
    requestId: z.ZodString;
    timestamp: z.ZodString;
    pagination: z.ZodObject<{
        page: z.ZodNumber;
        limit: z.ZodNumber;
        total: z.ZodNumber;
        totalPages: z.ZodNumber;
        hasNext: z.ZodBoolean;
        hasPrev: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ResponseMetaWithPagination = z.infer<typeof ResponseMetaWithPaginationSchema>;
/**
 * Single read-only resource response type
 */
export interface SingleReadOnlyResponse<T> {
    data: T;
    meta: ResponseMetaReadOnly;
}
/**
 * Single editable resource response type
 */
export interface SingleResponse<T> {
    data: T;
    meta: ResponseMetaWithLock;
}
/**
 * List response type
 */
export interface ListResponse<T> {
    data: T[];
    meta: ResponseMetaWithPagination;
}
/**
 * Search response type with facets
 */
export interface SearchResponse<T, F = Record<string, {
    value: string;
    count: number;
}[] | undefined>> {
    data: T[];
    meta: ResponseMetaWithPagination;
    facets?: F;
}
//# sourceMappingURL=response.d.ts.map