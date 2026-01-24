/**
 * ID pattern definitions for dataset identification
 */
import type { DatasetIdType } from "@/crawler/types"

const SRA_REGEX = /(DRA|ERA|SRP|SRR|SRX|SRS)\d{6}/g
const JGAD_REGEX = /JGAD\d{6}/g
const JGAS_REGEX = /JGAS\d{6}/g
const GEA_REGEX = /E-GEAD-\d{3,4}/g
const NBDC_DATASET_REGEX = /hum\d{4}\.v\d+(?:\.[A-Za-z0-9_-]+)*\.v\d+/g
const BP_REGEX = /PRJDB\d{5}/g
const METABO_REGEX = /MTBKS\d{3}/g

export const ID_PATTERNS: Record<DatasetIdType, RegExp> = {
  DRA: SRA_REGEX,
  JGAD: JGAD_REGEX,
  JGAS: JGAS_REGEX,
  GEA: GEA_REGEX,
  NBDC_DATASET: NBDC_DATASET_REGEX,
  BP: BP_REGEX,
  METABO: METABO_REGEX,
}

/**
 * Extract IDs by type from a text string
 */
export const extractIdsByType = (text: string): Partial<Record<DatasetIdType, string[]>> => {
  const result: Partial<Record<DatasetIdType, string[]>> = {}

  for (const [type, regex] of Object.entries(ID_PATTERNS) as [DatasetIdType, RegExp][]) {
    regex.lastIndex = 0
    const matches = text.match(new RegExp(regex.source, "g"))
    if (matches && matches.length > 0) {
      result[type] = matches
    }
  }

  return result
}

/**
 * Check if a string is a valid dataset ID (matches one of the known ID patterns)
 */
export const isValidDatasetId = (id: string): boolean => {
  for (const regex of Object.values(ID_PATTERNS)) {
    regex.lastIndex = 0
    if (regex.test(id)) {
      return true
    }
  }
  return false
}
