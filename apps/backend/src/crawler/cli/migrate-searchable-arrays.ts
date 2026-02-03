/**
 * Migration script to convert single-value fields to arrays
 *
 * Converts the following fields from string | null to string[]:
 * - assayType
 * - cellLine
 * - platformModel
 * - population
 * - referenceGenome
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import type { SearchableDataset } from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getResultsDir } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Fields to migrate
const FIELDS_TO_MIGRATE = [
  "assayType",
  "cellLine",
  "platformModel",
  "population",
  "referenceGenome",
] as const

interface MigrationStats {
  filesProcessed: number
  filesUpdated: number
  fieldsConverted: number
}

/**
 * Convert a single value to an array
 */
const toArray = (value: unknown): string[] => {
  if (value === null || value === undefined) {
    return []
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string")
  }
  if (typeof value === "string") {
    return value.trim() === "" ? [] : [value]
  }
  return []
}

/**
 * Migrate a single dataset file
 */
const migrateDataset = (filePath: string, dryRun: boolean): { updated: boolean; fieldsConverted: number } => {
  const content = readFileSync(filePath, "utf8")
  const dataset = JSON.parse(content) as SearchableDataset

  let updated = false
  let fieldsConverted = 0

  for (const exp of dataset.experiments) {
    if (!exp.searchable) continue

    const searchable = exp.searchable as unknown as Record<string, unknown>

    for (const field of FIELDS_TO_MIGRATE) {
      const currentValue = searchable[field]

      // Skip if already an array
      if (Array.isArray(currentValue)) continue

      // Convert to array
      const newValue = toArray(currentValue)
      searchable[field] = newValue
      updated = true
      fieldsConverted++

      logger.debug("Converted field", {
        file: filePath,
        field,
        from: currentValue,
        to: newValue,
      })
    }
  }

  if (updated && !dryRun) {
    writeFileSync(filePath, JSON.stringify(dataset, null, 2), "utf8")
  }

  return { updated, fieldsConverted }
}

/**
 * Run migration
 */
const runMigration = (dryRun: boolean): MigrationStats => {
  const datasetDir = join(getResultsDir(), "structured-json", "dataset")

  if (!existsSync(datasetDir)) {
    logger.error("Dataset directory not found", { datasetDir })
    return { filesProcessed: 0, filesUpdated: 0, fieldsConverted: 0 }
  }

  const files = readdirSync(datasetDir).filter(f => f.endsWith(".json"))
  logger.info("Starting migration", { dryRun, fileCount: files.length })

  const stats: MigrationStats = {
    filesProcessed: 0,
    filesUpdated: 0,
    fieldsConverted: 0,
  }

  for (const file of files) {
    const filePath = join(datasetDir, file)
    const result = migrateDataset(filePath, dryRun)

    stats.filesProcessed++
    if (result.updated) {
      stats.filesUpdated++
      stats.fieldsConverted += result.fieldsConverted
    }
  }

  return stats
}

// CLI

interface CliArgs {
  dryRun?: boolean
  verbose?: boolean
  quiet?: boolean
}

const parseArgs = (): CliArgs => {
  const args = withCommonOptions(
    yargs(hideBin(process.argv))
      .option("dry-run", {
        alias: "n",
        type: "boolean",
        description: "Show what would be done without making changes",
        default: false,
      }),
  ).parseSync() as CliArgs

  applyLogLevel(args)
  return args
}

const main = (): void => {
  const args = parseArgs()
  const dryRun = args.dryRun ?? false

  if (dryRun) {
    logger.info("=== DRY RUN MODE ===")
  }

  const stats = runMigration(dryRun)

  logger.info("Migration complete", {
    dryRun,
    ...stats,
  })

  if (dryRun && stats.filesUpdated > 0) {
    logger.info("Run without --dry-run to apply changes")
  }
}

if (import.meta.main) {
  main()
}
