#!/usr/bin/env bun
/**
 * Structure CLI - Structure normalized JSON into structured output
 *
 * Structures normalized data from crawler-results/normalized-json/ and generates
 * structured JSON in crawler-results/structured-json/
 *
 * Output structure:
 * - structured-json/research/{humId}.json (Research)
 * - structured-json/research-version/{humVersionId}.json (ResearchVersion)
 * - structured-json/dataset/{datasetId}-{version}.json (Dataset)
 *
 * Processing:
 * - Groups normalized files by humId
 * - Merges ja/en to create bilingual output
 * - Handles dataset versioning
 *
 * Usage:
 *   bun run crawler:structure                    # Structure all humIds
 *   bun run crawler:structure --hum-id hum0001   # Structure specific humId only
 */
import { readdirSync } from "fs"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { saveRelationCache } from "@/crawler/api/jga"
import { getReleaseDateOverrideForDataset } from "@/crawler/config/mapping"
import { genDetailUrl } from "@/crawler/config/urls"
import {
  invertMolTableToDataset,
  buildDatasetMetadataMap,
  structureDataProvider,
  structureControlledAccessUsers,
  structureGrants,
  structurePublications,
  structureResearchProjects,
  buildDatasetIdExpansionMap,
  assignBilingualDatasetVersion,
  trackBilingualVersion,
  mergeDataset,
  mergeResearch,
  mergeResearchVersion,
  getIgnoredDatasetIds,
} from "@/crawler/processors/structure"
import type {
  LangType,
  NormalizedParseResult,
  NormalizedMolecularData,
  SingleLangDataset,
  SingleLangExperiment,
  SingleLangResearch,
  SingleLangResearchVersion,
} from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getErrorMessage } from "@/crawler/utils/error"
import {
  getNormalizedDir,
  readNormalizedJson,
  writeStructuredResearch,
  writeStructuredResearchVersion,
  writeStructuredDataset,
} from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// CLI argument types

interface StructureArgs {
  humId?: string
  force?: boolean
  verbose?: boolean
  quiet?: boolean
}

// CLI argument parsing

const parseArgs = (): StructureArgs => {
  const args = withCommonOptions(
    yargs(hideBin(process.argv))
      .option("hum-id", { alias: "i", type: "string", describe: "Target humId (e.g., hum0001)" })
      .option("force", { alias: "f", type: "boolean", default: false, describe: "Overwrite existing files" }),
  ).parseSync() as StructureArgs

  applyLogLevel(args)
  return args
}

// Discover humIds from normalized-json directory

const discoverHumIds = (targetHumId?: string): string[] => {
  const dir = getNormalizedDir()
  const files = readdirSync(dir).filter(f => f.endsWith(".json"))
  const humIds = new Set<string>()

  for (const file of files) {
    const match = file.match(/^(hum\d+)-v\d+-(ja|en)\.json$/)
    if (match) {
      humIds.add(match[1])
    }
  }

  const sorted = Array.from(humIds).sort()

  if (targetHumId) {
    return sorted.filter(h => h === targetHumId)
  }

  return sorted
}

// Group files by humId and version

interface NormalizedFileInfo {
  humVersionId: string
  version: number
  lang: LangType
  data: NormalizedParseResult
}

const loadNormalizedFilesForHumId = (humId: string): Map<string, Map<LangType, NormalizedFileInfo>> => {
  const dir = getNormalizedDir()
  const files = readdirSync(dir).filter(f => f.endsWith(".json"))
  const result = new Map<string, Map<LangType, NormalizedFileInfo>>()

  for (const file of files) {
    const match = file.match(/^(hum\d+)-(v(\d+))-(ja|en)\.json$/)
    if (!match || match[1] !== humId) continue

    const humVersionId = `${match[1]}-${match[2]}`
    const version = parseInt(match[3], 10)
    const lang = match[4] as LangType

    const data = readNormalizedJson<NormalizedParseResult>(humVersionId, lang)
    if (!data) continue

    if (!result.has(humVersionId)) {
      result.set(humVersionId, new Map())
    }

    result.get(humVersionId)!.set(lang, {
      humVersionId,
      version,
      lang,
      data,
    })
  }

  return result
}

// Structure molecular data to experiments

const structureMolDataToExperiment = (
  molData: NormalizedMolecularData,
): SingleLangExperiment => {
  // Convert array values to single values (take first element)
  const normalizedData: Record<string, import("@/crawler/types").TextValue | null> = {}
  for (const [key, value] of Object.entries(molData.data)) {
    if (Array.isArray(value)) {
      normalizedData[key] = value[0] ?? null
    } else {
      normalizedData[key] = value
    }
  }

  return {
    header: molData.id,
    data: normalizedData,
    footers: molData.footers,
  }
}

// Check if datasetId is JGA/DRA type (will be enriched later)

const isEnrichableDatasetId = (datasetId: string): boolean => {
  return /^(JGAD|DRA)\d+/.test(datasetId)
}

// Build single-language dataset

const buildSingleLangDataset = (
  datasetId: string,
  version: string,
  versionReleaseDate: string,
  humId: string,
  humVersionId: string,
  molDataList: NormalizedMolecularData[],
  metadataMap: Map<string, { typeOfData: string | null; criteria: import("@/crawler/types").CriteriaCanonical | null; releaseDate: string | null }>,
  _lang: LangType,
  onValidationError?: () => void,
): SingleLangDataset => {
  const metadata = metadataMap.get(datasetId)

  const releaseDate = metadata?.releaseDate ?? versionReleaseDate
  if (!metadata?.releaseDate) {
    // Check if this is an enrichable dataset (JGA/DRA) or has override
    const hasOverride = getReleaseDateOverrideForDataset(humId, datasetId) !== null
    const isEnrichable = isEnrichableDatasetId(datasetId)

    if (!hasOverride && !isEnrichable) {
      logger.error("Missing releaseDate in metadata without override, using versionReleaseDate as fallback", {
        datasetId,
        humId,
        versionReleaseDate,
      })
      onValidationError?.()
    }
  }

  return {
    datasetId,
    version,
    versionReleaseDate,
    humId,
    humVersionId,
    releaseDate,
    criteria: metadata?.criteria ?? null,
    typeOfData: metadata?.typeOfData ?? null,
    experiments: molDataList.map(structureMolDataToExperiment),
  }
}

// Build single-language research

const buildSingleLangResearch = (
  humId: string,
  normalized: NormalizedParseResult,
  lang: LangType,
  versionIds: string[],
  latestVersion: string,
  firstReleaseDate: string,
  lastReleaseDate: string,
  expansionMap: Map<string, Set<string>>,
): SingleLangResearch => ({
  humId,
  url: genDetailUrl(latestVersion, lang),
  title: normalized.title,
  summary: {
    aims: normalized.summary.aims,
    methods: normalized.summary.methods,
    targets: normalized.summary.targets,
    url: normalized.summary.url,
    footers: normalized.summary.footers,
  },
  dataProvider: structureDataProvider(normalized.dataProvider),
  researchProject: structureResearchProjects(normalized.dataProvider),
  grant: structureGrants(normalized.dataProvider.grants),
  relatedPublication: structurePublications(normalized.publications, expansionMap),
  controlledAccessUser: structureControlledAccessUsers(normalized.controlledAccessUsers, expansionMap),
  versionIds,
  latestVersion,
  firstReleaseDate,
  lastReleaseDate,
})

// Build single-language research version

const buildSingleLangResearchVersion = (
  humVersionId: string,
  humId: string,
  version: string,
  releaseDate: string,
  datasetIds: string[],
  releaseNote: import("@/crawler/types").TextValue | undefined,
): SingleLangResearchVersion => ({
  humId,
  humVersionId,
  version,
  versionReleaseDate: releaseDate,
  releaseDate,
  datasetIds,
  releaseNote: releaseNote ?? { text: "", rawHtml: "" },
})

// Get release date from normalized result

const getReleaseDate = (normalized: NormalizedParseResult, humVersionId: string): string => {
  const release = normalized.releases.find(r => r.humVersionId === humVersionId)
  return release?.releaseDate ?? ""
}

// Get release note from normalized result

const getReleaseNote = (normalized: NormalizedParseResult, humVersionId: string): import("@/crawler/types").TextValue | undefined => {
  const release = normalized.releases.find(r => r.humVersionId === humVersionId)
  return release?.releaseNote
}

// Process one humId

interface ProcessResult {
  researchCreated: boolean
  versionsCreated: number
  datasetsCreated: number
  validationErrors: number
  errors: string[]
}

const processHumId = async (humId: string): Promise<ProcessResult> => {
  const result: ProcessResult = {
    researchCreated: false,
    versionsCreated: 0,
    datasetsCreated: 0,
    validationErrors: 0,
    errors: [],
  }

  const onValidationError = () => { result.validationErrors++ }

  try {
    const filesMap = loadNormalizedFilesForHumId(humId)

    if (filesMap.size === 0) {
      result.errors.push(`No normalized files found for ${humId}`)
      return result
    }

    // Sort versions
    const sortedVersions = Array.from(filesMap.keys()).sort((a, b) => {
      const vA = parseInt(a.match(/-v(\d+)$/)?.[1] ?? "0", 10)
      const vB = parseInt(b.match(/-v(\d+)$/)?.[1] ?? "0", 10)
      return vA - vB
    })

    const latestVersion = sortedVersions[sortedVersions.length - 1]
    const latestFiles = filesMap.get(latestVersion)!

    // Get latest normalized data for each language
    const jaLatest = latestFiles.get("ja")?.data ?? null
    const enLatest = latestFiles.get("en")?.data ?? null

    if (!jaLatest && !enLatest) {
      result.errors.push(`No normalized data found for ${humId}`)
      return result
    }

    const latestData = jaLatest ?? enLatest!

    // Build inverted map for dataset ID expansion
    const jaMolData = jaLatest?.molecularData ?? []
    const enMolData = enLatest?.molecularData ?? []
    const allMolData = [...jaMolData]

    // Add enMolData that doesn't exist in jaMolData (by header)
    const jaHeaders = new Set(jaMolData.map(m => m.id?.text ?? ""))
    for (const mol of enMolData) {
      if (!jaHeaders.has(mol.id?.text ?? "")) {
        allMolData.push(mol)
      }
    }

    const invertedMap = invertMolTableToDataset(allMolData)
    const expansionMap = buildDatasetIdExpansionMap(allMolData, invertedMap)

    // Build metadata map
    const metadataMap = buildDatasetMetadataMap(
      latestData.summary.datasets,
      allMolData,
    )

    // Get ignored dataset IDs
    const ignoredDatasetIds = new Set(getIgnoredDatasetIds(humId))

    // Track dataset versions
    const datasetVersions = new Map<string, { version: string; jaExperiments: SingleLangExperiment[]; enExperiments: SingleLangExperiment[] }[]>()

    // Process each version
    const jaVersions: SingleLangResearchVersion[] = []
    const enVersions: SingleLangResearchVersion[] = []
    let firstReleaseDate = ""
    let lastReleaseDate = ""

    for (const humVersionId of sortedVersions) {
      const versionFiles = filesMap.get(humVersionId)!
      const jaData = versionFiles.get("ja")?.data ?? null
      const enData = versionFiles.get("en")?.data ?? null

      if (!jaData && !enData) continue

      const versionData = jaData ?? enData!
      const releaseDate = getReleaseDate(versionData, humVersionId)

      if (!firstReleaseDate || releaseDate < firstReleaseDate) {
        firstReleaseDate = releaseDate
      }
      if (!lastReleaseDate || releaseDate > lastReleaseDate) {
        lastReleaseDate = releaseDate
      }

      // Get version number
      const versionNum = humVersionId.match(/-v(\d+)$/)?.[1] ?? "1"
      const version = `v${versionNum}`

      // Build dataset-to-molData mapping for this version
      const jaVersionMolData = jaData?.molecularData ?? []
      const enVersionMolData = enData?.molecularData ?? []
      const versionAllMolData = [...jaVersionMolData]

      const jaVersionHeaders = new Set(jaVersionMolData.map(m => m.id?.text ?? ""))
      for (const mol of enVersionMolData) {
        if (!jaVersionHeaders.has(mol.id?.text ?? "")) {
          versionAllMolData.push(mol)
        }
      }

      const versionInvertedMap = invertMolTableToDataset(versionAllMolData)
      const versionDatasetIds: string[] = []

      // Process each dataset
      for (const [datasetId, molDataList] of versionInvertedMap.entries()) {
        if (ignoredDatasetIds.has(datasetId)) continue

        versionDatasetIds.push(datasetId)

        // Get ja/en molData for this dataset
        const jaMolDataForDataset = jaData
          ? molDataList.filter(m => jaVersionMolData.some(jm => jm.id?.text === m.id?.text))
          : []
        const enMolDataForDataset = enData
          ? molDataList.filter(m => enVersionMolData.some(em => em.id?.text === m.id?.text))
          : []

        const jaExperiments = jaMolDataForDataset.map(structureMolDataToExperiment)
        const enExperiments = enMolDataForDataset.map(structureMolDataToExperiment)

        // Assign version
        const datasetVersion = assignBilingualDatasetVersion(
          datasetId,
          jaExperiments,
          enExperiments,
          datasetVersions,
        )

        trackBilingualVersion(datasetId, datasetVersion, jaExperiments, enExperiments, datasetVersions)

        // Build single-language datasets
        const jaSingleLangDataset = jaData
          ? buildSingleLangDataset(datasetId, datasetVersion, releaseDate, humId, humVersionId, jaMolDataForDataset, metadataMap, "ja", onValidationError)
          : null

        const enSingleLangDataset = enData
          ? buildSingleLangDataset(datasetId, datasetVersion, releaseDate, humId, humVersionId, enMolDataForDataset, metadataMap, "en", onValidationError)
          : null

        // Create unified dataset
        const dataset = mergeDataset(
          datasetId,
          datasetVersion,
          releaseDate,
          humId,
          humVersionId,
          jaSingleLangDataset,
          enSingleLangDataset,
        )

        // Write dataset
        writeStructuredDataset(datasetId, datasetVersion, dataset)
        result.datasetsCreated++
      }

      // Build research versions
      const jaReleaseNote = jaData ? getReleaseNote(jaData, humVersionId) : undefined
      const enReleaseNote = enData ? getReleaseNote(enData, humVersionId) : undefined

      if (jaData) {
        jaVersions.push(buildSingleLangResearchVersion(humVersionId, humId, version, releaseDate, versionDatasetIds, jaReleaseNote))
      }
      if (enData) {
        enVersions.push(buildSingleLangResearchVersion(humVersionId, humId, version, releaseDate, versionDatasetIds, enReleaseNote))
      }

      // Write research version
      const jaResearchVersion = jaVersions.find(v => v.humVersionId === humVersionId) ?? null
      const enResearchVersion = enVersions.find(v => v.humVersionId === humVersionId) ?? null

      const researchVersion = mergeResearchVersion(
        humVersionId,
        jaResearchVersion,
        enResearchVersion,
      )

      writeStructuredResearchVersion(humVersionId, researchVersion)
      result.versionsCreated++
    }

    // Build research
    const versionIds = sortedVersions
    const jaLatestResearch = jaLatest
      ? buildSingleLangResearch(humId, jaLatest, "ja", versionIds, latestVersion, firstReleaseDate, lastReleaseDate, expansionMap)
      : null
    const enLatestResearch = enLatest
      ? buildSingleLangResearch(humId, enLatest, "en", versionIds, latestVersion, firstReleaseDate, lastReleaseDate, expansionMap)
      : null

    const research = mergeResearch(humId, jaLatestResearch, enLatestResearch)

    writeStructuredResearch(humId, research)
    result.researchCreated = true

    logger.info("Processed humId", { humId, versions: result.versionsCreated, datasets: result.datasetsCreated })
  } catch (error) {
    result.errors.push(`Failed to process ${humId}: ${getErrorMessage(error)}`)
    logger.error("Failed to process humId", { humId, error: getErrorMessage(error) })
  }

  return result
}

// Main function

const main = async (): Promise<void> => {
  const args = parseArgs()
  const humIds = discoverHumIds(args.humId)

  if (humIds.length === 0) {
    logger.info("No normalized JSON files found. Run 'bun run crawler:normalize' first.")
    return
  }

  logger.info(`Starting structure: ${humIds.length} humId(s)`)

  let totalResearch = 0
  let totalVersions = 0
  let totalDatasets = 0
  let totalValidationErrors = 0
  let totalErrors = 0

  for (let i = 0; i < humIds.length; i++) {
    const humId = humIds[i]
    const result = await processHumId(humId)

    if (result.researchCreated) totalResearch++
    totalVersions += result.versionsCreated
    totalDatasets += result.datasetsCreated
    totalValidationErrors += result.validationErrors
    totalErrors += result.errors.length

    const percent = Math.round(((i + 1) / humIds.length) * 100)
    logger.info(`Progress: ${i + 1}/${humIds.length} humIds (${percent}%)`)
  }

  // Save JGA API cache
  saveRelationCache()

  logger.info("Completed", {
    research: totalResearch,
    versions: totalVersions,
    datasets: totalDatasets,
    validationErrors: totalValidationErrors,
    errors: totalErrors,
  })
}

if (import.meta.main) {
  await main()
}
