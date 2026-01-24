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
  getDatasetIdSpecialCases,
  applyDatasetIdSpecialCase,
  getJgaxToJgasMap,
  getOldJgaToJgasMap,
  getPublicationDatasetIdMap,
  getControlledAccessUsersDatasetIdMap,
  getUnusedPublicationTitles,
  getInvalidIdValues,
  getInvalidJgasIds,
  isInvalidPublicationDatasetId,
  cleanPublicationDatasetId,
  getPublicationDatasetIdNoSplit,
  getMolDataUnusedKey,
  getMolDataSplitKeys,
  getMolDataIdFields,
  getJgadTypoToJgas,
} from "@/crawler/config/mapping"
import { isValidDatasetId } from "@/crawler/config/patterns"
import { loadMolDataMappingTable, buildMolDataHeaderMapping, normalizeMolDataKey } from "@/crawler/processors/mapping-table"
import type {
  LangType,
  TextValue,
  CriteriaCanonical,
  RawParseResult,
  NormalizedParseResult,
  NormalizedControlledAccessUser,
  NormalizedMolecularData,
  RawPublication,
  RawRelease,
  PeriodOfDataUse,
} from "@/crawler/types"
import { logger } from "@/crawler/utils/logger"
import {
  normalizeKey,
  splitValue,
  isTextValue,
  normalizeText,
  normalizeFooterText,
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
 * Normalize criteria value to canonical form
 */
export const normalizeCriteria = (
  value: string | null | undefined,
): CriteriaCanonical[] | null => {
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
      logger.warn("Unknown criteria value", { value: part, normalizedKey: key })
    }
  }

  return results.length > 0 ? results : null
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
  const specialCases = getDatasetIdSpecialCases()
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
): string[] | null => {
  if (!value) return null

  const raw = value.trim()
  if (!raw) return null
  if (raw === "Coming soon") return null
  if (raw === "近日公開予定") return null

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

  return dates.length > 0 ? dates : null
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
  const normalized = normalizeText(id, true)
  const noSplitPatterns = getPublicationDatasetIdNoSplit()

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
    const invalidIdValues = getInvalidIdValues()
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
  const invalidIdValues = getInvalidIdValues()
  return jgadIds.filter(jgadId => !invalidIdValues.includes(jgadId))
}

/**
 * Process a single dataset ID: apply special cases, mapping, convert JGAX→JGAS, expand range, expand JGAS→JGAD
 */
export const processDatasetId = async (
  id: string,
  idMap: Record<string, string[]>,
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
): Promise<string[]> => {
  // First, apply ID mapping
  if (id in idMap) {
    return idMap[id]
  }

  // Fix typos: JGAD written by mistake instead of JGAS
  const jgadTypoToJgas = getJgadTypoToJgas()
  const typoFixedId = jgadTypoToJgas[id] ?? id

  // Apply special case transformations
  const specialCaseIds = applyDatasetIdSpecialCase(typoFixedId)

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
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
): Promise<RawPublication[]> => {
  const pubDatasetIdMap = getPublicationDatasetIdMap()

  return Promise.all(publications.map(async pub => {
    const mappedIds: string[] = []

    for (const id of pub.datasetIds) {
      const processedIds = await processDatasetId(id, pubDatasetIdMap, getDatasetsFromStudy)
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
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>,
): Promise<NormalizedControlledAccessUser[]> => {
  const caDatasetIdMap = getControlledAccessUsersDatasetIdMap()

  return Promise.all(cas.map(async ca => {
    const mappedIds: string[] = []

    for (const id of ca.datasetIds) {
      const processedIds = await processDatasetId(id, caDatasetIdMap, getDatasetsFromStudy)
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
): Promise<NormalizedParseResult["summary"]["datasets"]> => {
  return Promise.all(datasets.map(async ds => {
    if (!ds.datasetId || ds.datasetId.length === 0) {
      return ds
    }

    const mappedIds: string[] = []
    for (const id of ds.datasetId) {
      // If the ID is already a valid dataset ID pattern, process it normally
      if (isValidDatasetId(id)) {
        const processedIds = await processDatasetId(id, {}, getDatasetsFromStudy)
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
            const processedIds = await processDatasetId(extractedId, {}, getDatasetsFromStudy)
            mappedIds.push(...processedIds)
          }
          continue
        }
      }

      // Fallback: keep the original ID
      mappedIds.push(id)
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
      aims: normalizeText(detail.summary.aims, lang === "en"),
      methods: normalizeText(detail.summary.methods, lang === "en"),
      targets: normalizeText(detail.summary.targets, lang === "en"),
      url: detail.summary.url.map(u => ({
        ...u,
        url: normalizeUrl(u.url, baseUrl),
      })),
      datasets: detail.summary.datasets.map(ds => ({
        ...ds,
        datasetId: ds.datasetId ? fixDatasetId(normalizeText(ds.datasetId, true)) : null,
        typeOfData: ds.typeOfData ? normalizeText(ds.typeOfData, true) : null,
        criteria: normalizeCriteria(ds.criteria),
        releaseDate: ds.releaseDate ? fixReleaseDate(normalizeText(ds.releaseDate, true)) : null,
      })),
      footers: detail.summary.footers.map(f => ({
        ...f,
        text: normalizeFooterText(normalizeText(f.text, lang === "en"), lang),
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
        text: normalizeFooterText(normalizeText(f.text, lang === "en"), lang),
      })),
    })),
    dataProvider: {
      ...detail.dataProvider,
      principalInvestigator: detail.dataProvider.principalInvestigator.map(pi => normalizeText(pi, true)),
      affiliation: detail.dataProvider.affiliation.map(af => normalizeText(af, true)),
      projectName: detail.dataProvider.projectName.map(pn => normalizeText(pn, true)),
      projectUrl: detail.dataProvider.projectUrl.map(u => ({
        ...u,
        url: normalizeUrl(u.url, baseUrl),
      })),
      grants: detail.dataProvider.grants.map(grant => ({
        grantName: grant.grantName ? normalizeText(grant.grantName, true) : null,
        projectTitle: grant.projectTitle ? normalizeText(grant.projectTitle, true) : null,
        // Filter "-" and annotations before processing
        grantId: fixGrantId(filterParsedValues(grant.grantId).map(id => normalizeText(id, true))),
      })),
    },
    publications: detail.publications.map(pub => ({
      ...pub,
      title: pub.title ? normalizeText(pub.title, true) : null,
      doi: pub.doi ? normalizeDoiValue(normalizeText(pub.doi, true)) : null,
      // Filter "-" and annotations before processing
      datasetIds: filterParsedValues(pub.datasetIds)
        .flatMap(id => splitDatasetId(id))
        .filter(id => !isInvalidPublicationDatasetId(id))
        .map(id => cleanPublicationDatasetId(id)),
    })),
    controlledAccessUsers: detail.controlledAccessUsers.map(cau => ({
      ...cau,
      principalInvestigator: cau.principalInvestigator ? normalizeText(cau.principalInvestigator, true) : null,
      affiliation: cau.affiliation ? normalizeText(cau.affiliation, true) : null,
      country: cau.country ? normalizeText(cau.country, true) : null,
      researchTitle: cau.researchTitle ? normalizeText(cau.researchTitle, true) : null,
      // Filter "-" and annotations before processing
      datasetIds: filterParsedValues(cau.datasetIds).map(id => normalizeText(id, true)),
      periodOfDataUse: cau.periodOfDataUse ? parsePeriodOfDataUse(normalizeText(cau.periodOfDataUse, true)) : null,
    })),
    releases: detail.releases.map(rel => ({
      ...rel,
      humVersionId: fixHumVersionId(rel.humVersionId),
      content: normalizeText(rel.content, lang === "en"),
      releaseNote: rel.releaseNote ? normalizeText(rel.releaseNote, true) : undefined,
    })),
  }

  // Post-processing
  normalizedDetail.publications = removeUnusedPublications(normalizedDetail.publications)
  normalizedDetail.publications = await fixDatasetIdsInPublications(normalizedDetail.publications, getDatasetsFromStudy)
  normalizedDetail.controlledAccessUsers = await fixDatasetIdsInControlledAccessUsers(normalizedDetail.controlledAccessUsers, getDatasetsFromStudy)
  normalizedDetail.releases = fixDateInReleases(normalizedDetail.releases)

  // Normalize molecular data keys
  for (const molData of normalizedDetail.molecularData) {
    molData.data = normalizeMolData(molData.data, humVersionId, lang)
  }

  // Fix dataset IDs in summary (must be called after normalizeMolData)
  normalizedDetail.summary.datasets = await fixDatasetIdsInSummaryDatasets(
    normalizedDetail.summary.datasets,
    normalizedDetail.molecularData,
    getDatasetsFromStudy,
    extractIdsByType,
  )

  return normalizedDetail
}
