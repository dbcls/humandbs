/**
 * DRA API client
 *
 * Fetches metadata from DDBJ Search API for DRA/ERA/SRA accessions
 * Results are cached to external-cache/dra/ directory
 */
import { getErrorMessage } from "@/crawler/utils/error"
import { logger } from "@/crawler/utils/logger"

import { createCachedClient } from "./client"

// Types

interface DraApiResponse {
  found: boolean
  _source?: {
    accession?: string
    title?: string
    description?: string
    datePublished?: string
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

// DRA Metadata - uses createCachedClient

const draClient = createCachedClient<Record<string, unknown>>(
  {
    cacheDir: "dra",
    getCacheKey: (id) => id,
  },
  async (accession) => {
    const response = await fetchDraFromApi(accession)
    if (!response?.found || !response._source?.properties) {
      return null
    }
    return response._source.properties
  },
)

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
  return draClient.get(accession, useCache)
}

/**
 * Batch fetch DRA metadata for multiple accessions
 */
export const batchGetDraMetadata = async (
  accessions: string[],
  useCache = true,
): Promise<Map<string, Record<string, unknown>>> => {
  const validAccessions = accessions.filter(acc => getResourceType(acc) !== null)
  const result = await draClient.getMany(validAccessions, useCache)
  // Filter out null values for the return type
  const filtered = new Map<string, Record<string, unknown>>()
  for (const [k, v] of result) {
    if (v !== null) filtered.set(k, v)
  }
  return filtered
}

/**
 * Get DRA release date (datePublished) from DDBJ Search API
 * Returns ISO 8601 date string (YYYY-MM-DD) or null
 */
export const getDraReleaseDate = async (
  accession: string,
): Promise<string | null> => {
  if (!getResourceType(accession)) {
    return null
  }

  const response = await fetchDraFromApi(accession)
  if (!response?.found || !response._source?.datePublished) {
    return null
  }

  // Convert ISO 8601 datetime to date (YYYY-MM-DD)
  const datePublished = response._source.datePublished
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(datePublished)
  return match ? match[1] : null
}
