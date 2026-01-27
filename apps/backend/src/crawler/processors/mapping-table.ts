/**
 * Molecular data header mapping table
 *
 * Maps raw Japanese/English headers to normalized English keys
 */
import fs from "fs"
import path from "path"

import type { LangType } from "@/crawler/types"
import { logger } from "@/crawler/utils/logger"

// Path to the TSV file in data/ directory
const HEADER_TSV_PATH = path.join(__dirname, "..", "data", "moldata-header-mapping.tsv")

/**
 * Mapping table row
 */
export interface MappingTableRow {
  ja_raw: string
  en_raw: string
  ja_norm: string
  en_norm: string
}

/**
 * Load molecular data mapping table from TSV file
 */
export const loadMolDataMappingTable = (): MappingTableRow[] => {
  const content = fs.readFileSync(HEADER_TSV_PATH, "utf8")
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== "")

  // skip header line
  const dataLines = lines.slice(1)

  const table: MappingTableRow[] = dataLines.map(line => {
    const [ja_raw, en_raw, ja_norm, en_norm] = line.split("\t")
    if (!ja_raw || !en_raw || !ja_norm || !en_norm) {
      throw new Error(`Invalid mapping table line: ${line}`)
    }
    return { ja_raw, en_raw, ja_norm, en_norm }
  })

  logger.debug("Mapping table loaded", { rows: table.length })
  return table
}

/**
 * Molecular data header mapping structure
 */
export interface MolDataHeaderMapping {
  /** Japanese raw key → Japanese normalized key */
  jaMap: Map<string, string>
  /** English raw key → English normalized key */
  enMap: Map<string, string>
  /** Japanese normalized key → English normalized key */
  normJaToEnMap: Map<string, string>
}

/** Cached mapping table */
let cachedMapping: MolDataHeaderMapping | null = null

/**
 * Build molecular data header mapping from TSV file
 */
export const buildMolDataHeaderMapping = (): MolDataHeaderMapping => {
  if (cachedMapping) {
    return cachedMapping
  }

  const table = loadMolDataMappingTable()
  const jaMap = new Map<string, string>()
  const enMap = new Map<string, string>()
  const normJaToEnMap = new Map<string, string>()

  for (const row of table) {
    jaMap.set(row.ja_raw, row.ja_norm)
    enMap.set(row.en_raw, row.en_norm)
    normJaToEnMap.set(row.ja_norm, row.en_norm)
  }

  cachedMapping = { jaMap, enMap, normJaToEnMap }
  return cachedMapping
}

/**
 * Normalize molecular data key (header) to English normalized key
 */
export const normalizeMolDataKey = (
  rawKey: string,
  lang: LangType,
  mapping?: MolDataHeaderMapping,
): string | null => {
  const m = mapping ?? buildMolDataHeaderMapping()

  if (lang === "ja") {
    const normJaKey = m.jaMap.get(rawKey)
    if (normJaKey) {
      return m.normJaToEnMap.get(normJaKey) || null
    }
    return null
  } else {
    return m.enMap.get(rawKey) || null
  }
}

/**
 * Clear the cached mapping table
 */
export const clearMappingCache = (): void => {
  cachedMapping = null
}
