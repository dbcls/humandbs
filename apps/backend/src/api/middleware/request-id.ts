/**
 * Request ID Middleware
 *
 * Generates or extracts a unique request ID for each request.
 * The ID is used for log correlation and error tracking.
 */

import type { MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"
import { randomUUID } from "node:crypto"

// Extend Hono context with requestId
declare module "hono" {
  interface ContextVariableMap {
    requestId: string
  }
}

/**
 * Header name for request ID.
 * Standard header used by many services and load balancers.
 */
export const REQUEST_ID_HEADER = "X-Request-ID"

/**
 * Middleware that assigns a unique request ID to each request.
 *
 * If the request includes an X-Request-ID header, that value is used.
 * Otherwise, a new UUID is generated.
 *
 * The request ID is:
 * - Stored in context via c.set("requestId", id)
 * - Added to response headers
 */
export const requestIdMiddleware: MiddlewareHandler = createMiddleware(async (c, next) => {
  // Use existing header or generate new ID
  const requestId = c.req.header(REQUEST_ID_HEADER) ?? randomUUID()

  // Store in context for use by handlers and other middleware
  c.set("requestId", requestId)

  // Add to response headers
  c.header(REQUEST_ID_HEADER, requestId)

  await next()
})

/**
 * Get request ID from context.
 * Returns "unknown" if not available (should not happen if middleware is properly configured).
 */
export function getRequestId(c: { get: (key: "requestId") => string | undefined }): string {
  return c.get("requestId") ?? "unknown"
}
