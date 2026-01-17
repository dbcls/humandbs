/**
 * Crawler configuration
 *
 * Centralized configuration for HumanDBs special cases and exceptions.
 */
import type { LangType } from "@/crawler/types"

/** Base URL for HumanDBs portal site */
export const DETAIL_PAGE_BASE_URL = "https://humandbs.dbcls.jp/"

/** Default number of concurrent downloads */
export const DEFAULT_CONCURRENCY = 4

/** Maximum allowed concurrency */
export const MAX_CONCURRENCY = 32

/** Timeout for HEAD requests when resolving latest version (ms) */
export const HEAD_TIMEOUT_MS = 2000

/** Maximum version number to try when discovering versions */
export const MAX_VERSION = 50

/**
 * Configuration for pages to skip
 * - Pages that do not exist
 * - Pages with special HTML structure that are difficult to parse
 */
export interface SkipConfig {
  humVersionId: string
  lang: LangType
  reason: string
}

export const SKIP_PAGES: SkipConfig[] = [
  {
    humVersionId: "hum0003-v1",
    lang: "en",
    reason: "English version does not exist",
  },
]

/**
 * Pages with special release URLs.
 * Normally the pattern is `{humVersionId}-release`, but some have different patterns.
 */
export interface SpecialReleaseUrl {
  humVersionId: string
  lang: LangType
  suffix: string // Suffix to use instead of "-release"
}

export const SPECIAL_RELEASE_URLS: SpecialReleaseUrl[] = [
  {
    humVersionId: "hum0329-v1",
    lang: "ja",
    suffix: "-release-note",
  },
]

/**
 * Check if the specified page should be skipped.
 */
export const shouldSkipPage = (
  humVersionId: string,
  lang: LangType,
): boolean => {
  return SKIP_PAGES.some(
    s => s.humVersionId === humVersionId && s.lang === lang,
  )
}

/**
 * Get the suffix for release URL.
 * Returns the special suffix if defined, otherwise returns "-release".
 */
export const getReleaseSuffix = (
  humVersionId: string,
  lang: LangType,
): string => {
  const special = SPECIAL_RELEASE_URLS.find(
    s => s.humVersionId === humVersionId && s.lang === lang,
  )
  return special?.suffix ?? "-release"
}
