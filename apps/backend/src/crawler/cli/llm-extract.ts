/**
 * LLM Field Extraction
 *
 * Extracts structured fields from Dataset using Ollama LLM
 * Updates structured-json in-place with searchable fields
 *
 * Idempotent: skips datasets that already have searchable fields (unless --force)
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getOllamaConfig, type OllamaConfig } from "@/crawler/llm/client"
import {
  isEmptySearchableFields,
  processExperimentsParallel,
} from "@/crawler/llm/extract"
import type {
  EnrichedDataset,
  Experiment,
  SearchableDataset,
} from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getErrorMessage } from "@/crawler/utils/error"
import { getResultsDir } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// I/O

const getStructuredDatasetDir = (): string => {
  return join(getResultsDir(), "structured-json", "dataset")
}

const readDataset = (filename: string): EnrichedDataset | null => {
  const filePath = join(getStructuredDatasetDir(), filename)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf8"))
  } catch (error) {
    logger.error("Failed to read dataset", { filename, error: getErrorMessage(error) })
    return null
  }
}

const writeDataset = (filename: string, data: SearchableDataset): void => {
  const filePath = join(getStructuredDatasetDir(), filename)
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// Dataset Processing

/** Parse version number from version string (e.g., "v3" -> 3) */
const parseVersionNumber = (version: string): number => {
  const match = version.match(/^v(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/** Get list of dataset files */
const listDatasetFiles = (): string[] => {
  const dir = getStructuredDatasetDir()
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

/** Check if extraction is complete by verifying at least one experiment has non-empty searchable fields */
const isExtractionComplete = (dataset: SearchableDataset): boolean => {
  return dataset.experiments.some(exp => exp.searchable != null && !isEmptySearchableFields(exp.searchable))
}

/** Process a single dataset with resume support (dataset-level) */
const processDataset = async (
  filename: string,
  options: { dryRun: boolean; force: boolean; retryFailed: boolean; experimentConcurrency: number; ollamaConfig?: OllamaConfig },
): Promise<void> => {
  const { dryRun, force, retryFailed, experimentConcurrency, ollamaConfig } = options
  const parsed = parseFilename(filename)
  if (!parsed) {
    logger.error("Invalid filename format", { filename })
    return
  }

  const { datasetId, version } = parsed
  logger.info("Processing dataset", { datasetId, version })

  // Read current dataset
  const dataset = readDataset(filename)
  if (!dataset) {
    logger.error("Failed to read dataset", { filename })
    return
  }

  const existing = dataset as SearchableDataset
  const isCompleted = isExtractionComplete(existing)

  // --retry-failed: re-extract only failed experiments in completed datasets
  if (retryFailed && isCompleted) {
    const existingExperiments = existing.experiments
    const failedIndices: number[] = []
    for (let i = 0; i < existingExperiments.length; i++) {
      const searchable = existingExperiments[i].searchable
      if (!searchable || isEmptySearchableFields(searchable)) {
        failedIndices.push(i)
      }
    }

    if (failedIndices.length === 0) {
      logger.info("Skipped: no failed experiments", { filename })
      return
    }

    logger.info("Retrying failed experiments", { filename, failedCount: failedIndices.length, totalCount: existingExperiments.length })

    // Extract only failed experiments
    const failedExperiments = failedIndices.map(i => dataset.experiments[i])
    const reExtracted = await processExperimentsParallel(
      failedExperiments,
      dataset.originalMetadata ?? null,
      experimentConcurrency,
      dryRun,
      ollamaConfig,
    )

    // Merge: keep existing successful, replace failed with re-extracted
    const mergedExperiments: Experiment[] = [...existingExperiments]
    for (let j = 0; j < failedIndices.length; j++) {
      mergedExperiments[failedIndices[j]] = reExtracted[j]
    }

    const finalResult: SearchableDataset = {
      ...existing,
      experiments: mergedExperiments,
    }

    if (!dryRun) {
      writeDataset(filename, finalResult)
      logger.info("Saved dataset (retry-failed)", { output: `structured-json/dataset/${filename}` })
    } else {
      logger.info("[dry-run] Would save dataset (retry-failed)", { output: `structured-json/dataset/${filename}`, failedCount: failedIndices.length })
    }
    return
  }

  // Skip if already completed (unless --force)
  if (isCompleted && !force) {
    logger.info("Skipped: already completed", { filename })
    return
  }

  logger.debug("Dataset experiments", { count: dataset.experiments.length, experimentConcurrency })

  // Process all experiments in parallel batches
  const experiments = await processExperimentsParallel(
    dataset.experiments,
    dataset.originalMetadata ?? null,
    experimentConcurrency,
    dryRun,
    ollamaConfig,
  )

  const finalResult: SearchableDataset = {
    ...dataset,
    experiments,
  }

  if (!dryRun) {
    writeDataset(filename, finalResult)
    logger.info("Saved dataset", { output: `structured-json/dataset/${filename}` })
  } else {
    logger.info("[dry-run] Would save dataset", { output: `structured-json/dataset/${filename}` })
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
  latestOnly?: boolean
  retryFailed?: boolean
  verbose?: boolean
  quiet?: boolean
}

const parseArgs = (): ExtractArgs => {
  const args = withCommonOptions(
    yargs(hideBin(process.argv))
      .option("file", { alias: "f", type: "string", description: "Process single file (by datasetId)" })
      .option("hum-id", { alias: "i", type: "array", string: true, description: "Process datasets for specified humIds" })
      .option("dataset-id", { alias: "d", type: "array", string: true, description: "Process specific datasetIds" })
      .option("model", { alias: "m", type: "string", description: "Ollama model name (e.g. llama3.3:70b)" })
      .option("concurrency", { alias: "c", type: "number", default: 4, description: "Concurrent dataset processing" })
      .option("experiment-concurrency", { alias: "e", type: "number", default: 4, description: "Concurrent experiment LLM calls per dataset" })
      .option("dry-run", { type: "boolean", default: false, description: "Dry run without LLM calls" })
      .option("force", { type: "boolean", default: false, description: "Force reprocess even if already completed" })
      .option("latest-only", { type: "boolean", default: true, description: "Process only the latest version of each dataset" })
      .option("retry-failed", { type: "boolean", default: false, description: "Retry only experiments with empty extracted fields" }),
  ).parseSync() as ExtractArgs

  applyLogLevel(args)
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
  const retryFailed = args.retryFailed ?? false

  if (retryFailed && force) {
    logger.error("--retry-failed and --force cannot be used together")
    process.exit(1)
  }

  logger.debug("Concurrency settings", { datasetConcurrency: concurrency, experimentConcurrency })

  // Get list of dataset files
  let files = listDatasetFiles()

  // Filter by specific file
  if (args.file) {
    const targetFile = args.file.endsWith(".json") ? args.file : `${args.file}.json`
    files = files.filter(f => f === targetFile || f.startsWith(args.file!))
  }

  // Filter by humId
  if (args.humId && args.humId.length > 0) {
    const humIdSet = new Set(args.humId)
    files = files.filter(f => {
      const data = readDataset(f)
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
    await Promise.all(batch.map(f => processDataset(f, { dryRun, force, retryFailed, experimentConcurrency, ollamaConfig })))
  }

  logger.info("Completed", { outputDir: getStructuredDatasetDir() })
}

if (import.meta.main) {
  await main()
}
