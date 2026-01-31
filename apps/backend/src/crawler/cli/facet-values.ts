#!/usr/bin/env bun
/**
 * Facet Values Collector CLI
 *
 * Collects unique values from searchable fields and generates mapping files.
 * Preserves existing normalizedTo settings when updating.
 *
 * Usage:
 *   bun run crawler:facet-values [options]
 *
 * Options:
 *   --latest-only    Process only the latest version of each dataset (default: true)
 *   -o, --output     Output directory (default: crawler-results/facet-values)
 */
import { existsSync, readdirSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import {
  ValueCounter,
  generateFieldMapping,
  FACET_FIELD_NAMES,
  type FacetMapping,
  type FacetFieldName,
} from "@/crawler/processors/facet-values"
import type { SearchableDataset, Experiment } from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getResultsDir, readJson, writeJson, ensureDir } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Types

interface Args {
  latestOnly: boolean
  output: string
  verbose?: boolean
  quiet?: boolean
}

// Paths

const getStructuredDatasetDir = (): string =>
  join(getResultsDir(), "structured-json", "dataset")

const getDefaultOutputDir = (): string =>
  join(getResultsDir(), "facet-values")

// Dataset Processing

/** Parse datasetId and version from filename */
const parseFilename = (filename: string): { datasetId: string; version: string } | null => {
  const match = filename.match(/^(.+)-(v\d+)\.json$/)
  if (!match) return null
  return { datasetId: match[1], version: match[2] }
}

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
    versions.sort((a, b) => b.versionNum - a.versionNum)
    result.push(versions[0].filename)
  }

  return result.sort()
}

/** Read existing mapping file */
const readExistingMapping = (outputDir: string, fieldName: FacetFieldName): FacetMapping | null => {
  const filePath = join(outputDir, `${fieldName}.json`)
  return readJson<FacetMapping>(filePath)
}

/** Write mapping file */
const writeMapping = (outputDir: string, fieldName: FacetFieldName, mapping: FacetMapping): void => {
  const filePath = join(outputDir, `${fieldName}.json`)
  writeJson(filePath, mapping)
}

// Main

const main = async (args: Args): Promise<void> => {
  const { latestOnly, output } = args

  // Get dataset files
  let files = listDatasetFiles()
  if (files.length === 0) {
    logger.info("No datasets found")
    return
  }

  // Filter to latest versions if requested
  if (latestOnly) {
    files = filterLatestVersions(files)
  }

  logger.info("Starting facet values collection", {
    datasetCount: files.length,
    latestOnly,
    outputDir: output,
  })

  // Collect values
  const counter = new ValueCounter()
  let experimentsProcessed = 0

  for (const filename of files) {
    const filePath = join(getStructuredDatasetDir(), filename)
    const dataset = readJson<SearchableDataset>(filePath)

    if (!dataset) {
      logger.warn("Failed to read dataset", { filename })
      continue
    }

    for (const experiment of dataset.experiments) {
      const exp = experiment as Experiment
      if (exp.searchable) {
        counter.addFromSearchable(exp.searchable)
        experimentsProcessed++
      }
    }
  }

  logger.info("Values collected", { experimentsProcessed })

  // Ensure output directory exists
  ensureDir(output)

  // Generate and write mapping files
  for (const fieldName of FACET_FIELD_NAMES) {
    const existingMapping = readExistingMapping(output, fieldName)
    const mapping = generateFieldMapping(counter, fieldName, existingMapping)

    writeMapping(output, fieldName, mapping)

    const newValues = mapping.values.filter(v => {
      if (!existingMapping) return true
      return !existingMapping.values.some(e => e.value === v.value)
    }).length

    logger.info(`Generated ${fieldName}.json`, {
      uniqueValues: mapping.values.length,
      newValues,
      total: mapping.total,
    })
  }

  logger.info("Completed", {
    outputDir: output,
    fields: FACET_FIELD_NAMES.length,
  })
}

// CLI

const argv = await withCommonOptions(
  yargs(hideBin(process.argv))
    .option("latest-only", {
      type: "boolean",
      description: "Process only the latest version of each dataset",
      default: true,
    })
    .option("output", {
      alias: "o",
      type: "string",
      description: "Output directory for mapping files",
      default: getDefaultOutputDir(),
    }),
)
  .help()
  .parse()

applyLogLevel(argv)

const args: Args = {
  latestOnly: argv["latest-only"],
  output: argv.output,
  verbose: argv.verbose,
  quiet: argv.quiet,
}

await main(args)
