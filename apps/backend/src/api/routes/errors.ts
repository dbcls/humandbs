/**
 * Error Response Utilities
 *
 * This module provides:
 * - OpenAPI error response specs for route definitions
 * - Convenience re-exports of error classes from @/api/errors
 *
 * Error handling is done via throw:
 * - throw new ValidationError("message")
 * - throw new NotFoundError.forResource("Research", humId)
 *
 * The global error handler in app.ts catches these and returns RFC 7807 responses.
 */

import { ProblemDetailsSchema, type ProblemDetails } from "@/api/types/errors"

interface ErrorSpecParams {
  status: number
  title: string
  code: string
  detail: string
  instance: string
  description: string
}

const PROBLEM_DETAILS_TIMESTAMP = "2025-01-15T08:00:00.000Z"
const PROBLEM_DETAILS_REQUEST_ID = "req_01HZ4K2W3X7Y8Z9A0B1C2D3E4F"

const createErrorSpec = ({ status, title, code, detail, instance, description }: ErrorSpecParams) => {
  const example: ProblemDetails = {
    type: `about:blank#${code.toLowerCase().replace(/_/g, "-")}`,
    title,
    status,
    detail,
    instance,
    timestamp: PROBLEM_DETAILS_TIMESTAMP,
    requestId: PROBLEM_DETAILS_REQUEST_ID,
  }
  return {
    content: {
      "application/problem+json": {
        schema: ProblemDetailsSchema,
        example,
      },
    },
    description,
  }
}

export const ErrorSpec400 = createErrorSpec({
  status: 400,
  title: "Validation Error",
  code: "VALIDATION_ERROR",
  detail: "query.lang: Invalid enum value. Expected 'ja' | 'en', received 'fr'",
  instance: "/research",
  description: "Bad Request - Validation error",
})

export const ErrorSpec401 = createErrorSpec({
  status: 401,
  title: "Unauthorized",
  code: "UNAUTHORIZED",
  detail: "Authentication required",
  instance: "/research/hum0001/update",
  description: "Unauthorized - Authentication required",
})

export const ErrorSpec403 = createErrorSpec({
  status: 403,
  title: "Forbidden",
  code: "FORBIDDEN",
  detail: "Not authorized",
  instance: "/research/hum0001/approve",
  description: "Forbidden - Insufficient permissions",
})

export const ErrorSpec404 = createErrorSpec({
  status: 404,
  title: "Not Found",
  code: "NOT_FOUND",
  detail: "Research hum9999 not found",
  instance: "/research/hum9999",
  description: "Not Found - Resource does not exist",
})

export const ErrorSpec409 = createErrorSpec({
  status: 409,
  title: "Conflict",
  code: "CONFLICT",
  detail: "Resource was modified by another request",
  instance: "/research/hum0001/update",
  description: "Conflict - Resource was modified by another request",
})

export const ErrorSpec500 = createErrorSpec({
  status: 500,
  title: "Internal Server Error",
  code: "INTERNAL_ERROR",
  detail: "An unexpected error occurred",
  instance: "/research",
  description: "Internal Server Error - Unexpected error occurred",
})

// Re-export error classes for convenience
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalError,
  isAppError,
} from "@/api/errors"
