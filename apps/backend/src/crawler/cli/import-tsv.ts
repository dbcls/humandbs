/**
 * TSV Import
 *
 * Imports manually edited TSV files back into JSON format
 * Merges TSV changes into extracted-json JSON files and outputs to final/ directory
 * Uses Unified (ja/en integrated) data format
 *
 * Process:
 * 1. Copy extracted-json → final
 * 2. Read TSV files
 * 3. Merge TSV edits into final JSON files
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import type {
  BilingualText,
  CriteriaCanonical,
  DiseaseInfo,
  DataVolume,
  DataVolumeUnit,
  Research,
  Publication,
  RefinedDataset,
  RefinedExperimentFields,
  HealthStatus,
  SubjectCountType,
  ReadType,
} from "@/crawler/types"
import { getResultsDir } from "@/crawler/utils/io"
import { logger, setLogLevel } from "@/crawler/utils/logger"
import {
  parseTsv,
  parseJsonField,
  parseJsonFieldOrNull,
  parseNumberOrNull,
  parseBooleanOrNull,
  type TsvRow,
} from "@/crawler/utils/tsv"

// Directory Functions

const getTsvDir = (): string => {
  return join(getResultsDir(), "tsv")
}

const getFinalDir = (type: "research" | "research-version" | "dataset"): string => {
  const dir = join(getResultsDir(), "final", type)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Copy extracted-json to final (if not already exists)
 */
export const copyExtractedToFinal = (force = false): void => {
  const srcBase = join(getResultsDir(), "extracted-json")
  const dstBase = join(getResultsDir(), "final")

  if (!existsSync(srcBase)) {
    logger.error("Error: extracted-json directory does not exist")
    logger.error("Please run extract-fields-unified first")
    process.exit(1)
  }

  if (existsSync(dstBase) && !force) {
    logger.info("final directory already exists (use --force to overwrite)")
    return
  }

  logger.info("Copying extracted-json to final...")
  cpSync(srcBase, dstBase, { recursive: true })
  logger.info("Copy completed")
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

const parseDisease = (str: string): DiseaseInfo | null => {
  if (!str) return null
  // Format: "label(icd10)" or just "label"
  const match = str.match(/^(.+?)\(([^)]+)\)$/)
  if (match) {
    return { label: match[1], icd10: match[2] }
  }
  return { label: str, icd10: null }
}

const parseDataVolume = (str: string): DataVolume | null => {
  if (!str) return null
  // Format: "123.45 GB" or "1.2 TB"
  const match = str.match(/^([\d.]+)\s*(KB|MB|GB|TB)$/i)
  if (match) {
    return {
      value: parseFloat(match[1]),
      unit: match[2].toUpperCase() as DataVolumeUnit,
    }
  }
  return null
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
  const finalDir = getFinalDir("research")
  let updated = 0

  for (const [humId, pubRows] of groupedRows) {
    const filename = `${humId}.json`
    const filePath = join(finalDir, filename)

    const research = readJsonFile<Research>(filePath)
    if (!research) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Build new publications array
    const newPubs: Publication[] = pubRows.map(row => ({
      title: parseBilingualText(row.title_ja ?? "", row.title_en ?? ""),
      doi: row.doi || null,
      datasetIds: parseJsonField<string[]>(row.datasetIds, []),
    }))

    research.relatedPublication = newPubs
    writeJsonFile(filePath, research)
    updated++
  }

  logger.info("Updated research files", { count: updated })
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

  const finalDir = getFinalDir("dataset")
  let updated = 0

  for (const row of rows) {
    const filename = `${row.datasetId}-${row.version}.json`
    const filePath = join(finalDir, filename)

    const dataset = readJsonFile<RefinedDataset>(filePath)
    if (!dataset) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Update bilingual fields
    dataset.typeOfData = parseBilingualText(row.typeOfData_ja ?? "", row.typeOfData_en ?? "")
    dataset.criteria = parseJsonFieldOrNull<CriteriaCanonical[]>(row.criteria) ?? []
    dataset.releaseDate = parseJsonFieldOrNull<string[]>(row.releaseDate) ?? []

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

  const finalDir = getFinalDir("dataset")
  let updated = 0

  for (const [filename, expRows] of groupedRows) {
    const filePath = join(finalDir, filename)

    const dataset = readJsonFile<RefinedDataset>(filePath)
    if (!dataset) {
      logger.warn("Skipped: file not found", { filename })
      continue
    }

    // Sort rows by experimentIndex
    expRows.sort((a, b) => parseInt(a.experimentIndex) - parseInt(b.experimentIndex))

    // Update experiments
    for (const row of expRows) {
      const index = parseInt(row.experimentIndex)
      if (index >= 0 && index < dataset.experiments.length) {
        const exp = dataset.experiments[index]

        // Parse diseases from JSON array of strings like ["label(icd10)", "label2"]
        const diseasesRaw = parseJsonField<string[]>(row.refined_diseases, [])
        const diseases = diseasesRaw
          .map(parseDisease)
          .filter((d): d is DiseaseInfo => d !== null)

        const refined: RefinedExperimentFields = {
          subjectCount: parseNumberOrNull(row.refined_subjectCount),
          subjectCountType: (row.refined_subjectCountType as SubjectCountType) || null,
          healthStatus: (row.refined_healthStatus as HealthStatus) || null,
          diseases,
          tissues: parseJsonField<string[]>(row.refined_tissues, []),
          isTumor: parseBooleanOrNull(row.refined_isTumor),
          cellLine: row.refined_cellLine || null,
          population: row.refined_population || null,
          assayType: row.refined_assayType || null,
          libraryKits: parseJsonField<string[]>(row.refined_libraryKits, []),
          platformVendor: row.refined_platformVendor || null,
          platformModel: row.refined_platformModel || null,
          readType: (row.refined_readType as ReadType) || null,
          readLength: parseNumberOrNull(row.refined_readLength),
          targets: row.refined_targets || null,
          fileTypes: parseJsonField<string[]>(row.refined_fileTypes, []),
          dataVolume: parseDataVolume(row.refined_dataVolume),
          // Policies are rule-based (not LLM), preserved from existing refined or empty
          policies: exp.refined?.policies ?? [],
        }

        exp.refined = refined
      }
    }

    writeJsonFile(filePath, dataset)
    updated++
  }

  logger.info("Updated dataset files", { count: updated })
}

// Import All

export const importAllTsv = (force: boolean): void => {
  logger.info("Starting TSV import...")

  // Step 1: Copy extracted-json to final
  copyExtractedToFinal(force)

  // Step 2: Import TSV files
  const tsvDir = getTsvDir()
  if (!existsSync(tsvDir)) {
    logger.info("TSV directory not found. Nothing to import.")
    return
  }

  importPublicationTsv()
  importDatasetTsv()
  importExperimentTsv()

  const outputDir = join(getResultsDir(), "final")
  logger.info("Completed", { outputDir })
}

// CLI

interface CliArgs {
  force?: boolean
  verbose?: boolean
  quiet?: boolean
}

const parseArgs = (): CliArgs => {
  const args = yargs(hideBin(process.argv))
    .option("force", {
      alias: "f",
      type: "boolean",
      default: false,
      description: "Force overwrite final directory",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      description: "Show debug logs",
    })
    .option("quiet", {
      alias: "q",
      type: "boolean",
      default: false,
      description: "Show only warnings and errors",
    })
    .parseSync() as CliArgs

  if (args.verbose) {
    setLogLevel("debug")
  } else if (args.quiet) {
    setLogLevel("warn")
  }

  return args
}

const main = (): void => {
  const args = parseArgs()
  importAllTsv(args.force ?? false)
}

if (import.meta.main) {
  main()
}
