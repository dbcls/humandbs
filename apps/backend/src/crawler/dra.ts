/**
 * DRA API client
 *
 * Fetches metadata from DDBJ Search API for DRA/ERA/SRA accessions.
 * Results are cached to external-cache/dra/ directory.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"

import { getResultsDirPath } from "@/crawler/io"

// === Types ===

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

// === Constants ===

const DDBJ_SEARCH_BASE_URL = "https://ddbj.nig.ac.jp/search/resources"

// Map accession prefix to DDBJ resource type
const ACCESSION_RESOURCE_MAP: Record<string, string> = {
  DRA: "sra-run",
  DRR: "sra-run",
  DRX: "sra-experiment",
  DRS: "sra-sample",
  DRP: "sra-study",
  ERA: "sra-run",
  ERR: "sra-run",
  ERX: "sra-experiment",
  ERS: "sra-sample",
  ERP: "sra-study",
  SRA: "sra-run",
  SRR: "sra-run",
  SRX: "sra-experiment",
  SRS: "sra-sample",
  SRP: "sra-study",
}

// === Cache Directory ===

const getCacheDir = (): string => {
  const dir = join(getResultsDirPath(), "external-cache", "dra")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

const getCachePath = (accession: string): string =>
  join(getCacheDir(), `${accession}.json`)

// === Helper Functions ===

const getResourceType = (accession: string): string | null => {
  const prefix = accession.slice(0, 3)
  return ACCESSION_RESOURCE_MAP[prefix] ?? null
}

// === API Functions ===

const fetchDraFromApi = async (accession: string): Promise<DraApiResponse | null> => {
  const resourceType = getResourceType(accession)
  if (!resourceType) {
    console.warn(`Unknown DRA accession format: ${accession}`)
    return null
  }

  const url = `${DDBJ_SEARCH_BASE_URL}/${resourceType}/_doc/${accession}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 404) {
        return { found: false }
      }
      console.warn(`DRA API error for ${accession}: ${res.status}`)
      return null
    }
    return (await res.json()) as DraApiResponse
  } catch (e) {
    console.error(`Failed to fetch DRA ${accession}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

// === Public Functions ===

/**
 * Check if an accession is a valid DRA/ERA/SRA format
 */
export const isDraAccession = (accession: string): boolean =>
  getResourceType(accession) !== null

/**
 * Get DRA metadata with caching
 * Returns _source.properties directly as Record<string, unknown>
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
  if (useCache && existsSync(cachePath)) {
    try {
      const content = readFileSync(cachePath, "utf-8")
      const cached = JSON.parse(content)
      if (cached.notFound) {
        return null
      }
      return cached as Record<string, unknown>
    } catch {
      // Cache corrupted, fetch fresh
    }
  }

  // Fetch from API
  const response = await fetchDraFromApi(accession)
  if (!response) {
    return null
  }

  if (!response.found || !response._source?.properties) {
    // Cache empty result
    writeFileSync(cachePath, JSON.stringify({ accession, notFound: true }, null, 2))
    return null
  }

  // Return properties directly
  const properties = response._source.properties

  // Cache the result
  writeFileSync(cachePath, JSON.stringify(properties, null, 2))

  return properties
}

/**
 * Batch fetch DRA metadata for multiple accessions
 */
export const batchGetDraMetadata = async (
  accessions: string[],
  useCache = true,
  delayMs = 100,
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

