/**
 * TSV Import
 *
 * Imports manually edited TSV files back into JSON format.
 * Merges TSV changes into llm-extracted JSON files and outputs to final/ directory.
 *
 * Process:
 * 1. Copy llm-extracted → final
 * 2. Read TSV files
 * 3. Merge TSV edits into final JSON files
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getResultsDirPath } from "@/crawler/io"
import type {
  DiseaseInfo,
  PlatformInfo,
  DataVolume,
  DataVolumeUnit,
  EnrichedResearch,
  EnrichedPublication,
  SearchableEnrichedDataset,
  ExtractedExperimentFields,
} from "@/crawler/types"

// === TSV Parsing ===

type TsvRow = Record<string, string>;

function parseTsv(content: string): TsvRow[] {
  const lines = content.split("\n").filter(line => line.trim() !== "")
  if (lines.length === 0) return []

  const headers = lines[0].split("\t")
  const rows: TsvRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split("\t")
    const row: TsvRow = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = unescapeTsv(values[j] ?? "")
    }
    rows.push(row)
  }

  return rows
}

function unescapeTsv(value: string): string {
  return value
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
}

function parseJsonField<T>(value: string, defaultValue: T): T {
  if (!value || value.trim() === "") return defaultValue
  try {
    return JSON.parse(value) as T
  } catch {
    return defaultValue
  }
}

function parseJsonFieldOrNull<T>(value: string): T | null {
  if (!value || value.trim() === "") return null
  try {
    const parsed = JSON.parse(value) as T
    // Convert empty arrays to null
    if (Array.isArray(parsed) && parsed.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function parseNumberOrNull(value: string): number | null {
  if (!value || value.trim() === "") return null
  const num = parseFloat(value)
  return isNaN(num) ? null : num
}

function parseBooleanOrNull(value: string): boolean | null {
  if (!value || value.trim() === "") return null
  if (value === "true") return true
  if (value === "false") return false
  return null
}

// === Directory Functions ===

function getTsvDir(): string {
  return join(getResultsDirPath(), "tsv")
}

function getFinalDir(type: "research" | "research-version" | "dataset"): string {
  const dir = join(getResultsDirPath(), "final", type)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Copy llm-extracted to final (if not already exists)
 */
function copyExtractedToFinal(force = false): void {
  const srcBase = join(getResultsDirPath(), "llm-extracted")
  const dstBase = join(getResultsDirPath(), "final")

  if (!existsSync(srcBase)) {
    console.error("Error: llm-extracted directory does not exist")
    console.error("Please run extract-fields first")
    process.exit(1)
  }

  if (existsSync(dstBase) && !force) {
    console.log("final directory already exists (use --force to overwrite)")
    return
  }

  console.log("Copying llm-extracted to final...")
  cpSync(srcBase, dstBase, { recursive: true })
  console.log("Done copying")
}

// === Read/Write JSON ===

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as T
}

function writeJsonFile(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// === Import Publication TSV ===

function importPublicationTsv(): void {
  console.log("Importing research-publication.tsv...")

  const tsvPath = join(getTsvDir(), "research-publication.tsv")
  if (!existsSync(tsvPath)) {
    console.log("  Skip: research-publication.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  // Group by humId + lang
  const groupedRows = new Map<string, TsvRow[]>()
  for (const row of rows) {
    const key = `${row.humId}-${row.lang}`
    const existing = groupedRows.get(key) ?? []
    existing.push(row)
    groupedRows.set(key, existing)
  }

  // Update each research file
  const finalDir = getFinalDir("research")
  let updated = 0

  for (const [key, pubRows] of groupedRows) {
    const filename = `${key}.json`
    const filePath = join(finalDir, filename)

    const research = readJsonFile<EnrichedResearch>(filePath)
    if (!research) {
      console.warn(`  Skip: ${filename} not found`)
      continue
    }

    // Build new publications array
    const newPubs: EnrichedPublication[] = pubRows.map(row => ({
      title: row.title,
      doi: row.doi || null,
      datasetIds: parseJsonField<string[]>(row.datasetIds, []),
    }))

    research.relatedPublication = newPubs
    writeJsonFile(filePath, research)
    updated++
  }

  console.log(`  Updated ${updated} research files`)
}

// === Import Dataset TSV ===

function parseDisease(str: string): DiseaseInfo | null {
  if (!str) return null
  // Format: "label(icd10)" or just "label"
  const match = str.match(/^(.+?)\(([^)]+)\)$/)
  if (match) {
    return { label: match[1], icd10: match[2] }
  }
  return { label: str, icd10: null }
}

function parsePlatform(str: string): PlatformInfo | null {
  if (!str) return null
  // Format: "vendor:model"
  const parts = str.split(":")
  if (parts.length === 2) {
    return { vendor: parts[0], model: parts[1] }
  }
  return null
}

function parseDataVolume(str: string): DataVolume | null {
  if (!str) return null
  // Format: "123.45 GB" or "1.2 TB"
  const match = str.match(/^([\d.]+)\s*(KB|MB|GB|TB)$/i)
  if (match) {
    return {
      value: parseFloat(match[1]),
      unit: match[2].toUpperCase() as DataVolumeUnit,
    }
  }
  return null
}

function importDatasetTsv(): void {
  console.log("Importing dataset.tsv...")

  const tsvPath = join(getTsvDir(), "dataset.tsv")
  if (!existsSync(tsvPath)) {
    console.log("  Skip: dataset.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  const finalDir = getFinalDir("dataset")
  let updated = 0

  for (const row of rows) {
    const filename = `${row.datasetId}-${row.version}-${row.lang}.json`
    const filePath = join(finalDir, filename)

    const dataset = readJsonFile<SearchableEnrichedDataset>(filePath)
    if (!dataset) {
      console.warn(`  Skip: ${filename} not found`)
      continue
    }

    // Update searchable fields from TSV
    const diseases = parseJsonField<string[]>(row.searchable_diseases, [])
      .map(parseDisease)
      .filter((d): d is DiseaseInfo => d !== null)

    const platforms = parseJsonField<string[]>(row.searchable_platforms, [])
      .map(parsePlatform)
      .filter((p): p is PlatformInfo => p !== null)

    dataset.searchable = {
      ...dataset.searchable,
      diseases,
      tissues: parseJsonField<string[]>(row.searchable_tissues, []),
      assayTypes: parseJsonField<string[]>(row.searchable_assayTypes, []),
      platforms,
      readTypes: parseJsonField<string[]>(row.searchable_readTypes, []),
      fileTypes: parseJsonField<string[]>(row.searchable_fileTypes, []),
      totalSubjectCount: parseNumberOrNull(row.searchable_totalSubjectCount),
      totalDataVolume: parseDataVolume(row.searchable_totalDataVolume),
      hasHealthyControl: row.searchable_hasHealthyControl === "true",
      hasTumor: row.searchable_hasTumor === "true",
      hasCellLine: row.searchable_hasCellLine === "true",
    }

    // Update other fields
    dataset.typeOfData = row.typeOfData || null
    dataset.criteria = parseJsonFieldOrNull<string[]>(row.criteria)
    dataset.releaseDate = parseJsonFieldOrNull<string[]>(row.releaseDate)

    writeJsonFile(filePath, dataset)
    updated++
  }

  console.log(`  Updated ${updated} dataset files`)
}

// === Import Experiment TSV ===

function importExperimentTsv(): void {
  console.log("Importing experiment.tsv...")

  const tsvPath = join(getTsvDir(), "experiment.tsv")
  if (!existsSync(tsvPath)) {
    console.log("  Skip: experiment.tsv not found")
    return
  }

  const content = readFileSync(tsvPath, "utf8")
  const rows = parseTsv(content)

  // Group by dataset file
  const groupedRows = new Map<string, TsvRow[]>()
  for (const row of rows) {
    const filename = `${row.datasetId}-${row.version}-${row.lang}.json`
    const existing = groupedRows.get(filename) ?? []
    existing.push(row)
    groupedRows.set(filename, existing)
  }

  const finalDir = getFinalDir("dataset")
  let updated = 0

  for (const [filename, expRows] of groupedRows) {
    const filePath = join(finalDir, filename)

    const dataset = readJsonFile<SearchableEnrichedDataset>(filePath)
    if (!dataset) {
      console.warn(`  Skip: ${filename} not found`)
      continue
    }

    // Sort rows by experimentIndex
    expRows.sort((a, b) => parseInt(a.experimentIndex) - parseInt(b.experimentIndex))

    // Update experiments
    for (const row of expRows) {
      const index = parseInt(row.experimentIndex)
      if (index >= 0 && index < dataset.experiments.length) {
        const exp = dataset.experiments[index]

        // Parse diseases from JSON array of strings like ["label(icd10)", "label2"]
        const diseases = parseJsonField<string[]>(row.extracted_diseases, [])
          .map(parseDisease)
          .filter((d): d is DiseaseInfo => d !== null)

        const extracted: ExtractedExperimentFields = {
          subjectCount: parseNumberOrNull(row.extracted_subjectCount),
          subjectCountType: row.extracted_subjectCountType as "individual" | "sample" | "mixed" | null || null,
          healthStatus: row.extracted_healthStatus as "healthy" | "affected" | "mixed" | null || null,
          diseases,
          tissue: row.extracted_tissue || null,
          isTumor: parseBooleanOrNull(row.extracted_isTumor),
          cellLine: row.extracted_cellLine || null,
          assayType: row.extracted_assayType || null,
          libraryKit: row.extracted_libraryKit || null,
          platformVendor: row.extracted_platformVendor || null,
          platformModel: row.extracted_platformModel || null,
          readType: row.extracted_readType as "single-end" | "paired-end" | null || null,
          readLength: parseNumberOrNull(row.extracted_readLength),
          targets: row.extracted_targets || null,
          fileTypes: parseJsonField<string[]>(row.extracted_fileTypes, []),
          dataVolume: parseDataVolume(row.extracted_dataVolume),
        }

        exp.extracted = extracted
      }
    }

    writeJsonFile(filePath, dataset)
    updated++
  }

  console.log(`  Updated ${updated} dataset files`)
}

// === Import All ===

function importAllTsv(force: boolean): void {
  console.log("Starting TSV import...")

  // Step 1: Copy llm-extracted to final
  copyExtractedToFinal(force)

  // Step 2: Import TSV files
  const tsvDir = getTsvDir()
  if (!existsSync(tsvDir)) {
    console.log("TSV directory not found. Nothing to import.")
    return
  }

  importPublicationTsv()
  importDatasetTsv()
  importExperimentTsv()

  const outputDir = join(getResultsDirPath(), "final")
  console.log(`TSV import completed! Output: ${outputDir}`)
}

// === CLI ===

interface CliArgs {
  force?: boolean
}

function parseArgs(): CliArgs {
  return yargs(hideBin(process.argv))
    .option("force", {
      alias: "f",
      type: "boolean",
      default: false,
      description: "Force overwrite final directory",
    })
    .parseSync()
}

function main(): void {
  const args = parseArgs()
  importAllTsv(args.force ?? false)
}

if (import.meta.main) {
  main()
}

export {
  copyExtractedToFinal,
  importPublicationTsv,
  importDatasetTsv,
  importExperimentTsv,
  importAllTsv,
}
