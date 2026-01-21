/**
 * Fetch External API CLI
 *
 * Fetches metadata from external APIs (JGAD, DRA, DOI) and enriches
 * structured-json data, outputting to enriched-json directory.
 *
 * Process:
 * 1. Copy structured-json → enriched-json
 * 2. For each dataset, fetch JGAD/DRA metadata and add originalMetadata
 * 3. For each research, search DOIs for publications and update
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { batchSearchDois } from "@/crawler/doi"
import { getDraMetadata, isDraAccession } from "@/crawler/dra"
import { getResultsDirPath } from "@/crawler/io"
import { getJgadMetadata } from "@/crawler/jga"
import type {
  TransformedDataset,
  TransformedResearch,
  EnrichedDataset,
  EnrichedResearch,
  EnrichedPublication,
} from "@/crawler/types"

// === Directory Functions ===

const getStructuredJsonDir = (type: "research" | "research-version" | "dataset"): string =>
  join(getResultsDirPath(), "structured-json", type)

const getEnrichedJsonDir = (type: "research" | "research-version" | "dataset"): string => {
  const dir = join(getResultsDirPath(), "enriched-json", type)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

// === Copy Functions ===

/**
 * Copy structured-json to enriched-json (if not already exists)
 */
export const copyStructuredToEnriched = (force = false): void => {
  const srcBase = join(getResultsDirPath(), "structured-json")
  const dstBase = join(getResultsDirPath(), "enriched-json")

  if (!existsSync(srcBase)) {
    console.error("Error: structured-json directory does not exist")
    process.exit(1)
  }

  if (existsSync(dstBase) && !force) {
    console.log("enriched-json directory already exists (use --force to overwrite)")
    return
  }

  console.log("Copying structured-json to enriched-json...")
  cpSync(srcBase, dstBase, { recursive: true })
  console.log("Done copying")
}

// === Read/Write Functions ===

const readJsonFile = <T>(filePath: string): T | null => {
  if (!existsSync(filePath)) {
    return null
  }
  const content = readFileSync(filePath, "utf8")
  return JSON.parse(content) as T
}

const writeJsonFile = (filePath: string, data: unknown): void => {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

// === Dataset Enrichment ===

/**
 * Get appropriate metadata for a dataset based on its ID type
 */
const getDatasetMetadata = async (
  datasetId: string,
  useCache: boolean,
): Promise<Record<string, unknown> | null> => {
  // Try JGAD first
  if (datasetId.startsWith("JGAD")) {
    const metadata = await getJgadMetadata(datasetId, useCache)
    if (metadata) {
      return metadata
    }
  }

  // Try DRA/ERA/SRA
  if (isDraAccession(datasetId)) {
    const metadata = await getDraMetadata(datasetId, useCache)
    if (metadata) {
      return metadata
    }
  }

  return null
}

/**
 * Enrich a single dataset with external metadata
 */
export const enrichDataset = async (
  dataset: TransformedDataset,
  useCache: boolean,
): Promise<EnrichedDataset> => {
  const metadata = await getDatasetMetadata(dataset.datasetId, useCache)

  return {
    ...dataset,
    originalMetadata: metadata,
  }
}

/**
 * Process all datasets for enrichment
 */
const processDatasets = async (
  humIds: string[] | null,
  useCache: boolean,
  delayMs: number,
): Promise<void> => {
  const srcDir = getStructuredJsonDir("dataset")
  const dstDir = getEnrichedJsonDir("dataset")

  if (!existsSync(srcDir)) {
    console.warn("Warning: structured-json/dataset directory does not exist")
    return
  }

  const files = readdirSync(srcDir).filter(f => f.endsWith(".json"))

  // Filter by humIds if specified
  const filteredFiles = humIds
    ? files.filter(f => humIds.some(id => f.startsWith(id.replace("-", ""))))
    : files

  console.log(`Processing ${filteredFiles.length} dataset files...`)

  for (let i = 0; i < filteredFiles.length; i++) {
    const filename = filteredFiles[i]
    const srcPath = join(srcDir, filename)
    const dstPath = join(dstDir, filename)

    const dataset = readJsonFile<TransformedDataset>(srcPath)
    if (!dataset) {
      console.warn(`  Skip: Could not read ${filename}`)
      continue
    }

    // Check if already enriched
    const existing = readJsonFile<EnrichedDataset>(dstPath)
    if (existing?.originalMetadata !== undefined && useCache) {
      console.log(`  Skip: ${filename} (already enriched)`)
      continue
    }

    console.log(`  Processing: ${filename}`)
    const enriched = await enrichDataset(dataset, useCache)
    writeJsonFile(dstPath, enriched)

    if (enriched.originalMetadata) {
      console.log(`    -> Added metadata for ${dataset.datasetId}`)
    }

    // Rate limiting
    if (i < filteredFiles.length - 1) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}

// === Research Enrichment ===

/**
 * Enrich publications with DOIs
 * Only keeps DOIs that were originally valid DOI URLs (score 100)
 * DOIs are stored as full URL format: https://doi.org/...
 */
const enrichPublications = async (
  humId: string,
  publications: EnrichedPublication[],
  firstReleaseDate: string | null,
  useCache: boolean,
): Promise<EnrichedPublication[]> => {
  // Prepare publications for batch search
  const pubsToSearch = publications.map(p => ({
    title: p.title,
    doi: p.doi,
  }))

  // Search DOIs (with year filter based on firstReleaseDate - 3 years)
  const doiResults = await batchSearchDois(humId, pubsToSearch, firstReleaseDate, useCache)

  // Merge results - only use DOI if score is 100 (original valid DOI URL)
  return publications.map(pub => {
    const result = doiResults.get(pub.title)
    if (result && result.score === 100) {
      // Format as full DOI URL
      const doiUrl = result.doi.startsWith("https://doi.org/")
        ? result.doi
        : `https://doi.org/${result.doi}`
      return {
        ...pub,
        doi: doiUrl,
      }
    }
    // Keep original URL or null
    return pub
  })
}

/**
 * Enrich a single research with DOI information
 */
export const enrichResearch = async (
  research: TransformedResearch,
  useCache: boolean,
): Promise<EnrichedResearch> => {
  const enrichedPubs = await enrichPublications(
    research.humId,
    research.relatedPublication as EnrichedPublication[],
    research.firstReleaseDate,
    useCache,
  )

  return {
    ...research,
    relatedPublication: enrichedPubs,
  }
}

/**
 * Process all research files for enrichment
 */
const processResearches = async (
  humIds: string[] | null,
  useCache: boolean,
): Promise<void> => {
  const srcDir = getStructuredJsonDir("research")
  const dstDir = getEnrichedJsonDir("research")

  if (!existsSync(srcDir)) {
    console.warn("Warning: structured-json/research directory does not exist")
    return
  }

  const files = readdirSync(srcDir).filter(f => f.endsWith(".json"))

  // Filter by humIds if specified
  const filteredFiles = humIds
    ? files.filter(f => humIds.some(id => f.startsWith(id)))
    : files

  console.log(`Processing ${filteredFiles.length} research files...`)

  for (const filename of filteredFiles) {
    const srcPath = join(srcDir, filename)
    const dstPath = join(dstDir, filename)

    const research = readJsonFile<TransformedResearch>(srcPath)
    if (!research) {
      console.warn(`  Skip: Could not read ${filename}`)
      continue
    }

    // Check if already enriched (has DOI URL on any publication)
    const existing = readJsonFile<EnrichedResearch>(dstPath)
    const alreadyEnriched = existing?.relatedPublication?.some(p => p.doi?.startsWith("https://doi.org/"))
    if (alreadyEnriched && useCache) {
      console.log(`  Skip: ${filename} (already enriched)`)
      continue
    }

    console.log(`  Processing: ${filename}`)
    const enriched = await enrichResearch(research, useCache)
    writeJsonFile(dstPath, enriched)

    const newDois = enriched.relatedPublication.filter(p => p.doi?.startsWith("https://doi.org/")).length
    if (newDois > 0) {
      console.log(`    -> Found ${newDois} DOIs`)
    }
  }
}

// === CLI ===

interface CliArgs {
  humId?: string[]
  force?: boolean
  noCache?: boolean
  skipCopy?: boolean
  skipDatasets?: boolean
  skipResearch?: boolean
  delayMs?: number
}

const parseArgs = (): CliArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", {
      alias: "i",
      type: "array",
      string: true,
      description: "Process only specified humIds",
    })
    .option("force", {
      alias: "f",
      type: "boolean",
      default: false,
      description: "Force overwrite enriched-json directory",
    })
    .option("no-cache", {
      type: "boolean",
      default: false,
      description: "Skip cache and fetch fresh data",
    })
    .option("skip-copy", {
      type: "boolean",
      default: false,
      description: "Skip copying structured-json to enriched-json",
    })
    .option("skip-datasets", {
      type: "boolean",
      default: false,
      description: "Skip dataset enrichment",
    })
    .option("skip-research", {
      type: "boolean",
      default: false,
      description: "Skip research (DOI) enrichment",
    })
    .option("delay-ms", {
      type: "number",
      default: 100,
      description: "Delay between API calls in milliseconds",
    })
    .parseSync()

const main = async (): Promise<void> => {
  const args = parseArgs()
  const useCache = !args.noCache

  console.log("=== Fetch External API ===")
  console.log(`Use cache: ${useCache}`)
  if (args.humId) {
    console.log(`Processing humIds: ${args.humId.join(", ")}`)
  }

  // Step 1: Copy structured-json to enriched-json
  if (!args.skipCopy) {
    copyStructuredToEnriched(args.force)
  }

  // Step 2: Enrich datasets with JGAD/DRA metadata
  if (!args.skipDatasets) {
    console.log("\n=== Enriching Datasets ===")
    await processDatasets(args.humId ?? null, useCache, args.delayMs ?? 100)
  }

  // Step 3: Enrich research with DOIs
  if (!args.skipResearch) {
    console.log("\n=== Enriching Research (DOIs) ===")
    await processResearches(args.humId ?? null, useCache)
  }

  const outputDir = join(getResultsDirPath(), "enriched-json")
  console.log(`\n=== Done! Output: ${outputDir} ===`)
}

if (import.meta.main) {
  await main()
}
