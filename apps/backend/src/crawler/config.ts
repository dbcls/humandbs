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

/**
 * Special controlled access user rows that have malformed HTML structure.
 * These are manually parsed entries because the original HTML is broken.
 */
export interface SpecialControlledAccessRow {
  /** humId (without version) to match */
  humId: string
  /** Cell count to detect this malformed row */
  cellCount: number
  /** First cell text to identify the row */
  firstCellText: string
  /** Manually parsed data */
  data: {
    principalInvestigator: string | null
    affiliation: string | null
    country: string | null
    researchTitle: string | null
    datasetIds: string[]
    periodOfDataUse: string | null
  }
}

export const SPECIAL_CONTROLLED_ACCESS_ROWS: SpecialControlledAccessRow[] = [
  {
    // hum0014: Atray Dixit row has 5 cells instead of 6, with merged cells
    humId: "hum0014",
    cellCount: 5,
    firstCellText: "Atray Dixit",
    data: {
      principalInvestigator: "Atray Dixit",
      affiliation: "Coral Genomics, Inc.",
      country: null,
      researchTitle: "Derivation and Evaluation of Functional Response Scores",
      datasetIds: ["JGAD000101", "JGAD000123", "JGAD000124", "JGAD000144-JGAD000201", "JGAD000220"],
      periodOfDataUse: "2020/08/24-2021/07/21",
    },
  },
]

/**
 * Find a special controlled access row configuration.
 */
export const findSpecialControlledAccessRow = (
  humVersionId: string,
  cellCount: number,
  firstCellText: string,
): SpecialControlledAccessRow | undefined => {
  const humId = humVersionId.split("-v")[0]
  return SPECIAL_CONTROLLED_ACCESS_ROWS.find(
    s =>
      s.humId === humId &&
      s.cellCount === cellCount &&
      s.firstCellText === firstCellText,
  )
}
