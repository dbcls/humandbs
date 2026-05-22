/**
 * RFC 7807 Problem Details and error code definitions.
 *
 * The HTTP error response shape is published here so OpenAPI specs, route
 * handlers and the global error handler in `app.ts` all reference the same
 * Zod schema.
 */
import "@hono/zod-openapi"
import { z } from "zod"

/**
 * Error codes used in API problem responses.
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * RFC 7807 Problem Details for HTTP APIs
 * @see https://tools.ietf.org/html/rfc7807
 */
export const ProblemDetailsSchema = z.object({
  type: z
    .url()
    .describe(
      "URI reference identifying the problem type (e.g., 'https://api.humandbs.dbcls.jp/errors/not-found')",
    ),
  title: z
    .string()
    .describe(
      "Short, human-readable summary of the problem type (e.g., 'Not Found', 'Validation Error')",
    ),
  status: z
    .number()
    .int()
    .min(400)
    .max(599)
    .describe("HTTP status code for this error (e.g., 400, 401, 404, 500)"),
  detail: z
    .string()
    .optional()
    .describe(
      "Human-readable explanation specific to this occurrence of the problem",
    ),
  instance: z
    .string()
    .optional()
    .describe(
      "URI reference for the specific occurrence, usually the request path",
    ),
  timestamp: z
    .string()
    .describe("ISO 8601 timestamp of when the error occurred"),
  requestId: z
    .string()
    .optional()
    .describe("Unique request identifier for tracing and debugging"),
})
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>
