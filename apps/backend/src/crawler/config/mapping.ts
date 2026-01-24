/**
 * Configuration loading functions
 *
 * Loads JSON configuration files from the data/ directory
 */
import { readFileSync } from "fs"
import { join, dirname } from "path"

import type { CriteriaCanonical, LangType } from "@/crawler/types"

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

// Skip Pages

interface SkipPage {
  humVersionId: string
  lang: LangType
  reason: string
}

interface SkipPagesConfig {
  pages: SkipPage[]
}

let skipPagesCache: SkipPagesConfig | null = null

export const getSkipPages = (): SkipPage[] => {
  if (!skipPagesCache) {
    skipPagesCache = loadConfig<SkipPagesConfig>("skip-pages.json")
  }
  return skipPagesCache.pages
}

export const shouldSkipPage = (humVersionId: string, lang: LangType): boolean => {
  return getSkipPages().some(s => s.humVersionId === humVersionId && s.lang === lang)
}

// Special Cases

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

interface SpecialCasesConfig {
  releaseUrls: Record<string, { suffix: string; reason: string }>
  controlledAccessRows: Record<string, SpecialControlledAccessRow[]>
  humIdsWithDataSummary: string[]
}

let specialCasesCache: SpecialCasesConfig | null = null

const getSpecialCases = (): SpecialCasesConfig => {
  if (!specialCasesCache) {
    specialCasesCache = loadConfig<SpecialCasesConfig>("special-cases.json")
  }
  return specialCasesCache
}

export const getReleaseSuffix = (humVersionId: string, lang: LangType): string => {
  const key = `${humVersionId}-${lang}`
  const specialCases = getSpecialCases()
  const special = specialCases.releaseUrls[key]
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
  const specialCases = getSpecialCases()
  const rows = specialCases.controlledAccessRows[humId]
  if (!rows) return undefined
  return rows.find(s => s.cellCount === cellCount && s.firstCellText === firstCellText)
}

export const getHumIdsWithDataSummary = (): string[] => {
  return getSpecialCases().humIdsWithDataSummary
}

// ID Mapping

interface IdMappingConfig {
  datasetIdSpecialCases: Record<string, string[]>
  publicationDatasetId: Record<string, string[]>
  publicationDatasetIdNoSplit: string[]
  controlledAccessUsersDatasetId: Record<string, string[]>
  jgaxToJgas: Record<string, string>
  oldJgaToJgas: Record<string, string>
  jgasToAdditionalJgad: Record<string, string[]>
  jgadTypoToJgas: Record<string, string>
  ignoreDatasetIdForHum: Record<string, string[]>
  datasetMetadataInheritance: Record<string, string>
  invalidJgasIds: string[]
  invalidIdValues: string[]
}

let idMappingCache: IdMappingConfig | null = null

const getIdMapping = (): IdMappingConfig => {
  if (!idMappingCache) {
    idMappingCache = loadConfig<IdMappingConfig>("id-mapping.json")
  }
  return idMappingCache
}

export const getDatasetIdSpecialCases = (): Record<string, string[]> => {
  return getIdMapping().datasetIdSpecialCases
}

export const applyDatasetIdSpecialCase = (id: string): string[] => {
  const specialCases = getDatasetIdSpecialCases()
  return specialCases[id] ?? [id]
}

export const getPublicationDatasetIdMap = (): Record<string, string[]> => {
  return getIdMapping().publicationDatasetId
}

export const getPublicationDatasetIdNoSplit = (): string[] => {
  return getIdMapping().publicationDatasetIdNoSplit
}

export const getControlledAccessUsersDatasetIdMap = (): Record<string, string[]> => {
  return getIdMapping().controlledAccessUsersDatasetId
}

export const getJgaxToJgasMap = (): Record<string, string> => {
  return getIdMapping().jgaxToJgas
}

export const getOldJgaToJgasMap = (): Record<string, string> => {
  return getIdMapping().oldJgaToJgas
}

export const getJgasToAdditionalJgad = (): Record<string, string[]> => {
  return getIdMapping().jgasToAdditionalJgad
}

export const getJgadTypoToJgas = (): Record<string, string> => {
  return getIdMapping().jgadTypoToJgas
}

export const getIgnoreDatasetIdForHum = (): Record<string, string[]> => {
  return getIdMapping().ignoreDatasetIdForHum
}

export const getDatasetMetadataInheritance = (): Record<string, string> => {
  return getIdMapping().datasetMetadataInheritance
}

export const getInvalidJgasIds = (): Set<string> => {
  return new Set(getIdMapping().invalidJgasIds)
}

export const getInvalidIdValues = (): string[] => {
  return getIdMapping().invalidIdValues
}

// Criteria Mapping

interface CriteriaMappingConfig {
  canonical: Record<CriteriaCanonical, { ja: string; en: string }>
  normalize: Record<string, CriteriaCanonical>
}

let criteriaMappingCache: CriteriaMappingConfig | null = null

const getCriteriaMapping = (): CriteriaMappingConfig => {
  if (!criteriaMappingCache) {
    criteriaMappingCache = loadConfig<CriteriaMappingConfig>("criteria-mapping.json")
  }
  return criteriaMappingCache
}

export const getCriteriaCanonicalMap = (): Record<string, CriteriaCanonical> => {
  return getCriteriaMapping().normalize
}

export const getCriteriaDisplayValue = (criteria: CriteriaCanonical, lang: LangType): string => {
  const mapping = getCriteriaMapping()
  return mapping.canonical[criteria][lang]
}

export const getCriteriaCanonical = (displayValue: string): CriteriaCanonical | null => {
  const mapping = getCriteriaMapping()
  // Check if it's already a canonical value
  if (displayValue in mapping.canonical) {
    return displayValue as CriteriaCanonical
  }
  // Check Japanese display values
  for (const [canonical, display] of Object.entries(mapping.canonical)) {
    if (display.ja === displayValue || display.en === displayValue) {
      return canonical as CriteriaCanonical
    }
  }
  return null
}

// Publication Config

interface PublicationConfig {
  unusedTitles: string[]
  invalidDoiValues: string[]
  invalidDatasetIdPatterns: string[]
}

let publicationConfigCache: PublicationConfig | null = null

const getPublicationConfig = (): PublicationConfig => {
  if (!publicationConfigCache) {
    publicationConfigCache = loadConfig<PublicationConfig>("publication-config.json")
  }
  return publicationConfigCache
}

export const getUnusedPublicationTitles = (): string[] => {
  return getPublicationConfig().unusedTitles
}

export const getInvalidDoiValues = (): string[] => {
  return getPublicationConfig().invalidDoiValues
}

export const isInvalidPublicationDatasetId = (id: string): boolean => {
  const stripped = id.replace(/^\(|\)$/g, "")
  if (stripped === "") return true
  const patterns = getPublicationConfig().invalidDatasetIdPatterns
  return patterns.some(pattern => new RegExp(pattern, "i").test(stripped))
}

export const cleanPublicationDatasetId = (id: string): string => {
  if (id.startsWith("(") && id.endsWith(")")) {
    return id.slice(1, -1)
  }
  return id
}

// Grant Config

interface GrantConfig {
  invalidGrantIdValues: string[]
}

let grantConfigCache: GrantConfig | null = null

const getGrantConfig = (): GrantConfig => {
  if (!grantConfigCache) {
    grantConfigCache = loadConfig<GrantConfig>("grant-config.json")
  }
  return grantConfigCache
}

export const getInvalidGrantIdValues = (): string[] => {
  return getGrantConfig().invalidGrantIdValues
}

// Molecular Data Keys

interface MolDataKeysConfig {
  unusedKey: string
  splitKeys: Record<string, string[]>
  idFields: string[]
}

let molDataKeysCache: MolDataKeysConfig | null = null

const getMolDataKeys = (): MolDataKeysConfig => {
  if (!molDataKeysCache) {
    molDataKeysCache = loadConfig<MolDataKeysConfig>("moldata-keys.json")
  }
  return molDataKeysCache
}

export const getMolDataUnusedKey = (): string => {
  return getMolDataKeys().unusedKey
}

export const getMolDataSplitKeys = (): Record<string, string[]> => {
  return getMolDataKeys().splitKeys
}

export const getMolDataIdFields = (): string[] => {
  return getMolDataKeys().idFields
}

