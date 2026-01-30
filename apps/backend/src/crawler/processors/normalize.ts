/**
 * Normalization processor
 *
 * Transforms raw parsed data into normalized form:
 * - Value interpretation: "-" as empty, annotations filtering
 * - Text normalization: whitespace, full-width characters, quotes
 * - Date formatting: YYYY/M/D → YYYY-MM-DD
 * - Dataset ID processing: expansion, JGAS→JGAD conversion
 * - Criteria canonicalization: Japanese/English → canonical form
 *
 * Responsibility boundary:
 * - Parsers extract structured data from HTML (structure extraction)
 * - This processor interprets and normalizes extracted values
 */
import {
  getCriteriaCanonicalMap,
  getInvalidGrantIdValues,
  getInvalidDoiValues,
  getGlobalIdCorrection,
  applyGlobalIdCorrection,
  getJgaxToJgasMap,
  getOldJgaToJgasMap,
  getPublicationIdCorrection,
  getUnusedPublicationTitles,
  getInvalidOtherIds,
  getInvalidJgasIds,
  isInvalidPublicationDatasetId,
  cleanPublicationDatasetId,
  getNoSplitIds,
  getMolDataUnusedKey,
  getMolDataSplitKeys,
  getMolDataIdFields,
  getIdCorrectionByHum,
  getHumIdsWithDataSummary,
  getAdditionalIdsByHum,
  getIgnoreIdsByHum,
  getPolicyBaseUrl,
  getPolicyCanonical,
  getPolicyNormalizeMap,
  getPolicyUrlToCanonicalMap,
  hasCriteriaOverrideForHum,
} from "@/crawler/config/mapping"
import { isValidDatasetId } from "@/crawler/config/patterns"
import { loadMolDataMappingTable, buildMolDataHeaderMapping, normalizeMolDataKey } from "@/crawler/processors/mapping-table"
import type {
  LangType,
  TextValue,
  CriteriaCanonical,
  DatasetIdType,
  RawParseResult,
  NormalizedParseResult,
  NormalizedControlledAccessUser,
  NormalizedMolecularData,
  RawPublication,
  RawRelease,
  PeriodOfDataUse,
  ExtractedDatasetIds,
  DatasetIdRegistry,
  OrphanReference,
  NormalizedPolicy,
} from "@/crawler/types"
import { logger } from "@/crawler/utils/logger"
import {
  normalizeKey,
  splitValue,
  isTextValue,
  normalizeText,
  normalizeFooterText,
  httpToHttps,
} from "@/crawler/utils/text"

// Re-export mapping table functions
export { loadMolDataMappingTable, buildMolDataHeaderMapping, normalizeMolDataKey }

// Re-export text utilities for backward compatibility
export { normalizeKey, splitValue, isTextValue, normalizeText, normalizeFooterText }

/**
 * Normalize URL (ensure absolute URL)
 */
export const normalizeUrl = (url: string, baseUrl: string): string => {
  const u = url.trim()
  if (!u) return u

  if (/^https?:\/\//i.test(u)) return u

  if (u.startsWith("/")) return `${baseUrl}${u}`

  return u
}

// Value filtering (moved from parsers/utils.ts)

/**
 * Filter out empty marker "-" from values
 * This interprets "-" as "empty" which is a normalization concern
 */
export const filterEmptyMarker = (values: string[]): string[] =>
  values.filter(v => v !== "-")

/**
 * Filter out annotations starting with ※, *, （, (
 * Annotations like "※データ追加" or "(参考)" are filtered out,
 * but IDs starting with parentheses like "(A)" are preserved
 */
export const filterAnnotations = (values: string[]): string[] =>
  values.filter(v => {
    if (/^[※*（(]/.test(v) && !/^[（(]?[A-Z]/.test(v)) return false
    return true
  })

/**
 * Apply all value filters (empty marker + annotations)
 */
export const filterParsedValues = (values: string[]): string[] =>
  filterAnnotations(filterEmptyMarker(values))

// Header/Cell normalization (moved from parsers/utils.ts)

/**
 * Compare table headers with expected headers (case-insensitive, whitespace-normalized)
 * This is a normalization concern because it ignores case/whitespace differences
 */
export const compareHeaders = (headers: string[], expected: string[]): boolean => {
  if (headers.length !== expected.length) return false
  for (let i = 0; i < headers.length; i++) {
    const act = headers[i].replace(/\s+/g, "").toLowerCase().trim()
    const exp = expected[i].replace(/\s+/g, "").toLowerCase().trim()
    if (act !== exp) return false
  }
  return true
}

/**
 * Clean whitespace from text (utility for normalizeCellValue)
 */
const cleanTextForCell = (str: string | null | undefined): string => {
  return str?.trim() ?? ""
}

/**
 * Normalize cell value: empty string or "-" becomes null
 * This interprets "-" as "empty" which is a normalization concern
 */
export const normalizeCellValue = (cell: HTMLTableCellElement): string | null => {
  const t = cleanTextForCell(cell.textContent)
  return t === "" || t === "-" ? null : t
}

// Criteria normalization

/**
 * Context for normalization logging
 */
export interface NormalizeCriteriaContext {
  humVersionId?: string
  datasetId?: string | null
  onValidationError?: () => void
}

/**
 * Normalize criteria value to canonical form (single value)
 */
export const normalizeCriteria = (
  value: string | null | undefined,
  context?: NormalizeCriteriaContext,
): CriteriaCanonical | null => {
  if (!value) return null

  const raw = value.trim()
  if (raw === "") return null

  const parts = splitValue(raw)
  const criteriaMap = getCriteriaCanonicalMap()

  const results: CriteriaCanonical[] = []

  for (const part of parts) {
    const key = normalizeKey(part)
    const canonical = criteriaMap[key]
    if (canonical) {
      results.push(canonical)
    } else {
      logger.warn("Unknown criteria value", { value: part, normalizedKey: key, ...context })
    }
  }

  if (results.length === 0) return null

  // Error if multiple criteria values found without override
  if (results.length > 1) {
    const humId = context?.humVersionId?.split("-v")[0]
    const hasOverride = humId ? hasCriteriaOverrideForHum(humId) : false
    if (!hasOverride) {
      logger.error("Multiple criteria values found without override, using first", { values: results, humVersionId: context?.humVersionId, datasetId: context?.datasetId })
      context?.onValidationError?.()
    }
  }

  return results[0]
}

// Policy normalization

/**
 * Extract href URLs from rawHtml
 */
const extractHrefsFromHtml = (rawHtml: string | null): string[] => {
  if (!rawHtml) return []

  const hrefs: string[] = []
  const hrefRegex = /href="([^"]+)"/g
  let match: RegExpExecArray | null

  while ((match = hrefRegex.exec(rawHtml)) !== null) {
    hrefs.push(match[1])
  }

  return hrefs
}

/**
 * Split policy text by common delimiters
 * Handles: "および", "&", "、" and text before parentheses
 */
const splitPolicyText = (text: string): string[] => {
  // Remove dataset ID annotations like "(JGAD000095、JGAD000122)"
  const withoutAnnotations = text.replace(/\([^)]*JGAD[^)]*\)/g, "")

  // Split by common delimiters
  return withoutAnnotations
    .split(/\s*(?:および|&|、)\s*/)
    .map(s => s.trim())
    .filter(s => s !== "")
}

/**
 * Normalize a single policy text to canonical form
 */
const normalizeOnePolicyText = (
  text: string,
  _lang: "ja" | "en",
): NormalizedPolicy | null => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const normalizeMap = getPolicyNormalizeMap()
  const canonicalMap = getPolicyCanonical()
  const baseUrl = getPolicyBaseUrl()

  // Try to match with normalize map (lowercase comparison)
  const lowerText = trimmed.toLowerCase()
  for (const [pattern, canonicalId] of Object.entries(normalizeMap)) {
    if (lowerText.includes(pattern.toLowerCase())) {
      const canonical = canonicalMap[canonicalId]
      if (canonical) {
        return {
          id: canonicalId,
          name: { ja: canonical.ja, en: canonical.en },
          url: `${baseUrl}${canonical.path}`,
        }
      }
    }
  }

  // Check for custom policy pattern (e.g., "hum0184 policy")
  const customMatch = trimmed.match(/hum\d+\s*policy/i)
  if (customMatch) {
    return {
      id: "custom-policy",
      name: { ja: trimmed, en: trimmed },
      url: null,
    }
  }

  return null
}

/**
 * Normalize policy from URL path
 */
const normalizePolicyFromUrl = (urlPath: string): NormalizedPolicy | null => {
  const urlToCanonical = getPolicyUrlToCanonicalMap()
  const canonicalMap = getPolicyCanonical()
  const baseUrl = getPolicyBaseUrl()

  const canonicalId = urlToCanonical[urlPath]
  if (canonicalId) {
    const canonical = canonicalMap[canonicalId]
    if (canonical) {
      return {
        id: canonicalId,
        name: { ja: canonical.ja, en: canonical.en },
        url: `${baseUrl}${canonical.path}`,
      }
    }
  }

  return null
}

/**
 * Normalize policies from experiment data
 *
 * @param jaText - Japanese policy text
 * @param enText - English policy text
 * @param jaRawHtml - Japanese raw HTML (may contain href links)
 * @param enRawHtml - English raw HTML (may contain href links)
 * @returns Array of normalized policies
 */
export const normalizePolicies = (
  jaText: string | null,
  enText: string | null,
  jaRawHtml: string | null,
  enRawHtml: string | null,
): NormalizedPolicy[] => {
  const policies: NormalizedPolicy[] = []
  const seenIds = new Set<string>()

  // Helper to add policy if not already seen
  const addPolicy = (policy: NormalizedPolicy | null) => {
    if (policy && !seenIds.has(policy.id)) {
      // For custom policies, use the full name as key to allow multiple custom policies
      const key = policy.id === "custom-policy"
        ? `${policy.id}:${policy.name.ja}`
        : policy.id
      if (!seenIds.has(key)) {
        seenIds.add(key)
        policies.push(policy)
      }
    }
  }

  // 1. Try to extract from rawHtml hrefs first (most reliable)
  const jaHrefs = extractHrefsFromHtml(jaRawHtml)
  const enHrefs = extractHrefsFromHtml(enRawHtml)
  const allHrefs = [...new Set([...jaHrefs, ...enHrefs])]

  for (const href of allHrefs) {
    // Convert to path only
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : href
    addPolicy(normalizePolicyFromUrl(path))
  }

  // 2. Parse policy text
  const jaTexts = jaText ? splitPolicyText(jaText) : []
  const enTexts = enText ? splitPolicyText(enText) : []

  for (const t of jaTexts) {
    addPolicy(normalizeOnePolicyText(t, "ja"))
  }

  for (const t of enTexts) {
    addPolicy(normalizeOnePolicyText(t, "en"))
  }

  return policies
}

// Dataset ID normalization

/**
 * Fix dataset ID (remove parentheses, normalize text)
 */
export const fixDatasetId = (
  value: string,
): string[] => {
  const raw = value.trim()
  if (raw === "") return []

  const trimmed = raw
    // Insert spaces around parentheses before removing them
    // so that compound IDs like "JGAS000073(JGA000074)" split correctly
    .replace(/([^\s(])\(/g, "$1 (")
    .replace(/\)([^\s)])/g, ") $1")
    // Remove parentheses
    .replace(/[()]/g, "")
    // Remove Japanese text
    .replace(/データ追加/g, "")
    .replace(/データ削除/g, "")
    .replace(/に/g, "")
    .replace(/追加/g, "")
    // Remove English text
    .replace(/Data addition/gi, "")
    .replace(/Dataset addition/gi, "")
    .replace(/data added/gi, "")
    .replace(/data deleted/gi, "")
    // Replace delimiters with space
    .replace(/[、,]/g, " ")
    // Collapse multiple spaces
    .replace(/\s{2,}/g, " ")
    .trim()

  // Check special cases from config
  const specialCases = getGlobalIdCorrection()
  if (trimmed in specialCases) {
    return specialCases[trimmed]
  }

  // Split by space
  return trimmed.split(" ")
}

/**
 * Expand JGAD range notation to individual IDs
 * e.g., "JGAD000106-JGAD000108" → ["JGAD000106", "JGAD000107", "JGAD000108"]
 */
export const expandJgadRange = (id: string): string[] => {
  const match = id.match(/^(JGAD)(\d+)-JGAD(\d+)$/)
  if (!match) {
    return [id]
  }

  const [, prefix, startStr, endStr] = match
  const start = parseInt(startStr, 10)
  const end = parseInt(endStr, 10)

  if (start > end) {
    return [id]
  }

  const padLength = startStr.length
  const result: string[] = []
  for (let i = start; i <= end; i++) {
    result.push(`${prefix}${i.toString().padStart(padLength, "0")}`)
  }

  return result
}

// Date normalization

/**
 * Fix release date (parse YYYY/M/D → YYYY-MM-DD)
 */
export const fixReleaseDate = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null

  const raw = value.trim()
  if (!raw) return null
  if (raw === "Coming soon") return null
  if (raw === "近日公開予定") return null

  // Parse dates and return the first one (for single value)
  const dates = raw
    .split(/\s+/)
    .map(v => {
      const m = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
      if (!m) return null

      const [, y, mo, d] = m
      const mm = mo.padStart(2, "0")
      const dd = d.padStart(2, "0")

      return `${y}-${mm}-${dd}`
    })
    .filter((v): v is string => v !== null)

  return dates.length > 0 ? dates[0] : null
}

/**
 * Fix date format (YYYY/M/D → YYYY-MM-DD)
 */
export const fixDate = (value: string): string => {
  const raw = value.trim()
  const m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return raw

  const [, y, mo, d] = m
  const mm = mo.padStart(2, "0")
  const dd = d.padStart(2, "0")
  return `${y}-${mm}-${dd}`
}

/**
 * Fix dates in releases
 */
const fixDateInReleases = (
  releases: RawRelease[],
): RawRelease[] => {
  return releases.map(rel => ({
    ...rel,
    releaseDate: fixDate(rel.releaseDate),
  }))
}

// HumVersionId normalization

/**
 * Fix humVersionId format: "hum0014-v1-freq-v1" → "hum0014-v1"
 */
export const fixHumVersionId = (humVersionId: string): string => {
  const match = humVersionId.match(/^(hum\d+)-(v\d+)/)
  if (match) {
    return `${match[1]}-${match[2]}`
  }
  return humVersionId
}

// DOI normalization

/**
 * Normalize DOI value (filter invalid values)
 */
export const normalizeDoiValue = (doi: string | null): string | null => {
  if (!doi) return null

  const invalidDoiValues = getInvalidDoiValues()
  if (invalidDoiValues.includes(doi)) {
    return null
  }

  return doi
}

// Grant ID normalization

/**
 * Fix grant IDs (remove invalid values, normalize characters)
 */
export const fixGrantId = (values: string[]): string[] | null => {
  if (values.length === 0) return null

  const invalidGrantIdValues = getInvalidGrantIdValues()
  const results: string[] = []

  for (const value of values) {
    if (invalidGrantIdValues.includes(value)) continue

    const fixedValue = value
      // Full-width alphanumeric → half-width
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
        String.fromCharCode(c.charCodeAt(0) - 0xFEE0),
      )
      // Full-width dashes → half-width
      .replace(/[－―–—]/g, "-")
      // Full-width space → half-width
      .replace(/\u3000/g, " ")
      // Collapse multiple spaces
      .replace(/\s{2,}/g, " ")
      .trim()

    if (!fixedValue) continue
    results.push(fixedValue)
  }

  return results.length > 0 ? results : null
}

// Period of data use parsing

/**
 * Parse period of data use string
 */
export const parsePeriodOfDataUse = (
  value: string,
): PeriodOfDataUse | null => {
  const raw = value.trim().replace(/\s+/g, "")
  if (raw === "") return null

  // Try YYYY-MM-DD-YYYY-MM-DD format first
  const mHyphen = raw.match(/^(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/)
  if (mHyphen) {
    return {
      startDate: mHyphen[1],
      endDate: mHyphen[2],
    }
  }

  // Try YYYY/M/D-YYYY/M/D format
  const mSlash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})-(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (mSlash) {
    const [, y1, m1, d1, y2, m2, d2] = mSlash
    return {
      startDate: `${y1}-${m1.padStart(2, "0")}-${d1.padStart(2, "0")}`,
      endDate: `${y2}-${m2.padStart(2, "0")}-${d2.padStart(2, "0")}`,
    }
  }

  return null
}

// Value merging helpers

/**
 * Merge TextValue arrays
 */
export const mergeValue = (
  existing: TextValue | TextValue[] | null | undefined,
  incoming: TextValue | TextValue[] | null,
): TextValue | TextValue[] | null => {
  if (!incoming) {
    return existing ?? null
  }

  if (!existing) {
    return incoming
  }

  const toArray = (v: TextValue | TextValue[]): TextValue[] =>
    Array.isArray(v) ? v : [v]

  const merged = [
    ...toArray(existing),
    ...toArray(incoming),
  ]

  return merged.length === 1 ? merged[0] : merged
}

// Molecular data normalization

/**
 * Normalize molecular data keys
 */
export const normalizeMolData = (
  data: NormalizedMolecularData["data"],
  humVersionId: string,
  lang: LangType,
): NormalizedMolecularData["data"] => {
  const mappingTable = buildMolDataHeaderMapping()
  const normalizedData: NormalizedMolecularData["data"] = {}
  const unusedKey = getMolDataUnusedKey()
  const splitKeys = getMolDataSplitKeys()

  for (const [key, val] of Object.entries(data)) {
    const trimmedKey = key
      // Newlines to space
      .replace(/\r\n?|\n/g, " ")
      // Remove leading/trailing markers
      .replace(/^[\s*※]+|[\s*※]+$/g, "")
      // Collapse multiple spaces
      .replace(/\s{2,}/g, " ")
      .trim()

    const normKey = normalizeMolDataKey(trimmedKey, lang, mappingTable)

    if (normKey === unusedKey) {
      continue
    }

    if (!normKey) {
      logger.warn("Molecular data header not found in mapping table", { header: trimmedKey, humVersionId })
      normalizedData[trimmedKey] = val
      continue
    }

    if (normKey in splitKeys) {
      const splitKeyList = splitKeys[normKey]

      for (const sk of splitKeyList) {
        normalizedData[sk] = mergeValue(
          normalizedData[sk],
          val,
        )
      }
      continue
    }

    normalizedData[normKey] = mergeValue(
      normalizedData[normKey],
      val,
    )
  }

  return normalizedData
}

// Publication normalization

/**
 * Remove unused publications
 */
export const removeUnusedPublications = (
  publications: RawPublication[],
): RawPublication[] => {
  const unusedTitles = getUnusedPublicationTitles()
  return publications.filter(pub => {
    if (!pub.title) return true

    const t = pub.title.trim()
    return !unusedTitles.includes(t)
  })
}

/**
 * Split datasetId by whitespace, but preserve special cases
 */
const splitDatasetId = (id: string): string[] => {
  const raw = normalizeText(id, true)
  // Insert spaces around parentheses so compound IDs like "DRA003802(JGAS000006)" split correctly
  const normalized = raw
    .replace(/([^\s(])\(/g, "$1 (")
    .replace(/\)([^\s)])/g, ") $1")
  const noSplitPatterns = getNoSplitIds()

  // Check if this matches any no-split pattern
  for (const noSplit of noSplitPatterns) {
    if (normalized === noSplit) {
      return [normalized]
    }
  }
  return normalized.split(/\s+/).filter(s => s !== "")
}

// JGAS/JGAX conversion helpers

/**
 * Convert JGAX or old JGA format to JGAS using config mappings
 */
const convertToJgas = (id: string): string => {
  const jgaxMap = getJgaxToJgasMap()
  const oldJgaMap = getOldJgaToJgasMap()

  // Check JGAX mapping first
  if (id in jgaxMap) {
    return jgaxMap[id]
  }
  // Check old JGA format mapping
  if (id in oldJgaMap) {
    return oldJgaMap[id]
  }
  return id
}

/**
 * Expand JGAS ID to JGAD IDs using JGA API (async)
 * This is a stub - actual implementation needs JGA API client
 */
export const expandJgasToJgad = async (
  id: string,
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
): Promise<string[]> => {
  if (!/^JGAS\d{6}$/.test(id)) {
    const invalidIdValues = getInvalidOtherIds()
    if (invalidIdValues.includes(id)) {
      return []
    }
    return [id]
  }

  // Skip invalid JGAS IDs that don't exist
  const invalidJgasIds = getInvalidJgasIds()
  if (invalidJgasIds.has(id)) {
    return []
  }

  const jgadIds = await getDatasetsFromStudy(id)
  if (jgadIds.length === 0) {
    logger.warn("JGAS has no corresponding JGAD (unexpected)", { jgasId: id })
  }

  // Filter out invalid JGAD IDs
  const invalidIdValues = getInvalidOtherIds()
  return jgadIds.filter(jgadId => !invalidIdValues.includes(jgadId))
}

/**
 * Process a single dataset ID: apply special cases, mapping, convert JGAX→JGAS, expand range, expand JGAS→JGAD
 */
export const processDatasetId = async (
  id: string,
  idMap: Record<string, string[]>,
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
  humId: string,
): Promise<string[]> => {
  // First, apply ID mapping
  if (id in idMap) {
    return idMap[id]
  }

  // Fix typos: JGAD written by mistake instead of JGAS (hum-specific)
  const jgadTypoToJgas = getIdCorrectionByHum(humId)
  const typoFixedId = jgadTypoToJgas[id] ?? id

  // Apply special case transformations
  const specialCaseIds = applyGlobalIdCorrection(typoFixedId)

  const results: string[] = []
  for (const specialCaseId of specialCaseIds) {
    // Convert JGAX or old JGA format to JGAS
    const convertedId = convertToJgas(specialCaseId)

    // Expand JGAD range
    const expandedIds = expandJgadRange(convertedId)

    // Expand JGAS to JGAD for each expanded ID
    for (const expandedId of expandedIds) {
      const jgadIds = await expandJgasToJgad(expandedId, getDatasetsFromStudy)
      results.push(...jgadIds)
    }
  }

  return results
}

// Fix dataset IDs in various structures

/**
 * Fix dataset IDs in publications
 */
export const fixDatasetIdsInPublications = async (
  publications: RawPublication[],
  molecularData: NormalizedMolecularData[],
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
  extractIdsByTypeFn: (text: string) => Partial<Record<DatasetIdType, string[]>>,
  humId: string,
): Promise<RawPublication[]> => {
  const pubDatasetIdMap = getPublicationIdCorrection()

  return Promise.all(publications.map(async pub => {
    const mappedIds: string[] = []

    for (const id of pub.datasetIds) {
      // If the ID is already a valid dataset ID pattern, process it normally
      if (isValidDatasetId(id)) {
        const processedIds = await processDatasetId(id, pubDatasetIdMap, getDatasetsFromStudy, humId)
        mappedIds.push(...processedIds)
        continue
      }

      // Otherwise, try to match with molecularData header
      const matchingMolData = findMatchingMolData(id, molecularData)
      if (matchingMolData) {
        const extractedIds = extractDatasetIdsFromMolData(matchingMolData, extractIdsByTypeFn)
        if (extractedIds.length > 0) {
          for (const extractedId of extractedIds) {
            const processedIds = await processDatasetId(extractedId, pubDatasetIdMap, getDatasetsFromStudy, humId)
            mappedIds.push(...processedIds)
          }
          continue
        }
      }

      // Fallback: process the original ID
      const processedIds = await processDatasetId(id, pubDatasetIdMap, getDatasetsFromStudy, humId)
      mappedIds.push(...processedIds)
    }

    return {
      ...pub,
      datasetIds: mappedIds,
    }
  }))
}

/**
 * Fix dataset IDs in controlled access users
 */
export const fixDatasetIdsInControlledAccessUsers = async (
  cas: NormalizedControlledAccessUser[],
  molecularData: NormalizedMolecularData[],
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
  extractIdsByTypeFn: (text: string) => Partial<Record<DatasetIdType, string[]>>,
  humId: string,
): Promise<NormalizedControlledAccessUser[]> => {
  // No typo correction map for controlled access users (kept empty)
  const caDatasetIdMap: Record<string, string[]> = {}

  return Promise.all(cas.map(async ca => {
    const mappedIds: string[] = []

    for (const id of ca.datasetIds) {
      // If the ID is already a valid dataset ID pattern, process it normally
      if (isValidDatasetId(id)) {
        const processedIds = await processDatasetId(id, caDatasetIdMap, getDatasetsFromStudy, humId)
        mappedIds.push(...processedIds)
        continue
      }

      // Otherwise, try to match with molecularData header
      const matchingMolData = findMatchingMolData(id, molecularData)
      if (matchingMolData) {
        const extractedIds = extractDatasetIdsFromMolData(matchingMolData, extractIdsByTypeFn)
        if (extractedIds.length > 0) {
          for (const extractedId of extractedIds) {
            const processedIds = await processDatasetId(extractedId, caDatasetIdMap, getDatasetsFromStudy, humId)
            mappedIds.push(...processedIds)
          }
          continue
        }
      }

      // Fallback: process the original ID
      const processedIds = await processDatasetId(id, caDatasetIdMap, getDatasetsFromStudy, humId)
      mappedIds.push(...processedIds)
    }

    return {
      ...ca,
      datasetIds: mappedIds,
    }
  }))
}

/**
 * Extract all dataset IDs from molecularData's ID fields
 */
export const extractDatasetIdsFromMolData = (
  molData: NormalizedMolecularData,
  extractIdsByType: (text: string) => Record<string, string[]>,
): string[] => {
  const ids = new Set<string>()
  const idFields = getMolDataIdFields()

  for (const key of idFields) {
    const val = molData.data[key]
    if (!val) continue

    const values = Array.isArray(val) ? val : [val]
    for (const v of values) {
      // Extract from text
      const textIds = extractIdsByType(v.text)
      for (const idList of Object.values(textIds)) {
        for (const id of idList) {
          ids.add(id)
        }
      }
      // Extract from rawHtml
      const htmlIds = extractIdsByType(v.rawHtml)
      for (const idList of Object.values(htmlIds)) {
        for (const id of idList) {
          ids.add(id)
        }
      }
    }
  }

  return [...ids]
}

/**
 * Extract and expand dataset IDs from molecular data (including JGAS→JGAD conversion)
 */
export const extractAndExpandDatasetIdsFromMolData = async (
  molData: NormalizedMolecularData,
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
  extractIdsByTypeFn: (text: string) => Partial<Record<DatasetIdType, string[]>>,
): Promise<ExtractedDatasetIds> => {
  const invalidIdValues = getInvalidOtherIds()
  const invalidJgasIds = getInvalidJgasIds()
  const idFields = getMolDataIdFields()

  // Collect IDs from header and data fields
  const idsByType: Partial<Record<DatasetIdType, Set<string>>> = {}

  const addIds = (text: string) => {
    const found = extractIdsByTypeFn(text)
    for (const [type, ids] of Object.entries(found) as [DatasetIdType, string[]][]) {
      if (!idsByType[type]) {
        idsByType[type] = new Set()
      }
      for (const id of ids) {
        if (invalidIdValues.includes(id)) continue
        const normalizedIds = applyGlobalIdCorrection(id)
        for (const normalizedId of normalizedIds) {
          idsByType[type]!.add(normalizedId)
        }
      }
    }
  }

  // Extract from header
  if (molData.id?.text) {
    const specialCaseIds = applyGlobalIdCorrection(molData.id.text)
    for (const id of specialCaseIds) {
      addIds(id)
    }
    addIds(molData.id.text)
  }

  // Extract from data fields
  for (const key of idFields) {
    const val = molData.data[key]
    if (!val) continue

    const values = Array.isArray(val) ? val : [val]
    for (const v of values) {
      addIds(v.text)
      addIds(v.rawHtml)
    }
  }

  // Convert to arrays
  const idsByTypeArrays: Partial<Record<DatasetIdType, string[]>> = {}
  for (const [type, ids] of Object.entries(idsByType)) {
    idsByTypeArrays[type as DatasetIdType] = [...ids]
  }

  // Collect JGAS IDs for expansion
  const originalJgasIds: string[] = idsByTypeArrays.JGAS ?? []

  // Expand JGAS to JGAD
  const expandedJgadIds = new Set<string>()
  for (const jgasId of originalJgasIds) {
    if (invalidJgasIds.has(jgasId)) continue
    const jgadIds = await getDatasetsFromStudy(jgasId)
    for (const jgadId of jgadIds) {
      if (!invalidIdValues.includes(jgadId)) {
        expandedJgadIds.add(jgadId)
      }
    }
    if (jgadIds.length === 0) {
      logger.warn("JGAS has no corresponding JGAD (unexpected)", { jgasId })
    }
  }

  // Collect all final dataset IDs
  const allDatasetIds = new Set<string>()

  // Add direct IDs (JGAD, DRA, GEA, NBDC, BP, METABO)
  const directIdTypes: DatasetIdType[] = ["JGAD", "DRA", "GEA", "NBDC_DATASET", "BP", "METABO"]
  for (const type of directIdTypes) {
    const ids = idsByTypeArrays[type]
    if (ids) {
      for (const id of ids) {
        allDatasetIds.add(id)
      }
    }
  }

  // Add expanded JGAD IDs
  for (const jgadId of expandedJgadIds) {
    allDatasetIds.add(jgadId)
  }

  return {
    datasetIds: [...allDatasetIds],
    originalJgasIds,
    idsByType: idsByTypeArrays,
  }
}

/**
 * Build dataset ID registry from molecular data
 */
export const buildDatasetIdRegistry = (
  molecularData: NormalizedMolecularData[],
): DatasetIdRegistry => {
  const validDatasetIds = new Set<string>()
  const datasetIdToMolDataIndices: Record<string, number[]> = {}

  for (let i = 0; i < molecularData.length; i++) {
    const molData = molecularData[i]
    const extractedIds = molData.extractedDatasetIds

    if (!extractedIds) continue

    for (const datasetId of extractedIds.datasetIds) {
      validDatasetIds.add(datasetId)

      if (!datasetIdToMolDataIndices[datasetId]) {
        datasetIdToMolDataIndices[datasetId] = []
      }
      datasetIdToMolDataIndices[datasetId].push(i)
    }
  }

  return {
    validDatasetIds: [...validDatasetIds],
    datasetIdToMolDataIndices,
  }
}

/**
 * Build dataset ID registry from summary.datasets (for dataSummaryPages that have no molecularData)
 */
export const buildDatasetIdRegistryFromSummary = (
  datasets: NormalizedParseResult["summary"]["datasets"],
): DatasetIdRegistry => {
  const validDatasetIds = new Set<string>()

  for (const ds of datasets) {
    if (ds.datasetId) {
      for (const id of ds.datasetId) {
        validDatasetIds.add(id)
      }
    }
  }

  return {
    validDatasetIds: [...validDatasetIds],
    datasetIdToMolDataIndices: {}, // molData がないので空
  }
}

/**
 * Detect orphan dataset ID references
 */
export const detectOrphanDatasetIds = (
  result: NormalizedParseResult,
  validDatasetIds: Set<string>,
  humVersionId: string,
): OrphanReference[] => {
  const orphans: OrphanReference[] = []

  // Check summary.datasets
  for (const ds of result.summary.datasets) {
    if (!ds.datasetId) continue
    for (const id of ds.datasetId) {
      if (!validDatasetIds.has(id)) {
        orphans.push({
          type: "summary",
          datasetId: id,
          context: ds.typeOfData ?? "",
        })
      }
    }
  }

  // Check publications
  for (const pub of result.publications) {
    for (const id of pub.datasetIds) {
      if (!validDatasetIds.has(id)) {
        orphans.push({
          type: "publication",
          datasetId: id,
          context: pub.title ?? "",
        })
      }
    }
  }

  // Check controlledAccessUsers
  for (const cau of result.controlledAccessUsers) {
    for (const id of cau.datasetIds) {
      if (!validDatasetIds.has(id)) {
        orphans.push({
          type: "controlledAccessUser",
          datasetId: id,
          context: cau.researchTitle ?? "",
        })
      }
    }
  }

  // Log warnings
  for (const orphan of orphans) {
    logger.warn("Orphan dataset ID reference detected", {
      humVersionId,
      type: orphan.type,
      datasetId: orphan.datasetId,
      context: orphan.context,
    })
  }

  return orphans
}

/**
 * Find matching molecularData for a summary datasetId
 */
const findMatchingMolData = (
  summaryDatasetId: string,
  molecularData: NormalizedMolecularData[],
): NormalizedMolecularData | undefined => {
  const normalizedSummaryId = summaryDatasetId.toLowerCase().replace(/\s+/g, "")

  return molecularData.find(md => {
    const headerText = md.id?.text ?? ""
    const normalizedHeader = headerText.toLowerCase().replace(/\s+/g, "")
    return normalizedHeader.includes(normalizedSummaryId)
  })
}

/**
 * Fix dataset IDs in summary datasets
 */
export const fixDatasetIdsInSummaryDatasets = async (
  datasets: NormalizedParseResult["summary"]["datasets"],
  molecularData: NormalizedMolecularData[],
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
  extractIdsByType: (text: string) => Record<string, string[]>,
  humId: string,
): Promise<NormalizedParseResult["summary"]["datasets"]> => {
  return Promise.all(datasets.map(async ds => {
    if (!ds.datasetId || ds.datasetId.length === 0) {
      return ds
    }

    const mappedIds: string[] = []
    for (const id of ds.datasetId) {
      // If the ID is already a valid dataset ID pattern, process it normally
      if (isValidDatasetId(id)) {
        const processedIds = await processDatasetId(id, {}, getDatasetsFromStudy, humId)
        mappedIds.push(...processedIds)
        continue
      }

      // Otherwise, try to expand from matching molecularData
      const matchingMolData = findMatchingMolData(id, molecularData)
      if (matchingMolData) {
        const extractedIds = extractDatasetIdsFromMolData(matchingMolData, extractIdsByType)
        if (extractedIds.length > 0) {
          // Process each extracted ID
          for (const extractedId of extractedIds) {
            const processedIds = await processDatasetId(extractedId, {}, getDatasetsFromStudy, humId)
            mappedIds.push(...processedIds)
          }
          continue
        }
      }

      // Fallback: process the original ID (handles oldJga conversion etc.)
      const processedIds = await processDatasetId(id, {}, getDatasetsFromStudy, humId)
      mappedIds.push(...processedIds)
    }

    return {
      ...ds,
      datasetId: mappedIds,
    }
  }))
}

// Main normalization function

/**
 * Normalization options
 */
export interface NormalizeOptions {
  /** Base URL for relative URL resolution */
  baseUrl: string
  /** Function to get JGAD datasets from JGAS study ID */
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>
  /** Function to extract IDs by type from text */
  extractIdsByType: (text: string) => Record<string, string[]>
  /** Callback when validation error occurs (e.g., multiple criteria without override) */
  onValidationError?: () => void
}

/**
 * Normalize a single parsed detail
 */
export const normalizeParseResult = async (
  detail: RawParseResult,
  humVersionId: string,
  lang: LangType,
  options: NormalizeOptions,
): Promise<NormalizedParseResult> => {
  const { baseUrl, getDatasetsFromStudy, extractIdsByType } = options

  const normalizedDetail: NormalizedParseResult = {
    ...detail,
    summary: {
      ...detail.summary,
      aims: normalizeText(detail.summary.aims, lang === "en", lang),
      methods: normalizeText(detail.summary.methods, lang === "en", lang),
      targets: normalizeText(detail.summary.targets, lang === "en", lang),
      url: detail.summary.url.map(u => ({
        ...u,
        text: httpToHttps(u.text),
        url: httpToHttps(normalizeUrl(u.url, baseUrl)),
      })),
      datasets: detail.summary.datasets.map(ds => ({
        ...ds,
        datasetId: ds.datasetId ? fixDatasetId(normalizeText(ds.datasetId, true)) : null,
        typeOfData: ds.typeOfData ? normalizeText(ds.typeOfData, true) : null,
        criteria: normalizeCriteria(ds.criteria, { humVersionId, datasetId: ds.datasetId, onValidationError: options.onValidationError }),
        releaseDate: ds.releaseDate ? fixReleaseDate(normalizeText(ds.releaseDate, true)) : null,
      })),
      footers: detail.summary.footers.map(f => ({
        ...f,
        text: normalizeFooterText(normalizeText(f.text, lang === "en", lang), lang),
      })),
    },
    molecularData: detail.molecularData.map(md => ({
      ...md,
      id: normalizeText(md.id, true),
      data: Object.fromEntries(
        Object.entries(md.data).map(([key, val]) => [
          key,
          val === null ? null : normalizeText(val, true),
        ]),
      ),
      footers: md.footers.map(f => ({
        ...f,
        text: normalizeFooterText(normalizeText(f.text, lang === "en", lang), lang),
      })),
    })),
    dataProvider: {
      ...detail.dataProvider,
      principalInvestigator: detail.dataProvider.principalInvestigator.map(pi => normalizeText(pi, true, lang)),
      affiliation: detail.dataProvider.affiliation.map(af => normalizeText(af, true, lang)),
      projectName: detail.dataProvider.projectName.map(pn => normalizeText(pn, true, lang)),
      projectUrl: detail.dataProvider.projectUrl.map(u => ({
        ...u,
        text: httpToHttps(u.text),
        url: httpToHttps(normalizeUrl(u.url, baseUrl)),
      })),
      grants: detail.dataProvider.grants.map(grant => ({
        grantName: grant.grantName ? normalizeText(grant.grantName, true, lang) : null,
        projectTitle: grant.projectTitle ? normalizeText(grant.projectTitle, true, lang) : null,
        // Filter "-" and annotations before processing
        grantId: fixGrantId(filterParsedValues(grant.grantId).map(id => normalizeText(id, true))),
      })),
    },
    publications: detail.publications.map(pub => ({
      ...pub,
      title: pub.title ? normalizeText(pub.title, true, lang) : null,
      doi: (() => {
        if (!pub.doi) return null
        const normalized = normalizeDoiValue(normalizeText(pub.doi, true))
        return normalized ? httpToHttps(normalized) : null
      })(),
      // Filter "-" and annotations before processing
      datasetIds: filterParsedValues(pub.datasetIds)
        .flatMap(id => splitDatasetId(id))
        .filter(id => !isInvalidPublicationDatasetId(id))
        .map(id => cleanPublicationDatasetId(id)),
    })),
    controlledAccessUsers: detail.controlledAccessUsers.map(cau => ({
      ...cau,
      principalInvestigator: cau.principalInvestigator ? normalizeText(cau.principalInvestigator, true, lang) : null,
      affiliation: cau.affiliation ? normalizeText(cau.affiliation, true, lang) : null,
      country: cau.country ? normalizeText(cau.country, true, lang) : null,
      researchTitle: cau.researchTitle ? normalizeText(cau.researchTitle, true, lang) : null,
      // Filter "-" and annotations before processing
      datasetIds: filterParsedValues(cau.datasetIds).map(id => normalizeText(id, true)),
      periodOfDataUse: cau.periodOfDataUse ? parsePeriodOfDataUse(normalizeText(cau.periodOfDataUse, true)) : null,
    })),
    releases: detail.releases.map(rel => ({
      ...rel,
      humVersionId: fixHumVersionId(rel.humVersionId),
      content: normalizeText(rel.content, lang === "en", lang),
      releaseNote: rel.releaseNote ? normalizeText(rel.releaseNote, true, lang) : undefined,
    })),
  }

  // Post-processing
  normalizedDetail.publications = removeUnusedPublications(normalizedDetail.publications)
  normalizedDetail.releases = fixDateInReleases(normalizedDetail.releases)

  // Normalize molecular data keys
  for (const molData of normalizedDetail.molecularData) {
    molData.data = normalizeMolData(molData.data, humVersionId, lang)
  }

  // Extract and expand dataset IDs from molecular data
  for (const molData of normalizedDetail.molecularData) {
    molData.extractedDatasetIds = await extractAndExpandDatasetIdsFromMolData(
      molData,
      getDatasetsFromStudy,
      extractIdsByType,
    )
  }

  // Extract humId from humVersionId (e.g., "hum0014-v37" -> "hum0014")
  const humId = humVersionId.split("-v")[0]
  const dataSummaryHumIds = getHumIdsWithDataSummary()

  // Build dataset ID registry (molecularData から構築)
  // dataSummaryPages の場合は fixDatasetIdsInSummaryDatasets の後に再構築する
  normalizedDetail.datasetIdRegistry = buildDatasetIdRegistry(normalizedDetail.molecularData)

  // Fix dataset IDs in publications (with molData header matching)
  normalizedDetail.publications = await fixDatasetIdsInPublications(
    normalizedDetail.publications,
    normalizedDetail.molecularData,
    getDatasetsFromStudy,
    extractIdsByType,
    humId,
  )

  // Fix dataset IDs in controlled access users (with molData header matching)
  normalizedDetail.controlledAccessUsers = await fixDatasetIdsInControlledAccessUsers(
    normalizedDetail.controlledAccessUsers,
    normalizedDetail.molecularData,
    getDatasetsFromStudy,
    extractIdsByType,
    humId,
  )

  // Fix dataset IDs in summary (must be called after normalizeMolData)
  normalizedDetail.summary.datasets = await fixDatasetIdsInSummaryDatasets(
    normalizedDetail.summary.datasets,
    normalizedDetail.molecularData,
    getDatasetsFromStudy,
    extractIdsByType,
    humId,
  )

  // Build dataset ID registry for dataSummaryPages (after fixDatasetIdsInSummaryDatasets)
  if (dataSummaryHumIds.includes(humId)) {
    normalizedDetail.datasetIdRegistry = buildDatasetIdRegistryFromSummary(
      normalizedDetail.summary.datasets,
    )
  }

  // Add additional dataset IDs from config (e.g., PRJDB10452 for hum0248)
  const additionalIds = getAdditionalIdsByHum(humId)
  if (additionalIds.length > 0) {
    normalizedDetail.datasetIdRegistry.validDatasetIds.push(...additionalIds)
  }

  // Detect orphan dataset ID references (warning only, no exclusion)
  const ignoredIds = getIgnoreIdsByHum()[humId] ?? []
  const validDatasetIds = new Set([
    ...normalizedDetail.datasetIdRegistry.validDatasetIds,
    ...ignoredIds,
  ])
  normalizedDetail.detectedOrphans = detectOrphanDatasetIds(
    normalizedDetail,
    validDatasetIds,
    humVersionId,
  )

  return normalizedDetail
}
