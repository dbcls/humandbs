import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import {
  applyDatasetIdSpecialCase,
  cleanPublicationDatasetId,
  CONTROLLED_ACCESS_USERS_DATASET_ID_MAP,
  CRITERIA_CANONICAL_MAP,
  DATASET_ID_SPECIAL_CASES,
  DEFAULT_CONCURRENCY,
  extractIdsByType,
  HUMANDBS_BASE_URL,
  ID_FIELDS,
  INVALID_DOI_VALUES,
  INVALID_GRANT_ID_VALUES,
  INVALID_ID_VALUES,
  INVALID_JGAS_IDS,
  isInvalidPublicationDatasetId,
  isValidDatasetId,
  JGAD_TYPO_TO_JGAS,
  JGAX_TO_JGAS_MAP,
  MAX_CONCURRENCY,
  MOL_DATA_SPLIT_KEYS,
  MOL_DATA_UNUSED_KEY,
  OLD_JGA_TO_JGAS_MAP,
  PUBLICATION_DATASET_ID_MAP,
  PUBLICATION_DATASET_ID_NO_SPLIT,
  UNUSED_PUBLICATION_TITLES,
} from "@/crawler/config"
import { listDetailJsonFiles, readDetailJson, writeNormalizedDetailJson, getResultsDirPath } from "@/crawler/io"
import { getDatasetsFromStudy, saveRelationCache as saveJgaCache } from "@/crawler/jga"
import { buildMolDataHeaderMapping, normalizeMolDataKey } from "@/crawler/mapping-table"
import type { LangType, CrawlArgs, ParseResult, CriteriaCanonical, NormalizedParseResult, NormalizedControlledAccessUser, TextValue, NormalizedMolecularData, Publication, Release, NormalizeOneResult } from "@/crawler/types"

// === CLI argument parsing ===
const parseArgs = (): CrawlArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string" })
    .option("lang", { choices: ["ja", "en"] as const })
    .option("concurrency", { type: "number", default: DEFAULT_CONCURRENCY })
    .parseSync()

// === Text normalization helpers ===
export const normalizeKey = (v: string): string => {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
    .replace(/[\s-]/g, "")
}

export const splitValue = (value: string): string[] => {
  return value
    .split(/[\r\n]+|[、,／/]/)
    .map(v => v.trim())
    .filter(v => v !== "")
}

export const isTextValue = (v: unknown): v is TextValue => {
  return (
    typeof v === "object" &&
    v !== null &&
    "text" in v &&
    "rawHtml" in v
  )
}

export function normalizeText(value: string, newlineToSpace: boolean): string
export function normalizeText(value: TextValue, newlineToSpace: boolean): TextValue
export function normalizeText(
  value: string | TextValue,
  newlineToSpace = true,
): string | TextValue {
  const normalizeString = (s: string): string => {
    const raw = s.trim()
    if (raw === "") return ""

    if (/^https?:\/\//i.test(raw)) {
      return raw
    }

    let t = raw
      // Unicode 正規化（記号・全角英数・半角カナなど）
      .normalize("NFC")
      // 不可視・非改行スペース
      .replace(/[\u00A0\u200B\uFEFF]/g, " ")
      // 全角スペース
      .replace(/\u3000/g, " ")
      // 全角括弧 → 半角括弧
      .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
      // 全角スラッシュ → 半角
      .replace(/／/g, "/")
      // クォート類 (U+2018, U+2019 → ', U+201C, U+201D → ")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, "\"")
      // ダッシュ類
      .replace(/[‐-‒–—―]/g, "-")
      // コロン前後
      .replace(/\s*[:：]\s*/g, ": ")

    if (newlineToSpace) {
      t = t.replace(/\r\n?|\n/g, " ")
    } else {
      t = t.replace(/\r\n?|\n/g, "")
    }

    // 括弧前後にスペースを入れる
    t = t
      .replace(/([^\s(])\(/g, "$1 (")
      .replace(/\)([^\s)])/g, ") $1")

    // 連続スペースを 1 個に
    return t.replace(/[ \t]{2,}/g, " ").trim()
  }

  if (typeof value === "string") {
    return normalizeString(value)
  }
  if (isTextValue(value)) {
    return {
      ...value,
      text: normalizeString(value.text),
    }
  }

  return value
}

export const normalizeUrl = (url: string): string => {
  const u = url.trim()
  if (!u) return u

  if (/^https?:\/\//i.test(u)) return u

  if (u.startsWith("/")) return `${HUMANDBS_BASE_URL}${u}`

  return u
}

// === Data field normalization ===
const normalizeFooterText = (
  text: string,
  lang: LangType,
): string => {
  if (lang === "ja") {
    // Remove leading ※ or * with optional number (e.g., "※1", "*1", "※ ", "* ")
    return text.replace(/^[※*]\d*\s?/, "")
  } else {
    // Remove leading * with optional number (e.g., "*1", "* ")
    return text.replace(/^\*\d*\s?/, "")
  }
}

export const normalizeCriteria = (
  value: string | null | undefined,
): CriteriaCanonical[] | null => {
  if (!value) return null

  const raw = value.trim()
  if (raw === "") return null

  const parts = splitValue(raw)

  const results: CriteriaCanonical[] = []

  for (const part of parts) {
    const key = normalizeKey(part)
    const canonical = CRITERIA_CANONICAL_MAP[key]
    if (canonical) {
      results.push(canonical)
    } else {
      console.warn(`Unknown criteria value: "${part}" (normalized: "${key}")`)
    }
  }

  return results.length > 0 ? results : null
}

export const fixDatasetId = (
  value: string,
): string[] => {
  const raw = value.trim()
  if (raw === "") return []

  const trimmed = raw
    // ( と ) を除去
    .replace(/[()]/g, "")
    // "データ追加" と "Data addition" を除去
    .replace(/データ追加/g, "")
    .replace(/データ削除/g, "")
    .replace(/に/g, "")
    .replace(/追加/g, "")
    .replace(/Data addition/gi, "")
    .replace(/Dataset addition/gi, "")
    .replace(/data added/gi, "")
    .replace(/data deleted/gi, "")
    // , と "、" をスペースに置換
    .replace(/[、,]/g, " ")
    // 連続スペースを1つに
    .replace(/\s{2,}/g, " ")
    .trim()

  // Check special cases from config
  if (trimmed in DATASET_ID_SPECIAL_CASES) {
    return DATASET_ID_SPECIAL_CASES[trimmed]
  }

  // スペースを区切り文字として分割
  return trimmed.split(" ")
}

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

export const fixDate = (value: string): string => {
  const raw = value.trim()
  const m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return raw

  const [, y, mo, d] = m
  const mm = mo.padStart(2, "0")
  const dd = d.padStart(2, "0")
  return `${y}-${mm}-${dd}`
}

const fixDateInReleases = (
  releases: Release[],
): Release[] => {
  return releases.map(rel => ({
    ...rel,
    releaseDate: fixDate(rel.releaseDate),
  }))
}

export const fixHumVersionId = (humVersionId: string): string => {
  // Normalize humVersionId format: "hum0014-v1-freq-v1" → "hum0014-v1"
  // Extract only the base humId and version (e.g., "hum0014-v1")
  const match = humVersionId.match(/^(hum\d+)-(v\d+)/)
  if (match) {
    return `${match[1]}-${match[2]}`
  }
  return humVersionId
}

export const normalizeDoiValue = (doi: string | null): string | null => {
  if (!doi) return null

  if (INVALID_DOI_VALUES.includes(doi)) {
    return null
  }

  return doi
}

export const fixGrantId = (values: string[]): string[] | null => {
  if (values.length === 0) return null

  const results: string[] = []
  for (const value of values) {
    if (INVALID_GRANT_ID_VALUES.includes(value)) continue

    const fixedValue = value
      // 全角英数字を半角に
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
        String.fromCharCode(c.charCodeAt(0) - 0xFEE0),
      )
      // 全角ハイフン・ダッシュ類を半角 - (長音記号 ー U+30FC は除外)
      .replace(/[－―–—]/g, "-")
      // 全角スペース → 半角
      .replace(/\u3000/g, " ")
      // スペース整理
      .replace(/\s{2,}/g, " ")
      .trim()

    if (!fixedValue) continue
    results.push(fixedValue)
  }

  return results.length > 0 ? results : null
}

export const parsePeriodOfDataUse = (
  value: string,
): { startDate: string | null; endDate: string | null } | null => {
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

  // Try YYYY/M/D-YYYY/M/D format (common in source data, month/day can be 1 or 2 digits)
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
// === JGAD Range Expansion ===

/**
 * Expand JGAD range notation to individual IDs
 * e.g., "JGAD000106-JGAD000108" → ["JGAD000106", "JGAD000107", "JGAD000108"]
 * Non-range IDs are returned as-is in an array
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

// Array/object transformation helpers
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

const normalizeMolData = (
  data: NormalizedMolecularData["data"],
  humVersionId: string,
  lang: LangType,
): NormalizedMolecularData["data"] => {
  const mappingTable = buildMolDataHeaderMapping()
  const normalizedData: NormalizedMolecularData["data"] = {}

  for (const [key, val] of Object.entries(data)) {
    const trimmedKey = key
      // 改行をスペースに
      .replace(/\r\n?|\n/g, " ")
      // 前後の * や ※ を除去（連続もOK）
      .replace(/^[\s*※]+|[\s*※]+$/g, "")
      // 連続スペースを1つに
      .replace(/\s{2,}/g, " ")
      .trim()
    const normKey = normalizeMolDataKey(trimmedKey, lang, mappingTable)

    if (normKey === MOL_DATA_UNUSED_KEY) {
      continue
    }

    if (!normKey) {
      console.warn(`Molecular data header "${trimmedKey}" not found in mapping table, in ${humVersionId}`)
      normalizedData[trimmedKey] = val
      continue
    }

    if (normKey in MOL_DATA_SPLIT_KEYS) {
      const splitKeys = MOL_DATA_SPLIT_KEYS[normKey]

      for (const sk of splitKeys) {
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

export const removeUnusedPublications = (
  publications: Publication[],
): Publication[] => {
  return publications.filter(pub => {
    if (!pub.title) return true

    const t = pub.title.trim()
    return !UNUSED_PUBLICATION_TITLES.includes(t)
  })
}

/**
 * Split datasetId by whitespace, but preserve special cases that shouldn't be split
 */
const splitDatasetId = (id: string): string[] => {
  const normalized = normalizeText(id, true)
  // Check if this matches any no-split pattern
  for (const noSplit of PUBLICATION_DATASET_ID_NO_SPLIT) {
    if (normalized === noSplit) {
      return [normalized]
    }
  }
  return normalized.split(/\s+/).filter(s => s !== "")
}

/**
 * Convert JGAX or old JGA format to JGAS using config mappings
 */
const convertToJgas = (id: string): string => {
  // Check JGAX mapping first
  if (id in JGAX_TO_JGAS_MAP) {
    return JGAX_TO_JGAS_MAP[id]
  }
  // Check old JGA format mapping
  if (id in OLD_JGA_TO_JGAS_MAP) {
    return OLD_JGA_TO_JGAS_MAP[id]
  }
  return id
}

/**
 * Expand JGAS ID to JGAD IDs using JGA API
 * Returns empty array if no JGAD found (JGAS should not remain as datasetId)
 */
const expandJgasToJgad = async (id: string): Promise<string[]> => {
  if (!/^JGAS\d{6}$/.test(id)) {
    // Filter out invalid IDs (also applies to non-JGAS IDs like JGAD)
    if (INVALID_ID_VALUES.includes(id)) {
      return []
    }
    return [id]
  }
  // Skip invalid JGAS IDs that don't exist
  if (INVALID_JGAS_IDS.has(id)) {
    return []
  }
  const jgadIds = await getDatasetsFromStudy(id)
  if (jgadIds.length === 0) {
    console.warn(`[normalize] JGAS ${id} has no corresponding JGAD (unexpected - this should not happen)`)
  }
  // Filter out invalid JGAD IDs
  return jgadIds.filter(jgadId => !INVALID_ID_VALUES.includes(jgadId))
}

/**
 * Process a single dataset ID: apply special cases, mapping, convert JGAX→JGAS, expand range, expand JGAS→JGAD
 */
const processDatasetId = async (
  id: string,
  idMap: Record<string, string[]>,
): Promise<string[]> => {
  // First, apply ID mapping
  if (id in idMap) {
    return idMap[id]
  }

  // Fix typos: JGAD written by mistake instead of JGAS
  const typoFixedId = JGAD_TYPO_TO_JGAS[id] ?? id

  // Apply special case transformations (e.g., ja/en bilingual ID normalization)
  const specialCaseIds = applyDatasetIdSpecialCase(typoFixedId)

  const results: string[] = []
  for (const specialCaseId of specialCaseIds) {
    // Convert JGAX or old JGA format to JGAS
    const convertedId = convertToJgas(specialCaseId)

    // Expand JGAD range
    const expandedIds = expandJgadRange(convertedId)

    // Expand JGAS to JGAD for each expanded ID
    for (const expandedId of expandedIds) {
      const jgadIds = await expandJgasToJgad(expandedId)
      results.push(...jgadIds)
    }
  }

  return results
}

const fixDatasetIdsInPublications = async (
  publications: Publication[],
): Promise<Publication[]> => {
  return Promise.all(publications.map(async pub => {
    const mappedIds: string[] = []

    for (const id of pub.datasetIds) {
      const processedIds = await processDatasetId(id, PUBLICATION_DATASET_ID_MAP)
      mappedIds.push(...processedIds)
    }

    return {
      ...pub,
      datasetIds: mappedIds,
    }
  }))
}

const fixDatasetIdsInControlledAccessUsers = async (
  cas: NormalizedControlledAccessUser[],
): Promise<NormalizedControlledAccessUser[]> => {
  return Promise.all(cas.map(async ca => {
    const mappedIds: string[] = []

    for (const id of ca.datasetIds) {
      const processedIds = await processDatasetId(id, CONTROLLED_ACCESS_USERS_DATASET_ID_MAP)
      mappedIds.push(...processedIds)
    }

    return {
      ...ca,
      datasetIds: mappedIds,
    }
  }))
}

/**
 * Extract all dataset IDs from molecularData's ID fields (text and rawHtml)
 */
const extractDatasetIdsFromMolData = (molData: NormalizedMolecularData): string[] => {
  const ids = new Set<string>()

  for (const key of ID_FIELDS) {
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
 * Match if the summary datasetId is contained in the molData header text
 */
const findMatchingMolData = (
  summaryDatasetId: string,
  molecularData: NormalizedMolecularData[],
): NormalizedMolecularData | undefined => {
  // Normalize for matching (remove spaces, convert to lowercase for comparison)
  const normalizedSummaryId = summaryDatasetId.toLowerCase().replace(/\s+/g, "")

  return molecularData.find(md => {
    const headerText = md.id?.text ?? ""
    const normalizedHeader = headerText.toLowerCase().replace(/\s+/g, "")
    // Check if the summary datasetId is contained in the header
    return normalizedHeader.includes(normalizedSummaryId)
  })
}

const fixDatasetIdsInSummaryDatasets = async (
  datasets: NormalizedParseResult["summary"]["datasets"],
  molecularData: NormalizedMolecularData[],
): Promise<NormalizedParseResult["summary"]["datasets"]> => {
  return Promise.all(datasets.map(async ds => {
    if (!ds.datasetId || ds.datasetId.length === 0) {
      return ds
    }

    const mappedIds: string[] = []
    for (const id of ds.datasetId) {
      // If the ID is already a valid dataset ID pattern, process it normally
      if (isValidDatasetId(id)) {
        const processedIds = await processDatasetId(id, {})
        mappedIds.push(...processedIds)
        continue
      }

      // Otherwise, try to expand from matching molecularData
      const matchingMolData = findMatchingMolData(id, molecularData)
      if (matchingMolData) {
        const extractedIds = extractDatasetIdsFromMolData(matchingMolData)
        if (extractedIds.length > 0) {
          // Process each extracted ID (apply special cases, expand JGAS, etc.)
          for (const extractedId of extractedIds) {
            const processedIds = await processDatasetId(extractedId, {})
            mappedIds.push(...processedIds)
          }
          continue
        }
      }

      // Fallback: keep the original ID (will be filtered out later if invalid)
      mappedIds.push(id)
    }

    return {
      ...ds,
      datasetId: mappedIds,
    }
  }))
}

// === Single normalization function ===
export const normalizeOneDetail = async (
  humVersionId: string,
  lang: LangType,
): Promise<NormalizeOneResult> => {
  try {
    const detail = readDetailJson(humVersionId, lang) as ParseResult | null
    if (!detail) {
      return { success: false, humVersionId, lang, error: "JSON not found" }
    }

    const normalizedDetail: NormalizedParseResult = {
      ...detail,
      summary: {
        ...detail.summary,
        aims: normalizeText(detail.summary.aims, lang === "en"),
        methods: normalizeText(detail.summary.methods, lang === "en"),
        targets: normalizeText(detail.summary.targets, lang === "en"),
        url: detail.summary.url.map(u => ({
          ...u,
          url: normalizeUrl(u.url),
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
          url: normalizeUrl(u.url),
        })),
        grants: detail.dataProvider.grants.map(grant => ({
          grantName: grant.grantName ? normalizeText(grant.grantName, true) : null,
          projectTitle: grant.projectTitle ? normalizeText(grant.projectTitle, true) : null,
          grantId: fixGrantId(grant.grantId.map(id => normalizeText(id, true))),
        })),
      },
      publications: detail.publications.map(pub => ({
        ...pub,
        title: pub.title ? normalizeText(pub.title, true) : null,
        doi: pub.doi ? normalizeDoiValue(normalizeText(pub.doi, true)) : null,
        datasetIds: pub.datasetIds
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
        datasetIds: cau.datasetIds.map(id => normalizeText(id, true)),
        periodOfDataUse: cau.periodOfDataUse ? parsePeriodOfDataUse(normalizeText(cau.periodOfDataUse, true)) : null,
      })),
      releases: detail.releases.map(rel => ({
        ...rel,
        humVersionId: fixHumVersionId(rel.humVersionId),
        content: normalizeText(rel.content, lang === "en"),
        releaseNote: rel.releaseNote ? normalizeText(rel.releaseNote, true) : undefined,
      })),
    }

    normalizedDetail.publications = removeUnusedPublications(normalizedDetail.publications)
    normalizedDetail.publications = await fixDatasetIdsInPublications(normalizedDetail.publications)
    normalizedDetail.controlledAccessUsers = await fixDatasetIdsInControlledAccessUsers(normalizedDetail.controlledAccessUsers)
    normalizedDetail.releases = fixDateInReleases(normalizedDetail.releases)
    for (const molData of normalizedDetail.molecularData) {
      molData.data = normalizeMolData(molData.data, humVersionId, lang)
    }
    // Must be called after normalizeMolData to ensure data keys are normalized to English
    normalizedDetail.summary.datasets = await fixDatasetIdsInSummaryDatasets(
      normalizedDetail.summary.datasets,
      normalizedDetail.molecularData,
    )

    writeNormalizedDetailJson(humVersionId, lang, normalizedDetail)
    return { success: true, humVersionId, lang }
  } catch (e) {
    return {
      success: false,
      humVersionId,
      lang,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// === Main function ===
const main = async (): Promise<void> => {
  const args = parseArgs()
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]

  const targets = listDetailJsonFiles({
    humId: args.humId,
    langs,
  })

  if (targets.length === 0) {
    console.log("No JSON files found. Run 'bun run crawler:crawl' first.")
    return
  }

  console.log(`Normalizing ${targets.length} file(s), langs: ${langs.join(", ")}`)
  const conc = Math.max(1, Math.min(MAX_CONCURRENCY, args.concurrency ?? DEFAULT_CONCURRENCY))

  let totalNormalized = 0
  let totalErrors = 0
  let processed = 0

  for (let i = 0; i < targets.length; i += conc) {
    const batch = targets.slice(i, i + conc)
    const results = await Promise.all(
      batch.map(({ humVersionId, lang }) =>
        normalizeOneDetail(humVersionId, lang),
      ),
    )
    for (const result of results) {
      if (result.success) {
        totalNormalized++
      } else {
        totalErrors++
        console.error(`Error: ${result.humVersionId} (${result.lang}): ${result.error}`)
      }
    }
    processed += batch.length
    const percent = Math.round((processed / targets.length) * 100)
    console.log(`Progress: ${processed}/${targets.length} (${percent}%)`)
  }

  // Save JGA relation cache to file
  saveJgaCache()

  const outputDir = join(getResultsDirPath(), "detail-json-normalized")
  console.log(`Done: ${totalNormalized} normalized, ${totalErrors} errors. Output: ${outputDir}`)
}

if (import.meta.main) {
  await main()
}
