#!/usr/bin/env bun
/**
 * Migration script: extracted → refined
 *
 * Migrates existing JSON files from the old schema (extracted, searchable)
 * to the new schema (refined, no searchable).
 *
 * Changes:
 * - experiments[].extracted → experiments[].refined
 * - removes searchable field from dataset
 *
 * Usage:
 *   bun run scripts/migrate-extracted-to-refined.ts [--dry-run]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const RESULTS_DIR = process.env.HUMANDBS_CRAWLER_RESULTS ?? "crawler-results"

interface OldDataset {
  searchable?: unknown
  experiments: Array<{
    extracted?: unknown
    refined?: unknown
    [key: string]: unknown
  }>
  [key: string]: unknown
}

interface NewDataset {
  experiments: Array<{
    refined: unknown
    [key: string]: unknown
  }>
  [key: string]: unknown
}

const migrateDataset = (dataset: OldDataset): NewDataset => {
  // Remove searchable field
  const { searchable: _searchable, ...rest } = dataset

  // Migrate experiments[].extracted → experiments[].refined
  const experiments = dataset.experiments.map((exp) => {
    const { extracted, refined, ...expRest } = exp

    // If already has refined, keep it; otherwise migrate from extracted
    const newRefined = refined ?? extracted ?? null

    return {
      ...expRest,
      refined: newRefined,
    }
  })

  return {
    ...rest,
    experiments,
  }
}

const main = async () => {
  const isDryRun = process.argv.includes("--dry-run")

  // Process extracted-json/dataset
  const extractedDir = join(RESULTS_DIR, "extracted-json", "dataset")
  if (existsSync(extractedDir)) {
    const files = readdirSync(extractedDir).filter((f) => f.endsWith(".json"))
    console.log(`Processing ${files.length} files in extracted-json/dataset...`)

    for (const file of files) {
      const filePath = join(extractedDir, file)
      const content = readFileSync(filePath, "utf8")
      const dataset = JSON.parse(content) as OldDataset

      // Check if migration is needed
      const needsMigration =
        "searchable" in dataset ||
        dataset.experiments.some((e) => "extracted" in e && !("refined" in e))

      if (!needsMigration) {
        console.log(`  [skip] ${file} (already migrated)`)
        continue
      }

      const migrated = migrateDataset(dataset)

      if (isDryRun) {
        console.log(`  [dry-run] Would migrate: ${file}`)
      } else {
        writeFileSync(filePath, JSON.stringify(migrated, null, 2), "utf8")
        console.log(`  [migrated] ${file}`)
      }
    }
  }

  // Process final/dataset
  const finalDir = join(RESULTS_DIR, "final", "dataset")
  if (existsSync(finalDir)) {
    const files = readdirSync(finalDir).filter((f) => f.endsWith(".json"))
    console.log(`Processing ${files.length} files in final/dataset...`)

    for (const file of files) {
      const filePath = join(finalDir, file)
      const content = readFileSync(filePath, "utf8")
      const dataset = JSON.parse(content) as OldDataset

      // Check if migration is needed
      const needsMigration =
        "searchable" in dataset ||
        dataset.experiments.some((e) => "extracted" in e && !("refined" in e))

      if (!needsMigration) {
        console.log(`  [skip] ${file} (already migrated)`)
        continue
      }

      const migrated = migrateDataset(dataset)

      if (isDryRun) {
        console.log(`  [dry-run] Would migrate: ${file}`)
      } else {
        writeFileSync(filePath, JSON.stringify(migrated, null, 2), "utf8")
        console.log(`  [migrated] ${file}`)
      }
    }
  }

  console.log("Done!")
}

main().catch(console.error)
