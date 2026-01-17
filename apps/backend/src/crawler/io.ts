/**
 * I/O utilities for crawler
 *
 * Provides I/O related utilities such as file operations, URL generation, and HTML fetching.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs"
import { join, dirname } from "path"

import { DETAIL_PAGE_BASE_URL, getReleaseSuffix, HEAD_TIMEOUT_MS } from "@/crawler/config"
import type { LangType } from "@/crawler/types"

export { DETAIL_PAGE_BASE_URL }

const VERSION_RE = /https:\/\/humandbs\.dbcls\.jp\/(hum\d+)-v(\d+)(?:\/)?$/

/**
 * Get the path to the crawler-results directory.
 * Searches upward from the current directory until it finds package.json.
 */
export const getResultsDirPath = (): string => {
  let currentDir = __dirname
  while (!existsSync(join(currentDir, "package.json"))) {
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error("Failed to find package.json")
    }
    currentDir = parentDir
  }
  return join(currentDir, "crawler-results")
}

/** Create directory if it does not exist */
export const ensureDir = (p: string): void => {
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true })
  }
}

/** Get the path to the HTML cache directory */
export const getHtmlDir = (): string => {
  const p = join(getResultsDirPath(), "html")
  ensureDir(p)
  return p
}

/** Get the path to the detail-json directory */
export const getDetailJsonDir = (): string => {
  const p = join(getResultsDirPath(), "detail-json")
  ensureDir(p)
  return p
}

/** Generate the path for a detail JSON file */
export const detailJsonPath = (humVersionId: string, lang: LangType): string => {
  return join(getDetailJsonDir(), `${humVersionId}-${lang}.json`)
}

/** Generate the path for a normalized detail JSON file */
export const normalizedDetailJsonPath = (humVersionId: string, lang: LangType): string => {
  return join(getResultsDirPath(), "detail-json-normalized", `${humVersionId}-${lang}.json`)
}

/**
 * Generate the URL for a detail page.
 * @example genDetailUrl("hum0001-v1", "ja") => "https://humandbs.dbcls.jp/hum0001-v1"
 * @example genDetailUrl("hum0001-v1", "en") => "https://humandbs.dbcls.jp/en/hum0001-v1"
 */
export const genDetailUrl = (humVersionId: string, lang: LangType): string => {
  return lang === "ja"
    ? `${DETAIL_PAGE_BASE_URL}${humVersionId}`
    : `${DETAIL_PAGE_BASE_URL}en/${humVersionId}`
}

/**
 * Generate release page URL.
 * Some humVersionIds have special suffixes (defined in config.ts).
 */
export const genReleaseUrl = (humVersionId: string, lang: LangType): string => {
  const suffix = getReleaseSuffix(humVersionId, lang)
  return lang === "ja"
    ? `${DETAIL_PAGE_BASE_URL}${humVersionId}${suffix}`
    : `${DETAIL_PAGE_BASE_URL}en/${humVersionId}${suffix}`
}

class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "HttpError"
  }
}

const fetchHtml = async (url: string): Promise<string> => {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok) {
    throw new HttpError(`Failed to fetch HTML: ${url} (${res.status})`, res.status)
  }
  return await res.text()
}

const isRetryable = (e: unknown): boolean => {
  if (e instanceof HttpError) {
    // 4xx errors are not retryable (client errors like 404)
    // 5xx errors are retryable (server errors)
    return e.status >= 500
  }
  // Network errors are retryable
  return true
}

const fetchHtmlWithRetry = async (
  url: string,
  retries = 3,
  delayMs = 1000,
): Promise<string> => {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchHtml(url)
    } catch (e) {
      lastErr = e
      if (!isRetryable(e)) {
        throw e
      }
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw lastErr
}

/**
 * Fetch HTML and cache it.
 * If useCache=true and cache exists, returns the cached content.
 * Otherwise fetches from network and saves to cache.
 */
export const readHtml = async (
  url: string,
  cacheFileName: string,
  useCache = true,
): Promise<string> => {
  const filePath = join(getHtmlDir(), cacheFileName)
  if (!useCache || !existsSync(filePath)) {
    const html = await fetchHtmlWithRetry(url)
    writeFileSync(filePath, html, "utf8")
    return html
  }
  return readFileSync(filePath, "utf8")
}

const parseVersionFromUrl = (url: string): number => {
  const m = url.match(VERSION_RE)
  if (!m) throw new Error(`Cannot parse version from ${url}`)
  return Number(m[2])
}

/** Fetch with timeout using AbortController */
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

/** Check if a specific version exists */
const versionExists = async (humId: string, version: number): Promise<boolean> => {
  try {
    const res = await fetchWithTimeout(
      `${DETAIL_PAGE_BASE_URL}${humId}-v${version}`,
      { method: "HEAD", redirect: "follow" },
      HEAD_TIMEOUT_MS,
    )
    return res.ok
  } catch {
    return false
  }
}

/**
 * Get the latest version number for a humId from network.
 * First tries to access with humId only and get from redirect URL.
 * Falls back to binary search if that fails.
 */
export const headLatestVersionNum = async (
  humId: string,
  maxVersion = 50,
): Promise<number> => {
  console.log(`Resolving latest version for ${humId} via HEAD request`)
  const base = `${DETAIL_PAGE_BASE_URL}${humId}`
  try {
    const res = await fetchWithTimeout(
      base,
      { method: "HEAD", redirect: "follow" },
      HEAD_TIMEOUT_MS,
    )
    if (res.ok) return parseVersionFromUrl(res.url)
  } catch {
    // fallback to binary search
  }

  // Binary search: find the highest existing version
  console.log(`Falling back to binary search for latest version of ${humId}`)
  let low = 1
  let high = maxVersion
  let result = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (await versionExists(humId, mid)) {
      result = mid // Found a valid version, try higher
      low = mid + 1
    } else {
      high = mid - 1 // Version doesn't exist, try lower
    }
  }

  if (result === 0) {
    throw new Error(`Cannot resolve latest version for ${humId}`)
  }
  return result
}

/**
 * Get the latest version number for a humId.
 * If useCache=true, first looks in local cache.
 * Falls back to network if not found.
 */
export const findLatestVersionNum = async (
  humId: string,
  useCache = true,
): Promise<number> => {
  if (useCache) {
    const dir = getHtmlDir()
    const nums = readdirSync(dir)
      .map(f => f.match(new RegExp(`detail-${humId}-v(\\d+)-(ja|en)\\.html`)))
      .filter(Boolean)
      .map(m => Number(m![1]))
    if (nums.length > 0) return Math.max(...nums)
  }
  return headLatestVersionNum(humId)
}

/**
 * List files in the detail-json directory.
 * Can filter by humId.
 */
export const listDetailJsonFiles = (opts: {
  humId?: string
  langs: LangType[]
}): { humVersionId: string; lang: LangType }[] => {
  const dir = join(getResultsDirPath(), "detail-json")
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const m = f.match(/^(hum\d+-v\d+)-(ja|en)\.json$/)
      if (!m) return null
      return { humVersionId: m[1], lang: m[2] as LangType }
    })
    .filter(Boolean)
    .filter(e => opts.humId ? e!.humVersionId.startsWith(opts.humId) : true)
    .filter(e => opts.langs.includes(e!.lang)) as { humVersionId: string; lang: LangType }[]
}

/** Read detail JSON. Returns null if not found. */
export const readDetailJson = (humVersionId: string, lang: LangType): unknown | null => {
  const p = detailJsonPath(humVersionId, lang)
  if (!existsSync(p)) return null
  const content = readFileSync(p, "utf8")
  return JSON.parse(content)
}

/** Read normalized detail JSON. Returns null if not found. */
export const readNormalizedDetailJson = (humVersionId: string, lang: LangType): unknown | null => {
  const p = normalizedDetailJsonPath(humVersionId, lang)
  if (!existsSync(p)) return null
  const content = readFileSync(p, "utf8")
  return JSON.parse(content)
}

/** Write detail JSON */
export const writeDetailJson = (humVersionId: string, lang: LangType, data: unknown): void => {
  const dir = join(getResultsDirPath(), "detail-json")
  ensureDir(dir)
  writeFileSync(detailJsonPath(humVersionId, lang), JSON.stringify(data, null, 2), "utf8")
}

/** Write normalized detail JSON */
export const writeNormalizedDetailJson = (humVersionId: string, lang: LangType, data: unknown): void => {
  const dir = join(getResultsDirPath(), "detail-json-normalized")
  ensureDir(dir)
  writeFileSync(normalizedDetailJsonPath(humVersionId, lang), JSON.stringify(data, null, 2), "utf8")
}
