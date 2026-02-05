#!/usr/bin/env bun
/**
 * ICD10 Code Normalization CLI
 *
 * Extracts ICD10 codes from disease labels and applies manual split definitions.
 * Updates structured-json in-place.
 *
 * Usage:
 *   bun run crawler:icd10-normalize [options]
 *
 * Options:
 *   -i, --hum-id       Process only the specified humId
 *   --latest-only      Process only the latest version of each dataset (default: true)
 *   --dry-run          Preview changes without writing
 *   --check            Validate normalized data and exit with error if invalid
 *   -v, --verbose      Show debug logs
 */
import { existsSync, readdirSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import {
  normalizeDiseases,
  validateNormalizedDiseases,
  type NormalizedDiseaseValidationError,
} from "@/crawler/processors/icd10-normalize"
import type { SearchableDataset, Experiment } from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getResultsDir, readJson } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Types

interface Args {
  humId?: string
  latestOnly: boolean
  dryRun: boolean
  check: boolean
  verbose?: boolean
  quiet?: boolean
}

interface NormalizeResult {
  datasetsProcessed: number
  datasetsUpdated: number
  experimentsUpdated: number
  warningCount: number
  validationErrors: NormalizedDiseaseValidationError[]
}

// Paths

const getStructuredDatasetDir = (): string =>
  join(getResultsDir(), "structured-json", "dataset")

// Dataset Processing

/** Parse datasetId and version from filename */
const parseFilename = (filename: string): { datasetId: string; version: string } | null => {
  const match = /^(.+)-(v\d+)\.json$/.exec(filename)
  if (!match) return null
  return { datasetId: match[1], version: match[2] }
}

/** Parse version number from version string (e.g., "v3" -> 3) */
const parseVersionNumber = (version: string): number => {
  const match = /^v(\d+)$/.exec(version)
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

// Main

const main = (args: Args): NormalizeResult => {
  const { humId, latestOnly, dryRun, check } = args

  // Get dataset files
  let files = listDatasetFiles()
  if (files.length === 0) {
    logger.info("No datasets found")
    return {
      datasetsProcessed: 0,
      datasetsUpdated: 0,
      experimentsUpdated: 0,
      warningCount: 0,
      validationErrors: [],
    }
  }

  // Filter by humId
  if (humId) {
    files = files.filter(f => {
      const content = readFileSync(join(getStructuredDatasetDir(), f), "utf-8")
      const dataset = JSON.parse(content) as SearchableDataset
      return dataset.humId === humId
    })
  }

  // Filter to latest versions
  if (latestOnly) {
    files = filterLatestVersions(files)
  }

  logger.info("Starting ICD10 normalization", {
    datasetCount: files.length,
    latestOnly,
    dryRun,
    check,
  })

  // Track results
  let datasetsProcessed = 0
  let datasetsUpdated = 0
  let experimentsUpdated = 0
  let totalWarnings = 0
  const allValidationErrors: NormalizedDiseaseValidationError[] = []

  // Process each dataset
  for (const filename of files) {
    const filePath = join(getStructuredDatasetDir(), filename)
    const dataset = readJson<SearchableDataset>(filePath)

    if (!dataset) {
      logger.warn("Failed to read dataset", { filename })
      continue
    }

    let datasetUpdated = false
    const updatedExperiments: Experiment[] = []

    for (const experiment of dataset.experiments) {
      const exp = experiment

      if (!exp.searchable?.diseases || exp.searchable.diseases.length === 0) {
        updatedExperiments.push(exp)
        continue
      }

      // Normalize diseases
      const { normalized, warnings, updated } = normalizeDiseases(exp.searchable.diseases)

      // Log warnings
      for (const warning of warnings) {
        logger.warn(warning, { filename })
        totalWarnings++
      }

      if (updated) {
        updatedExperiments.push({
          ...exp,
          searchable: {
            ...exp.searchable,
            diseases: normalized,
          },
        })
        experimentsUpdated++
        datasetUpdated = true

        logger.debug("Updated experiment diseases", {
          filename,
          before: exp.searchable.diseases,
          after: normalized,
        })
      } else {
        updatedExperiments.push(exp)
      }

      // Validate normalized diseases if check mode is enabled
      if (check) {
        const validationErrors = validateNormalizedDiseases(normalized)
        for (const error of validationErrors) {
          allValidationErrors.push(error)
          logger.error(`Validation error (${error.type}): "${error.disease.label}" (icd10: ${error.disease.icd10})`, {
            filename,
            expectedLabel: error.expectedLabel,
          })
        }
      }
    }

    datasetsProcessed++

    if (datasetUpdated) {
      datasetsUpdated++

      const updatedDataset: SearchableDataset = {
        ...dataset,
        experiments: updatedExperiments,
      }

      if (!dryRun) {
        writeFileSync(filePath, JSON.stringify(updatedDataset, null, 2))
        logger.info("Updated dataset", { filename })
      } else {
        logger.info("[dry-run] Would update dataset", { filename })
      }
    }
  }

  return {
    datasetsProcessed,
    datasetsUpdated,
    experimentsUpdated,
    warningCount: totalWarnings,
    validationErrors: allValidationErrors,
  }
}

// CLI

const argv = await withCommonOptions(
  yargs(hideBin(process.argv))
    .option("hum-id", {
      alias: "i",
      type: "string",
      description: "Process only the specified humId",
    })
    .option("latest-only", {
      type: "boolean",
      description: "Process only the latest version of each dataset",
      default: true,
    })
    .option("dry-run", {
      type: "boolean",
      description: "Preview changes without writing",
      default: false,
    })
    .option("check", {
      type: "boolean",
      description: "Validate normalized data (icd10 not null, label = master label). Exit with error if invalid.",
      default: false,
    }),
)
  .help()
  .parse()

applyLogLevel(argv)

const args: Args = {
  humId: argv["hum-id"],
  latestOnly: argv["latest-only"],
  dryRun: argv["dry-run"],
  check: argv.check,
  verbose: argv.verbose,
  quiet: argv.quiet,
}

const result = main(args)

logger.info("Completed", {
  datasetsProcessed: result.datasetsProcessed,
  datasetsUpdated: result.datasetsUpdated,
  experimentsUpdated: result.experimentsUpdated,
  warningCount: result.warningCount,
  validationErrorCount: result.validationErrors.length,
})

if (result.warningCount > 0) {
  logger.warn(`Found ${result.warningCount} warnings. Consider adding manual split definitions for multiple ICD10 codes.`)
}

// Exit with error if check mode and validation errors found
if (args.check && result.validationErrors.length > 0) {
  logger.error(`Validation failed: ${result.validationErrors.length} errors found. All normalized diseases must have:`)
  logger.error("  - icd10: valid code in icd10-labels.json (no dots or dashes)")
  logger.error("  - label: exactly matching the master label from icd10-labels.json")
  process.exit(1)
}
