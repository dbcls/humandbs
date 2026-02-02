/**
 * Elasticsearch Client Wrapper
 *
 * Provides retry logic with exponential backoff for ES operations.
 * Handles transient errors and timeouts gracefully.
 */

import { logger } from "@/api/logger"

// === Configuration ===

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number
  /** Initial delay in ms before first retry (default: 100) */
  initialDelayMs: number
  /** Maximum delay in ms between retries (default: 5000) */
  maxDelayMs: number
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
}

// === Retryable Error Detection ===

/**
 * ES error codes that are retryable
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
])

/**
 * ES error types that indicate transient failures
 */
const RETRYABLE_ERROR_TYPES = new Set([
  "NoLivingConnectionsError",
  "ConnectionError",
  "TimeoutError",
])

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  // Check ES client error status code
  const esError = error as {
    meta?: { statusCode?: number }
    name?: string
    code?: string
  }

  if (esError.meta?.statusCode && RETRYABLE_STATUS_CODES.has(esError.meta.statusCode)) {
    return true
  }

  // Check error type
  if (esError.name && RETRYABLE_ERROR_TYPES.has(esError.name)) {
    return true
  }

  // Check for ECONNRESET and similar network errors
  if (esError.code && ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(esError.code)) {
    return true
  }

  return false
}

// === Delay Utility ===

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1)
  return Math.min(delay + jitter, config.maxDelayMs)
}

// === Main Retry Function ===

/**
 * Execute an async operation with retry logic.
 *
 * @param operation - Async function to execute
 * @param operationName - Name for logging purposes
 * @param config - Optional retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries fail
 *
 * @example
 * const result = await withRetry(
 *   () => esClient.search({ index: "research", query }),
 *   "search-research"
 * )
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: unknown

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      // Don't retry if we've exhausted attempts or error isn't retryable
      if (attempt >= retryConfig.maxRetries || !isRetryableError(error)) {
        throw error
      }

      const delay = calculateDelay(attempt, retryConfig)

      logger.warn("ES operation failed, retrying", {
        operation: operationName,
        attempt: attempt + 1,
        maxRetries: retryConfig.maxRetries,
        delayMs: Math.round(delay),
        error: String(error),
      })

      await sleep(delay)
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError
}

// === Timeout Wrapper ===

export class TimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`Operation '${operationName}' timed out after ${timeoutMs}ms`)
    this.name = "TimeoutError"
  }
}

/**
 * Execute an operation with a timeout.
 *
 * @param operation - Async function to execute
 * @param operationName - Name for error messages
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result of the operation
 * @throws TimeoutError if operation exceeds timeout
 *
 * @example
 * const result = await withTimeout(
 *   () => esClient.search({ index: "research", query }),
 *   "search-research",
 *   30000
 * )
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  operationName: string,
  timeoutMs: number,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs))
    }, timeoutMs)
  })

  return Promise.race([operation(), timeoutPromise])
}

/**
 * Execute an operation with both retry and timeout logic.
 *
 * @param operation - Async function to execute
 * @param operationName - Name for logging
 * @param options - Retry and timeout configuration
 * @returns Result of the operation
 *
 * @example
 * const result = await withRetryAndTimeout(
 *   () => esClient.search({ index: "research", query }),
 *   "search-research",
 *   { timeoutMs: 30000, maxRetries: 3 }
 * )
 */
export async function withRetryAndTimeout<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: Partial<RetryConfig> & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs, ...retryConfig } = options

  const wrappedOperation = timeoutMs
    ? () => withTimeout(operation, operationName, timeoutMs)
    : operation

  return withRetry(wrappedOperation, operationName, retryConfig)
}
