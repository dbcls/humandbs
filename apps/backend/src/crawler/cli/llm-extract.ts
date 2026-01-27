/**
 * LLM Field Extraction
 *
 * Extracts structured fields from EnrichedDataset using Ollama LLM
 * Reads from enriched-json and outputs to extracted-unified
 *
 * Process:
 * 1. Copy enriched-json -> extracted-unified (or skip with --skip-copy)
 * 2. For each dataset (latest version only), extract fields using LLM
 * 3. Add searchable aggregated fields
 * 4. Support --resume to continue from where it left off
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getOllamaConfig, type OllamaConfig } from "@/crawler/llm/client"
import {
  aggregateToSearchable,
  processExperimentsParallel,
} from "@/crawler/llm/extract"
import type {
  EnrichedDataset,
  SearchableDataset,
} from "@/crawler/types"
import { getErrorMessage } from "@/crawler/utils/error"
import { getResultsDir } from "@/crawler/utils/io"
import { logger, setLogLevel } from "@/crawler/utils/logger"

// Resume Progress Tracking

interface ExtractionProgress {
  totalExperiments: number
  status: "completed"
}

interface SearchableDatasetWithProgress extends SearchableDataset {
  _extractionProgress?: ExtractionProgress
}

// I/O

const getEnrichedJsonDir = (): string => {
  return join(getResultsDir(), "enriched-json", "dataset")
}

const getExtractedUnifiedDir = (): string => {
  const dir = join(getResultsDir(), "extracted-unified", "dataset")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Copy enriched-json to extracted-unified (if not already exists)
 */
const copyEnrichedToExtracted = (force = false): void => {
  const srcBase = join(getResultsDir(), "enriched-json")
  const dstBase = join(getResultsDir(), "extracted-unified")

  if (!existsSync(srcBase)) {
    logger.error("Error: enriched-json directory does not exist")
    logger.error("Please run enrich-unified first")
    process.exit(1)
  }

  if (existsSync(dstBase) && !force) {
    logger.info("extracted-unified directory already exists (use --force to overwrite)")
    return
  }

  logger.info("Copying enriched-json to extracted-unified...")
  cpSync(srcBase, dstBase, { recursive: true })
  logger.info("Copy completed")
}

const readEnrichedDataset = (filename: string): EnrichedDataset | null => {
  const filePath = join(getEnrichedJsonDir(), filename)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf8"))
  } catch (error) {
    logger.error("Failed to read enriched dataset", { filename, error: getErrorMessage(error) })
    return null
  }
}

const readExtractedDataset = (filename: string): SearchableDatasetWithProgress | null => {
  const filePath = join(getExtractedUnifiedDir(), filename)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf8"))
  } catch (error) {
    logger.error("Failed to read extracted dataset", { filename, error: getErrorMessage(error) })
    return null
  }
}

const writeExtractedDataset = (filename: string, data: SearchableDatasetWithProgress): void => {
  const dir = getExtractedUnifiedDir()
  const filePath = join(dir, filename)
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// Dataset Processing

/** Parse version number from version string (e.g., "v3" -> 3) */
const parseVersionNumber = (version: string): number => {
  const match = version.match(/^v(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/** Get list of enriched dataset files */
const listEnrichedDatasetFiles = (): string[] => {
  const dir = getEnrichedJsonDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith(".json"))
}

/** Parse datasetId and version from filename (e.g., "JGAD000001-v1.json" -> { datasetId: "JGAD000001", version: "v1" }) */
const parseFilename = (filename: string): { datasetId: string; version: string } | null => {
  const match = filename.match(/^(.+)-(v\d+)\.json$/)
  if (!match) return null
  return { datasetId: match[1], version: match[2] }
}

/** Filter to keep only the latest version of each dataset */
const filterLatestVersions = (files: string[]): string[] => {
  const datasetVersions = new Map<string, { version: string; versionNum: number; filename: string }[]>()

  for (const filename of files) {
    const parsed = parseFilename(filename)
    if (!parsed) continue

    const versionNum = parseVersionNumber(parsed.version)
    const existing = datasetVersions.get(parsed.datasetId) ?? []
    existing.push({ version: parsed.version, versionNum, filename })
    datasetVersions.set(parsed.datasetId, existing)
  }

  const result: string[] = []
  for (const versions of datasetVersions.values()) {
    // Sort by version number descending and take the first (latest)
    versions.sort((a, b) => b.versionNum - a.versionNum)
    result.push(versions[0].filename)
  }

  return result.sort()
}

/** Process a single dataset with resume support (dataset-level) */
const processDataset = async (
  filename: string,
  options: { dryRun: boolean; force: boolean; experimentConcurrency: number; ollamaConfig?: OllamaConfig },
): Promise<void> => {
  const { dryRun, force, experimentConcurrency, ollamaConfig } = options
  const parsed = parseFilename(filename)
  if (!parsed) {
    logger.error("Invalid filename format", { filename })
    return
  }

  const { datasetId, version } = parsed
  logger.info("Processing dataset", { datasetId, version })

  // Check for existing progress (dataset-level resume)
  const existing = readExtractedDataset(filename)
  const progress = existing?._extractionProgress

  // Skip if already completed (unless --force)
  if (progress?.status === "completed" && !force) {
    logger.info("Skipped: already completed", { filename })
    return
  }

  // Read source data (from enriched-json)
  const enriched = readEnrichedDataset(filename)
  if (!enriched) {
    logger.error("Failed to read enriched dataset", { filename })
    return
  }

  const totalExperiments = enriched.experiments.length
  logger.debug("Dataset experiments", { totalExperiments, experimentConcurrency })

  // Process all experiments in parallel batches
  const experiments = await processExperimentsParallel(
    enriched.experiments,
    enriched.originalMetadata ?? null,
    experimentConcurrency,
    dryRun,
    ollamaConfig,
  )

  // Aggregate and save
  const searchable = aggregateToSearchable(experiments)

  const finalResult: SearchableDatasetWithProgress = {
    ...enriched,
    searchable,
    experiments,
    _extractionProgress: {
      totalExperiments,
      status: "completed",
    },
  }

  if (!dryRun) {
    writeExtractedDataset(filename, finalResult)
    logger.info("Saved dataset", { output: `extracted-unified/dataset/${filename}` })
  } else {
    logger.info("[dry-run] Would save dataset", { output: `extracted-unified/dataset/${filename}` })
    logger.debug("Searchable fields", { searchable })
  }
}

// CLI

interface ExtractArgs {
  file?: string
  humId?: string[]
  datasetId?: string[]
  model?: string
  concurrency?: number
  experimentConcurrency?: number
  dryRun?: boolean
  force?: boolean
  skipCopy?: boolean
  latestOnly?: boolean
  verbose?: boolean
  quiet?: boolean
}

const parseArgs = (): ExtractArgs => {
  const args = yargs(hideBin(process.argv))
    .option("file", { alias: "f", type: "string", description: "Process single file (by datasetId)" })
    .option("hum-id", { alias: "i", type: "array", string: true, description: "Process datasets for specified humIds" })
    .option("dataset-id", { alias: "d", type: "array", string: true, description: "Process specific datasetIds" })
    .option("model", { alias: "m", type: "string", description: "Ollama model name (e.g. llama3.3:70b)" })
    .option("concurrency", { alias: "c", type: "number", default: 4, description: "Concurrent dataset processing" })
    .option("experiment-concurrency", { alias: "e", type: "number", default: 4, description: "Concurrent experiment LLM calls per dataset" })
    .option("dry-run", { type: "boolean", default: false, description: "Dry run without LLM calls" })
    .option("force", { type: "boolean", default: false, description: "Force reprocess even if already completed" })
    .option("skip-copy", { type: "boolean", default: false, description: "Skip copying enriched-json to extracted-unified" })
    .option("latest-only", { type: "boolean", default: true, description: "Process only the latest version of each dataset" })
    .option("verbose", { alias: "v", type: "boolean", default: false, description: "Show debug logs" })
    .option("quiet", { alias: "q", type: "boolean", default: false, description: "Show only warnings and errors" })
    .parseSync() as ExtractArgs

  if (args.verbose) {
    setLogLevel("debug")
  } else if (args.quiet) {
    setLogLevel("warn")
  }

  return args
}

const main = async (): Promise<void> => {
  const args = parseArgs()

  const ollamaConfig: OllamaConfig = {
    ...getOllamaConfig(),
    ...(args.model ? { model: args.model } : {}),
  }
  logger.info("Ollama configuration", { api: ollamaConfig.baseUrl, model: ollamaConfig.model })

  const dryRun = args.dryRun ?? false
  const concurrency = args.concurrency ?? 1
  const experimentConcurrency = args.experimentConcurrency ?? 8
  const latestOnly = args.latestOnly ?? true
  const force = args.force ?? false

  logger.debug("Concurrency settings", { datasetConcurrency: concurrency, experimentConcurrency })

  if (!args.skipCopy) {
    copyEnrichedToExtracted(args.force)
  }

  // Get list of dataset files
  let files = listEnrichedDatasetFiles()

  // Filter by specific file
  if (args.file) {
    const targetFile = args.file.endsWith(".json") ? args.file : `${args.file}.json`
    files = files.filter(f => f === targetFile || f.startsWith(args.file!))
  }

  // Filter by humId
  if (args.humId && args.humId.length > 0) {
    const humIdSet = new Set(args.humId)
    files = files.filter(f => {
      const data = readEnrichedDataset(f)
      return data && humIdSet.has(data.humId)
    })
  }

  // Filter by datasetId
  if (args.datasetId && args.datasetId.length > 0) {
    const datasetIdSet = new Set(args.datasetId)
    files = files.filter(f => {
      const parsed = parseFilename(f)
      return parsed && datasetIdSet.has(parsed.datasetId)
    })
  }

  // Filter to latest versions only
  if (latestOnly) {
    files = filterLatestVersions(files)
  }

  if (files.length === 0) {
    logger.info("No datasets to process")
    return
  }

  logger.info("Starting extraction", { datasetCount: files.length })

  // Process datasets with concurrency
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    await Promise.all(batch.map(f => processDataset(f, { dryRun, force, experimentConcurrency, ollamaConfig })))
  }

  const outputDir = join(getResultsDir(), "extracted-unified")
  logger.info("Completed", { outputDir })
}

if (import.meta.main) {
  await main()
}
