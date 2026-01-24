/**
 * URL definitions for HumanDBs crawler
 */
import type { LangType } from "@/crawler/types"

/** Base URL for HumanDBs portal site (with trailing slash, for path concatenation) */
export const DETAIL_PAGE_BASE_URL = "https://humandbs.dbcls.jp/"

/** Base URL for HumanDBs (without trailing slash, for joining with paths starting with /) */
export const HUMANDBS_BASE_URL = "https://humandbs.dbcls.jp"

/** Default number of concurrent downloads */
export const DEFAULT_CONCURRENCY = 4

/** Maximum allowed concurrency */
export const MAX_CONCURRENCY = 32

/** Timeout for HEAD requests when resolving latest version (ms) */
export const HEAD_TIMEOUT_MS = 2000

/** Maximum version number to try when discovering versions */
export const MAX_VERSION = 50

/** Default delay between API calls (ms) */
export const DEFAULT_API_DELAY_MS = 100

/** Delay for rate-limited API calls (ms) */
export const RATE_LIMIT_DELAY_MS = 5000

/** Minimum title length for DOI search */
export const MIN_TITLE_LENGTH = 10

/**
 * Generate the URL for a detail page
 * @example genDetailUrl("hum0001-v1", "ja") => "https://humandbs.dbcls.jp/hum0001-v1"
 * @example genDetailUrl("hum0001-v1", "en") => "https://humandbs.dbcls.jp/en/hum0001-v1"
 */
export const genDetailUrl = (humVersionId: string, lang: LangType): string => {
  return lang === "ja"
    ? `${DETAIL_PAGE_BASE_URL}${humVersionId}`
    : `${DETAIL_PAGE_BASE_URL}en/${humVersionId}`
}
