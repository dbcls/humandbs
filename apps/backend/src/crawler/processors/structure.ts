/**
 * Structure processor
 *
 * Structures normalized data into output format (datasets, research, versions)
 * Handles dataset ID extraction, versioning, and bilingual integration
 */
import {
  getMetadataInheritance,
  getCriteriaCanonical,
  getCriteriaDisplayValue,
  getIgnoreIdsByHum,
  getInvalidOtherIds,
  applyGlobalIdCorrection,
  getMolDataIdFields,
} from "@/crawler/config/mapping"
import { extractIdsByType } from "@/crawler/config/patterns"
import {
  matchExperiments,
  matchPublications,
  matchGrants,
  matchControlledAccessUsers,
  matchResearchProjects,
} from "@/crawler/processors/merge"
import type {
  LangType,
  TextValue,
  NormalizedParseResult,
  NormalizedMolecularData,
  NormalizedDataset,
  DatasetIdType,
  ExtractedIds,
  CriteriaCanonical,
  SingleLangExperiment,
  SingleLangDataset,
  SingleLangResearchVersion,
  SingleLangResearch,
  SingleLangPerson,
  SingleLangResearchProject,
  SingleLangGrant,
  SingleLangPublication,
  BilingualText,
  BilingualTextValue,
  Dataset,
  Experiment,
  Research,
  ResearchVersion,
  Summary,
  Person,
  ResearchProject,
  Grant,
  Publication,
} from "@/crawler/types"

// Criteria Display

/**
 * Convert criteria canonical values to display values
 */
export const convertCriteriaToDisplay = (
  criteria: CriteriaCanonical[] | null,
  lang: LangType,
): string[] => {
  if (!criteria) return []
  return criteria.map(c => getCriteriaDisplayValue(c, lang))
}

/**
 * Convert display criteria values back to canonical values
 */
export const convertCriteriaToCanonical = (
  displayValues: string[] | undefined,
): CriteriaCanonical[] => {
  if (!displayValues || displayValues.length === 0) return []
  const canonical = displayValues
    .map(v => getCriteriaCanonical(v))
    .filter((v): v is CriteriaCanonical => v !== null)
  return canonical
}

// ID Extraction

/**
 * Extract dataset IDs from molecular data
 */
export const extractDatasetIdsFromMolData = (molData: NormalizedMolecularData): ExtractedIds => {
  const idSets: ExtractedIds = {}
  const idFields = getMolDataIdFields()
  const invalidIdValues = getInvalidOtherIds()

  const addIds = (text: string) => {
    const found = extractIdsByType(text)
    for (const [type, ids] of Object.entries(found) as [DatasetIdType, string[]][]) {
      if (!idSets[type]) {
        idSets[type] = new Set()
      }
      for (const id of ids) {
        // Skip invalid IDs
        if (invalidIdValues.includes(id)) continue
        // Apply special case transformations
        const normalizedIds = applyGlobalIdCorrection(id)
        for (const normalizedId of normalizedIds) {
          idSets[type]!.add(normalizedId)
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

  return idSets
}

// Invert molTable -> Dataset

/**
 * Invert molecularData to datasetId mapping
 * Uses pre-extracted dataset IDs from normalization phase
 */
export const invertMolTableToDataset = (
  molecularData: NormalizedMolecularData[],
): Map<string, NormalizedMolecularData[]> => {
  const result = new Map<string, NormalizedMolecularData[]>()

  for (const molData of molecularData) {
    // Use pre-extracted dataset IDs from normalization
    const extractedIds = molData.extractedDatasetIds

    if (!extractedIds) {
      // Fallback for backward compatibility: use legacy extraction
      const legacyIds = extractDatasetIdsFromMolData(molData)
      for (const [, ids] of Object.entries(legacyIds)) {
        if (ids) {
          for (const id of ids) {
            const existing = result.get(id) ?? []
            existing.push(molData)
            result.set(id, existing)
          }
        }
      }
      continue
    }

    // Associate molData with each datasetId
    for (const datasetId of extractedIds.datasetIds) {
      const existing = result.get(datasetId) ?? []
      existing.push(molData)
      result.set(datasetId, existing)
    }
  }

  return result
}

// Dataset Metadata

interface DatasetMetadata {
  typeOfData: string | null
  criteria: CriteriaCanonical[] | null
  releaseDate: string[] | null
}

/**
 * Find metadata by prefix match
 */
const findPrefixMatch = (
  datasetId: string,
  metadataMap: Map<string, DatasetMetadata>,
): DatasetMetadata | null => {
  const parts = datasetId.split(".")
  if (parts.length < 3) return null

  for (let i = parts.length - 1; i >= 2; i--) {
    const prefix = parts.slice(0, i).join(".")
    const metadata = metadataMap.get(prefix)
    if (metadata) {
      return metadata
    }
  }

  return null
}

/**
 * Build dataset metadata map with inheritance
 */
export const buildDatasetMetadataMap = (
  datasets: NormalizedDataset[],
  molecularData?: NormalizedMolecularData[],
): Map<string, DatasetMetadata> => {
  const map = new Map<string, DatasetMetadata>()
  const metadataInheritance = getMetadataInheritance()

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
  for (const [childId, parentId] of Object.entries(metadataInheritance)) {
    if (!map.has(childId) && map.has(parentId)) {
      map.set(childId, map.get(parentId)!)
    }
  }

  // Second pass: inherit metadata for child datasetIds in molecularData
  if (molecularData) {
    for (const molData of molecularData) {
      const parentId = molData.id?.text
      if (!parentId) continue

      let parentMetadata = map.get(parentId)
      if (!parentMetadata) {
        const prefixMatch = findPrefixMatch(parentId, map)
        if (prefixMatch) {
          map.set(parentId, prefixMatch)
          parentMetadata = prefixMatch
        }
      }

      if (!parentMetadata) continue

      const extractedIds = extractDatasetIdsFromMolData(molData)
      for (const type of ["JGAD", "DRA", "GEA", "NBDC_DATASET", "BP", "METABO"] as const) {
        const ids = extractedIds[type]
        if (ids) {
          for (const childId of ids) {
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

// Dataset Versioning

/**
 * Check if experiments are equal
 */
export const isExperimentsEqual = (
  a: SingleLangExperiment[],
  b: SingleLangExperiment[],
): boolean => {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Assign dataset version
 */
export const assignDatasetVersion = (
  datasetId: string,
  lang: LangType,
  experiments: SingleLangExperiment[],
  existingVersions: Map<string, SingleLangDataset[]>,
): string => {
  const key = `${datasetId}-${lang}`
  const existing = existingVersions.get(key) ?? []

  for (const prev of existing) {
    if (isExperimentsEqual(prev.experiments, experiments)) {
      return prev.version
    }
  }

  return `v${existing.length + 1}`
}

// Bilingual Dataset Versioning

interface BilingualVersionInfo {
  version: string
  jaExperiments: SingleLangExperiment[]
  enExperiments: SingleLangExperiment[]
}

/**
 * Assign bilingual dataset version (ja/en synchronized)
 */
export const assignBilingualDatasetVersion = (
  datasetId: string,
  jaExperiments: SingleLangExperiment[],
  enExperiments: SingleLangExperiment[],
  existingVersions: Map<string, BilingualVersionInfo[]>,
): string => {
  const existing = existingVersions.get(datasetId) ?? []

  for (const prev of existing) {
    const jaMatch = isExperimentsEqual(prev.jaExperiments, jaExperiments)
    const enMatch = isExperimentsEqual(prev.enExperiments, enExperiments)

    if (jaMatch && enMatch) {
      return prev.version
    }
  }

  return `v${existing.length + 1}`
}

/**
 * Track bilingual version
 */
export const trackBilingualVersion = (
  datasetId: string,
  version: string,
  jaExperiments: SingleLangExperiment[],
  enExperiments: SingleLangExperiment[],
  existingVersions: Map<string, BilingualVersionInfo[]>,
): void => {
  const existing = existingVersions.get(datasetId) ?? []

  if (!existing.some(v => v.version === version)) {
    existing.push({ version, jaExperiments, enExperiments })
    existingVersions.set(datasetId, existing)
  }
}

// Structure Functions

/**
 * Structure data provider
 */
export const structureDataProvider = (
  dp: NormalizedParseResult["dataProvider"],
): SingleLangPerson[] => {
  const persons: SingleLangPerson[] = []

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

/**
 * Structure controlled access users
 */
export const structureControlledAccessUsers = (
  users: NormalizedParseResult["controlledAccessUsers"],
  expansionMap: Map<string, Set<string>>,
): SingleLangPerson[] => {
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

/**
 * Structure grants
 */
export const structureGrants = (
  grants: NormalizedParseResult["dataProvider"]["grants"],
): SingleLangGrant[] => {
  return grants
    .filter(g => g.grantName || g.projectTitle || g.grantId)
    .map(g => ({
      id: g.grantId ?? [],
      title: g.projectTitle ?? "",
      agency: { name: g.grantName ?? "" },
    }))
}

/**
 * Build dataset ID expansion map
 */
export const buildDatasetIdExpansionMap = (
  molecularData: NormalizedMolecularData[],
  invertedMap: Map<string, NormalizedMolecularData[]>,
): Map<string, Set<string>> => {
  const expansionMap = new Map<string, Set<string>>()

  for (const molData of molecularData) {
    const extractedIds = extractDatasetIdsFromMolData(molData)
    const allIdsInMolTable = new Set<string>()

    for (const type of ["JGAD", "JGAS", "DRA", "GEA", "NBDC_DATASET", "BP", "METABO"] as const) {
      const ids = extractedIds[type]
      if (ids) {
        for (const id of ids) {
          allIdsInMolTable.add(id)
        }
      }
    }

    const contributesToDatasets = new Set<string>()
    for (const [datasetId, molDataList] of invertedMap.entries()) {
      if (molDataList.includes(molData)) {
        contributesToDatasets.add(datasetId)
      }
    }

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
 * Expand dataset IDs
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
      expanded.add(id)
    }
  }

  return [...expanded].sort()
}

/**
 * Structure publications
 */
export const structurePublications = (
  pubs: NormalizedParseResult["publications"],
  expansionMap: Map<string, Set<string>>,
): SingleLangPublication[] => {
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

/**
 * Structure research projects
 */
export const structureResearchProjects = (
  dp: NormalizedParseResult["dataProvider"],
): SingleLangResearchProject[] => {
  const projects: SingleLangResearchProject[] = []

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

// Unified Structure Helpers

/**
 * Convert to bilingual text
 */
export const toBilingualText = (ja: string | null, en: string | null): BilingualText => ({ ja, en })

/**
 * Convert to bilingual text value
 */
export const toBilingualTextValue = (ja: TextValue | null, en: TextValue | null): BilingualTextValue => ({ ja, en })

/**
 * Create unified experiments from ja/en experiments
 */
export const createUnifiedExperiments = (
  jaExperiments: SingleLangExperiment[],
  enExperiments: SingleLangExperiment[],
): Experiment[] => {
  const pairs = matchExperiments(jaExperiments, enExperiments)

  return pairs.map((pair) => {
    const allKeys = new Set([
      ...Object.keys(pair.ja?.data ?? {}),
      ...Object.keys(pair.en?.data ?? {}),
    ])

    const unifiedData: Record<string, BilingualTextValue | null> = {}
    for (const key of allKeys) {
      const jaValue = pair.ja?.data[key] ?? null
      const enValue = pair.en?.data[key] ?? null

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
    }
  })
}

/**
 * Create unified dataset
 */
export const createUnifiedDataset = (
  datasetId: string,
  version: string,
  versionReleaseDate: string,
  humId: string,
  humVersionId: string,
  jaDataset: SingleLangDataset | null,
  enDataset: SingleLangDataset | null,
): Dataset => {
  const experiments = createUnifiedExperiments(
    jaDataset?.experiments ?? [],
    enDataset?.experiments ?? [],
  )

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
 * Create unified summary
 */
export const createUnifiedSummary = (
  jaSummary: SingleLangResearch["summary"] | null,
  enSummary: SingleLangResearch["summary"] | null,
): Summary => ({
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
 * Create unified data provider
 */
export const createUnifiedDataProvider = (
  jaProviders: SingleLangPerson[],
  enProviders: SingleLangPerson[],
): Person[] => {
  const maxLen = Math.max(jaProviders.length, enProviders.length)
  const result: Person[] = []

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
 * Create unified controlled access users
 */
export const createUnifiedControlledAccessUsers = (
  jaUsers: SingleLangPerson[],
  enUsers: SingleLangPerson[],
): Person[] => {
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
  }))
}

/**
 * Create unified research projects
 */
export const createUnifiedResearchProjects = (
  jaProjects: SingleLangResearchProject[],
  enProjects: SingleLangResearchProject[],
): ResearchProject[] => {
  const pairs = matchResearchProjects(jaProjects, enProjects)

  return pairs.map((pair) => ({
    name: toBilingualTextValue(pair.ja?.name ?? null, pair.en?.name ?? null),
    url: (pair.ja?.url || pair.en?.url)
      ? {
        ja: pair.ja?.url ?? null,
        en: pair.en?.url ?? null,
      }
      : null,
  }))
}

/**
 * Create unified grants
 */
export const createUnifiedGrants = (
  jaGrants: SingleLangGrant[],
  enGrants: SingleLangGrant[],
): Grant[] => {
  const pairs = matchGrants(jaGrants, enGrants)

  return pairs.map((pair) => ({
    id: pair.ja?.id ?? pair.en?.id ?? [],
    title: toBilingualText(pair.ja?.title ?? null, pair.en?.title ?? null),
    agency: {
      name: toBilingualText(pair.ja?.agency?.name ?? null, pair.en?.agency?.name ?? null),
    },
  }))
}

/**
 * Create unified publications
 */
export const createUnifiedPublications = (
  jaPubs: SingleLangPublication[],
  enPubs: SingleLangPublication[],
): Publication[] => {
  const pairs = matchPublications(jaPubs, enPubs)

  return pairs.map((pair) => ({
    title: toBilingualText(pair.ja?.title ?? null, pair.en?.title ?? null),
    doi: pair.ja?.doi ?? pair.en?.doi ?? null,
    datasetIds: pair.ja?.datasetIds ?? pair.en?.datasetIds,
  }))
}

/**
 * Create unified research
 */
export const createUnifiedResearch = (
  humId: string,
  jaResearch: SingleLangResearch | null,
  enResearch: SingleLangResearch | null,
): Research => ({
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
 * Create unified research version
 */
export const createUnifiedResearchVersion = (
  humVersionId: string,
  jaVersion: SingleLangResearchVersion | null,
  enVersion: SingleLangResearchVersion | null,
): ResearchVersion => ({
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

// Structure Options

/**
 * Structure options
 */
export interface StructureOptions {
  /** Base URL for detail pages */
  detailPageBaseUrl: string
  /** Function to get JGAD datasets from JGAS study ID */
  getDatasetsFromStudy: (studyId: string) => Promise<string[]>
}

/**
 * Get ignored dataset IDs for a humId
 */
export const getIgnoredDatasetIds = (humId: string): string[] => {
  const ignoreMap = getIgnoreIdsByHum()
  return ignoreMap[humId] ?? []
}
