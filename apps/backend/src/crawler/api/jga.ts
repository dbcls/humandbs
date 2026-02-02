/**
 * JGA API client
 *
 * Fetches JGAD metadata and handles JGAS↔JGAD bidirectional conversion
 * using the DDBJ Search API. Results are cached
 */
import { join } from "path"

import { getErrorMessage } from "@/crawler/utils/error"
import { getExternalCacheDir, readJson, writeJson, fileExists } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

import { createCachedClient } from "./client"

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
    datePublished?: string
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
const CACHE_SAVE_INTERVAL = 100 // Save cache every N new entries

// Cache Directory

const getRelationCacheFilePath = (): string =>
  join(getExternalCacheDir(), RELATION_CACHE_FILE_NAME)

// In-memory Cache for JGAS-JGAD relations

let studyToDatasetCache: Map<string, string[]> | null = null
let datasetToStudyCache: Map<string, string[]> | null = null
let cacheModified = false
let newEntriesSinceLastSave = 0

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
  newEntriesSinceLastSave = 0
}

/**
 * Periodically save cache if enough new entries have been added
 * Called after each cache update to check if save is needed
 */
const maybeSaveCache = (): void => {
  newEntriesSinceLastSave++
  if (newEntriesSinceLastSave >= CACHE_SAVE_INTERVAL) {
    saveRelationCache()
  }
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

  return (json._source.dbXrefs ?? [])
    .filter(x => x.type === "jga-dataset")
    .map(x => x.identifier)
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
  maybeSaveCache()
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
  maybeSaveCache()
  return studies
}

export const clearJgaApiCache = (): void => {
  studyToDatasetCache = new Map()
  datasetToStudyCache = new Map()
  cacheModified = false
}

// JGAD Metadata - uses createCachedClient

const jgadClient = createCachedClient<Record<string, unknown>>(
  {
    cacheDir: "jgad",
    getCacheKey: (id) => id,
  },
  async (datasetId) => {
    const response = await fetchJgadFromApi(datasetId)
    if (!response?.found || !response._source?.properties) {
      return null
    }
    return response._source.properties
  },
)

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
  return jgadClient.get(datasetId, useCache)
}

/**
 * Batch fetch JGAD metadata for multiple dataset IDs
 */
export const batchGetJgadMetadata = async (
  datasetIds: string[],
  useCache = true,
): Promise<Map<string, Record<string, unknown>>> => {
  const jgadIds = datasetIds.filter(id => id.startsWith("JGAD"))
  const result = await jgadClient.getMany(jgadIds, useCache)
  // Filter out null values for the return type
  const filtered = new Map<string, Record<string, unknown>>()
  for (const [k, v] of result) {
    if (v !== null) filtered.set(k, v)
  }
  return filtered
}

/**
 * Get JGAD release date (datePublished) from DDBJ Search API
 * Returns ISO 8601 date string (YYYY-MM-DD) or null
 */
export const getJgadReleaseDate = async (
  datasetId: string,
): Promise<string | null> => {
  if (!datasetId.startsWith("JGAD")) {
    return null
  }

  const response = await fetchJgadFromApi(datasetId)
  if (!response?.found || !response._source?.datePublished) {
    return null
  }

  // Convert ISO 8601 datetime to date (YYYY-MM-DD)
  const datePublished = response._source.datePublished
  const match = datePublished.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}
