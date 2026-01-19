/**
 * JGA API client for JGAS↔JGAD bidirectional conversion
 *
 * Provides functions to convert between JGA Study IDs (JGAS) and JGA Dataset IDs (JGAD)
 * using the DDBJ Search API. Results are cached to a JSON file.
 */
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

import { getResultsDirPath } from "@/crawler/io"

// === Types ===

interface DbXref {
  identifier: string
  type: string
  url: string
}

interface JgaStudyDoc {
  found: boolean
  _source: {
    dbXrefs?: DbXref[]
  }
}

interface JgaDatasetDoc {
  found: boolean
  _source: {
    dbXrefs?: DbXref[]
  }
}

interface JgaRelationCache {
  studyToDataset: Record<string, string[]>
  datasetToStudy: Record<string, string[]>
}

// === Cache File Path ===

const CACHE_FILE_NAME = "jga-relation.json"

function getCacheFilePath(): string {
  return join(getResultsDirPath(), CACHE_FILE_NAME)
}

// === In-memory Cache ===

let studyToDatasetCache: Map<string, string[]> | null = null
let datasetToStudyCache: Map<string, string[]> | null = null
let cacheModified = false

/**
 * Load cache from file if not already loaded
 */
function loadCache(): void {
  if (studyToDatasetCache !== null && datasetToStudyCache !== null) {
    return
  }

  studyToDatasetCache = new Map()
  datasetToStudyCache = new Map()

  const cachePath = getCacheFilePath()
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
    // If file is corrupted, start fresh
    studyToDatasetCache = new Map()
    datasetToStudyCache = new Map()
  }
}

/**
 * Save cache to file
 */
export function saveCache(): void {
  if (!cacheModified) {
    return
  }

  loadCache()

  const data: JgaRelationCache = {
    studyToDataset: Object.fromEntries(studyToDatasetCache!),
    datasetToStudy: Object.fromEntries(datasetToStudyCache!),
  }

  const cachePath = getCacheFilePath()
  writeFileSync(cachePath, JSON.stringify(data, null, 2))
  cacheModified = false
}

// === Core Functions ===

/**
 * Fetch dataset IDs (JGAD) from a study ID (JGAS) via DDBJ API
 */
export async function studyToDatasets(studyId: string): Promise<string[]> {
  const url = `https://ddbj.nig.ac.jp/search/resources/jga-study/_doc/${studyId}`

  const res = await fetch(url)
  if (!res.ok) return []

  const json = (await res.json()) as JgaStudyDoc
  if (!json.found) return []

  return (json._source.dbXrefs ?? [])
    .filter(x => x.type === "jga-dataset")
    .map(x => x.identifier)
}

/**
 * Fetch study IDs (JGAS) from a dataset ID (JGAD) via DDBJ API
 */
export async function datasetToStudy(datasetId: string): Promise<string[]> {
  const url = `https://ddbj.nig.ac.jp/search/resources/jga-dataset/_doc/${datasetId}`

  const res = await fetch(url)
  if (!res.ok) return []

  const json = (await res.json()) as JgaDatasetDoc
  if (!json.found) return []

  return (json._source.dbXrefs ?? [])
    .filter(x => x.type === "jga-study")
    .map(x => x.identifier)
}

// === Cached Functions ===

/**
 * Get dataset IDs from a study ID, with caching
 */
export async function getDatasetsFromStudy(studyId: string): Promise<string[]> {
  loadCache()

  if (studyToDatasetCache!.has(studyId)) {
    return studyToDatasetCache!.get(studyId)!
  }

  const datasets = await studyToDatasets(studyId)
  studyToDatasetCache!.set(studyId, datasets)
  cacheModified = true
  return datasets
}

/**
 * Get study IDs from a dataset ID, with caching
 */
export async function getStudiesFromDataset(datasetId: string): Promise<string[]> {
  loadCache()

  if (datasetToStudyCache!.has(datasetId)) {
    return datasetToStudyCache!.get(datasetId)!
  }

  const studies = await datasetToStudy(datasetId)
  datasetToStudyCache!.set(datasetId, studies)
  cacheModified = true
  return studies
}

// === Test Utilities ===

/**
 * Clear the JGA API cache (for testing)
 */
export function clearJgaApiCache(): void {
  studyToDatasetCache = new Map()
  datasetToStudyCache = new Map()
  cacheModified = false
}
