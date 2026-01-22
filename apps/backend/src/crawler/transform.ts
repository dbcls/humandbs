import { existsSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import {
  DATASET_METADATA_INHERITANCE,
  extractIdsByType,
  getCriteriaCanonical,
  getCriteriaDisplayValue,
  ID_FIELDS,
  IGNORE_DATASET_ID_FOR_HUM,
  INVALID_ID_VALUES,
  INVALID_JGAS_IDS,
  JGAS_TO_ADDITIONAL_JGAD,
  applyDatasetIdSpecialCase,
  isValidDatasetId,
  shouldSkipPage,
} from "@/crawler/config"
import { parseAllHumIds } from "@/crawler/home"
import {
  getResultsDirPath,
  readNormalizedDetailJson,
  findLatestVersionNum,
  headLatestVersionNum,
  DETAIL_PAGE_BASE_URL,
} from "@/crawler/io"
import { getDatasetsFromStudy, saveRelationCache as saveJgaCache } from "@/crawler/jga"
import {
  matchControlledAccessUsers,
  matchExperiments,
  matchGrants,
  matchPublications,
  matchResearchProjects,
} from "@/crawler/merge-bilingual"
import type {
  LangType,
  CrawlArgs,
  NormalizedParseResult,
  NormalizedMolecularData,
  NormalizedDataset,
  DatasetIdType,
  ExtractedIds,
  TextValue,
  TransformedExperiment,
  TransformedDataset,
  TransformedResearchVersion,
  TransformedResearch,
  TransformedPerson,
  TransformedResearchProject,
  TransformedGrant,
  TransformedPublication,
  CriteriaCanonical,
  TransformOneResult,
  BilingualText,
  BilingualTextValue,
  UnifiedDataset,
  UnifiedExperiment,
  UnifiedResearch,
  UnifiedResearchVersion,
  UnifiedSummary,
  UnifiedPerson,
  UnifiedResearchProject,
  UnifiedGrant,
  UnifiedPublication,
  ExperimentMatchType,
} from "@/crawler/types"

// === Bilingual Transform Types (internal to transform.ts) ===

/** Bilingual dataset pair for synchronized versioning */
interface BilingualDatasetPair {
  datasetId: string
  version: string
  versionReleaseDate: string
  ja: TransformedDataset | null
  en: TransformedDataset | null
}

/** Result of bilingual transform */
interface TransformBilingualResult {
  success: boolean
  humId: string
  error?: string
  data?: {
    research: { ja: TransformedResearch | null; en: TransformedResearch | null }
    versions: { ja: TransformedResearchVersion[]; en: TransformedResearchVersion[] }
    datasets: BilingualDatasetPair[]
  }
}

// === Validation Warnings ===

interface DatasetValidationWarning {
  datasetId: string
  humVersionId: string
  field: "typeOfData" | "criteria" | "releaseDate"
  lang?: LangType
}

// Global array to collect validation warnings during transform
const validationWarnings: DatasetValidationWarning[] = []

const recordWarning = (
  datasetId: string,
  humVersionId: string,
  field: DatasetValidationWarning["field"],
  lang?: LangType,
): void => {
  validationWarnings.push({ datasetId, humVersionId, field, lang })
}

const clearWarnings = (): void => {
  validationWarnings.length = 0
}

const printWarnings = (): void => {
  if (validationWarnings.length === 0) return

  console.warn(`\n=== Dataset Validation Warnings (${validationWarnings.length} issues) ===`)

  // Group by field
  const byField = new Map<string, DatasetValidationWarning[]>()
  for (const w of validationWarnings) {
    const key = w.field
    const list = byField.get(key) ?? []
    list.push(w)
    byField.set(key, list)
  }

  for (const [field, warnings] of byField) {
    console.warn(`\n${field} is null (${warnings.length}):`)
    for (const w of warnings.slice(0, 10)) {
      console.warn(`  ${w.datasetId} (${w.humVersionId}${w.lang ? `, ${w.lang}` : ""})`)
    }
    if (warnings.length > 10) {
      console.warn(`  ... and ${warnings.length - 10} more`)
    }
  }
  console.warn("")
}

// === Criteria Display ===

const convertCriteriaToDisplay = (
  criteria: CriteriaCanonical[] | null,
  lang: LangType,
): string[] => {
  if (!criteria) return []
  return criteria.map(c => getCriteriaDisplayValue(c, lang))
}

// === ID Extraction ===

export const extractDatasetIdsFromMolData = (molData: NormalizedMolecularData): ExtractedIds => {
  const idSets: ExtractedIds = {}

  const addIds = (text: string) => {
    const found = extractIdsByType(text)
    for (const [type, ids] of Object.entries(found) as [DatasetIdType, string[]][]) {
      if (!idSets[type]) {
        idSets[type] = new Set()
      }
      for (const id of ids) {
        // Skip invalid IDs
        if (INVALID_ID_VALUES.includes(id)) continue
        // Apply special case transformations (e.g., ja/en bilingual ID normalization)
        const normalizedIds = applyDatasetIdSpecialCase(id)
        for (const normalizedId of normalizedIds) {
          idSets[type]!.add(normalizedId)
        }
      }
    }
  }

  // Extract from header
  if (molData.id?.text) {
    // Apply special case transformations for header text (e.g., AP023461-AP024084 -> PRJDB10452)
    const specialCaseIds = applyDatasetIdSpecialCase(molData.id.text)
    for (const id of specialCaseIds) {
      addIds(id)
    }
    // Also extract IDs from the original header text
    addIds(molData.id.text)
  }

  // Extract from data fields
  for (const key of ID_FIELDS) {
    const val = molData.data[key]
    if (!val) continue

    const values = Array.isArray(val) ? val : [val]
    for (const v of values) {
      addIds(v.text)
      addIds(v.rawHtml)
    }
  }

  return idSets
}

// === Invert molTable -> Dataset ===

export const invertMolTableToDataset = async (
  molecularData: NormalizedMolecularData[],
): Promise<Map<string, NormalizedMolecularData[]>> => {
  const result = new Map<string, NormalizedMolecularData[]>()

  // First pass: collect all JGAS IDs
  const allJgasIds = new Set<string>()
  for (const molData of molecularData) {
    const extractedIds = extractDatasetIdsFromMolData(molData)
    const jgasIds = extractedIds.JGAS
    if (jgasIds) {
      for (const jgasId of jgasIds) {
        allJgasIds.add(jgasId)
      }
    }
  }

  // Fetch JGAS -> JGAD mapping
  const jgasToJgadMap = new Map<string, string[]>()
  for (const jgasId of allJgasIds) {
    const jgadIds = await getDatasetsFromStudy(jgasId)
    jgasToJgadMap.set(jgasId, jgadIds)
  }

  // Second pass: invert
  for (const molData of molecularData) {
    const extractedIds = extractDatasetIdsFromMolData(molData)
    const allDatasetIds = new Set<string>()

    // Add direct IDs (JGAD, DRA, GEA, NBDC, BP, METABO)
    for (const type of ["JGAD", "DRA", "GEA", "NBDC_DATASET", "BP", "METABO"] as const) {
      const ids = extractedIds[type]
      if (ids) {
        for (const id of ids) {
          allDatasetIds.add(id)
        }
      }
    }

    // Convert JGAS to JGAD (skip if no JGAD found - JGAS should not be used as datasetId)
    const jgasIds = extractedIds.JGAS
    if (jgasIds) {
      for (const jgasId of jgasIds) {
        // Skip invalid JGAS IDs that don't exist
        if (INVALID_JGAS_IDS.has(jgasId)) {
          continue
        }
        const jgadIds = jgasToJgadMap.get(jgasId) ?? []
        for (const jgadId of jgadIds) {
          // Skip invalid JGAD IDs
          if (INVALID_ID_VALUES.includes(jgadId)) continue
          allDatasetIds.add(jgadId)
        }
        // Add additional JGAD IDs from config (for IDs not returned by JGA API)
        const additionalJgadIds = JGAS_TO_ADDITIONAL_JGAD[jgasId]
        if (additionalJgadIds) {
          for (const jgadId of additionalJgadIds) {
            allDatasetIds.add(jgadId)
          }
        }
        if (jgadIds.length === 0) {
          console.warn(`[transform] JGAS ${jgasId} has no corresponding JGAD (unexpected - this should not happen)`)
        }
      }
    }

    // Associate molData with each datasetId
    for (const datasetId of allDatasetIds) {
      const existing = result.get(datasetId) ?? []
      existing.push(molData)
      result.set(datasetId, existing)
    }
  }

  return result
}

// === Dataset Metadata ===

interface DatasetMetadata {
  typeOfData: string | null
  criteria: CriteriaCanonical[] | null
  releaseDate: string[] | null
}

/**
 * Build dataset metadata map with inheritance from parent molData.
 * If a datasetId extracted from molData is not in summary.datasets,
 * it inherits metadata from the molData's parent datasetId (id.text).
 */
export const buildDatasetMetadataMap = (
  datasets: NormalizedDataset[],
  molecularData?: NormalizedMolecularData[],
): Map<string, DatasetMetadata> => {
  const map = new Map<string, DatasetMetadata>()

  // First pass: add all datasetIds from summary.datasets
  for (const ds of datasets) {
    const ids = ds.datasetId ?? []
    for (const id of ids) {
      map.set(id, {
        typeOfData: ds.typeOfData ?? null,
        criteria: ds.criteria,
        releaseDate: ds.releaseDate,
      })
    }
  }

  // Apply explicit metadata inheritance from config
  for (const [childId, parentId] of Object.entries(DATASET_METADATA_INHERITANCE)) {
    if (!map.has(childId) && map.has(parentId)) {
      map.set(childId, map.get(parentId)!)
    }
  }

  // Second pass: inherit metadata for child datasetIds in molecularData
  if (molecularData) {
    for (const molData of molecularData) {
      const parentId = molData.id?.text
      if (!parentId) continue

      // Get parent metadata (exact match or prefix match)
      let parentMetadata = map.get(parentId)
      if (!parentMetadata) {
        // Try prefix match for parent (e.g., "hum0197.v12" for "hum0197.v12.MAG.v1")
        const prefixMatch = findPrefixMatch(parentId, map)
        if (prefixMatch) {
          map.set(parentId, prefixMatch)
          parentMetadata = prefixMatch
        }
      }

      // Skip if no parent metadata found
      if (!parentMetadata) continue

      // Extract child datasetIds from molData and inherit parent metadata
      const extractedIds = extractDatasetIdsFromMolData(molData)
      for (const type of ["JGAD", "DRA", "GEA", "NBDC_DATASET", "BP", "METABO"] as const) {
        const ids = extractedIds[type]
        if (ids) {
          for (const childId of ids) {
            // If child doesn't have metadata, inherit from parent
            if (!map.has(childId) && childId !== parentId) {
              map.set(childId, parentMetadata)
            }
          }
        }
      }
    }
  }

  return map
}

/**
 * Find metadata by prefix match (e.g., "hum0197.v12" for "hum0197.v12.MAG.v1")
 */
const findPrefixMatch = (
  datasetId: string,
  metadataMap: Map<string, DatasetMetadata>,
): DatasetMetadata | null => {
  // Extract prefix (e.g., "hum0197.v12" from "hum0197.v12.MAG.v1")
  const parts = datasetId.split(".")
  if (parts.length < 3) return null

  // Try progressively shorter prefixes
  for (let i = parts.length - 1; i >= 2; i--) {
    const prefix = parts.slice(0, i).join(".")
    const metadata = metadataMap.get(prefix)
    if (metadata) {
      return metadata
    }
  }

  return null
}

// === Dataset Versioning ===

export const isExperimentsEqual = (
  a: TransformedExperiment[],
  b: TransformedExperiment[],
): boolean => {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const assignDatasetVersion = (
  datasetId: string,
  lang: LangType,
  experiments: TransformedExperiment[],
  existingVersions: Map<string, TransformedDataset[]>,
): string => {
  const key = `${datasetId}-${lang}`
  const existing = existingVersions.get(key) ?? []

  // Check if same experiments exist
  for (const prev of existing) {
    if (isExperimentsEqual(prev.experiments, experiments)) {
      return prev.version
    }
  }

  // Assign new version
  return `v${existing.length + 1}`
}

// === Bilingual Dataset Versioning ===

/** Track bilingual dataset versions - key is datasetId, value is list of version info */
interface BilingualVersionInfo {
  version: string
  jaExperiments: TransformedExperiment[]
  enExperiments: TransformedExperiment[]
}

/**
 * Assign dataset version with ja/en synchronization.
 * Both ja and en datasets get the same version if either has changes.
 */
export const assignBilingualDatasetVersion = (
  datasetId: string,
  jaExperiments: TransformedExperiment[],
  enExperiments: TransformedExperiment[],
  existingVersions: Map<string, BilingualVersionInfo[]>,
): string => {
  const existing = existingVersions.get(datasetId) ?? []

  // Check if same experiments exist for both languages
  for (const prev of existing) {
    const jaMatch = isExperimentsEqual(prev.jaExperiments, jaExperiments)
    const enMatch = isExperimentsEqual(prev.enExperiments, enExperiments)

    if (jaMatch && enMatch) {
      return prev.version
    }
  }

  // Assign new version (both ja and en get the same version)
  return `v${existing.length + 1}`
}

/**
 * Track bilingual version for later comparison.
 */
export const trackBilingualVersion = (
  datasetId: string,
  version: string,
  jaExperiments: TransformedExperiment[],
  enExperiments: TransformedExperiment[],
  existingVersions: Map<string, BilingualVersionInfo[]>,
): void => {
  const existing = existingVersions.get(datasetId) ?? []

  // Only add if this version doesn't exist yet
  if (!existing.some(v => v.version === version)) {
    existing.push({ version, jaExperiments, enExperiments })
    existingVersions.set(datasetId, existing)
  }
}

// === Transform Functions ===

export const transformDataProvider = (
  dp: NormalizedParseResult["dataProvider"],
): TransformedPerson[] => {
  const persons: TransformedPerson[] = []

  const piCount = dp.principalInvestigator.length
  const affCount = dp.affiliation.length

  for (let i = 0; i < piCount; i++) {
    const pi = dp.principalInvestigator[i]
    const aff = i < affCount ? dp.affiliation[i] : null

    persons.push({
      name: pi,
      organization: aff
        ? {
          name: aff,
        }
        : null,
    })
  }

  return persons
}

export const transformControlledAccessUsers = (
  users: NormalizedParseResult["controlledAccessUsers"],
  expansionMap: Map<string, Set<string>>,
): TransformedPerson[] => {
  return users.map(u => ({
    name: { text: u.principalInvestigator ?? "", rawHtml: u.principalInvestigator ?? "" },
    organization: u.affiliation
      ? {
        name: { text: u.affiliation, rawHtml: u.affiliation },
        address: u.country ? { country: u.country } : null,
      }
      : null,
    datasetIds: u.datasetIds.length > 0
      ? expandDatasetIds(u.datasetIds, expansionMap)
      : undefined,
    researchTitle: u.researchTitle,
    periodOfDataUse: u.periodOfDataUse,
  }))
}

export const transformGrants = (
  grants: NormalizedParseResult["dataProvider"]["grants"],
): TransformedGrant[] => {
  return grants
    .filter(g => g.grantName || g.projectTitle || g.grantId)
    .map(g => ({
      id: g.grantId ?? [],
      title: g.projectTitle ?? "",
      agency: { name: g.grantName ?? "" },
    }))
}

/**
 * Build a mapping from original datasetId to expanded datasetIds
 * When a molTable contains multiple datasetIds, any reference to one should expand to all
 */
export const buildDatasetIdExpansionMap = (
  molecularData: NormalizedMolecularData[],
  invertedMap: Map<string, NormalizedMolecularData[]>,
): Map<string, Set<string>> => {
  const expansionMap = new Map<string, Set<string>>()

  // For each molTable, collect all datasetIds it maps to
  for (const molData of molecularData) {
    const extractedIds = extractDatasetIdsFromMolData(molData)
    const allIdsInMolTable = new Set<string>()

    // Collect all IDs from this molTable
    for (const type of ["JGAD", "JGAS", "DRA", "GEA", "NBDC_DATASET", "BP", "METABO"] as const) {
      const ids = extractedIds[type]
      if (ids) {
        for (const id of ids) {
          allIdsInMolTable.add(id)
        }
      }
    }

    // Also check which datasetIds this molTable contributes to (from invertedMap)
    const contributesToDatasets = new Set<string>()
    for (const [datasetId, molDataList] of invertedMap.entries()) {
      if (molDataList.includes(molData)) {
        contributesToDatasets.add(datasetId)
      }
    }

    // For each ID in this molTable, it should expand to all datasetIds the molTable contributes to
    for (const id of allIdsInMolTable) {
      const existing = expansionMap.get(id) ?? new Set()
      for (const datasetId of contributesToDatasets) {
        existing.add(datasetId)
      }
      expansionMap.set(id, existing)
    }
  }

  return expansionMap
}

/**
 * Expand datasetIds using the expansion map
 */
export const expandDatasetIds = (
  datasetIds: string[],
  expansionMap: Map<string, Set<string>>,
): string[] => {
  const expanded = new Set<string>()

  for (const id of datasetIds) {
    const expandedIds = expansionMap.get(id)
    if (expandedIds && expandedIds.size > 0) {
      for (const expandedId of expandedIds) {
        expanded.add(expandedId)
      }
    } else {
      // Keep original if no expansion found
      expanded.add(id)
    }
  }

  return [...expanded].sort()
}

export const transformPublications = (
  pubs: NormalizedParseResult["publications"],
  expansionMap: Map<string, Set<string>>,
): TransformedPublication[] => {
  return pubs
    .filter(p => p.title)
    .map(p => {
      const expandedIds = p.datasetIds.length > 0
        ? expandDatasetIds(p.datasetIds, expansionMap)
        : undefined
      return {
        title: p.title!,
        doi: p.doi,
        datasetIds: expandedIds,
      }
    })
}

export const transformResearchProjects = (
  dp: NormalizedParseResult["dataProvider"],
): TransformedResearchProject[] => {
  const projects: TransformedResearchProject[] = []

  const nameCount = dp.projectName.length
  const urlCount = dp.projectUrl.length

  for (let i = 0; i < nameCount; i++) {
    const name = dp.projectName[i]
    const url = i < urlCount ? dp.projectUrl[i] : null

    projects.push({
      name,
      url: url ?? null,
    })
  }

  return projects
}

// === I/O Functions ===

const getStructuredJsonDir = (type: "research" | "research-version" | "dataset"): string => {
  const base = join(getResultsDirPath(), "structured-json", type)
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
  }
  return base
}

const writeStructuredJson = (
  type: "research" | "research-version" | "dataset",
  filename: string,
  data: unknown,
): void => {
  const dir = getStructuredJsonDir(type)
  const filePath = join(dir, filename)
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// === Main Transform Logic ===

export const transformOneResearch = async (
  humId: string,
  lang: LangType,
  opts: { noCache?: boolean },
): Promise<TransformOneResult> => {
  const useCache = !opts.noCache

  // Find all versions
  let latestVersion: number
  try {
    latestVersion = await findLatestVersionNum(humId, useCache)
  } catch {
    latestVersion = await headLatestVersionNum(humId).catch(() => 0)
  }

  if (latestVersion === 0) {
    return {
      success: false,
      humId,
      lang,
      error: `No versions found for ${humId}`,
    }
  }

  const versions: TransformedResearchVersion[] = []
  const allDatasets: TransformedDataset[] = []
  const datasetVersionsMap = new Map<string, TransformedDataset[]>()
  let skippedCount = 0

  // Process each version
  for (let v = 1; v <= latestVersion; v++) {
    const humVersionId = `${humId}-v${v}`

    // Skip pages that are known to not exist
    if (shouldSkipPage(humVersionId, lang)) {
      skippedCount++
      continue
    }

    const detail = readNormalizedDetailJson(humVersionId, lang) as NormalizedParseResult | null
    if (!detail) {
      // This is expected for skipped pages, so only log as debug info
      continue
    }

    // Invert molTable -> Dataset
    const invertedMap = await invertMolTableToDataset(detail.molecularData)

    // Build dataset metadata map (with inheritance from parent molData)
    const metadataMap = buildDatasetMetadataMap(detail.summary.datasets, detail.molecularData)

    // Find release info (used for both datasets and research-version)
    const releaseInfo = detail.releases.find(r => r.humVersionId === humVersionId)
    const versionReleaseDate = releaseInfo?.releaseDate ?? ""

    // Create datasets
    const versionDatasetIds: string[] = []

    for (const [datasetId, molDataList] of invertedMap.entries()) {
      const experiments: TransformedExperiment[] = molDataList.map(md => ({
        header: md.id,
        data: md.data,
        footers: md.footers,
      }))

      const version = assignDatasetVersion(
        datasetId,
        lang,
        experiments,
        datasetVersionsMap,
      )

      const metadata = metadataMap.get(datasetId)

      // Record warnings for null values
      if (!metadata?.typeOfData) recordWarning(datasetId, humVersionId, "typeOfData", lang)
      if (!metadata?.criteria) recordWarning(datasetId, humVersionId, "criteria", lang)
      if (!metadata?.releaseDate) recordWarning(datasetId, humVersionId, "releaseDate", lang)

      const dataset: TransformedDataset = {
        datasetId,
        lang,
        version,
        versionReleaseDate,
        humId,
        humVersionId,
        typeOfData: metadata?.typeOfData ?? "",
        criteria: convertCriteriaToDisplay(metadata?.criteria ?? null, lang),
        releaseDate: metadata?.releaseDate ?? [],
        experiments,
      }

      // Track version
      const key = `${datasetId}-${lang}`
      const existing = datasetVersionsMap.get(key) ?? []
      // Only add if this is a new version
      if (!existing.some(d => d.version === version)) {
        existing.push(dataset)
        datasetVersionsMap.set(key, existing)
        allDatasets.push(dataset)
      }

      versionDatasetIds.push(`${datasetId}-${version}-${lang}`)
    }

    // Create datasets from summary.datasets for datasetIds without molecularData
    for (const summaryDataset of detail.summary.datasets) {
      const datasetIds = summaryDataset.datasetId ?? []
      for (const datasetId of datasetIds) {
        // Skip if already processed from molecularData
        if (invertedMap.has(datasetId)) {
          continue
        }

        // Only create empty datasets for valid dataset IDs (e.g., JGAD, DRA, etc.)
        if (!isValidDatasetId(datasetId)) {
          continue
        }

        const experiments: TransformedExperiment[] = []

        const version = assignDatasetVersion(
          datasetId,
          lang,
          experiments,
          datasetVersionsMap,
        )

        // Record warnings for null values
        if (!summaryDataset.typeOfData) recordWarning(datasetId, humVersionId, "typeOfData", lang)
        if (!summaryDataset.criteria) recordWarning(datasetId, humVersionId, "criteria", lang)
        if (!summaryDataset.releaseDate) recordWarning(datasetId, humVersionId, "releaseDate", lang)

        const dataset: TransformedDataset = {
          datasetId,
          lang,
          version,
          versionReleaseDate,
          humId,
          humVersionId,
          typeOfData: summaryDataset.typeOfData ?? "",
          criteria: convertCriteriaToDisplay(summaryDataset.criteria, lang),
          releaseDate: summaryDataset.releaseDate ?? [],
          experiments,
        }

        // Track version
        const key = `${datasetId}-${lang}`
        const existing = datasetVersionsMap.get(key) ?? []
        // Only add if this is a new version
        if (!existing.some(d => d.version === version)) {
          existing.push(dataset)
          datasetVersionsMap.set(key, existing)
          allDatasets.push(dataset)
        }

        versionDatasetIds.push(`${datasetId}-${version}-${lang}`)
      }
    }

    const researchVersion: TransformedResearchVersion = {
      humId,
      lang,
      version: `v${v}`,
      humVersionId,
      datasetIds: versionDatasetIds,
      releaseDate: versionReleaseDate,
      releaseNote: releaseInfo?.releaseNote ?? { text: "", rawHtml: "" },
    }

    versions.push(researchVersion)
  }

  if (versions.length === 0) {
    // All versions were skipped - this is not an error
    if (skippedCount === latestVersion) {
      return {
        success: false,
        humId,
        lang,
        error: "SKIPPED", // Special marker for skipped humId-lang
      }
    }
    return {
      success: false,
      humId,
      lang,
      error: `No versions processed for ${humId}-${lang}`,
    }
  }

  // Build Research from latest version
  const latestHumVersionId = `${humId}-v${latestVersion}`
  const latestDetail = readNormalizedDetailJson(latestHumVersionId, lang) as NormalizedParseResult | null

  if (!latestDetail) {
    return {
      success: false,
      humId,
      lang,
      error: `Cannot read latest detail for ${humId}-${lang}`,
    }
  }

  // Build expansion map for datasetIds (using latest version's molecularData)
  const latestInvertedMap = await invertMolTableToDataset(latestDetail.molecularData)
  const expansionMap = buildDatasetIdExpansionMap(latestDetail.molecularData, latestInvertedMap)

  // Calculate release dates
  const releaseDates = versions
    .map(v => v.releaseDate)
    .filter(d => d !== "")
    .sort()

  const research: TransformedResearch = {
    humId,
    lang,
    title: latestDetail.title,
    url: lang === "ja"
      ? `${DETAIL_PAGE_BASE_URL}${latestHumVersionId}`
      : `${DETAIL_PAGE_BASE_URL}en/${latestHumVersionId}`,
    summary: {
      aims: latestDetail.summary.aims,
      methods: latestDetail.summary.methods,
      targets: latestDetail.summary.targets,
      url: latestDetail.summary.url,
      footers: latestDetail.summary.footers,
    },
    dataProvider: transformDataProvider(latestDetail.dataProvider),
    researchProject: transformResearchProjects(latestDetail.dataProvider),
    grant: transformGrants(latestDetail.dataProvider.grants),
    relatedPublication: transformPublications(latestDetail.publications, expansionMap),
    controlledAccessUser: transformControlledAccessUsers(latestDetail.controlledAccessUsers, expansionMap),
    versionIds: versions.map(v => `${v.humVersionId}-${lang}`),
    latestVersion: `v${latestVersion}`,
    firstReleaseDate: releaseDates[0] ?? "",
    lastReleaseDate: releaseDates[releaseDates.length - 1] ?? "",
  }

  return {
    success: true,
    humId,
    lang,
    data: {
      research,
      versions,
      datasets: allDatasets,
    },
  }
}

// === Bilingual Transform Logic ===

/**
 * Transform one humId processing both ja and en simultaneously.
 * This ensures ja/en versions are synchronized.
 */
export const transformBilingualResearch = async (
  humId: string,
  opts: { noCache?: boolean },
): Promise<TransformBilingualResult> => {
  const useCache = !opts.noCache

  // Find all versions
  let latestVersion: number
  try {
    latestVersion = await findLatestVersionNum(humId, useCache)
  } catch {
    latestVersion = await headLatestVersionNum(humId).catch(() => 0)
  }

  if (latestVersion === 0) {
    return {
      success: false,
      humId,
      error: `No versions found for ${humId}`,
    }
  }

  const jaVersions: TransformedResearchVersion[] = []
  const enVersions: TransformedResearchVersion[] = []
  const bilingualDatasets: BilingualDatasetPair[] = []
  const bilingualVersionsMap = new Map<string, { version: string; jaExperiments: TransformedExperiment[]; enExperiments: TransformedExperiment[] }[]>()

  let jaSkippedCount = 0
  let enSkippedCount = 0

  // Process each version for both languages simultaneously
  for (let v = 1; v <= latestVersion; v++) {
    const humVersionId = `${humId}-v${v}`

    // Read detail for both languages
    const jaDetail = shouldSkipPage(humVersionId, "ja")
      ? (jaSkippedCount++, null)
      : (readNormalizedDetailJson(humVersionId, "ja") as NormalizedParseResult | null)

    const enDetail = shouldSkipPage(humVersionId, "en")
      ? (enSkippedCount++, null)
      : (readNormalizedDetailJson(humVersionId, "en") as NormalizedParseResult | null)

    // Skip if both are missing
    if (!jaDetail && !enDetail) {
      continue
    }

    // Use whichever detail is available for release info
    const referenceDetail = jaDetail ?? enDetail
    const releaseInfo = referenceDetail?.releases.find(r => r.humVersionId === humVersionId)
    const versionReleaseDate = releaseInfo?.releaseDate ?? ""

    // Invert molTable -> Dataset for both languages
    const jaInvertedMap = jaDetail ? await invertMolTableToDataset(jaDetail.molecularData) : new Map()
    const enInvertedMap = enDetail ? await invertMolTableToDataset(enDetail.molecularData) : new Map()

    // Build dataset metadata maps for both languages (with inheritance from parent molData)
    const jaMetadataMap = jaDetail ? buildDatasetMetadataMap(jaDetail.summary.datasets, jaDetail.molecularData) : new Map()
    const enMetadataMap = enDetail ? buildDatasetMetadataMap(enDetail.summary.datasets, enDetail.molecularData) : new Map()

    // Collect all datasetIds from both languages
    const allDatasetIds = new Set<string>([...jaInvertedMap.keys(), ...enInvertedMap.keys()])

    // Also add datasetIds from summary.datasets
    if (jaDetail) {
      for (const ds of jaDetail.summary.datasets) {
        for (const id of ds.datasetId ?? []) {
          if (isValidDatasetId(id)) allDatasetIds.add(id)
        }
      }
    }
    if (enDetail) {
      for (const ds of enDetail.summary.datasets) {
        for (const id of ds.datasetId ?? []) {
          if (isValidDatasetId(id)) allDatasetIds.add(id)
        }
      }
    }

    // Process each datasetId with synchronized versioning
    const jaVersionDatasetIds: string[] = []
    const enVersionDatasetIds: string[] = []

    // Get ignored datasetIds for this humId
    const ignoredDatasetIds = IGNORE_DATASET_ID_FOR_HUM[humId] ?? []

    for (const datasetId of allDatasetIds) {
      // Skip ignored datasetIds for this humId
      if (ignoredDatasetIds.includes(datasetId)) {
        continue
      }
      // Get experiments for both languages
      const jaMolDataList = jaInvertedMap.get(datasetId) ?? []
      const enMolDataList = enInvertedMap.get(datasetId) ?? []

      const jaExperiments: TransformedExperiment[] = jaMolDataList.map((md: NormalizedMolecularData) => ({
        header: md.id,
        data: md.data,
        footers: md.footers,
      }))

      const enExperiments: TransformedExperiment[] = enMolDataList.map((md: NormalizedMolecularData) => ({
        header: md.id,
        data: md.data,
        footers: md.footers,
      }))

      // Assign synchronized version
      const version = assignBilingualDatasetVersion(
        datasetId,
        jaExperiments,
        enExperiments,
        bilingualVersionsMap,
      )

      // Track version
      trackBilingualVersion(datasetId, version, jaExperiments, enExperiments, bilingualVersionsMap)

      // Get metadata for each language (with cross-language fallback)
      const jaMetadataRaw = jaMetadataMap.get(datasetId)
      const enMetadataRaw = enMetadataMap.get(datasetId)

      // Use cross-language fallback for metadata fields
      // If one language has metadata but the other doesn't, use the available one
      const jaMetadata = jaMetadataRaw ?? enMetadataRaw
      const enMetadata = enMetadataRaw ?? jaMetadataRaw

      // Create datasets for both languages
      const jaDataset: TransformedDataset | null = (jaExperiments.length > 0 || jaMetadataRaw)
        ? (() => {
          if (!jaMetadata?.typeOfData) recordWarning(datasetId, humVersionId, "typeOfData", "ja")
          if (!jaMetadata?.criteria) recordWarning(datasetId, humVersionId, "criteria", "ja")
          if (!jaMetadata?.releaseDate) recordWarning(datasetId, humVersionId, "releaseDate", "ja")
          return {
            datasetId,
            lang: "ja" as const,
            version,
            versionReleaseDate,
            humId,
            humVersionId,
            typeOfData: jaMetadata?.typeOfData ?? "",
            criteria: convertCriteriaToDisplay(jaMetadata?.criteria ?? null, "ja"),
            releaseDate: jaMetadata?.releaseDate ?? [],
            experiments: jaExperiments,
          }
        })()
        : null

      const enDataset: TransformedDataset | null = (enExperiments.length > 0 || enMetadataRaw)
        ? (() => {
          if (!enMetadata?.typeOfData) recordWarning(datasetId, humVersionId, "typeOfData", "en")
          if (!enMetadata?.criteria) recordWarning(datasetId, humVersionId, "criteria", "en")
          if (!enMetadata?.releaseDate) recordWarning(datasetId, humVersionId, "releaseDate", "en")
          return {
            datasetId,
            lang: "en" as const,
            version,
            versionReleaseDate,
            humId,
            humVersionId,
            typeOfData: enMetadata?.typeOfData ?? "",
            criteria: convertCriteriaToDisplay(enMetadata?.criteria ?? null, "en"),
            releaseDate: enMetadata?.releaseDate ?? [],
            experiments: enExperiments,
          }
        })()
        : null

      // Only add if this is a new version (check by version string)
      const existingPair = bilingualDatasets.find(
        d => d.datasetId === datasetId && d.version === version,
      )

      if (!existingPair) {
        bilingualDatasets.push({
          datasetId,
          version,
          versionReleaseDate,
          ja: jaDataset,
          en: enDataset,
        })
      }

      if (jaDataset) {
        jaVersionDatasetIds.push(`${datasetId}-${version}-ja`)
      }
      if (enDataset) {
        enVersionDatasetIds.push(`${datasetId}-${version}-en`)
      }
    }

    // Create research versions for both languages
    if (jaDetail) {
      const releaseNote = releaseInfo?.releaseNote ?? { text: "", rawHtml: "" }
      jaVersions.push({
        humId,
        lang: "ja",
        version: `v${v}`,
        humVersionId,
        datasetIds: jaVersionDatasetIds,
        releaseDate: versionReleaseDate,
        releaseNote,
      })
    }

    if (enDetail) {
      const releaseNote = releaseInfo?.releaseNote ?? { text: "", rawHtml: "" }
      enVersions.push({
        humId,
        lang: "en",
        version: `v${v}`,
        humVersionId,
        datasetIds: enVersionDatasetIds,
        releaseDate: versionReleaseDate,
        releaseNote,
      })
    }
  }

  // Check if all versions were skipped
  if (jaVersions.length === 0 && enVersions.length === 0) {
    if (jaSkippedCount === latestVersion && enSkippedCount === latestVersion) {
      return { success: false, humId, error: "SKIPPED" }
    }
    return { success: false, humId, error: `No versions processed for ${humId}` }
  }

  // Build Research from latest version for both languages
  const latestHumVersionId = `${humId}-v${latestVersion}`
  const latestJaDetail = readNormalizedDetailJson(latestHumVersionId, "ja") as NormalizedParseResult | null
  const latestEnDetail = readNormalizedDetailJson(latestHumVersionId, "en") as NormalizedParseResult | null

  // Build research for ja
  let jaResearch: TransformedResearch | null = null
  if (latestJaDetail && jaVersions.length > 0) {
    const latestInvertedMap = await invertMolTableToDataset(latestJaDetail.molecularData)
    const expansionMap = buildDatasetIdExpansionMap(latestJaDetail.molecularData, latestInvertedMap)

    const releaseDates = jaVersions.map(v => v.releaseDate).filter(d => d !== "").sort()

    jaResearch = {
      humId,
      lang: "ja",
      title: latestJaDetail.title,
      url: `${DETAIL_PAGE_BASE_URL}${latestHumVersionId}`,
      summary: {
        aims: latestJaDetail.summary.aims,
        methods: latestJaDetail.summary.methods,
        targets: latestJaDetail.summary.targets,
        url: latestJaDetail.summary.url,
        footers: latestJaDetail.summary.footers,
      },
      dataProvider: transformDataProvider(latestJaDetail.dataProvider),
      researchProject: transformResearchProjects(latestJaDetail.dataProvider),
      grant: transformGrants(latestJaDetail.dataProvider.grants),
      relatedPublication: transformPublications(latestJaDetail.publications, expansionMap),
      controlledAccessUser: transformControlledAccessUsers(latestJaDetail.controlledAccessUsers, expansionMap),
      versionIds: jaVersions.map(v => `${v.humVersionId}-ja`),
      latestVersion: `v${latestVersion}`,
      firstReleaseDate: releaseDates[0] ?? "",
      lastReleaseDate: releaseDates[releaseDates.length - 1] ?? "",
    }
  }

  // Build research for en
  let enResearch: TransformedResearch | null = null
  if (latestEnDetail && enVersions.length > 0) {
    const latestInvertedMap = await invertMolTableToDataset(latestEnDetail.molecularData)
    const expansionMap = buildDatasetIdExpansionMap(latestEnDetail.molecularData, latestInvertedMap)

    const releaseDates = enVersions.map(v => v.releaseDate).filter(d => d !== "").sort()

    enResearch = {
      humId,
      lang: "en",
      title: latestEnDetail.title,
      url: `${DETAIL_PAGE_BASE_URL}en/${latestHumVersionId}`,
      summary: {
        aims: latestEnDetail.summary.aims,
        methods: latestEnDetail.summary.methods,
        targets: latestEnDetail.summary.targets,
        url: latestEnDetail.summary.url,
        footers: latestEnDetail.summary.footers,
      },
      dataProvider: transformDataProvider(latestEnDetail.dataProvider),
      researchProject: transformResearchProjects(latestEnDetail.dataProvider),
      grant: transformGrants(latestEnDetail.dataProvider.grants),
      relatedPublication: transformPublications(latestEnDetail.publications, expansionMap),
      controlledAccessUser: transformControlledAccessUsers(latestEnDetail.controlledAccessUsers, expansionMap),
      versionIds: enVersions.map(v => `${v.humVersionId}-en`),
      latestVersion: `v${latestVersion}`,
      firstReleaseDate: releaseDates[0] ?? "",
      lastReleaseDate: releaseDates[releaseDates.length - 1] ?? "",
    }
  }

  return {
    success: true,
    humId,
    data: {
      research: { ja: jaResearch, en: enResearch },
      versions: { ja: jaVersions, en: enVersions },
      datasets: bilingualDatasets,
    },
  }
}

// === Bilingual Transform All ===

/**
 * Transform all humIds with ja/en synchronization.
 */
export const transformAllBilingual = async (
  humIds: string[],
  opts: { noCache?: boolean; concurrency?: number },
): Promise<void> => {
  const tasks: (() => Promise<void>)[] = []

  for (const humId of humIds) {
    tasks.push(async () => {
      const tag = `[${humId}]`
      try {
        const result = await transformBilingualResearch(humId, opts)

        if (!result.success) {
          if (result.error !== "SKIPPED") {
            console.error(`${tag} Error: ${result.error}`)
          }
          return
        }

        const { data } = result

        if (!data) {
          console.error(`${tag} Error: No data returned`)
          return
        }

        // Write research for both languages
        if (data.research.ja) {
          writeStructuredJson("research", `${humId}-ja.json`, data.research.ja)
        }
        if (data.research.en) {
          writeStructuredJson("research", `${humId}-en.json`, data.research.en)
        }

        // Write versions for both languages
        for (const version of data.versions.ja) {
          writeStructuredJson("research-version", `${version.humVersionId}-ja.json`, version)
        }
        for (const version of data.versions.en) {
          writeStructuredJson("research-version", `${version.humVersionId}-en.json`, version)
        }

        // Write datasets (bilingual pairs)
        for (const pair of data.datasets) {
          if (pair.ja) {
            writeStructuredJson("dataset", `${pair.datasetId}-${pair.version}-ja.json`, pair.ja)
          }
          if (pair.en) {
            writeStructuredJson("dataset", `${pair.datasetId}-${pair.version}-en.json`, pair.en)
          }
        }

        console.log(
          `${tag} ja: ${data.versions.ja.length} versions, en: ${data.versions.en.length} versions, ${data.datasets.length} dataset pairs`,
        )
      } catch (e) {
        console.error(`${tag} Failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  // Execute with concurrency
  const conc = Math.max(1, Math.min(32, opts.concurrency ?? 4))
  for (let i = 0; i < tasks.length; i += conc) {
    await Promise.all(tasks.slice(i, i + conc).map(fn => fn()))
  }
}

// === Original Transform All (kept for backwards compatibility) ===

export const transformAll = async (
  humIds: string[],
  langs: LangType[],
  opts: { noCache?: boolean; concurrency?: number },
): Promise<void> => {
  const tasks: (() => Promise<void>)[] = []

  for (const humId of humIds) {
    for (const lang of langs) {
      tasks.push(async () => {
        const tag = `[${humId}-${lang}]`
        try {
          const result = await transformOneResearch(humId, lang, opts)

          if (!result.success) {
            // Don't log if all versions were skipped (expected)
            if (result.error !== "SKIPPED") {
              console.error(`${tag} Error: ${result.error}`)
            }
            return
          }

          const { data } = result

          // Write research
          writeStructuredJson(
            "research",
            `${humId}-${lang}.json`,
            data.research,
          )

          // Write versions
          for (const version of data.versions) {
            writeStructuredJson(
              "research-version",
              `${version.humVersionId}-${lang}.json`,
              version,
            )
          }

          // Write datasets
          for (const dataset of data.datasets) {
            writeStructuredJson(
              "dataset",
              `${dataset.datasetId}-${dataset.version}-${lang}.json`,
              dataset,
            )
          }

          console.log(
            `${tag} ${data.versions.length} versions, ${data.datasets.length} datasets`,
          )
        } catch (e) {
          console.error(
            `${tag} Failed: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      })
    }
  }

  // Execute with concurrency
  const conc = Math.max(1, Math.min(32, opts.concurrency ?? 4))
  for (let i = 0; i < tasks.length; i += conc) {
    await Promise.all(tasks.slice(i, i + conc).map(fn => fn()))
  }
}

// === Unified Transform Helpers ===

const toBilingualText = (ja: string | null, en: string | null): BilingualText => ({ ja, en })

const toBilingualTextValue = (ja: TextValue | null, en: TextValue | null): BilingualTextValue => ({ ja, en })

/**
 * Create UnifiedExperiment from ja/en experiments
 */
const createUnifiedExperiments = (
  jaExperiments: TransformedExperiment[],
  enExperiments: TransformedExperiment[],
): UnifiedExperiment[] => {
  const pairs = matchExperiments(jaExperiments, enExperiments)

  return pairs.map((pair) => {
    // Merge data fields from both languages
    const allKeys = new Set([
      ...Object.keys(pair.ja?.data ?? {}),
      ...Object.keys(pair.en?.data ?? {}),
    ])

    const unifiedData: Record<string, BilingualTextValue | null> = {}
    for (const key of allKeys) {
      const jaValue = pair.ja?.data[key] ?? null
      const enValue = pair.en?.data[key] ?? null

      // Handle TextValue arrays - take first element or null
      const jaTextValue = Array.isArray(jaValue) ? jaValue[0] ?? null : jaValue
      const enTextValue = Array.isArray(enValue) ? enValue[0] ?? null : enValue

      unifiedData[key] = toBilingualTextValue(jaTextValue, enTextValue)
    }

    return {
      header: toBilingualTextValue(pair.ja?.header ?? null, pair.en?.header ?? null),
      data: unifiedData,
      footers: {
        ja: pair.ja?.footers ?? [],
        en: pair.en?.footers ?? [],
      },
      matchType: pair.matchType,
    }
  })
}

/**
 * Convert display criteria values back to canonical values
 */
const convertCriteriaToCanonical = (
  displayValues: string[] | undefined,
): CriteriaCanonical[] => {
  if (!displayValues || displayValues.length === 0) return []
  const canonical = displayValues
    .map(v => getCriteriaCanonical(v))
    .filter((v): v is CriteriaCanonical => v !== null)
  return canonical
}

/**
 * Create UnifiedDataset from ja/en datasets
 */
const createUnifiedDataset = (
  datasetId: string,
  version: string,
  versionReleaseDate: string,
  humId: string,
  humVersionId: string,
  jaDataset: TransformedDataset | null,
  enDataset: TransformedDataset | null,
): UnifiedDataset => {
  const experiments = createUnifiedExperiments(
    jaDataset?.experiments ?? [],
    enDataset?.experiments ?? [],
  )

  // Convert criteria from display values to canonical (merge ja and en)
  const jaCriteria = convertCriteriaToCanonical(jaDataset?.criteria)
  const enCriteria = convertCriteriaToCanonical(enDataset?.criteria)
  const criteria = jaCriteria.length > 0 ? jaCriteria : enCriteria

  return {
    datasetId,
    version,
    versionReleaseDate,
    humId,
    humVersionId,
    releaseDate: jaDataset?.releaseDate ?? enDataset?.releaseDate ?? [],
    criteria,
    typeOfData: {
      ja: jaDataset?.typeOfData || null,
      en: enDataset?.typeOfData || null,
    },
    experiments,
  }
}

/**
 * Create UnifiedSummary from ja/en summaries
 */
const createUnifiedSummary = (
  jaSummary: TransformedResearch["summary"] | null,
  enSummary: TransformedResearch["summary"] | null,
): UnifiedSummary => ({
  aims: toBilingualTextValue(jaSummary?.aims ?? null, enSummary?.aims ?? null),
  methods: toBilingualTextValue(jaSummary?.methods ?? null, enSummary?.methods ?? null),
  targets: toBilingualTextValue(jaSummary?.targets ?? null, enSummary?.targets ?? null),
  url: {
    ja: jaSummary?.url ?? [],
    en: enSummary?.url ?? [],
  },
  footers: {
    ja: jaSummary?.footers ?? [],
    en: enSummary?.footers ?? [],
  },
})

/**
 * Create UnifiedPerson from ja/en persons (for data provider)
 */
const createUnifiedDataProvider = (
  jaProviders: TransformedPerson[],
  enProviders: TransformedPerson[],
): UnifiedPerson[] => {
  const maxLen = Math.max(jaProviders.length, enProviders.length)
  const result: UnifiedPerson[] = []

  for (let i = 0; i < maxLen; i++) {
    const ja = jaProviders[i]
    const en = enProviders[i]

    result.push({
      name: toBilingualTextValue(ja?.name ?? null, en?.name ?? null),
      email: ja?.email ?? en?.email ?? null,
      orcid: ja?.orcid ?? en?.orcid ?? null,
      organization: (ja?.organization || en?.organization)
        ? {
          name: toBilingualTextValue(
            ja?.organization?.name ?? null,
            en?.organization?.name ?? null,
          ),
          address: ja?.organization?.address ?? en?.organization?.address ?? null,
        }
        : null,
    })
  }

  return result
}

/**
 * Create UnifiedPerson from ja/en persons (for controlled access users)
 * Uses key-based matching by datasetIds and periodOfDataUse
 */
const createUnifiedControlledAccessUsers = (
  jaUsers: TransformedPerson[],
  enUsers: TransformedPerson[],
): UnifiedPerson[] => {
  const pairs = matchControlledAccessUsers(jaUsers, enUsers)

  return pairs.map((pair) => ({
    name: toBilingualTextValue(pair.ja?.name ?? null, pair.en?.name ?? null),
    organization: (pair.ja?.organization || pair.en?.organization)
      ? {
        name: toBilingualTextValue(
          pair.ja?.organization?.name ?? null,
          pair.en?.organization?.name ?? null,
        ),
        address: pair.ja?.organization?.address ?? pair.en?.organization?.address ?? null,
      }
      : null,
    datasetIds: pair.ja?.datasetIds ?? pair.en?.datasetIds,
    researchTitle: toBilingualText(pair.ja?.researchTitle ?? null, pair.en?.researchTitle ?? null),
    periodOfDataUse: pair.ja?.periodOfDataUse ?? pair.en?.periodOfDataUse ?? null,
    matchType: pair.matchType,
  }))
}

/**
 * Create UnifiedResearchProject from ja/en projects
 * Uses key-based matching by URL and name similarity
 */
const createUnifiedResearchProjects = (
  jaProjects: TransformedResearchProject[],
  enProjects: TransformedResearchProject[],
): UnifiedResearchProject[] => {
  const pairs = matchResearchProjects(jaProjects, enProjects)

  return pairs.map((pair) => ({
    name: toBilingualTextValue(pair.ja?.name ?? null, pair.en?.name ?? null),
    url: (pair.ja?.url || pair.en?.url)
      ? {
        ja: pair.ja?.url ?? null,
        en: pair.en?.url ?? null,
      }
      : null,
    matchType: pair.matchType,
  }))
}

/**
 * Create UnifiedGrant from ja/en grants
 * Uses key-based matching by grantId overlap
 */
const createUnifiedGrants = (
  jaGrants: TransformedGrant[],
  enGrants: TransformedGrant[],
): UnifiedGrant[] => {
  const pairs = matchGrants(jaGrants, enGrants)

  return pairs.map((pair) => ({
    id: pair.ja?.id ?? pair.en?.id ?? [],
    title: toBilingualText(pair.ja?.title ?? null, pair.en?.title ?? null),
    agency: {
      name: toBilingualText(pair.ja?.agency?.name ?? null, pair.en?.agency?.name ?? null),
    },
    matchType: pair.matchType,
  }))
}

/**
 * Create UnifiedPublication from ja/en publications
 * Uses key-based matching by DOI, datasetIds, and title similarity
 */
const createUnifiedPublications = (
  jaPubs: TransformedPublication[],
  enPubs: TransformedPublication[],
): UnifiedPublication[] => {
  const pairs = matchPublications(jaPubs, enPubs)

  return pairs.map((pair) => ({
    title: toBilingualText(pair.ja?.title ?? null, pair.en?.title ?? null),
    doi: pair.ja?.doi ?? pair.en?.doi ?? null,
    datasetIds: pair.ja?.datasetIds ?? pair.en?.datasetIds,
    matchType: pair.matchType,
  }))
}

/**
 * Create UnifiedResearch from ja/en research
 */
const createUnifiedResearch = (
  humId: string,
  jaResearch: TransformedResearch | null,
  enResearch: TransformedResearch | null,
): UnifiedResearch => ({
  humId,
  url: toBilingualText(jaResearch?.url ?? null, enResearch?.url ?? null),
  title: toBilingualText(jaResearch?.title ?? null, enResearch?.title ?? null),
  summary: createUnifiedSummary(
    jaResearch?.summary ?? null,
    enResearch?.summary ?? null,
  ),
  dataProvider: createUnifiedDataProvider(
    jaResearch?.dataProvider ?? [],
    enResearch?.dataProvider ?? [],
  ),
  researchProject: createUnifiedResearchProjects(
    jaResearch?.researchProject ?? [],
    enResearch?.researchProject ?? [],
  ),
  grant: createUnifiedGrants(
    jaResearch?.grant ?? [],
    enResearch?.grant ?? [],
  ),
  relatedPublication: createUnifiedPublications(
    jaResearch?.relatedPublication ?? [],
    enResearch?.relatedPublication ?? [],
  ),
  controlledAccessUser: createUnifiedControlledAccessUsers(
    jaResearch?.controlledAccessUser ?? [],
    enResearch?.controlledAccessUser ?? [],
  ),
  versionIds: [
    ...(jaResearch?.versionIds ?? []),
    ...(enResearch?.versionIds ?? []).filter(
      id => !jaResearch?.versionIds?.includes(id),
    ),
  ],
  latestVersion: jaResearch?.latestVersion ?? enResearch?.latestVersion ?? "",
  firstReleaseDate: jaResearch?.firstReleaseDate ?? enResearch?.firstReleaseDate ?? "",
  lastReleaseDate: jaResearch?.lastReleaseDate ?? enResearch?.lastReleaseDate ?? "",
})

/**
 * Create UnifiedResearchVersion from ja/en versions
 */
const createUnifiedResearchVersion = (
  humVersionId: string,
  jaVersion: TransformedResearchVersion | null,
  enVersion: TransformedResearchVersion | null,
): UnifiedResearchVersion => ({
  humId: jaVersion?.humId ?? enVersion?.humId ?? "",
  humVersionId,
  version: jaVersion?.version ?? enVersion?.version ?? "",
  versionReleaseDate: jaVersion?.releaseDate ?? enVersion?.releaseDate ?? "",
  datasetIds: [
    ...new Set([
      ...(jaVersion?.datasetIds ?? []),
      ...(enVersion?.datasetIds ?? []),
    ]),
  ],
  releaseNote: toBilingualTextValue(
    jaVersion?.releaseNote ?? null,
    enVersion?.releaseNote ?? null,
  ),
})

// === Unified Transform Result Type ===

interface TransformUnifiedResult {
  success: boolean
  humId: string
  error?: string
  data?: {
    research: UnifiedResearch
    versions: UnifiedResearchVersion[]
    datasets: UnifiedDataset[]
  }
}

/**
 * Transform one humId to unified structure (ja/en integrated)
 */
export const transformUnifiedResearch = async (
  humId: string,
  opts: { noCache?: boolean },
): Promise<TransformUnifiedResult> => {
  // First, get bilingual result
  const bilingualResult = await transformBilingualResearch(humId, opts)

  if (!bilingualResult.success || !bilingualResult.data) {
    return {
      success: false,
      humId,
      error: bilingualResult.error,
    }
  }

  const { research, versions, datasets } = bilingualResult.data

  // Create unified research
  const unifiedResearch = createUnifiedResearch(humId, research.ja, research.en)

  // Create unified versions
  const versionMap = new Map<string, { ja: TransformedResearchVersion | null; en: TransformedResearchVersion | null }>()
  for (const v of versions.ja) {
    versionMap.set(v.humVersionId, { ja: v, en: null })
  }
  for (const v of versions.en) {
    const existing = versionMap.get(v.humVersionId) ?? { ja: null, en: null }
    existing.en = v
    versionMap.set(v.humVersionId, existing)
  }

  const unifiedVersions: UnifiedResearchVersion[] = []
  for (const [humVersionId, pair] of versionMap) {
    unifiedVersions.push(createUnifiedResearchVersion(humVersionId, pair.ja, pair.en))
  }

  // Create unified datasets
  const unifiedDatasets: UnifiedDataset[] = datasets.map((pair) =>
    createUnifiedDataset(
      pair.datasetId,
      pair.version,
      pair.versionReleaseDate,
      research.ja?.humId ?? research.en?.humId ?? "",
      pair.ja?.humVersionId ?? pair.en?.humVersionId ?? "",
      pair.ja,
      pair.en,
    ),
  )

  return {
    success: true,
    humId,
    data: {
      research: unifiedResearch,
      versions: unifiedVersions,
      datasets: unifiedDatasets,
    },
  }
}

/**
 * Transform all humIds to unified structure
 */
export const transformAllUnified = async (
  humIds: string[],
  opts: { noCache?: boolean; concurrency?: number },
): Promise<void> => {
  const tasks: (() => Promise<void>)[] = []

  for (const humId of humIds) {
    tasks.push(async () => {
      const tag = `[${humId}]`
      try {
        const result = await transformUnifiedResearch(humId, opts)

        if (!result.success) {
          if (result.error !== "SKIPPED") {
            console.error(`${tag} Error: ${result.error}`)
          }
          return
        }

        const { data } = result

        if (!data) {
          console.error(`${tag} Error: No data returned`)
          return
        }

        // Write unified research (single file, not per-language)
        writeStructuredJson("research", `${humId}.json`, data.research)

        // Write unified versions (single file per version)
        for (const version of data.versions) {
          writeStructuredJson("research-version", `${version.humVersionId}.json`, version)
        }

        // Write unified datasets (single file per dataset-version)
        for (const dataset of data.datasets) {
          writeStructuredJson("dataset", `${dataset.datasetId}-${dataset.version}.json`, dataset)
        }

        console.log(
          `${tag} ${data.versions.length} versions, ${data.datasets.length} datasets`,
        )
      } catch (e) {
        console.error(`${tag} Failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  // Execute with concurrency
  const conc = Math.max(1, Math.min(32, opts.concurrency ?? 4))
  for (let i = 0; i < tasks.length; i += conc) {
    await Promise.all(tasks.slice(i, i + conc).map(fn => fn()))
  }
}

// === CLI ===

interface TransformArgs extends CrawlArgs {
  legacy?: boolean
  unified?: boolean
  clean?: boolean
}

const parseArgs = (): TransformArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string" })
    .option("lang", { choices: ["ja", "en"] as const })
    .option("no-cache", { type: "boolean", default: false })
    .option("concurrency", { type: "number", default: 4 })
    .option("legacy", { type: "boolean", default: false, description: "Use legacy (non-bilingual) transform" })
    .option("unified", { type: "boolean", default: false, description: "Use unified (ja/en integrated) transform" })
    .option("clean", { type: "boolean", default: false, description: "Clean output directories before transform" })
    .parseSync()

const cleanOutputDir = (type: "research" | "research-version" | "dataset"): void => {
  const dir = getStructuredJsonDir(type)
  if (existsSync(dir)) {
    const files = readdirSync(dir)
    for (const file of files) {
      if (file.endsWith(".json")) {
        rmSync(join(dir, file))
      }
    }
    console.log(`Cleaned ${files.length} files from ${type} directory`)
  }
}

const main = async (): Promise<void> => {
  const args = parseArgs()
  const useCache = !args.noCache
  const humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)

  // Clear validation warnings from previous runs
  clearWarnings()

  if (args.clean) {
    console.log("Cleaning output directories...")
    cleanOutputDir("research")
    cleanOutputDir("research-version")
    cleanOutputDir("dataset")
  }

  if (args.legacy) {
    // Legacy mode: process languages independently
    const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]
    console.log(`[Legacy] Transforming ${humIds.length} humIds for languages: ${langs.join(", ")}`)

    await transformAll(humIds, langs, {
      noCache: args.noCache,
      concurrency: args.concurrency,
    })
  } else if (args.unified) {
    // Unified mode: ja/en integrated structure
    console.log(`[Unified] Transforming ${humIds.length} humIds with ja/en integrated structure`)

    await transformAllUnified(humIds, {
      noCache: args.noCache,
      concurrency: args.concurrency,
    })
  } else {
    // Default: Bilingual mode with synchronized versioning
    console.log(`[Bilingual] Transforming ${humIds.length} humIds with ja/en version synchronization`)

    await transformAllBilingual(humIds, {
      noCache: args.noCache,
      concurrency: args.concurrency,
    })
  }

  // Save JGA relation cache to file
  saveJgaCache()

  // Print validation warnings
  printWarnings()

  const outputDir = join(getResultsDirPath(), "structured-json")
  console.log(`Done! Output: ${outputDir}`)
}

if (import.meta.main) {
  await main()
}
