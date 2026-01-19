import { existsSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import {
  extractIdsByType,
  getCriteriaDisplayValue,
  ID_FIELDS,
  INVALID_ID_VALUES,
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
import { getDatasetsFromStudy, saveCache as saveJgaCache } from "@/crawler/jga-api"
import type {
  LangType,
  CrawlArgs,
  NormalizedParseResult,
  NormalizedMolecularData,
  NormalizedDataset,
  DatasetIdType,
  ExtractedIds,
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
} from "@/crawler/types"

// === Criteria Display ===

const convertCriteriaToDisplay = (
  criteria: CriteriaCanonical[] | null,
  lang: LangType,
): string[] | null => {
  if (!criteria) return null
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
        idSets[type]!.add(id)
      }
    }
  }

  // Extract from header
  if (molData.id?.text) {
    // Apply special case transformations (e.g., AP023461-AP024084 -> PRJDB10452)
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

    // Convert JGAS to JGAD
    const jgasIds = extractedIds.JGAS
    if (jgasIds) {
      for (const jgasId of jgasIds) {
        const jgadIds = jgasToJgadMap.get(jgasId) ?? []
        for (const jgadId of jgadIds) {
          allDatasetIds.add(jgadId)
        }
        // Use JGAS itself as fallback if no JGAD found
        if (jgadIds.length === 0) {
          allDatasetIds.add(jgasId)
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

export const buildDatasetMetadataMap = (
  datasets: NormalizedDataset[],
): Map<string, DatasetMetadata> => {
  const map = new Map<string, DatasetMetadata>()

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

  return map
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

    // Build dataset metadata map
    const metadataMap = buildDatasetMetadataMap(detail.summary.datasets)

    // Invert molTable -> Dataset
    const invertedMap = await invertMolTableToDataset(detail.molecularData)

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

      const dataset: TransformedDataset = {
        datasetId,
        lang,
        version,
        versionReleaseDate,
        humId,
        humVersionId,
        typeOfData: metadata?.typeOfData ?? null,
        criteria: convertCriteriaToDisplay(metadata?.criteria ?? null, lang),
        releaseDate: metadata?.releaseDate ?? null,
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

        const dataset: TransformedDataset = {
          datasetId,
          lang,
          version,
          versionReleaseDate,
          humId,
          humVersionId,
          typeOfData: summaryDataset.typeOfData ?? null,
          criteria: convertCriteriaToDisplay(summaryDataset.criteria, lang),
          releaseDate: summaryDataset.releaseDate,
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
    title: "", // Will be filled from home page or summary
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

// === CLI ===

const parseArgs = (): CrawlArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string" })
    .option("lang", { choices: ["ja", "en"] as const })
    .option("no-cache", { type: "boolean", default: false })
    .option("concurrency", { type: "number", default: 4 })
    .parseSync()

const main = async (): Promise<void> => {
  const args = parseArgs()
  const useCache = !args.noCache
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]
  const humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)

  console.log(`Transforming ${humIds.length} humIds for languages: ${langs.join(", ")}`)

  await transformAll(humIds, langs, {
    noCache: args.noCache,
    concurrency: args.concurrency,
  })

  // Save JGA relation cache to file
  saveJgaCache()

  console.log("Done!")
}

if (import.meta.main) {
  await main()
}
