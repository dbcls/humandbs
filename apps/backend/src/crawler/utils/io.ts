/**
 * File I/O utilities for crawler
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs"
import { join, dirname } from "path"

import type { LangType } from "@/crawler/types"

/**
 * Get the path to the crawler-results directory
 * Searches upward from the current directory until it finds package.json
 */
export const getResultsDir = (): string => {
  let currentDir = __dirname
  while (!existsSync(join(currentDir, "package.json"))) {
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error("Failed to find package.json")
    }
    currentDir = parentDir
  }
  return join(currentDir, "crawler-results")
}

/**
 * Create directory if it does not exist
 */
export const ensureDir = (path: string): void => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

/**
 * Check if a file exists
 */
export const fileExists = (path: string): boolean => {
  return existsSync(path)
}

/**
 * Read a JSON file
 */
export const readJson = <T>(path: string): T | null => {
  if (!existsSync(path)) return null
  const content = readFileSync(path, "utf8")
  return JSON.parse(content) as T
}

/**
 * Write a JSON file
 */
export const writeJson = <T>(path: string, data: T, pretty = true): void => {
  const dir = dirname(path)
  ensureDir(dir)
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  writeFileSync(path, content, "utf8")
}

/**
 * Read a text file
 */
export const readText = (path: string): string | null => {
  if (!existsSync(path)) return null
  return readFileSync(path, "utf8")
}

/**
 * Write a text file
 */
export const writeText = (path: string, content: string): void => {
  const dir = dirname(path)
  ensureDir(dir)
  writeFileSync(path, content, "utf8")
}

/**
 * List files in a directory
 */
export const listFiles = (dir: string, pattern?: string): string[] => {
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
  if (!pattern) return files
  return files.filter(f => f.endsWith(pattern.replace("*", "")))
}

// Path generation functions

/** Subdirectory mappings for crawler-results */
const RESULT_SUBDIRS = {
  html: "html",
  parsed: "detail-json",
  normalized: "normalized-json",
  enriched: "enriched",
  extracted: "extracted",
  externalCache: "external-cache",
  structuredJson: "structured-json",
  structuredResearch: "structured-json/research",
  structuredResearchVersion: "structured-json/research-version",
  structuredDataset: "structured-json/dataset",
} as const

export type ResultSubdirKey = keyof typeof RESULT_SUBDIRS

/** Get a subdirectory path within crawler-results */
export const getSubdir = (key: ResultSubdirKey): string =>
  join(getResultsDir(), RESULT_SUBDIRS[key])

/** Get the path to the HTML cache directory */
export const getHtmlDir = (): string => getSubdir("html")

/** Get the path to the parsed JSON directory */
export const getParsedDir = (): string => getSubdir("parsed")

/** Get the path to the normalized JSON directory */
export const getNormalizedDir = (): string => getSubdir("normalized")

/** Get the path to the enriched JSON directory */
export const getEnrichedDir = (): string => getSubdir("enriched")

/** Get the path to the extracted JSON directory */
export const getExtractedDir = (): string => getSubdir("extracted")

/** Get the path to the external cache directory */
export const getExternalCacheDir = (): string => getSubdir("externalCache")

/**
 * Generate the path for a parsed JSON file
 */
export const parsedFilePath = (humVersionId: string, lang: LangType): string => {
  return join(getParsedDir(), `${humVersionId}-${lang}.json`)
}

/**
 * Generate the path for a normalized JSON file
 */
export const normalizedFilePath = (humVersionId: string, lang: LangType): string => {
  return join(getNormalizedDir(), `${humVersionId}-${lang}.json`)
}

/**
 * List parsed JSON files
 */
export const listParsedFiles = (opts: {
  humId?: string
  langs: LangType[]
}): { humVersionId: string; lang: LangType }[] => {
  const dir = getParsedDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const m = /^(hum\d+-v\d+)-(ja|en)\.json$/.exec(f)
      if (!m) return null
      return { humVersionId: m[1], lang: m[2] as LangType }
    })
    .filter((e): e is { humVersionId: string; lang: LangType } => e !== null)
    .filter(e => opts.humId ? e.humVersionId.startsWith(opts.humId) : true)
    .filter(e => opts.langs.includes(e.lang))
}

/**
 * Read parsed JSON
 */
export const readParsedJson = <T>(humVersionId: string, lang: LangType): T | null => {
  return readJson<T>(parsedFilePath(humVersionId, lang))
}

/**
 * Write parsed JSON
 */
export const writeParsedJson = <T>(humVersionId: string, lang: LangType, data: T): void => {
  writeJson(parsedFilePath(humVersionId, lang), data)
}

/**
 * Read normalized JSON
 */
export const readNormalizedJson = <T>(humVersionId: string, lang: LangType): T | null => {
  return readJson<T>(normalizedFilePath(humVersionId, lang))
}

/**
 * Write normalized JSON
 */
export const writeNormalizedJson = <T>(humVersionId: string, lang: LangType, data: T): void => {
  writeJson(normalizedFilePath(humVersionId, lang), data)
}

/**
 * List normalized JSON files
 */
export const listNormalizedFiles = (opts: {
  humId?: string
  langs: LangType[]
}): { humVersionId: string; lang: LangType }[] => {
  const dir = getNormalizedDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const m = /^(hum\d+-v\d+)-(ja|en)\.json$/.exec(f)
      if (!m) return null
      return { humVersionId: m[1], lang: m[2] as LangType }
    })
    .filter((e): e is { humVersionId: string; lang: LangType } => e !== null)
    .filter(e => opts.humId ? e.humVersionId.startsWith(opts.humId) : true)
    .filter(e => opts.langs.includes(e.lang))
}

// Structured JSON paths

/** Get the path to the structured JSON directory */
export const getStructuredJsonDir = (): string => getSubdir("structuredJson")

/** Get the path to the structured research directory */
export const getStructuredResearchDir = (): string => getSubdir("structuredResearch")

/** Get the path to the structured research version directory */
export const getStructuredResearchVersionDir = (): string => getSubdir("structuredResearchVersion")

/** Get the path to the structured dataset directory */
export const getStructuredDatasetDir = (): string => getSubdir("structuredDataset")

/**
 * Generate the path for a structured research JSON file
 */
export const structuredResearchFilePath = (humId: string): string => {
  return join(getStructuredResearchDir(), `${humId}.json`)
}

/**
 * Generate the path for a structured research version JSON file
 */
export const structuredResearchVersionFilePath = (humVersionId: string): string => {
  return join(getStructuredResearchVersionDir(), `${humVersionId}.json`)
}

/**
 * Generate the path for a structured dataset JSON file
 */
export const structuredDatasetFilePath = (datasetId: string, version: string): string => {
  return join(getStructuredDatasetDir(), `${datasetId}-${version}.json`)
}

/**
 * Write structured research JSON
 */
export const writeStructuredResearch = <T>(humId: string, data: T): void => {
  writeJson(structuredResearchFilePath(humId), data)
}

/**
 * Read structured research JSON
 */
export const readStructuredResearch = <T>(humId: string): T | null => {
  return readJson<T>(structuredResearchFilePath(humId))
}

/**
 * Write structured research version JSON
 */
export const writeStructuredResearchVersion = <T>(humVersionId: string, data: T): void => {
  writeJson(structuredResearchVersionFilePath(humVersionId), data)
}

/**
 * Read structured research version JSON
 */
export const readStructuredResearchVersion = <T>(humVersionId: string): T | null => {
  return readJson<T>(structuredResearchVersionFilePath(humVersionId))
}

/**
 * Write structured dataset JSON
 */
export const writeStructuredDataset = <T>(datasetId: string, version: string, data: T): void => {
  writeJson(structuredDatasetFilePath(datasetId, version), data)
}

/**
 * Read structured dataset JSON
 */
export const readStructuredDataset = <T>(datasetId: string, version: string): T | null => {
  return readJson<T>(structuredDatasetFilePath(datasetId, version))
}

/**
 * List structured research files
 */
export const listStructuredResearchFiles = (opts?: { humId?: string }): string[] => {
  const dir = getStructuredResearchDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .filter(f => opts?.humId ? f.startsWith(opts.humId) : true)
    .map(f => f.replace(".json", ""))
}

/**
 * List structured research version files
 */
export const listStructuredResearchVersionFiles = (opts?: { humId?: string }): string[] => {
  const dir = getStructuredResearchVersionDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .filter(f => opts?.humId ? f.startsWith(opts.humId) : true)
    .map(f => f.replace(".json", ""))
}

/**
 * List structured dataset files
 */
export const listStructuredDatasetFiles = (_opts?: { humId?: string }): { datasetId: string; version: string }[] => {
  const dir = getStructuredDatasetDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      // Match datasetId-version.json pattern (e.g., JGAD000001-v1.json)
      const m = /^(.+)-(v\d+)\.json$/.exec(f)
      if (!m) return null
      return { datasetId: m[1], version: m[2] }
    })
    .filter((e): e is { datasetId: string; version: string } => e !== null)
}

