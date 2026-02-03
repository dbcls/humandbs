/**
 * LLM Field Extraction
 *
 * Extracts structured fields from Dataset using Ollama LLM
 * Updates structured-json in-place with searchable fields
 *
 * Idempotent: skips experiments that already have non-empty searchable fields (unless --force)
 * Resume-friendly: each job writes its result immediately after completion
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getOllamaDefaultConfig, type OllamaConfig } from "@/crawler/llm/client"
import {
  createEmptySearchableFields,
  extractFieldsFromExperiment,
  isEmptySearchableFields,
} from "@/crawler/llm/extract"
import type {
  EnrichedDataset,
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
  retryCount: number
}

// Constants

const MAX_RETRIES = 3

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

// Dataset file lock to prevent concurrent writes
const datasetLocks = new Map<string, Promise<void>>()

const withDatasetLock = async <T>(filename: string, fn: () => Promise<T>): Promise<T> => {
  // Wait for existing lock
  const existing = datasetLocks.get(filename)
  if (existing) {
    await existing
  }

  // Create new lock
  let resolve: () => void
  const lock = new Promise<void>(r => { resolve = r })
  datasetLocks.set(filename, lock)

  try {
    return await fn()
  } finally {
    resolve!()
    datasetLocks.delete(filename)
  }
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
 * Process a single job: extract fields and write result to file
 * Returns true if successful, false if should retry
 */
const processJob = async (
  job: ExperimentJob,
  dryRun: boolean,
  ollamaConfig: OllamaConfig,
): Promise<boolean> => {
  return withDatasetLock(job.datasetFilename, async () => {
    // Read current dataset state
    const dataset = readDataset(job.datasetFilename)
    if (!dataset) {
      logger.error("Failed to read dataset", { filename: job.datasetFilename })
      return true // Don't retry, dataset is broken
    }

    const experiment = dataset.experiments[job.experimentIndex]
    if (!experiment) {
      logger.error("Experiment not found", { filename: job.datasetFilename, index: job.experimentIndex })
      return true // Don't retry
    }

    try {
      const llmSearchable = dryRun
        ? createEmptySearchableFields()
        : await extractFieldsFromExperiment(experiment, dataset.originalMetadata ?? null, ollamaConfig)

      // Preserve policies from structure step
      const existingSearchable = experiment.searchable
      const searchable: SearchableExperimentFields = {
        ...llmSearchable,
        policies: existingSearchable?.policies ?? [],
      }

      // Update and write immediately
      const updatedExperiments = [...dataset.experiments]
      updatedExperiments[job.experimentIndex] = {
        ...experiment,
        searchable,
      }

      const updatedDataset: SearchableDataset = {
        ...dataset,
        experiments: updatedExperiments,
      }

      if (!dryRun) {
        writeDataset(job.datasetFilename, updatedDataset)
      }

      return true // Success
    } catch (error) {
      logger.warn("Job failed", {
        filename: job.datasetFilename,
        experimentIndex: job.experimentIndex,
        retryCount: job.retryCount,
        error: getErrorMessage(error),
      })
      return false // Should retry
    }
  })
}

/**
 * Run queue-based worker pool
 * Each worker consumes jobs from the queue
 * Failed jobs are re-queued immediately (no delay)
 */
const runWorkerPool = async (
  initialJobs: ExperimentJob[],
  concurrency: number,
  dryRun: boolean,
  ollamaConfig: OllamaConfig,
  onProgress?: (completed: number, total: number, failed: number) => void,
): Promise<{ completed: number; failed: number }> => {
  const queue: ExperimentJob[] = [...initialJobs]
  const totalJobs = initialJobs.length

  let completed = 0
  let failed = 0

  const runWorker = async (): Promise<void> => {
    while (true) {
      const job = queue.shift()
      if (!job) break // Queue is empty

      const success = await processJob(job, dryRun, ollamaConfig)

      if (success) {
        completed++
        onProgress?.(completed, totalJobs, failed)
      } else {
        // Retry: re-queue with incremented retry count
        if (job.retryCount < MAX_RETRIES) {
          queue.push({ ...job, retryCount: job.retryCount + 1 })
        } else {
          // Max retries reached, mark as failed
          logger.error("Job failed after max retries", {
            filename: job.datasetFilename,
            experimentIndex: job.experimentIndex,
          })
          completed++
          failed++
          onProgress?.(completed, totalJobs, failed)
        }
      }
    }
  }

  // Start workers
  const workers: Promise<void>[] = []
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorker())
  }

  await Promise.all(workers)

  return { completed, failed }
}

// CLI

interface ExtractArgs {
  file?: string
  humId?: string[]
  datasetId?: string[]
  host?: string
  port?: number
  model?: string
  timeout?: number
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
      .option("host", { alias: "h", type: "string", description: "Ollama host (default: localhost)" })
      .option("port", { alias: "p", type: "number", description: "Ollama port (default: 11434)" })
      .option("model", { alias: "m", type: "string", description: "Ollama model name (e.g. llama3.3:70b)" })
      .option("timeout", { alias: "t", type: "number", description: "Request timeout in milliseconds (default: 300000)" })
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

  const host = args.host ?? "localhost"
  const port = args.port ?? 11434
  const baseUrl = `http://${host}:${port}`

  const ollamaConfig: OllamaConfig = {
    baseUrl,
    ...getOllamaDefaultConfig(),
    ...(args.model ? { model: args.model } : {}),
    ...(args.timeout ? { timeout: args.timeout } : {}),
  }
  logger.info("Ollama configuration", { api: ollamaConfig.baseUrl, model: ollamaConfig.model, timeout: ollamaConfig.timeout })

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

  // Collect jobs: find experiments without searchable fields
  const jobs: ExperimentJob[] = []

  for (const filename of files) {
    const dataset = readDataset(filename)
    if (!dataset) {
      logger.error("Failed to read dataset", { filename })
      continue
    }

    for (let i = 0; i < dataset.experiments.length; i++) {
      const exp = dataset.experiments[i]
      const needsExtraction = !exp.searchable || isEmptySearchableFields(exp.searchable)

      if (needsExtraction || force) {
        jobs.push({
          datasetFilename: filename,
          experimentIndex: i,
          retryCount: 0,
        })
      }
    }
  }

  if (jobs.length === 0) {
    logger.info("No experiments to process (all have non-empty searchable fields)")
    return
  }

  const datasetCount = new Set(jobs.map(j => j.datasetFilename)).size
  logger.info("Starting extraction", { jobCount: jobs.length, datasetCount, concurrency })

  // Progress tracking
  let lastProgressLog = 0
  const progressInterval = 100
  const onProgress = (completed: number, total: number, failed: number): void => {
    if (completed - lastProgressLog >= progressInterval || completed === total) {
      const percent = Math.round((completed / total) * 100)
      logger.info(`Progress: ${completed}/${total} experiments (${percent}%)`, { failed })
      lastProgressLog = completed
    }
  }

  // Run worker pool
  const result = await runWorkerPool(jobs, concurrency, dryRun, ollamaConfig, onProgress)

  logger.info("Completed", {
    experimentsProcessed: result.completed,
    experimentsFailed: result.failed,
    outputDir: getStructuredDatasetDir(),
  })
}

if (import.meta.main) {
  await main()
}
