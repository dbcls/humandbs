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

import { ProblemDetailsSchema } from "@/api/types/request-response"

/**
 * Factory function to create OpenAPI error response spec
 */
const createErrorSpec = (description: string) => ({
  content: {
    "application/problem+json": {
      schema: ProblemDetailsSchema,
    },
  },
  description,
})

// Error response specs for OpenAPI routes
export const ErrorSpec400 = createErrorSpec("Bad Request - Validation error")
export const ErrorSpec401 = createErrorSpec("Unauthorized - Authentication required")
export const ErrorSpec403 = createErrorSpec("Forbidden - Insufficient permissions")
export const ErrorSpec404 = createErrorSpec("Not Found - Resource does not exist")
export const ErrorSpec409 = createErrorSpec("Conflict - Resource was modified by another request")
export const ErrorSpec500 = createErrorSpec("Internal Server Error - Unexpected error occurred")

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
