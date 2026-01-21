/**
 * JGA API client
 *
 * Fetches JGAD metadata and handles JGAS↔JGAD bidirectional conversion
 * using the DDBJ Search API. Results are cached.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"

import { getResultsDirPath } from "@/crawler/io"

// === Types ===

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

// === Constants ===

const DDBJ_SEARCH_BASE_URL = "https://ddbj.nig.ac.jp/search/resources"
const RELATION_CACHE_FILE_NAME = "jga-relation.json"

// === Cache Directory ===

const getCacheDir = (): string => {
  const dir = join(getResultsDirPath(), "external-cache", "jgad")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

const getCachePath = (datasetId: string): string =>
  join(getCacheDir(), `${datasetId}.json`)

const getRelationCacheFilePath = (): string =>
  join(getResultsDirPath(), RELATION_CACHE_FILE_NAME)

// === In-memory Cache for JGAS↔JGAD relations ===

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
  if (!existsSync(cachePath)) {
    return
  }

  try {
    const content = readFileSync(cachePath, "utf-8")
    const data = JSON.parse(content) as JgaRelationCache

    for (const [key, value] of Object.entries(data.studyToDataset)) {
      studyToDatasetCache.set(key, value)
    }
    for (const [key, value] of Object.entries(data.datasetToStudy)) {
      datasetToStudyCache.set(key, value)
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
  writeFileSync(cachePath, JSON.stringify(data, null, 2))
  cacheModified = false
}

// === API Functions ===

const fetchJgadFromApi = async (datasetId: string): Promise<JgadApiResponse | null> => {
  const url = `${DDBJ_SEARCH_BASE_URL}/jga-dataset/_doc/${datasetId}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 404) {
        return { found: false }
      }
      console.warn(`JGAD API error for ${datasetId}: ${res.status}`)
      return null
    }
    return (await res.json()) as JgadApiResponse
  } catch (e) {
    console.error(`Failed to fetch JGAD ${datasetId}: ${e instanceof Error ? e.message : String(e)}`)
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

// === JGAS <-> JGAD Conversion ===

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

// === JGAD Metadata ===

/**
 * Get JGAD metadata with caching
 * Returns _source.properties directly as Record<string, unknown>
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
  const response = await fetchJgadFromApi(datasetId)
  if (!response) {
    return null
  }

  if (!response.found || !response._source?.properties) {
    // Cache empty result
    writeFileSync(cachePath, JSON.stringify({ accession: datasetId, notFound: true }, null, 2))
    return null
  }

  // Return properties directly
  const properties = response._source.properties

  // Cache the result
  writeFileSync(cachePath, JSON.stringify(properties, null, 2))

  return properties
}

/**
 * Batch fetch JGAD metadata for multiple dataset IDs
 */
export const batchGetJgadMetadata = async (
  datasetIds: string[],
  useCache = true,
  delayMs = 100,
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

