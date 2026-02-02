/**
 * Custom Error Classes
 *
 * Provides typed error classes for consistent error handling across the API.
 * All errors extend AppError base class for type-safe error handling.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status"

/**
 * HTTP status codes used by the API
 */
export type ErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 500

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  readonly statusCode: ErrorStatusCode
  readonly code: string

  constructor(message: string, statusCode: ErrorStatusCode, code: string) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * 400 Bad Request - Validation errors, malformed requests
 */
export class ValidationError extends AppError {
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR")
    this.details = details
  }
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED")
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends AppError {
  constructor(message = "Not authorized") {
    super(message, 403, "FORBIDDEN")
  }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends AppError {
  readonly resourceType?: string
  readonly resourceId?: string

  constructor(message: string, resourceType?: string, resourceId?: string) {
    super(message, 404, "NOT_FOUND")
    this.resourceType = resourceType
    this.resourceId = resourceId
  }

  /**
   * Create a NotFoundError for a specific resource
   */
  static forResource(resourceType: string, resourceId: string): NotFoundError {
    return new NotFoundError(
      `${resourceType} with ID '${resourceId}' not found`,
      resourceType,
      resourceId,
    )
  }
}

/**
 * 409 Conflict - Optimistic lock failure, duplicate resource
 */
export class ConflictError extends AppError {
  constructor(message = "Resource was modified by another request") {
    super(message, 409, "CONFLICT")
  }
}

/**
 * 500 Internal Server Error - Unexpected server errors
 */
export class InternalError extends AppError {
  readonly cause?: unknown

  constructor(message = "An unexpected error occurred", cause?: unknown) {
    super(message, 500, "INTERNAL_ERROR")
    this.cause = cause
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Create appropriate error from HTTP status code
 */
export function createErrorFromStatus(
  status: ContentfulStatusCode,
  message: string,
): AppError {
  switch (status) {
    case 400:
      return new ValidationError(message)
    case 401:
      return new UnauthorizedError(message)
    case 403:
      return new ForbiddenError(message)
    case 404:
      return new NotFoundError(message)
    case 409:
      return new ConflictError(message)
    default:
      return new InternalError(message)
  }
}

// === RFC 7807 Problem Details ===

/**
 * Base URL for error type URIs
 */
const ERROR_TYPE_BASE = "https://humandbs.dbcls.jp/errors"

/**
 * Error type URIs mapped from error codes
 */
export const ERROR_TYPE_URIS: Record<string, string> = {
  VALIDATION_ERROR: `${ERROR_TYPE_BASE}/validation-error`,
  UNAUTHORIZED: `${ERROR_TYPE_BASE}/unauthorized`,
  FORBIDDEN: `${ERROR_TYPE_BASE}/forbidden`,
  NOT_FOUND: `${ERROR_TYPE_BASE}/not-found`,
  CONFLICT: `${ERROR_TYPE_BASE}/conflict`,
  INTERNAL_ERROR: `${ERROR_TYPE_BASE}/internal-error`,
}

/**
 * Human-readable titles for error codes
 */
export const ERROR_TITLES: Record<string, string> = {
  VALIDATION_ERROR: "Validation Error",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  FORBIDDEN_ADMIN: "Forbidden",
  NOT_FOUND: "Not Found",
  CONFLICT: "Conflict",
  INTERNAL_ERROR: "Internal Server Error",
}

/**
 * RFC 7807 Problem Details response structure
 */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  timestamp: string
  requestId?: string
}

/**
 * Create RFC 7807 Problem Details from AppError
 */
export function toProblemDetails(
  error: AppError,
  requestId?: string,
  instance?: string,
): ProblemDetails {
  return {
    type: ERROR_TYPE_URIS[error.code] || `${ERROR_TYPE_BASE}/unknown`,
    title: ERROR_TITLES[error.code] || "Error",
    status: error.statusCode,
    detail: error.message,
    instance,
    timestamp: new Date().toISOString(),
    requestId,
  }
}

/**
 * Create RFC 7807 Problem Details from status code and message
 */
export function createProblemDetails(
  status: ErrorStatusCode,
  code: string,
  message: string,
  requestId?: string,
  instance?: string,
): ProblemDetails {
  return {
    type: ERROR_TYPE_URIS[code] || `${ERROR_TYPE_BASE}/unknown`,
    title: ERROR_TITLES[code] || "Error",
    status,
    detail: message,
    instance,
    timestamp: new Date().toISOString(),
    requestId,
  }
}
