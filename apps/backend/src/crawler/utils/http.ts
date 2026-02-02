/**
 * HTTP utilities for crawler
 */
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

import { getHtmlDir, ensureDir } from "./io"
import { logger } from "./logger"

/**
 * HTTP error class
 */
export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(`HTTP ${status}: ${statusText} - ${url}`)
    this.name = "HttpError"
  }
}

/**
 * Fetch options
 */
export interface FetchOptions {
  timeout?: number
  retries?: number
  retryDelay?: number
  retryStatuses?: number[]
  /** These error statuses won't trigger warn logs (for speculative requests) */
  expectedErrorStatuses?: number[]
}

const DEFAULT_TIMEOUT = 30000
const DEFAULT_RETRIES = 3
const DEFAULT_RETRY_DELAY = 1000

/**
 * Fetch with timeout using AbortController
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Check if an error is retryable
 */
const isRetryable = (e: unknown, retryStatuses?: number[]): boolean => {
  if (e instanceof HttpError) {
    if (retryStatuses) {
      return retryStatuses.includes(e.status)
    }
    return e.status >= 500
  }
  return true
}

/**
 * HTTP GET with retry
 */
export async function fetchWithRetry(
  url: string,
  options?: FetchOptions,
): Promise<Response> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT
  const retries = options?.retries ?? DEFAULT_RETRIES
  const retryDelay = options?.retryDelay ?? DEFAULT_RETRY_DELAY
  const retryStatuses = options?.retryStatuses
  const expectedErrorStatuses = options?.expectedErrorStatuses

  let lastErr: unknown

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchWithTimeout(url, { redirect: "follow" }, timeout)
      if (!res.ok) {
        throw new HttpError(url, res.status, res.statusText)
      }
      logger.debug("HTTP fetch succeeded", { url, status: res.status })
      return res
    } catch (e) {
      lastErr = e

      // Expected error statuses (e.g., 404 for speculative requests) - throw without warn
      if (e instanceof HttpError && expectedErrorStatuses?.includes(e.status)) {
        throw e
      }

      if (!isRetryable(e, retryStatuses)) {
        logger.warn("HTTP fetch failed (non-retryable)", { url, error: String(e) })
        throw e
      }
      if (i < retries - 1) {
        logger.debug("HTTP fetch failed, retrying", { url, attempt: i + 1, retries })
        await new Promise(r => setTimeout(r, retryDelay))
      }
    }
  }

  logger.error("HTTP fetch failed after retries", { url, retries })
  throw lastErr
}

/**
 * Fetch HTML content
 */
export async function fetchHtml(url: string, options?: FetchOptions): Promise<string> {
  const res = await fetchWithRetry(url, options)
  return await res.text()
}

/**
 * Fetch HTML with caching
 */
export async function fetchHtmlCached(
  url: string,
  cacheFileName: string,
  useCache = true,
  options?: FetchOptions,
): Promise<string> {
  const filePath = join(getHtmlDir(), cacheFileName)
  if (useCache && existsSync(filePath)) {
    logger.debug("HTML cache hit", { cacheFileName })
    return readFileSync(filePath, "utf8")
  }

  const html = await fetchHtml(url, options)
  ensureDir(getHtmlDir())
  writeFileSync(filePath, html, "utf8")
  logger.debug("HTML fetched and cached", { cacheFileName })
  return html
}

/**
 * HEAD request to check if URL exists
 */
export async function headExists(url: string, timeout = 2000): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" }, timeout)
    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch JSON from URL
 */
export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, options)
  return await res.json() as T
}

/**
 * Fetch JSON with caching
 */
export async function fetchJsonCached<T>(
  url: string,
  cacheDir: string,
  cacheKey: string,
  useCache = true,
): Promise<{ found: boolean; data: T | null }> {
  ensureDir(cacheDir)
  const filePath = join(cacheDir, `${cacheKey}.json`)

  if (useCache && existsSync(filePath)) {
    const content = readFileSync(filePath, "utf8")
    const cached = JSON.parse(content) as { found: boolean; data: T | null }
    return cached
  }

  try {
    const data = await fetchJson<T>(url)
    const result = { found: true, data }
    writeFileSync(filePath, JSON.stringify(result, null, 2), "utf8")
    return result
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      const result = { found: false, data: null }
      writeFileSync(filePath, JSON.stringify(result, null, 2), "utf8")
      return result
    }
    throw e
  }
}

