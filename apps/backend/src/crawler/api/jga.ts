/**
 * JGA API client
 *
 * Fetches JGAD metadata and handles JGAS↔JGAD bidirectional conversion
 * using the DDBJ Search API. Results are cached
 */
import { join } from "path"

import { getJgasToAdditionalJgad } from "@/crawler/config/mapping"
import { DEFAULT_API_DELAY_MS } from "@/crawler/config/urls"
import { getErrorMessage } from "@/crawler/utils/error"
import { getExternalCacheDir, ensureDir, readJson, writeJson, fileExists } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Types

interface DdbjDbXref {
  identifier: string
  type: string
  url: string
}

interface JgadProperties {
  TITLE?: string
  DESCRIPTION?: string
  DATASET_TYPE?: string
  DATA_REFS?: { accession: string; ref: string }[]
  [key: string]: unknown
}

interface JgadApiResponse {
  found: boolean
  _source?: {
    accession?: string
    properties?: JgadProperties
    dbXrefs?: DdbjDbXref[]
    [key: string]: unknown
  }
}

interface JgaStudyDoc {
  found: boolean
  _source: {
    dbXrefs?: DdbjDbXref[]
  }
}

interface JgaRelationCache {
  studyToDataset: Record<string, string[]>
  datasetToStudy: Record<string, string[]>
}

// Constants

const DDBJ_SEARCH_BASE_URL = "https://ddbj.nig.ac.jp/search/resources"
const RELATION_CACHE_FILE_NAME = "jga-relation.json"

// Cache Directory

const getCacheDir = (): string => {
  const dir = join(getExternalCacheDir(), "jgad")
  ensureDir(dir)
  return dir
}

const getCachePath = (datasetId: string): string =>
  join(getCacheDir(), `${datasetId}.json`)

const getRelationCacheFilePath = (): string =>
  join(getExternalCacheDir(), RELATION_CACHE_FILE_NAME)

// In-memory Cache for JGAS-JGAD relations

let studyToDatasetCache: Map<string, string[]> | null = null
let datasetToStudyCache: Map<string, string[]> | null = null
let cacheModified = false

const loadRelationCache = (): void => {
  if (studyToDatasetCache !== null && datasetToStudyCache !== null) {
    return
  }

  studyToDatasetCache = new Map()
  datasetToStudyCache = new Map()

  const cachePath = getRelationCacheFilePath()
  if (!fileExists(cachePath)) {
    return
  }

  try {
    const data = readJson<JgaRelationCache>(cachePath)
    if (data) {
      for (const [key, value] of Object.entries(data.studyToDataset)) {
        studyToDatasetCache.set(key, value)
      }
      for (const [key, value] of Object.entries(data.datasetToStudy)) {
        datasetToStudyCache.set(key, value)
      }
    }
  } catch {
    studyToDatasetCache = new Map()
    datasetToStudyCache = new Map()
  }
}

export const saveRelationCache = (): void => {
  if (!cacheModified) {
    return
  }

  loadRelationCache()

  const data: JgaRelationCache = {
    studyToDataset: Object.fromEntries(studyToDatasetCache!),
    datasetToStudy: Object.fromEntries(datasetToStudyCache!),
  }

  const cachePath = getRelationCacheFilePath()
  writeJson(cachePath, data)
  cacheModified = false
}

// API Functions

const fetchJgadFromApi = async (datasetId: string): Promise<JgadApiResponse | null> => {
  const url = `${DDBJ_SEARCH_BASE_URL}/jga-dataset/_doc/${datasetId}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 404) {
        logger.debug("JGAD not found", { datasetId })
        return { found: false }
      }
      logger.warn("JGAD API error", { datasetId, status: res.status })
      return null
    }
    logger.debug("JGAD metadata fetched", { datasetId })
    return (await res.json()) as JgadApiResponse
  } catch (error) {
    logger.error("Failed to fetch JGAD", { datasetId, error: getErrorMessage(error) })
    return null
  }
}

const fetchJgasFromApi = async (studyId: string): Promise<JgaStudyDoc | null> => {
  const url = `${DDBJ_SEARCH_BASE_URL}/jga-study/_doc/${studyId}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      return null
    }
    return (await res.json()) as JgaStudyDoc
  } catch {
    return null
  }
}

// JGAS - JGAD Conversion

export const studyToDatasets = async (studyId: string): Promise<string[]> => {
  const json = await fetchJgasFromApi(studyId)
  if (!json?.found) return []

  const datasetsFromApi = (json._source.dbXrefs ?? [])
    .filter(x => x.type === "jga-dataset")
    .map(x => x.identifier)

  // Add additional JGAD IDs from config
  const additionalJgadMap = getJgasToAdditionalJgad()
  const additionalJgad = additionalJgadMap[studyId] ?? []

  return [...datasetsFromApi, ...additionalJgad]
}

export const datasetToStudy = async (datasetId: string): Promise<string[]> => {
  const url = `${DDBJ_SEARCH_BASE_URL}/jga-dataset/_doc/${datasetId}`

  try {
    const res = await fetch(url)
    if (!res.ok) return []

    const json = (await res.json()) as JgadApiResponse
    if (!json.found) return []

    return (json._source?.dbXrefs ?? [])
      .filter(x => x.type === "jga-study")
      .map(x => x.identifier)
  } catch {
    return []
  }
}

export const getDatasetsFromStudy = async (studyId: string): Promise<string[]> => {
  loadRelationCache()

  if (studyToDatasetCache!.has(studyId)) {
    return studyToDatasetCache!.get(studyId)!
  }

  const datasets = await studyToDatasets(studyId)
  studyToDatasetCache!.set(studyId, datasets)
  cacheModified = true
  return datasets
}

export const getStudiesFromDataset = async (datasetId: string): Promise<string[]> => {
  loadRelationCache()

  if (datasetToStudyCache!.has(datasetId)) {
    return datasetToStudyCache!.get(datasetId)!
  }

  const studies = await datasetToStudy(datasetId)
  datasetToStudyCache!.set(datasetId, studies)
  cacheModified = true
  return studies
}

export const clearJgaApiCache = (): void => {
  studyToDatasetCache = new Map()
  datasetToStudyCache = new Map()
  cacheModified = false
}

// JGAD Metadata

interface CachedJgadMetadata {
  accession: string
  notFound?: boolean
  [key: string]: unknown
}

/**
 * Get JGAD metadata with caching
 * Returns properties directly as Record<string, unknown>
 */
export const getJgadMetadata = async (
  datasetId: string,
  useCache = true,
): Promise<Record<string, unknown> | null> => {
  if (!datasetId.startsWith("JGAD")) {
    return null
  }

  const cachePath = getCachePath(datasetId)

  // Check cache
  if (useCache && fileExists(cachePath)) {
    const cached = readJson<CachedJgadMetadata>(cachePath)
    if (cached?.notFound) {
      logger.debug("JGAD cache hit (not found)", { datasetId })
      return null
    }
    logger.debug("JGAD cache hit", { datasetId })
    return cached as Record<string, unknown>
  }

  // Fetch from API
  const response = await fetchJgadFromApi(datasetId)
  if (!response) {
    return null
  }

  if (!response.found || !response._source?.properties) {
    // Cache empty result
    writeJson(cachePath, { accession: datasetId, notFound: true })
    return null
  }

  // Return properties directly
  const properties = response._source.properties

  // Cache the result
  writeJson(cachePath, properties)

  return properties
}

/**
 * Batch fetch JGAD metadata for multiple dataset IDs
 */
export const batchGetJgadMetadata = async (
  datasetIds: string[],
  useCache = true,
  delayMs = DEFAULT_API_DELAY_MS,
): Promise<Map<string, Record<string, unknown>>> => {
  const result = new Map<string, Record<string, unknown>>()

  const jgadIds = datasetIds.filter(id => id.startsWith("JGAD"))

  for (let i = 0; i < jgadIds.length; i++) {
    const datasetId = jgadIds[i]
    const metadata = await getJgadMetadata(datasetId, useCache)

    if (metadata) {
      result.set(datasetId, metadata)
    }

    if (i < jgadIds.length - 1 && !useCache) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  return result
}
