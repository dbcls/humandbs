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
 * GEA URL pattern: extract only the final E-GEAD-* ID from URL paths
 *
 * GEA URLs have bucket directories like /E-GEAD-1000/E-GEAD-1121/
 * where E-GEAD-1000 is a bucket (not a real dataset) and E-GEAD-1121 is the actual ID
 */
const GEA_URL_PATTERN = /https?:\/\/[^\s]*\/gea\/experiment\/E-GEAD-\d+\/(E-GEAD-\d+)\/?/g

/**
 * Extract GEA IDs from URLs, taking only the final path segment
 */
const extractGeaIdsFromUrls = (text: string): string[] => {
  const ids: string[] = []
  const regex = new RegExp(GEA_URL_PATTERN.source, "g")
  let match
  while ((match = regex.exec(text)) !== null) {
    ids.push(match[1])
  }
  return ids
}

/**
 * Remove GEA URL portions from text to prevent bucket directory extraction
 */
const removeGeaUrls = (text: string): string => {
  return text.replace(/https?:\/\/[^\s]*\/gea\/experiment\/E-GEAD-\d+\/E-GEAD-\d+\/?/g, " ")
}

/**
 * Extract IDs by type from a text string
 */
export const extractIdsByType = (text: string): Partial<Record<DatasetIdType, string[]>> => {
  const result: Partial<Record<DatasetIdType, string[]>> = {}

  // Special handling for GEA: extract from URLs first, then from remaining text
  const geaUrlIds = extractGeaIdsFromUrls(text)
  const textWithoutGeaUrls = removeGeaUrls(text)

  for (const [type, regex] of Object.entries(ID_PATTERNS) as [DatasetIdType, RegExp][]) {
    regex.lastIndex = 0

    if (type === "GEA") {
      // For GEA: use URL-extracted IDs + IDs from non-URL text
      const nonUrlMatches = textWithoutGeaUrls.match(new RegExp(regex.source, "g")) ?? []
      const allGeaIds = [...new Set([...geaUrlIds, ...nonUrlMatches])]
      if (allGeaIds.length > 0) {
        result[type] = allGeaIds
      }
    } else {
      const matches = text.match(new RegExp(regex.source, "g"))
      if (matches && matches.length > 0) {
        result[type] = matches
      }
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
