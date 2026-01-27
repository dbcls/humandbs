/**
 * DRA API client
 *
 * Fetches metadata from DDBJ Search API for DRA/ERA/SRA accessions
 * Results are cached to external-cache/dra/ directory
 */
import { join } from "path"

import { DEFAULT_API_DELAY_MS } from "@/crawler/config/urls"
import { getErrorMessage } from "@/crawler/utils/error"
import { getExternalCacheDir, ensureDir, readJson, writeJson, fileExists } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Types

interface DraApiResponse {
  found: boolean
  _source?: {
    accession?: string
    title?: string
    description?: string
    properties?: Record<string, unknown>
    dbXrefs?: { identifier: string; type: string; url: string }[]
    [key: string]: unknown
  }
}

// Constants

const DDBJ_SEARCH_BASE_URL = "https://ddbj.nig.ac.jp/search/resources"

// Map accession prefix to DDBJ resource type
const ACCESSION_RESOURCE_MAP: Record<string, string> = {
  DRA: "sra-submission",
  DRR: "sra-run",
  DRX: "sra-experiment",
  DRS: "sra-sample",
  DRP: "sra-study",
  ERA: "sra-submission",
  ERR: "sra-run",
  ERX: "sra-experiment",
  ERS: "sra-sample",
  ERP: "sra-study",
  SRA: "sra-submission",
  SRR: "sra-run",
  SRX: "sra-experiment",
  SRS: "sra-sample",
  SRP: "sra-study",
}

// Cache Directory

const getCacheDir = (): string => {
  const dir = join(getExternalCacheDir(), "dra")
  ensureDir(dir)
  return dir
}

const getCachePath = (accession: string): string =>
  join(getCacheDir(), `${accession}.json`)

// Helper Functions

/**
 * Get resource type from accession prefix
 */
export const getResourceType = (accession: string): string | null => {
  const prefix = accession.slice(0, 3)
  return ACCESSION_RESOURCE_MAP[prefix] ?? null
}

// API Functions

const fetchDraFromApi = async (accession: string): Promise<DraApiResponse | null> => {
  const resourceType = getResourceType(accession)
  if (!resourceType) {
    logger.warn("Unknown DRA accession format", { accession })
    return null
  }

  const url = `${DDBJ_SEARCH_BASE_URL}/${resourceType}/_doc/${accession}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 404) {
        logger.debug("DRA not found", { accession })
        return { found: false }
      }
      logger.warn("DRA API error", { accession, status: res.status })
      return null
    }
    logger.debug("DRA metadata fetched", { accession })
    return (await res.json()) as DraApiResponse
  } catch (error) {
    logger.error("Failed to fetch DRA", { accession, error: getErrorMessage(error) })
    return null
  }
}

// Public Functions

/**
 * Check if an accession is a valid DRA/ERA/SRA format
 */
export const isDraAccession = (accession: string): boolean =>
  getResourceType(accession) !== null

interface CachedDraMetadata {
  accession: string
  notFound?: boolean
  [key: string]: unknown
}

/**
 * Get DRA metadata with caching
 * Returns properties directly as Record<string, unknown>
 */
export const getDraMetadata = async (
  accession: string,
  useCache = true,
): Promise<Record<string, unknown> | null> => {
  if (!getResourceType(accession)) {
    return null
  }

  const cachePath = getCachePath(accession)

  // Check cache
  if (useCache && fileExists(cachePath)) {
    const cached = readJson<CachedDraMetadata>(cachePath)
    if (cached?.notFound) {
      logger.debug("DRA cache hit (not found)", { accession })
      return null
    }
    logger.debug("DRA cache hit", { accession })
    return cached as Record<string, unknown>
  }

  // Fetch from API
  const response = await fetchDraFromApi(accession)
  if (!response) {
    return null
  }

  if (!response.found || !response._source?.properties) {
    // Cache empty result
    writeJson(cachePath, { accession, notFound: true })
    return null
  }

  // Return properties directly
  const properties = response._source.properties

  // Cache the result
  writeJson(cachePath, properties)

  return properties
}

/**
 * Batch fetch DRA metadata for multiple accessions
 */
export const batchGetDraMetadata = async (
  accessions: string[],
  useCache = true,
  delayMs = DEFAULT_API_DELAY_MS,
): Promise<Map<string, Record<string, unknown>>> => {
  const result = new Map<string, Record<string, unknown>>()

  const validAccessions = accessions.filter(acc => getResourceType(acc) !== null)

  for (let i = 0; i < validAccessions.length; i++) {
    const accession = validAccessions[i]
    const metadata = await getDraMetadata(accession, useCache)

    if (metadata) {
      result.set(accession, metadata)
    }

    if (i < validAccessions.length - 1) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  return result
}
