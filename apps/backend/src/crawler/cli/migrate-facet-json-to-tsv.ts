#!/usr/bin/env bun
/**
 * Migration script: Convert JSON facet mappings to TSV format
 *
 * This is a one-time migration script to convert existing JSON mapping files
 * to the new TSV format.
 *
 * Usage:
 *   bun run src/crawler/cli/migrate-facet-json-to-tsv.ts
 */
import { existsSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

import {
  FACET_FIELD_NAMES,
  MAPPING_DELETE,
  generateTsv,
  type FacetMapping,
  type TsvMappingEntry,
} from "@/crawler/processors/facet-values"
import { ensureDir, getResultsDir } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Paths
const getJsonDir = (): string =>
  join(getResultsDir(), "facet-values")

const getTsvDir = (): string => {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  return join(__dirname, "..", "data", "facet-mappings")
}

/**
 * Convert JSON FacetMapping to TSV entries
 *
 * Conversion rules:
 * - normalizedTo = "" -> Keep as "" (canonical value)
 * - normalizedTo = "SomeValue" -> Keep as "SomeValue"
 * - normalizedTo = null -> Convert to "__DELETE__"
 */
const convertJsonToTsvEntries = (mapping: FacetMapping): TsvMappingEntry[] => {
  return mapping.values.map(entry => ({
    value: entry.value,
    normalizedTo: entry.normalizedTo ?? MAPPING_DELETE,
  }))
}

const main = (): void => {
  const jsonDir = getJsonDir()
  const tsvDir = getTsvDir()

  logger.info("Starting JSON to TSV migration", { jsonDir, tsvDir })

  if (!existsSync(jsonDir)) {
    logger.error("JSON directory does not exist", { jsonDir })
    return
  }

  // Ensure TSV directory exists
  ensureDir(tsvDir)

  let migratedCount = 0
  let skippedCount = 0

  for (const fieldName of FACET_FIELD_NAMES) {
    const jsonPath = join(jsonDir, `${fieldName}.json`)
    const tsvPath = join(tsvDir, `${fieldName}.tsv`)

    if (!existsSync(jsonPath)) {
      logger.warn(`JSON file not found: ${fieldName}.json`)
      skippedCount++
      continue
    }

    // Skip if TSV already exists
    if (existsSync(tsvPath)) {
      logger.info(`TSV already exists, skipping: ${fieldName}.tsv`)
      skippedCount++
      continue
    }

    try {
      const jsonContent = readFileSync(jsonPath, "utf-8")
      const mapping = JSON.parse(jsonContent) as FacetMapping

      const entries = convertJsonToTsvEntries(mapping)
      const tsvContent = generateTsv(entries)

      writeFileSync(tsvPath, tsvContent)

      logger.info(`Migrated ${fieldName}`, {
        entries: entries.length,
        deleteEntries: entries.filter(e => e.normalizedTo === MAPPING_DELETE).length,
        normalizedEntries: entries.filter(e => e.normalizedTo !== "" && e.normalizedTo !== MAPPING_DELETE).length,
        canonicalEntries: entries.filter(e => e.normalizedTo === "").length,
      })

      migratedCount++
    } catch (error) {
      logger.error(`Failed to migrate ${fieldName}`, { error })
    }
  }

  logger.info("Migration completed", { migratedCount, skippedCount })

  if (migratedCount > 0) {
    logger.info(`TSV files created in: ${tsvDir}`)
    logger.info("You can now delete the old JSON files if migration looks correct:")
    logger.info(`  rm -rf ${jsonDir}`)
  }
}

main()
