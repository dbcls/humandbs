#!/usr/bin/env bun
/**
 * Check Dataset Metadata Script
 *
 * Analyzes typeOfData null issues in structured-json/dataset files.
 * Helps diagnose why some datasets have null typeOfData.
 * Supports both unified (ja/en integrated) and legacy (per-language) formats.
 *
 * Usage:
 *   bun run scripts/check-dataset-metadata.ts
 *   bun run scripts/check-dataset-metadata.ts --hum-id hum0001
 *   bun run scripts/check-dataset-metadata.ts --show-all
 */
import { readdirSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getCriteriaCanonical } from "@/crawler/config"
import { getResultsDirPath } from "@/crawler/io"
import type { UnifiedDataset, NormalizedParseResult, TransformedDataset, CriteriaCanonical, BilingualText } from "@/crawler/types"

// === CLI argument parsing ===

interface Args {
  humId?: string
  showAll?: boolean
}

const parseArgs = (): Args =>
  yargs(hideBin(process.argv))
    .option("hum-id", {
      alias: "i",
      type: "string",
      describe: "Filter by humId (e.g., hum0001)",
    })
    .option("show-all", {
      alias: "a",
      type: "boolean",
      default: false,
      describe: "Show all datasets, not just those with null typeOfData",
    })
    .parseSync()

// === Analysis Types ===

interface DatasetAnalysis {
  datasetId: string
  version: string
  humId: string
  humVersionId: string
  typeOfData: BilingualText | null
  reason: string
}

interface SummaryDatasetInfo {
  datasetId: string[]
  typeOfData: string | null
}

// === Helper Functions ===

const getStructuredJsonDir = (): string =>
  join(getResultsDirPath(), "structured-json", "dataset")

const getNormalizedJsonDir = (): string =>
  join(getResultsDirPath(), "detail-json-normalized")

const readDatasetFile = (filename: string): UnifiedDataset | null => {
  const filePath = join(getStructuredJsonDir(), filename)
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as UnifiedDataset
}

/** Read bilingual format files (-ja.json and -en.json) and convert to UnifiedDataset-like structure */
const readBilingualDatasetFiles = (baseFilename: string): UnifiedDataset | null => {
  // baseFilename is like "JGAD000001-v1" (without -ja.json or -en.json)
  const jaPath = join(getStructuredJsonDir(), `${baseFilename}-ja.json`)
  const enPath = join(getStructuredJsonDir(), `${baseFilename}-en.json`)

  const jaDataset = existsSync(jaPath)
    ? (JSON.parse(readFileSync(jaPath, "utf8")) as TransformedDataset)
    : null
  const enDataset = existsSync(enPath)
    ? (JSON.parse(readFileSync(enPath, "utf8")) as TransformedDataset)
    : null

  const dataset = jaDataset ?? enDataset
  if (!dataset) return null

  // Convert criteria from display values to canonical
  const convertCriteria = (criteria: string[]): CriteriaCanonical[] => {
    return criteria
      .map(c => getCriteriaCanonical(c))
      .filter((c): c is CriteriaCanonical => c !== null)
  }

  // Convert to UnifiedDataset-like structure
  return {
    datasetId: dataset.datasetId,
    version: dataset.version,
    versionReleaseDate: dataset.versionReleaseDate,
    humId: dataset.humId,
    humVersionId: dataset.humVersionId,
    releaseDate: dataset.releaseDate,
    criteria: convertCriteria(dataset.criteria),
    typeOfData: {
      ja: jaDataset?.typeOfData || null,
      en: enDataset?.typeOfData || null,
    },
    experiments: [], // Not needed for this analysis
  }
}

const readNormalizedDetail = (
  humVersionId: string,
  lang: "ja" | "en",
): NormalizedParseResult | null => {
  const filePath = join(getNormalizedJsonDir(), `${humVersionId}-${lang}.json`)
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as NormalizedParseResult
}

const getSummaryDatasets = (
  humVersionId: string,
): SummaryDatasetInfo[] => {
  // Try ja first, then en
  const jaDetail = readNormalizedDetail(humVersionId, "ja")
  const enDetail = readNormalizedDetail(humVersionId, "en")
  const detail = jaDetail ?? enDetail
  if (!detail) return []

  return detail.summary.datasets.map((ds) => ({
    datasetId: ds.datasetId ?? [],
    typeOfData: ds.typeOfData,
  }))
}

/** Check if BilingualText has at least one non-null value */
const hasTypeOfData = (typeOfData: BilingualText | null): boolean => {
  if (!typeOfData) return false
  return typeOfData.ja !== null || typeOfData.en !== null
}

/** Format BilingualText for display */
const formatTypeOfData = (typeOfData: BilingualText | null): string => {
  if (!typeOfData) return "null"
  if (typeOfData.ja && typeOfData.en) {
    return `ja="${typeOfData.ja.substring(0, 30)}${typeOfData.ja.length > 30 ? "..." : ""}", en="${typeOfData.en.substring(0, 30)}${typeOfData.en.length > 30 ? "..." : ""}"`
  }
  if (typeOfData.ja) {
    return `ja="${typeOfData.ja.substring(0, 40)}${typeOfData.ja.length > 40 ? "..." : ""}"`
  }
  if (typeOfData.en) {
    return `en="${typeOfData.en.substring(0, 40)}${typeOfData.en.length > 40 ? "..." : ""}"`
  }
  return "null (both)"
}

const analyzeDataset = (dataset: UnifiedDataset): DatasetAnalysis => {
  const { datasetId, version, humId, humVersionId, typeOfData } = dataset

  if (hasTypeOfData(typeOfData)) {
    return {
      datasetId,
      version,
      humId,
      humVersionId,
      typeOfData,
      reason: "OK",
    }
  }

  // typeOfData is null or both ja/en are null - diagnose the reason
  const summaryDatasets = getSummaryDatasets(humVersionId)

  if (summaryDatasets.length === 0) {
    return {
      datasetId,
      version,
      humId,
      humVersionId,
      typeOfData,
      reason: "normalized detail not found or no summary.datasets",
    }
  }

  // Check if this datasetId is in summary.datasets
  const matchingSummary = summaryDatasets.find((sd) =>
    sd.datasetId.includes(datasetId),
  )

  if (matchingSummary) {
    if (matchingSummary.typeOfData === null) {
      return {
        datasetId,
        version,
        humId,
        humVersionId,
        typeOfData,
        reason: "summary.datasets has null typeOfData",
      }
    }
    return {
      datasetId,
      version,
      humId,
      humVersionId,
      typeOfData,
      reason: `unexpected: summary has typeOfData="${matchingSummary.typeOfData}" but dataset is null`,
    }
  }

  // datasetId not found in summary.datasets
  const availableIds = summaryDatasets.flatMap((sd) => sd.datasetId)
  if (availableIds.length === 0) {
    return {
      datasetId,
      version,
      humId,
      humVersionId,
      typeOfData,
      reason: "summary.datasets has no datasetIds",
    }
  }

  // Check for potential JGAS/JGAD mismatch
  const jgasPattern = /^JGAS\d{6}$/
  const jgadPattern = /^JGAD\d{6}$/

  if (jgadPattern.test(datasetId)) {
    const correspondingJgas = availableIds.find((id) => jgasPattern.test(id))
    if (correspondingJgas) {
      return {
        datasetId,
        version,
        humId,
        humVersionId,
        typeOfData,
        reason: `summary.datasets has ${correspondingJgas}, not ${datasetId} (JGAS/JGAD mismatch)`,
      }
    }
  }

  return {
    datasetId,
    version,
    humId,
    humVersionId,
    typeOfData,
    reason: `not in summary.datasets (available: ${availableIds.slice(0, 5).join(", ")}${availableIds.length > 5 ? "..." : ""})`,
  }
}

// === Main ===

const main = async (): Promise<void> => {
  const args = parseArgs()
  const dir = getStructuredJsonDir()

  if (!existsSync(dir)) {
    console.error(`Error: Structured JSON directory not found: ${dir}`)
    console.error("Run 'bun run crawler -- --process transform --unified' first.")
    process.exit(1)
  }

  // Unified format: JGAD000001-v1.json (no language suffix)
  // Bilingual format: JGAD000001-v1-ja.json or JGAD000001-v1-en.json
  const allFiles = readdirSync(dir).filter((f) => f.endsWith(".json"))

  // Check if we have unified format files
  const unifiedFiles = allFiles.filter((f) => !f.match(/-(?:ja|en)\.json$/))
  const bilingualFiles = allFiles.filter((f) => f.match(/-ja\.json$/))

  // Use unified format if available, otherwise use bilingual format
  const isUnifiedFormat = unifiedFiles.length > 0
  const filesToProcess = isUnifiedFormat
    ? unifiedFiles
    : bilingualFiles.map((f) => f.replace(/-ja\.json$/, "")) // Get base names

  const files = filesToProcess.filter((f) => {
    if (!args.humId) return true
    // Extract humId from the dataset file by reading it
    const dataset = isUnifiedFormat
      ? readDatasetFile(f)
      : readBilingualDatasetFiles(f)
    return dataset?.humId === args.humId
  })

  console.log(`Analyzing ${files.length} ${isUnifiedFormat ? "unified" : "bilingual"} dataset files...`)
  console.log("")

  const analyses: DatasetAnalysis[] = []
  let nullCount = 0
  let okCount = 0

  for (const file of files) {
    const dataset = isUnifiedFormat
      ? readDatasetFile(file)
      : readBilingualDatasetFiles(file)
    if (!dataset) continue

    // Filter by humId if specified
    if (args.humId && dataset.humId !== args.humId) continue

    const analysis = analyzeDataset(dataset)
    analyses.push(analysis)

    if (!hasTypeOfData(analysis.typeOfData)) {
      nullCount++
    } else {
      okCount++
    }
  }

  // Sort by reason for better grouping
  analyses.sort((a, b) => {
    // Put nulls first
    const aHasData = hasTypeOfData(a.typeOfData)
    const bHasData = hasTypeOfData(b.typeOfData)
    if (!aHasData && bHasData) return -1
    if (aHasData && !bHasData) return 1
    // Then sort by reason
    return a.reason.localeCompare(b.reason)
  })

  // Print results
  console.log("=== Dataset typeOfData Analysis (Unified Format) ===")
  console.log("")

  // Group by reason
  const reasonGroups = new Map<string, DatasetAnalysis[]>()
  for (const analysis of analyses) {
    if (!args.showAll && hasTypeOfData(analysis.typeOfData)) continue

    const key = analysis.reason
    const group = reasonGroups.get(key) ?? []
    group.push(analysis)
    reasonGroups.set(key, group)
  }

  for (const [reason, group] of reasonGroups) {
    console.log(`--- ${reason} (${group.length} datasets) ---`)
    for (const analysis of group.slice(0, 10)) {
      const typeStr = formatTypeOfData(analysis.typeOfData)
      console.log(
        `  ${analysis.datasetId}-${analysis.version} (${analysis.humVersionId}): typeOfData=${typeStr}`,
      )
    }
    if (group.length > 10) {
      console.log(`  ... and ${group.length - 10} more`)
    }
    console.log("")
  }

  // Summary
  console.log("=== Summary ===")
  console.log(`Total datasets: ${analyses.length}`)
  console.log(`  OK (has typeOfData): ${okCount}`)
  console.log(`  Null (missing typeOfData): ${nullCount}`)

  if (nullCount > 0) {
    console.log("")
    console.log("Reason breakdown:")
    for (const [reason, group] of reasonGroups) {
      if (!hasTypeOfData(group[0].typeOfData)) {
        console.log(`  ${reason}: ${group.length}`)
      }
    }
  }
}

if (import.meta.main) {
  await main()
}
