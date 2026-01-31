/**
 * LLM Field Extraction
 *
 * Extracts structured fields from Dataset using Ollama LLM
 * Updates structured-json in-place with searchable fields
 *
 * Idempotent: skips experiments that already have non-empty searchable fields (unless --force)
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getOllamaConfig, type OllamaConfig } from "@/crawler/llm/client"
import {
  createEmptySearchableFields,
  extractFieldsFromExperiment,
  isEmptySearchableFields,
} from "@/crawler/llm/extract"
import type {
  EnrichedDataset,
  Experiment,
  SearchableDataset,
  SearchableExperimentFields,
} from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getErrorMessage } from "@/crawler/utils/error"
import { getResultsDir } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Types

interface ExperimentJob {
  datasetFilename: string
  experimentIndex: number
  experiment: Experiment
  originalMetadata: Record<string, unknown> | null
}

interface JobResult {
  datasetFilename: string
  experimentIndex: number
  searchable: SearchableExperimentFields
}

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

// Worker Pool

/**
 * Run jobs in a worker pool with fixed concurrency
 * Returns results grouped by dataset filename
 */
const runWorkerPool = async (
  jobs: ExperimentJob[],
  concurrency: number,
  dryRun: boolean,
  ollamaConfig?: OllamaConfig,
  onProgress?: (completed: number, total: number, failed: number) => void,
): Promise<Map<string, JobResult[]>> => {
  const results = new Map<string, JobResult[]>()
  let completed = 0
  let failed = 0
  let jobIndex = 0

  const processJob = async (job: ExperimentJob): Promise<void> => {
    try {
      const llmSearchable = dryRun
        ? createEmptySearchableFields()
        : await extractFieldsFromExperiment(job.experiment, job.originalMetadata, ollamaConfig)

      // Preserve policies from structure step
      const existingSearchable = job.experiment.searchable
      const searchable: SearchableExperimentFields = {
        ...llmSearchable,
        policies: existingSearchable?.policies ?? [],
      }

      // Store result
      const datasetResults = results.get(job.datasetFilename) ?? []
      datasetResults.push({
        datasetFilename: job.datasetFilename,
        experimentIndex: job.experimentIndex,
        searchable,
      })
      results.set(job.datasetFilename, datasetResults)
    } catch (error) {
      logger.error("Failed to process experiment", {
        datasetFilename: job.datasetFilename,
        experimentIndex: job.experimentIndex,
        error: getErrorMessage(error),
      })

      // Store empty result for failed job
      const datasetResults = results.get(job.datasetFilename) ?? []
      const existingSearchable = job.experiment.searchable
      datasetResults.push({
        datasetFilename: job.datasetFilename,
        experimentIndex: job.experimentIndex,
        searchable: {
          ...createEmptySearchableFields(),
          policies: existingSearchable?.policies ?? [],
        },
      })
      results.set(job.datasetFilename, datasetResults)
      failed++
    }

    completed++
    onProgress?.(completed, jobs.length, failed)
  }

  // Start initial workers
  const workers: Promise<void>[] = []

  const startNextJob = (): void => {
    if (jobIndex < jobs.length) {
      const job = jobs[jobIndex++]
      const worker = processJob(job).then(() => {
        // When done, start next job
        startNextJob()
      })
      workers.push(worker)
    }
  }

  // Start up to `concurrency` jobs initially
  for (let i = 0; i < Math.min(concurrency, jobs.length); i++) {
    startNextJob()
  }

  // Wait for all workers to complete
  await Promise.all(workers)

  return results
}

// CLI

interface ExtractArgs {
  file?: string
  humId?: string[]
  datasetId?: string[]
  model?: string
  concurrency?: number
  dryRun?: boolean
  force?: boolean
  latestOnly?: boolean
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
      .option("concurrency", { alias: "c", type: "number", default: 16, description: "Concurrent LLM calls" })
      .option("dry-run", { type: "boolean", default: false, description: "Dry run without LLM calls" })
      .option("force", { type: "boolean", default: false, description: "Force reprocess all experiments" })
      .option("latest-only", { type: "boolean", default: true, description: "Process only the latest version of each dataset" }),
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
  const concurrency = args.concurrency ?? 16
  const latestOnly = args.latestOnly ?? true
  const force = args.force ?? false

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

  // Collect jobs from all datasets
  const jobs: ExperimentJob[] = []
  const datasetCache = new Map<string, EnrichedDataset>()

  for (const filename of files) {
    const dataset = readDataset(filename)
    if (!dataset) {
      logger.error("Failed to read dataset", { filename })
      continue
    }
    datasetCache.set(filename, dataset)

    for (let i = 0; i < dataset.experiments.length; i++) {
      const exp = dataset.experiments[i]
      const needsExtraction = !exp.searchable || isEmptySearchableFields(exp.searchable)

      if (needsExtraction || force) {
        jobs.push({
          datasetFilename: filename,
          experimentIndex: i,
          experiment: exp,
          originalMetadata: dataset.originalMetadata ?? null,
        })
      }
    }
  }

  if (jobs.length === 0) {
    logger.info("No experiments to process (all have non-empty searchable fields)")
    return
  }

  const datasetCount = new Set(jobs.map(j => j.datasetFilename)).size
  logger.info("Starting extraction", { datasetCount, experimentCount: jobs.length, concurrency })

  // Progress tracking
  let lastProgressLog = 0
  const progressInterval = 100 // Log every 100 experiments
  const onProgress = (completed: number, total: number, failed: number): void => {
    if (completed - lastProgressLog >= progressInterval || completed === total) {
      const percent = Math.round((completed / total) * 100)
      logger.info(`Progress: ${completed}/${total} experiments (${percent}%)`, { failed })
      lastProgressLog = completed
    }
  }

  // Run worker pool
  const results = await runWorkerPool(jobs, concurrency, dryRun, ollamaConfig, onProgress)

  // Apply results to datasets and save
  let experimentsFailed = 0
  for (const [filename, jobResults] of results.entries()) {
    const dataset = datasetCache.get(filename)
    if (!dataset) continue

    // Create updated experiments array
    const updatedExperiments = [...dataset.experiments]
    for (const result of jobResults) {
      updatedExperiments[result.experimentIndex] = {
        ...updatedExperiments[result.experimentIndex],
        searchable: result.searchable,
      }
      // Count failed extractions
      if (isEmptySearchableFields(result.searchable)) {
        experimentsFailed++
      }
    }

    const finalResult: SearchableDataset = {
      ...dataset,
      experiments: updatedExperiments,
    }

    if (!dryRun) {
      writeDataset(filename, finalResult)
      logger.debug("Saved dataset", { output: `structured-json/dataset/${filename}` })
    } else {
      logger.debug("[dry-run] Would save dataset", { output: `structured-json/dataset/${filename}` })
    }
  }

  logger.info("Completed", {
    experimentsProcessed: jobs.length,
    experimentsFailed,
    outputDir: getStructuredDatasetDir(),
  })
}

if (import.meta.main) {
  await main()
}
