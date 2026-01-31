/**
 * TSV Import
 *
 * Imports manually edited TSV files back into JSON format
 * Merges TSV changes into structured-json JSON files (in-place update)
 * Uses Unified (ja/en integrated) data format
 *
 * Process:
 * 1. Read TSV files
 * 2. Merge TSV edits into structured-json JSON files
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import type {
  BilingualText,
  BilingualTextValue,
  CriteriaCanonical,
  DiseaseInfo,
  Person,
  Grant,
  Publication,
  Research,
  ResearchProject,
  ResearchVersion,
  SearchableDataset,
  SearchableExperimentFields,
  HealthStatus,
  SubjectCountType,
  ReadType,
  Sex,
  AgeGroup,
  VariantCounts,
  TextValue,
} from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getResultsDir } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"
import {
  parseTsv,
  parseJsonField,
  parseNumberOrNull,
  parseBooleanOrNull,
  type TsvRow,
} from "@/crawler/utils/tsv"

// Directory Functions

const getTsvDir = (): string => {
  return join(getResultsDir(), "tsv")
}

const getStructuredDir = (type: "research" | "research-version" | "dataset"): string => {
  return join(getResultsDir(), "structured-json", type)
}

// Read/Write JSON

const readJsonFile = <T>(filePath: string): T | null => {
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as T
}

const writeJsonFile = (filePath: string, data: unknown): void => {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// Parse Helpers

const parseBilingualText = (ja: string, en: string): BilingualText => {
  return {
    ja: ja || null,
    en: en || null,
  }
}

const parseBilingualTextValue = (
  jaText: string,
  enText: string,
  existing?: BilingualTextValue | null,
): BilingualTextValue => {
  return {
    ja: jaText ? { text: jaText, rawHtml: existing?.ja?.rawHtml ?? "" } : null,
    en: enText ? { text: enText, rawHtml: existing?.en?.rawHtml ?? "" } : null,
  }
}

const parseDisease = (str: string): DiseaseInfo | null => {
  if (!str) return null
  // Format: "label(icd10)" or just "label"
  const match = str.match(/^(.+?)\(([^)]+)\)$/)
  if (match) {
    return { label: match[1], icd10: match[2] }
  }
  return { label: str, icd10: null }
}

// Import Research TSV

export const importResearchTsv = (): void => {
  logger.info("Importing research.tsv...")

  const tsvPath = join(getTsvDir(), "research.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: research.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  const structuredDir = getStructuredDir("research")
  let updated = 0

  for (const row of rows) {
    const filename = `${row.humId}.json`
    const filePath = join(structuredDir, filename)

    const research = readJsonFile<Research>(filePath)
    if (!research) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Update editable fields only
    research.title = parseBilingualText(row.title_ja ?? "", row.title_en ?? "")

    writeJsonFile(filePath, research)
    updated++
  }

  logger.info("Updated research files", { count: updated })
}

// Import Research Summary TSV

export const importResearchSummaryTsv = (): void => {
  logger.info("Importing research-summary.tsv...")

  const tsvPath = join(getTsvDir(), "research-summary.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: research-summary.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  const structuredDir = getStructuredDir("research")
  let updated = 0

  for (const row of rows) {
    const filename = `${row.humId}.json`
    const filePath = join(structuredDir, filename)

    const research = readJsonFile<Research>(filePath)
    if (!research) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Update editable fields only
    research.summary.aims = parseBilingualTextValue(
      row.aims_ja ?? "",
      row.aims_en ?? "",
      research.summary.aims,
    )
    research.summary.methods = parseBilingualTextValue(
      row.methods_ja ?? "",
      row.methods_en ?? "",
      research.summary.methods,
    )
    research.summary.targets = parseBilingualTextValue(
      row.targets_ja ?? "",
      row.targets_en ?? "",
      research.summary.targets,
    )

    // Parse footers (JSON array of strings)
    const footersJa = parseJsonField<string[]>(row.footers_ja, [])
    const footersEn = parseJsonField<string[]>(row.footers_en, [])
    research.summary.footers = {
      ja: footersJa.map((text): TextValue => ({ text, rawHtml: "" })),
      en: footersEn.map((text): TextValue => ({ text, rawHtml: "" })),
    }

    writeJsonFile(filePath, research)
    updated++
  }

  logger.info("Updated research-summary files", { count: updated })
}

// Import Data Provider TSV

export const importDataProviderTsv = (): void => {
  logger.info("Importing research-data-provider.tsv...")

  const tsvPath = join(getTsvDir(), "research-data-provider.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: research-data-provider.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  // Group by humId
  const groupedRows = new Map<string, TsvRow[]>()
  for (const row of rows) {
    const key = row.humId
    const existing = groupedRows.get(key) ?? []
    existing.push(row)
    groupedRows.set(key, existing)
  }

  const structuredDir = getStructuredDir("research")
  let updated = 0

  for (const [humId, dpRows] of groupedRows) {
    const filename = `${humId}.json`
    const filePath = join(structuredDir, filename)

    const research = readJsonFile<Research>(filePath)
    if (!research) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Sort by index and rebuild array
    dpRows.sort((a, b) => parseInt(a.index ?? "0") - parseInt(b.index ?? "0"))

    const newDataProviders: Person[] = dpRows.map(row => ({
      name: parseBilingualTextValue(row.name_ja ?? "", row.name_en ?? ""),
      email: row.email || null,
      orcid: row.orcid || null,
      organization: (row.organization_name_ja || row.organization_name_en || row.organization_country)
        ? {
            name: parseBilingualTextValue(row.organization_name_ja ?? "", row.organization_name_en ?? ""),
            address: row.organization_country ? { country: row.organization_country } : null,
          }
        : null,
    }))

    research.dataProvider = newDataProviders
    writeJsonFile(filePath, research)
    updated++
  }

  logger.info("Updated research-data-provider files", { count: updated })
}

// Import Grant TSV

export const importGrantTsv = (): void => {
  logger.info("Importing research-grant.tsv...")

  const tsvPath = join(getTsvDir(), "research-grant.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: research-grant.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  // Group by humId
  const groupedRows = new Map<string, TsvRow[]>()
  for (const row of rows) {
    const key = row.humId
    const existing = groupedRows.get(key) ?? []
    existing.push(row)
    groupedRows.set(key, existing)
  }

  const structuredDir = getStructuredDir("research")
  let updated = 0

  for (const [humId, grantRows] of groupedRows) {
    const filename = `${humId}.json`
    const filePath = join(structuredDir, filename)

    const research = readJsonFile<Research>(filePath)
    if (!research) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Sort by index and rebuild array
    grantRows.sort((a, b) => parseInt(a.index ?? "0") - parseInt(b.index ?? "0"))

    const newGrants: Grant[] = grantRows.map(row => ({
      id: parseJsonField<string[]>(row.grantId, []),
      title: parseBilingualText(row.title_ja ?? "", row.title_en ?? ""),
      agency: {
        name: parseBilingualText(row.agency_name_ja ?? "", row.agency_name_en ?? ""),
      },
    }))

    research.grant = newGrants
    writeJsonFile(filePath, research)
    updated++
  }

  logger.info("Updated research-grant files", { count: updated })
}

// Import Publication TSV

export const importPublicationTsv = (): void => {
  logger.info("Importing research-publication.tsv...")

  const tsvPath = join(getTsvDir(), "research-publication.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: research-publication.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  // Group by humId
  const groupedRows = new Map<string, TsvRow[]>()
  for (const row of rows) {
    const key = row.humId
    const existing = groupedRows.get(key) ?? []
    existing.push(row)
    groupedRows.set(key, existing)
  }

  // Update each research file
  const structuredDir = getStructuredDir("research")
  let updated = 0

  for (const [humId, pubRows] of groupedRows) {
    const filename = `${humId}.json`
    const filePath = join(structuredDir, filename)

    const research = readJsonFile<Research>(filePath)
    if (!research) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Sort by index and rebuild array
    pubRows.sort((a, b) => parseInt(a.index ?? "0") - parseInt(b.index ?? "0"))

    // Preserve datasetIds from existing publications (keyed by index)
    const existingDatasetIds = new Map<number, string[]>()
    for (let i = 0; i < research.relatedPublication.length; i++) {
      existingDatasetIds.set(i, research.relatedPublication[i].datasetIds ?? [])
    }

    const newPubs: Publication[] = pubRows.map((row, i) => ({
      title: parseBilingualText(row.title_ja ?? "", row.title_en ?? ""),
      doi: row.doi || null,
      // Preserve existing datasetIds (not editable via TSV)
      datasetIds: existingDatasetIds.get(parseInt(row.index ?? String(i))) ?? [],
    }))

    research.relatedPublication = newPubs
    writeJsonFile(filePath, research)
    updated++
  }

  logger.info("Updated research-publication files", { count: updated })
}

// Import Research Project TSV

export const importResearchProjectTsv = (): void => {
  logger.info("Importing research-project.tsv...")

  const tsvPath = join(getTsvDir(), "research-project.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: research-project.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  // Group by humId
  const groupedRows = new Map<string, TsvRow[]>()
  for (const row of rows) {
    const key = row.humId
    const existing = groupedRows.get(key) ?? []
    existing.push(row)
    groupedRows.set(key, existing)
  }

  const structuredDir = getStructuredDir("research")
  let updated = 0

  for (const [humId, projectRows] of groupedRows) {
    const filename = `${humId}.json`
    const filePath = join(structuredDir, filename)

    const research = readJsonFile<Research>(filePath)
    if (!research) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Sort by index and rebuild array
    projectRows.sort((a, b) => parseInt(a.index ?? "0") - parseInt(b.index ?? "0"))

    const newProjects: ResearchProject[] = projectRows.map(row => ({
      name: parseBilingualTextValue(row.name_ja ?? "", row.name_en ?? ""),
      url: (row.project_url_ja || row.project_url_en)
        ? {
            ja: row.project_url_ja ? { url: row.project_url_ja, text: "", rawHtml: "" } : null,
            en: row.project_url_en ? { url: row.project_url_en, text: "", rawHtml: "" } : null,
          }
        : null,
    }))

    research.researchProject = newProjects
    writeJsonFile(filePath, research)
    updated++
  }

  logger.info("Updated research-project files", { count: updated })
}

// Import Controlled Access User TSV

export const importCauTsv = (): void => {
  logger.info("Importing research-cau.tsv...")

  const tsvPath = join(getTsvDir(), "research-cau.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: research-cau.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  // Group by humId
  const groupedRows = new Map<string, TsvRow[]>()
  for (const row of rows) {
    const key = row.humId
    const existing = groupedRows.get(key) ?? []
    existing.push(row)
    groupedRows.set(key, existing)
  }

  const structuredDir = getStructuredDir("research")
  let updated = 0

  for (const [humId, cauRows] of groupedRows) {
    const filename = `${humId}.json`
    const filePath = join(structuredDir, filename)

    const research = readJsonFile<Research>(filePath)
    if (!research) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Sort by index and rebuild array
    cauRows.sort((a, b) => parseInt(a.index ?? "0") - parseInt(b.index ?? "0"))

    // Preserve datasetIds from existing CAUs (keyed by index)
    const existingDatasetIds = new Map<number, string[]>()
    for (let i = 0; i < research.controlledAccessUser.length; i++) {
      existingDatasetIds.set(i, research.controlledAccessUser[i].datasetIds ?? [])
    }

    const newCaus: Person[] = cauRows.map((row, i) => ({
      name: parseBilingualTextValue(row.name_ja ?? "", row.name_en ?? ""),
      organization: (row.organization_name_ja || row.organization_name_en || row.organization_country)
        ? {
            name: parseBilingualTextValue(row.organization_name_ja ?? "", row.organization_name_en ?? ""),
            address: row.organization_country ? { country: row.organization_country } : null,
          }
        : null,
      researchTitle: parseBilingualText(row.researchTitle_ja ?? "", row.researchTitle_en ?? ""),
      // Preserve existing datasetIds (not editable via TSV)
      datasetIds: existingDatasetIds.get(parseInt(row.index ?? String(i))) ?? [],
      periodOfDataUse: (row.periodOfDataUse_start || row.periodOfDataUse_end)
        ? {
            startDate: row.periodOfDataUse_start || null,
            endDate: row.periodOfDataUse_end || null,
          }
        : null,
    }))

    research.controlledAccessUser = newCaus
    writeJsonFile(filePath, research)
    updated++
  }

  logger.info("Updated research-cau files", { count: updated })
}

// Import Research Version TSV

export const importResearchVersionTsv = (): void => {
  logger.info("Importing research-version.tsv...")

  const tsvPath = join(getTsvDir(), "research-version.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: research-version.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  const structuredDir = getStructuredDir("research-version")
  let updated = 0

  for (const row of rows) {
    const filename = `${row.humVersionId}.json`
    const filePath = join(structuredDir, filename)

    const version = readJsonFile<ResearchVersion>(filePath)
    if (!version) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Update editable fields only
    version.releaseNote = parseBilingualTextValue(
      row.releaseNote_ja ?? "",
      row.releaseNote_en ?? "",
      version.releaseNote,
    )

    writeJsonFile(filePath, version)
    updated++
  }

  logger.info("Updated research-version files", { count: updated })
}

// Import Dataset TSV

export const importDatasetTsv = (): void => {
  logger.info("Importing dataset.tsv...")

  const tsvPath = join(getTsvDir(), "dataset.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: dataset.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  const structuredDir = getStructuredDir("dataset")
  let updated = 0

  for (const row of rows) {
    const filename = `${row.datasetId}-${row.version}.json`
    const filePath = join(structuredDir, filename)

    const dataset = readJsonFile<SearchableDataset>(filePath)
    if (!dataset) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Update editable fields
    dataset.typeOfData = parseBilingualText(row.typeOfData_ja ?? "", row.typeOfData_en ?? "")

    // criteria is a single value (not array)
    const criteriaValue = row.criteria as CriteriaCanonical | undefined
    if (criteriaValue) {
      dataset.criteria = criteriaValue
    }

    // releaseDate is a single value (not array)
    if (row.releaseDate) {
      dataset.releaseDate = row.releaseDate
    }

    writeJsonFile(filePath, dataset)
    updated++
  }

  logger.info("Updated dataset files", { count: updated })
}

// Import Experiment TSV

export const importExperimentTsv = (): void => {
  logger.info("Importing experiment.tsv...")

  const tsvPath = join(getTsvDir(), "experiment.tsv")
  if (!existsSync(tsvPath)) {
    logger.info("Skipped: experiment.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  // Group by dataset file
  const groupedRows = new Map<string, TsvRow[]>()
  for (const row of rows) {
    const filename = `${row.datasetId}-${row.version}.json`
    const existing = groupedRows.get(filename) ?? []
    existing.push(row)
    groupedRows.set(filename, existing)
  }

  const structuredDir = getStructuredDir("dataset")
  let updated = 0

  for (const [filename, expRows] of groupedRows) {
    const filePath = join(structuredDir, filename)

    const dataset = readJsonFile<SearchableDataset>(filePath)
    if (!dataset) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Sort rows by experimentIndex
    expRows.sort((a, b) => parseInt(a.experimentIndex ?? "0") - parseInt(b.experimentIndex ?? "0"))

    // Update experiments
    for (const row of expRows) {
      const index = parseInt(row.experimentIndex ?? "0")
      if (index >= 0 && index < dataset.experiments.length) {
        const exp = dataset.experiments[index]

        // Update header (editable)
        exp.header = parseBilingualTextValue(
          row.header_ja ?? "",
          row.header_en ?? "",
          exp.header,
        )

        // Parse diseases from JSON array of strings like ["label(icd10)", "label2"]
        const diseasesRaw = parseJsonField<string[]>(row.searchable_diseases, [])
        const diseases = diseasesRaw
          .map(parseDisease)
          .filter((d): d is DiseaseInfo => d !== null)

        const searchable: SearchableExperimentFields = {
          subjectCount: parseNumberOrNull(row.searchable_subjectCount),
          subjectCountType: (row.searchable_subjectCountType as SubjectCountType) || null,
          healthStatus: (row.searchable_healthStatus as HealthStatus) || null,
          diseases,
          tissues: parseJsonField<string[]>(row.searchable_tissues, []),
          isTumor: parseBooleanOrNull(row.searchable_isTumor),
          cellLine: row.searchable_cellLine || null,
          population: row.searchable_population || null,
          sex: (row.searchable_sex as Sex) || null,
          ageGroup: (row.searchable_ageGroup as AgeGroup) || null,
          assayType: row.searchable_assayType || null,
          libraryKits: parseJsonField<string[]>(row.searchable_libraryKits, []),
          platformVendor: row.searchable_platformVendor || null,
          platformModel: row.searchable_platformModel || null,
          readType: (row.searchable_readType as ReadType) || null,
          readLength: parseNumberOrNull(row.searchable_readLength),
          sequencingDepth: parseNumberOrNull(row.searchable_sequencingDepth),
          targetCoverage: parseNumberOrNull(row.searchable_targetCoverage),
          referenceGenome: row.searchable_referenceGenome || null,
          variantCounts: parseJsonField<VariantCounts | null>(row.searchable_variantCounts, null),
          hasPhenotypeData: parseBooleanOrNull(row.searchable_hasPhenotypeData),
          targets: row.searchable_targets || null,
          fileTypes: parseJsonField<string[]>(row.searchable_fileTypes, []),
          processedDataTypes: parseJsonField<string[]>(row.searchable_processedDataTypes, []),
          dataVolumeGb: parseNumberOrNull(row.searchable_dataVolumeGb),
          // Policies are rule-based (not LLM), preserved from existing searchable or empty
          policies: exp.searchable?.policies ?? [],
        }

        exp.searchable = searchable
      }
    }

    writeJsonFile(filePath, dataset)
    updated++
  }

  logger.info("Updated dataset files", { count: updated })
}

// Verify structured-json directory exists

const verifyStructuredJsonExists = (): boolean => {
  const srcBase = join(getResultsDir(), "structured-json")

  if (!existsSync(srcBase)) {
    logger.error("Error: structured-json directory does not exist")
    logger.error("Please run crawler:structure first")
    return false
  }

  // Check subdirectories
  const requiredDirs = ["research", "research-version", "dataset"]
  for (const dir of requiredDirs) {
    const dirPath = join(srcBase, dir)
    if (!existsSync(dirPath)) {
      logger.error(`Error: structured-json/${dir} directory does not exist`)
      return false
    }
  }

  return true
}

// Import All

export const importAllTsv = (): void => {
  logger.info("Starting TSV import...")

  // Verify structured-json exists
  if (!verifyStructuredJsonExists()) {
    process.exit(1)
  }

  const tsvDir = getTsvDir()
  if (!existsSync(tsvDir)) {
    logger.info("TSV directory not found. Nothing to import.")
    return
  }

  // List available TSV files
  const tsvFiles = readdirSync(tsvDir).filter(f => f.endsWith(".tsv"))
  logger.info("Found TSV files", { files: tsvFiles })

  // Import research-related TSV files
  importResearchTsv()
  importResearchSummaryTsv()
  importDataProviderTsv()
  importGrantTsv()
  importPublicationTsv()
  importResearchProjectTsv()
  importCauTsv()

  // Import research version TSV
  importResearchVersionTsv()

  // Import dataset and experiment TSV
  importDatasetTsv()
  importExperimentTsv()

  const outputDir = join(getResultsDir(), "structured-json")
  logger.info("Completed", { outputDir })
}

// CLI

interface CliArgs {
  verbose?: boolean
  quiet?: boolean
}

const parseArgs = (): CliArgs => {
  const args = withCommonOptions(
    yargs(hideBin(process.argv)),
  ).parseSync() as CliArgs

  applyLogLevel(args)
  return args
}

const main = (): void => {
  parseArgs()
  importAllTsv()
}

if (import.meta.main) {
  main()
}
