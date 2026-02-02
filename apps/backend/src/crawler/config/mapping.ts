/**
 * Configuration loading functions
 *
 * Loads JSON configuration files from the data/ directory
 */
import { readFileSync } from "fs"
import { join, dirname } from "path"

import type { CriteriaCanonical, DatasetOverridesConfig, LangType, PolicyCanonical } from "@/crawler/types"

// Import locally to avoid circular dependency
const DETAIL_PAGE_BASE_URL = "https://humandbs.dbcls.jp/"

const DATA_DIR = join(dirname(__dirname), "data")

/**
 * Load a JSON configuration file
 */
const loadConfig = <T>(filename: string): T => {
  const filePath = join(DATA_DIR, filename)
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as T
}

// Crawl Hotfix Mapping (skip-pages + special-cases を統合)

interface SkipPage {
  humVersionId: string
  lang: LangType
  reason: string
}

interface SpecialControlledAccessRowData {
  principalInvestigator: string | null
  affiliation: string | null
  country: string | null
  researchTitle: string | null
  datasetIds: string[]
  periodOfDataUse: string | null
}

interface SpecialControlledAccessRow {
  cellCount: number
  firstCellText: string
  data: SpecialControlledAccessRowData
}

interface CrawlHotfixMappingConfig {
  skipPages: SkipPage[]
  releaseUrlOverrides: Record<string, { suffix: string; reason: string }>
  controlledAccessRowFixes: Record<string, SpecialControlledAccessRow[]>
  dataSummaryPages: string[]
}

let crawlHotfixCache: CrawlHotfixMappingConfig | null = null

const getCrawlHotfixMapping = (): CrawlHotfixMappingConfig => {
  if (!crawlHotfixCache) {
    crawlHotfixCache = loadConfig<CrawlHotfixMappingConfig>("crawl-hotfix-mapping.json")
  }
  return crawlHotfixCache
}

export const getSkipPages = (): SkipPage[] => {
  return getCrawlHotfixMapping().skipPages
}

export const shouldSkipPage = (humVersionId: string, lang: LangType): boolean => {
  return getSkipPages().some(s => s.humVersionId === humVersionId && s.lang === lang)
}

export const getReleaseSuffix = (humVersionId: string, lang: LangType): string => {
  const key = `${humVersionId}-${lang}`
  const hotfix = getCrawlHotfixMapping()
  const special = hotfix.releaseUrlOverrides[key]
  return special?.suffix ?? "-release"
}

/**
 * Generate release page URL
 * Some humVersionIds have special suffixes
 */
export const genReleaseUrl = (humVersionId: string, lang: LangType): string => {
  const suffix = getReleaseSuffix(humVersionId, lang)
  return lang === "ja"
    ? `${DETAIL_PAGE_BASE_URL}${humVersionId}${suffix}`
    : `${DETAIL_PAGE_BASE_URL}en/${humVersionId}${suffix}`
}

export const findSpecialControlledAccessRow = (
  humVersionId: string,
  cellCount: number,
  firstCellText: string,
): SpecialControlledAccessRow | undefined => {
  const humId = humVersionId.split("-v")[0]
  const hotfix = getCrawlHotfixMapping()
  const rows = hotfix.controlledAccessRowFixes[humId]
  if (!rows) return undefined
  return rows.find(s => s.cellCount === cellCount && s.firstCellText === firstCellText)
}

export const getHumIdsWithDataSummary = (): string[] => {
  return getCrawlHotfixMapping().dataSummaryPages
}

// Dataset ID Mapping

interface DatasetIdMappingConfig {
  idCorrection: {
    global: Record<string, string[]>
    publication: Record<string, string[]>
    byHum: Record<string, Record<string, string>>
  }
  idFormatConversion: {
    jgaxToJgas: Record<string, string>
    oldJgaToJgas: Record<string, string>
  }
  invalidIds: {
    jgas: string[]
    other: string[]
  }
  noSplitIds: string[]
  ignoreIdsByHum: Record<string, string[]>
  additionalIdsByHum: Record<string, string[]>
}

let datasetIdMappingCache: DatasetIdMappingConfig | null = null

const getDatasetIdMapping = (): DatasetIdMappingConfig => {
  if (!datasetIdMappingCache) {
    datasetIdMappingCache = loadConfig<DatasetIdMappingConfig>("dataset-id-mapping.json")
  }
  return datasetIdMappingCache
}

export const getGlobalIdCorrection = (): Record<string, string[]> => {
  return getDatasetIdMapping().idCorrection.global
}

export const applyGlobalIdCorrection = (id: string): string[] => {
  const corrections = getGlobalIdCorrection()
  return corrections[id] ?? [id]
}

export const getPublicationIdCorrection = (): Record<string, string[]> => {
  return getDatasetIdMapping().idCorrection.publication
}

export const getIdCorrectionByHum = (humId: string): Record<string, string> => {
  const mapping = getDatasetIdMapping().idCorrection.byHum
  return mapping[humId] ?? {}
}

export const getNoSplitIds = (): string[] => {
  return getDatasetIdMapping().noSplitIds
}

export const getJgaxToJgasMap = (): Record<string, string> => {
  return getDatasetIdMapping().idFormatConversion.jgaxToJgas
}

export const getOldJgaToJgasMap = (): Record<string, string> => {
  return getDatasetIdMapping().idFormatConversion.oldJgaToJgas
}

export const getAdditionalIdsByHum = (humId: string): string[] => {
  return getDatasetIdMapping().additionalIdsByHum[humId] ?? []
}

export const getIgnoreIdsByHum = (): Record<string, string[]> => {
  return getDatasetIdMapping().ignoreIdsByHum
}

export const getInvalidJgasIds = (): Set<string> => {
  return new Set(getDatasetIdMapping().invalidIds.jgas)
}

export const getInvalidOtherIds = (): string[] => {
  return getDatasetIdMapping().invalidIds.other
}

// Normalize Mapping (policy + criteria + grant + publication を統合)

interface PolicyMappingSection {
  baseUrl: string
  canonical: Record<string, { ja: string; en: string; path: string }>
  normalize: Record<string, PolicyCanonical>
  urlToCanonical: Record<string, PolicyCanonical>
}

interface CriteriaMappingSection {
  canonical: Record<CriteriaCanonical, { ja: string; en: string }>
  normalize: Record<string, CriteriaCanonical>
}

interface GrantMappingSection {
  invalidValues: string[]
}

interface PublicationMappingSection {
  unusedTitles: string[]
  invalidDoiValues: string[]
  invalidDatasetIdPatterns: string[]
}

interface NormalizeMappingConfig {
  policy: PolicyMappingSection
  criteria: CriteriaMappingSection
  grant: GrantMappingSection
  publication: PublicationMappingSection
}

let normalizeMappingCache: NormalizeMappingConfig | null = null

const getNormalizeMapping = (): NormalizeMappingConfig => {
  if (!normalizeMappingCache) {
    normalizeMappingCache = loadConfig<NormalizeMappingConfig>("normalize-mapping.json")
  }
  return normalizeMappingCache
}

// Policy mapping functions

export const getPolicyBaseUrl = (): string => {
  return getNormalizeMapping().policy.baseUrl
}

export const getPolicyCanonical = (): Record<string, { ja: string; en: string; path: string }> => {
  return getNormalizeMapping().policy.canonical
}

export const getPolicyNormalizeMap = (): Record<string, PolicyCanonical> => {
  return getNormalizeMapping().policy.normalize
}

export const getPolicyUrlToCanonicalMap = (): Record<string, PolicyCanonical> => {
  return getNormalizeMapping().policy.urlToCanonical
}

// Criteria mapping functions

export const getCriteriaCanonicalMap = (): Record<string, CriteriaCanonical> => {
  return getNormalizeMapping().criteria.normalize
}

export const getCriteriaDisplayValue = (criteria: CriteriaCanonical, lang: LangType): string => {
  const mapping = getNormalizeMapping()
  return mapping.criteria.canonical[criteria][lang]
}

export const getCriteriaCanonical = (displayValue: string): CriteriaCanonical | null => {
  const mapping = getNormalizeMapping()
  // Check if it's already a canonical value
  if (displayValue in mapping.criteria.canonical) {
    return displayValue as CriteriaCanonical
  }
  // Check Japanese display values
  for (const [canonical, display] of Object.entries(mapping.criteria.canonical)) {
    if (display.ja === displayValue || display.en === displayValue) {
      return canonical as CriteriaCanonical
    }
  }
  return null
}

export const getInvalidGrantIdValues = (): string[] => {
  return getNormalizeMapping().grant.invalidValues
}

export const getUnusedPublicationTitles = (): string[] => {
  return getNormalizeMapping().publication.unusedTitles
}

export const getInvalidDoiValues = (): string[] => {
  return getNormalizeMapping().publication.invalidDoiValues
}

export const isInvalidPublicationDatasetId = (id: string): boolean => {
  const stripped = id.replace(/^\(|\)$/g, "")
  if (stripped === "") return true
  const patterns = getNormalizeMapping().publication.invalidDatasetIdPatterns
  return patterns.some(pattern => new RegExp(pattern, "i").test(stripped))
}

export const cleanPublicationDatasetId = (id: string): string => {
  if (id.startsWith("(") && id.endsWith(")")) {
    return id.slice(1, -1)
  }
  return id
}

// Molecular Data Field Mapping

interface MolDataFieldMappingConfig {
  unusedKey: string
  splitKeys: Record<string, string[]>
  idFields: string[]
}

let molDataFieldMappingCache: MolDataFieldMappingConfig | null = null

const getMolDataFieldMapping = (): MolDataFieldMappingConfig => {
  if (!molDataFieldMappingCache) {
    molDataFieldMappingCache = loadConfig<MolDataFieldMappingConfig>("moldata-field-mapping.json")
  }
  return molDataFieldMappingCache
}

export const getMolDataUnusedKey = (): string => {
  return getMolDataFieldMapping().unusedKey
}

export const getMolDataSplitKeys = (): Record<string, string[]> => {
  return getMolDataFieldMapping().splitKeys
}

export const getMolDataIdFields = (): string[] => {
  return getMolDataFieldMapping().idFields
}

// Dataset Overrides (criteria + releaseDate を統合)

let datasetOverridesCache: DatasetOverridesConfig | null = null

const getDatasetOverrides = (): DatasetOverridesConfig => {
  if (!datasetOverridesCache) {
    datasetOverridesCache = loadConfig<DatasetOverridesConfig>("dataset-overrides.json")
  }
  return datasetOverridesCache
}

/**
 * Get criteria override for a specific humId and datasetId
 * Returns null if no override exists
 */
export const getCriteriaOverrideForDataset = (
  humId: string,
  datasetId: string,
): CriteriaCanonical | null => {
  const overrides = getDatasetOverrides()
  const humOverrides = overrides[humId]
  if (!humOverrides) return null
  return humOverrides[datasetId]?.criteria ?? null
}

/**
 * Check if any criteria override exists for a humId
 * Used to suppress warnings during normalize when override is already defined
 */
export const hasCriteriaOverrideForHum = (humId: string): boolean => {
  const overrides = getDatasetOverrides()
  const humOverrides = overrides[humId]
  if (!humOverrides) return false
  return Object.values(humOverrides).some(o => o.criteria !== undefined)
}

/**
 * Get releaseDate override for a specific humId and datasetId
 * Returns null if no override exists
 */
export const getReleaseDateOverrideForDataset = (
  humId: string,
  datasetId: string,
): string | null => {
  const overrides = getDatasetOverrides()
  const humOverrides = overrides[humId]
  if (!humOverrides) return null
  return humOverrides[datasetId]?.releaseDate ?? null
}

