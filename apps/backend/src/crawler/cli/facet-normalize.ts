#!/usr/bin/env bun
/**
 * Facet Normalization CLI
 *
 * Normalizes searchable field values using mapping files.
 * Updates structured-json in-place.
 *
 * Usage:
 *   bun run crawler:facet-normalize [options]
 *
 * Options:
 *   -i, --hum-id       Process only the specified humId
 *   --latest-only      Process only the latest version of each dataset (default: true)
 *   --dry-run          Preview changes without writing
 *   -v, --verbose      Show debug logs
 *   --mapping-dir      Mapping files directory (default: crawler-results/facet-values)
 */
import { existsSync, readdirSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import {
  normalizeExperimentSearchable,
  applyNormalizationResult,
  UnmappedValuesTracker,
} from "@/crawler/processors/facet-normalize"
import {
  FACET_FIELD_NAMES,
  type FacetMapping,
  type FacetFieldName,
} from "@/crawler/processors/facet-values"
import type { SearchableDataset, Experiment } from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getResultsDir, readJson } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Types

interface Args {
  humId?: string
  latestOnly: boolean
  dryRun: boolean
  mappingDir: string
  verbose?: boolean
  quiet?: boolean
}

interface NormalizeResult {
  datasetsProcessed: number
  datasetsUpdated: number
  experimentsUpdated: number
  unmappedValueCount: number
}

// Paths

const getStructuredDatasetDir = (): string =>
  join(getResultsDir(), "structured-json", "dataset")

const getDefaultMappingDir = (): string =>
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

/** Load all mapping files */
const loadMappings = (mappingDir: string): Map<FacetFieldName, FacetMapping> => {
  const mappings = new Map<FacetFieldName, FacetMapping>()

  for (const fieldName of FACET_FIELD_NAMES) {
    const filePath = join(mappingDir, `${fieldName}.json`)
    const mapping = readJson<FacetMapping>(filePath)

    if (mapping) {
      mappings.set(fieldName, mapping)
      logger.debug(`Loaded mapping: ${fieldName}`, { values: mapping.values.length })
    } else {
      logger.warn(`Mapping file not found: ${fieldName}.json`)
    }
  }

  return mappings
}

// Main

const main = async (args: Args): Promise<NormalizeResult> => {
  const { humId, latestOnly, dryRun, mappingDir } = args

  // Load mappings
  const mappings = loadMappings(mappingDir)
  if (mappings.size === 0) {
    logger.error("No mapping files found. Run facet-values first.", { mappingDir })
    return {
      datasetsProcessed: 0,
      datasetsUpdated: 0,
      experimentsUpdated: 0,
      unmappedValueCount: 0,
    }
  }

  // Get dataset files
  let files = listDatasetFiles()
  if (files.length === 0) {
    logger.info("No datasets found")
    return {
      datasetsProcessed: 0,
      datasetsUpdated: 0,
      experimentsUpdated: 0,
      unmappedValueCount: 0,
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

  logger.info("Starting facet normalization", {
    datasetCount: files.length,
    latestOnly,
    dryRun,
    mappingDir,
  })

  // Track results
  const unmappedTracker = new UnmappedValuesTracker()
  let datasetsProcessed = 0
  let datasetsUpdated = 0
  let experimentsUpdated = 0

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
      const exp = experiment as Experiment

      if (!exp.searchable) {
        updatedExperiments.push(exp)
        continue
      }

      // Check if normalization would change anything
      const normalizeResult = normalizeExperimentSearchable(exp.searchable, mappings)
      unmappedTracker.addFromResult(normalizeResult)

      // Log unmapped values
      for (const [fieldName, values] of normalizeResult.unmappedValues) {
        for (const value of values) {
          logger.warn(`Unmapped value: "${value}" in field "${fieldName}"`, { filename })
        }
      }

      if (normalizeResult.updated) {
        // Apply normalization
        const normalizedSearchable = applyNormalizationResult(exp.searchable, mappings)
        updatedExperiments.push({
          ...exp,
          searchable: normalizedSearchable,
        })
        experimentsUpdated++
        datasetUpdated = true
      } else {
        updatedExperiments.push(exp)
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

  // Log unmapped values summary
  const unmappedSummary = unmappedTracker.getSummary()
  if (unmappedSummary.size > 0) {
    logger.warn("Unmapped values summary:")
    for (const [fieldName, values] of unmappedSummary) {
      logger.warn(`  ${fieldName}: ${values.join(", ")}`)
    }
  }

  return {
    datasetsProcessed,
    datasetsUpdated,
    experimentsUpdated,
    unmappedValueCount: unmappedTracker.getTotalCount(),
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
    .option("mapping-dir", {
      type: "string",
      description: "Mapping files directory",
      default: getDefaultMappingDir(),
    }),
)
  .help()
  .parse()

applyLogLevel(argv)

const args: Args = {
  humId: argv["hum-id"],
  latestOnly: argv["latest-only"],
  dryRun: argv["dry-run"],
  mappingDir: argv["mapping-dir"],
  verbose: argv.verbose,
  quiet: argv.quiet,
}

const result = await main(args)

logger.info("Completed", {
  datasetsProcessed: result.datasetsProcessed,
  datasetsUpdated: result.datasetsUpdated,
  experimentsUpdated: result.experimentsUpdated,
  unmappedValueCount: result.unmappedValueCount,
})

if (result.unmappedValueCount > 0) {
  logger.warn(`Found ${result.unmappedValueCount} unmapped values. Consider updating mapping files.`)
}
