import type { Context } from "hono"

import { logger } from "@/api/logger"
import { getRequestId } from "@/api/middleware/request-id"
import { ErrorResponseSchema } from "@/types"

/**
 * Factory function to create OpenAPI error response spec
 */
const createErrorSpec = (description: string) => ({
  content: {
    "application/json": {
      schema: ErrorResponseSchema,
    },
  },
  description,
})

// Error response specs for OpenAPI routes
export const ErrorSpec400 = createErrorSpec("Bad Request")
export const ErrorSpec401 = createErrorSpec("Unauthorized")
export const ErrorSpec403 = createErrorSpec("Forbidden")
export const ErrorSpec404 = createErrorSpec("Not Found")
export const ErrorSpec409 = createErrorSpec("Conflict")
export const ErrorSpec500 = createErrorSpec("Internal Server Error")

// === Error Response Helper Functions ===

/**
 * 400 Validation Error response
 */
export const validationErrorResponse = (c: Context, message: string) =>
  c.json({ error: "Validation Error", message }, 400)

/**
 * 401 Unauthorized response
 */
export const unauthorizedResponse = (c: Context, message = "Authentication required") =>
  c.json({ error: "Unauthorized", message }, 401)

/**
 * 403 Forbidden response
 */
export const forbiddenResponse = (c: Context, message: string) =>
  c.json({ error: "Forbidden", message }, 403)

/**
 * 404 Not Found response
 */
export const notFoundResponse = (c: Context, message: string) =>
  c.json({ error: "Not Found", message }, 404)

/**
 * 409 Conflict response
 */
export const conflictResponse = (c: Context, message = "Resource was modified by another request") =>
  c.json({ error: "Conflict", message }, 409)

/**
 * 500 Internal Server Error response
 * Note: Details are logged server-side only, response contains generic message
 */
export const serverErrorResponse = (c: Context, error: unknown) => {
  const requestId = getRequestId(c)
  logger.error("Internal server error", { requestId, error: String(error) })
  return c.json({ error: "Internal Server Error", message: "An unexpected error occurred" }, 500)
}
