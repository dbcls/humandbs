#!/usr/bin/env bun
/**
 * Facet Values Collector CLI
 *
 * Collects unique values from searchable fields and generates TSV mapping files.
 * Preserves existing normalizedTo settings when updating.
 * New values are marked as __PENDING__ for review.
 *
 * Usage:
 *   bun run crawler:facet-values [options]
 *
 * Options:
 *   --latest-only    Process only the latest version of each dataset (default: true)
 *   -o, --output     Output directory (default: src/crawler/data/facet-mappings)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import {
  ValueCounter,
  generateFieldTsvMapping,
  parseTsv,
  generateTsv,
  FACET_FIELD_NAMES,
  MAPPING_PENDING,
  type TsvMappingEntry,
  type FacetFieldName,
} from "@/crawler/processors/facet-values"
import type { SearchableDataset, Experiment } from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getResultsDir, readJson, ensureDir } from "@/crawler/utils/io"
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

const getDefaultOutputDir = (): string => {
  // Default to src/crawler/data/facet-mappings relative to this file
  const __dirname = dirname(fileURLToPath(import.meta.url))
  return join(__dirname, "..", "data", "facet-mappings")
}

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

/** Read existing TSV mapping file */
const readExistingTsvMapping = (outputDir: string, fieldName: FacetFieldName): TsvMappingEntry[] => {
  const filePath = join(outputDir, `${fieldName}.tsv`)
  if (!existsSync(filePath)) {
    return []
  }
  const content = readFileSync(filePath, "utf-8")
  return parseTsv(content)
}

/** Write TSV mapping file */
const writeTsvMapping = (outputDir: string, fieldName: FacetFieldName, entries: TsvMappingEntry[]): void => {
  const filePath = join(outputDir, `${fieldName}.tsv`)
  const content = generateTsv(entries)
  writeFileSync(filePath, content)
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

  // Generate and write TSV mapping files
  let totalNewValues = 0
  let totalPendingValues = 0

  for (const fieldName of FACET_FIELD_NAMES) {
    const existingEntries = readExistingTsvMapping(output, fieldName)
    const { entries, newValues } = generateFieldTsvMapping(counter, fieldName, existingEntries)

    writeTsvMapping(output, fieldName, entries)

    // Count pending values (including newly added ones)
    const pendingCount = entries.filter(e => e.normalizedTo === MAPPING_PENDING).length

    totalNewValues += newValues.length
    totalPendingValues += pendingCount

    // Log new values if any
    if (newValues.length > 0) {
      logger.info(`New values in ${fieldName}:`, { newValues })
    }

    logger.info(`Generated ${fieldName}.tsv`, {
      uniqueValues: entries.length,
      newValues: newValues.length,
      pending: pendingCount,
    })
  }

  logger.info("Completed", {
    outputDir: output,
    fields: FACET_FIELD_NAMES.length,
    totalNewValues,
    totalPendingValues,
  })

  if (totalPendingValues > 0) {
    logger.warn(`${totalPendingValues} values are marked as ${MAPPING_PENDING}. Please review and set normalizedTo values.`)
  }
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
