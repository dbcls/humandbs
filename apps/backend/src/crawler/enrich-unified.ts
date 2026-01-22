#!/usr/bin/env bun
/**
 * Enrich Unified JSON with external API metadata
 *
 * Enriches Unified structure with:
 * - DOI search for publications (via Crossref API)
 * - Original metadata from JGAD/DRA APIs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, cpSync } from "fs"
import { join, basename } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { batchSearchDois } from "@/crawler/doi"
import { getDraMetadata, isDraAccession } from "@/crawler/dra"
import { getResultsDirPath, ensureDir } from "@/crawler/io"
import { getJgadMetadata } from "@/crawler/jga"
import type {
  UnifiedResearch,
  UnifiedDataset,
  EnrichedUnifiedResearch,
  EnrichedUnifiedDataset,
  EnrichedUnifiedPublication,
} from "@/crawler/types"

// === Types ===

interface EnrichArgs {
  humId?: string
  force?: boolean
  noCache?: boolean
  skipCopy?: boolean
  skipDatasets?: boolean
  skipResearch?: boolean
  delayMs?: number
}

interface EnrichResult {
  datasetsEnriched: number
  datasetsSkipped: number
  researchEnriched: number
  researchSkipped: number
  errors: string[]
}

// === Directory Paths ===

const getStructuredJsonDir = (): string =>
  join(getResultsDirPath(), "structured-json")

const getEnrichedJsonDir = (): string =>
  join(getResultsDirPath(), "enriched-json")

// === Copy Functions ===

const copyStructuredToEnriched = (force: boolean, humId?: string): void => {
  const srcDir = getStructuredJsonDir()
  const destDir = getEnrichedJsonDir()

  if (!existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`)
  }

  const subdirs = ["research", "research-version", "dataset"]

  for (const subdir of subdirs) {
    const srcSubdir = join(srcDir, subdir)
    const destSubdir = join(destDir, subdir)

    if (!existsSync(srcSubdir)) {
      continue
    }

    ensureDir(destSubdir)

    const files = readdirSync(srcSubdir).filter(f => f.endsWith(".json"))

    for (const file of files) {
      // Filter by humId if specified
      if (humId && !file.startsWith(humId)) {
        continue
      }

      const srcPath = join(srcSubdir, file)
      const destPath = join(destSubdir, file)

      // Skip if destination exists and not force
      if (!force && existsSync(destPath)) {
        continue
      }

      cpSync(srcPath, destPath)
    }
  }

  console.log("Copied structured-json to enriched-json")
}

// === Dataset Enrichment ===

const getOriginalMetadata = async (
  datasetId: string,
  useCache: boolean,
): Promise<Record<string, unknown> | null> => {
  // Try JGAD first
  if (datasetId.startsWith("JGAD")) {
    return await getJgadMetadata(datasetId, useCache)
  }

  // Try DRA/ERA/SRA
  if (isDraAccession(datasetId)) {
    return await getDraMetadata(datasetId, useCache)
  }

  return null
}

const enrichDatasets = async (
  humId: string | undefined,
  useCache: boolean,
  delayMs: number,
): Promise<{ enriched: number; skipped: number; errors: string[] }> => {
  const datasetDir = join(getEnrichedJsonDir(), "dataset")
  if (!existsSync(datasetDir)) {
    return { enriched: 0, skipped: 0, errors: [] }
  }

  const files = readdirSync(datasetDir)
    .filter(f => f.endsWith(".json"))
    .filter(f => !humId || f.includes(humId))

  let enriched = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const filePath = join(datasetDir, file)

    try {
      const content = readFileSync(filePath, "utf-8")
      const dataset = JSON.parse(content) as UnifiedDataset

      // Skip if already has originalMetadata
      const existingEnriched = dataset as EnrichedUnifiedDataset
      if (existingEnriched.originalMetadata !== undefined) {
        skipped++
        continue
      }

      // Get original metadata
      const metadata = await getOriginalMetadata(dataset.datasetId, useCache)

      // Write enriched dataset
      const enrichedDataset: EnrichedUnifiedDataset = {
        ...dataset,
        originalMetadata: metadata,
      }

      writeFileSync(filePath, JSON.stringify(enrichedDataset, null, 2))
      enriched++

      console.log(`Enriched dataset: ${file}`)

      // Rate limiting
      if (i < files.length - 1 && metadata !== null) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    } catch (e) {
      const msg = `Failed to enrich dataset ${file}: ${e instanceof Error ? e.message : String(e)}`
      errors.push(msg)
      console.error(msg)
    }
  }

  return { enriched, skipped, errors }
}

// === Research Enrichment ===

const enrichResearch = async (
  humId: string | undefined,
  useCache: boolean,
  delayMs: number,
): Promise<{ enriched: number; skipped: number; errors: string[] }> => {
  const researchDir = join(getEnrichedJsonDir(), "research")
  if (!existsSync(researchDir)) {
    return { enriched: 0, skipped: 0, errors: [] }
  }

  const files = readdirSync(researchDir)
    .filter(f => f.endsWith(".json"))
    .filter(f => !humId || f.startsWith(humId))

  let enriched = 0
  let skipped = 0
  const errors: string[] = []

  for (const file of files) {
    const filePath = join(researchDir, file)

    try {
      const content = readFileSync(filePath, "utf-8")
      const research = JSON.parse(content) as UnifiedResearch

      // Check if all publications already have DOI
      const needsDoi = research.relatedPublication.some(
        pub => pub.doi === undefined || pub.doi === null,
      )

      if (!needsDoi) {
        skipped++
        continue
      }

      // Prepare publications for DOI search
      // Use English title first, fallback to Japanese
      const publications = research.relatedPublication.map(pub => ({
        title: pub.title.en ?? pub.title.ja ?? "",
        doi: pub.doi,
      }))

      // Batch search DOIs
      const humIdFromFile = basename(file, ".json")
      const doiResults = await batchSearchDois(
        humIdFromFile,
        publications,
        research.firstReleaseDate,
        useCache,
        delayMs,
      )

      // Enrich publications with DOI results
      const enrichedPublications: EnrichedUnifiedPublication[] = research.relatedPublication.map(pub => {
        const title = pub.title.en ?? pub.title.ja ?? ""
        const result = doiResults.get(title)

        if (result && result.doi) {
          return {
            ...pub,
            doi: result.doi,
          }
        }

        return pub
      })

      // Write enriched research
      const enrichedResearch: EnrichedUnifiedResearch = {
        ...research,
        relatedPublication: enrichedPublications,
      }

      writeFileSync(filePath, JSON.stringify(enrichedResearch, null, 2))
      enriched++

      console.log(`Enriched research: ${file}`)
    } catch (e) {
      const msg = `Failed to enrich research ${file}: ${e instanceof Error ? e.message : String(e)}`
      errors.push(msg)
      console.error(msg)
    }
  }

  return { enriched, skipped, errors }
}

// === Main ===

const main = async (args: EnrichArgs): Promise<EnrichResult> => {
  const useCache = !args.noCache
  const delayMs = args.delayMs ?? 100

  const result: EnrichResult = {
    datasetsEnriched: 0,
    datasetsSkipped: 0,
    researchEnriched: 0,
    researchSkipped: 0,
    errors: [],
  }

  // Step 1: Copy structured-json to enriched-json
  if (!args.skipCopy) {
    try {
      copyStructuredToEnriched(args.force ?? false, args.humId)
    } catch (e) {
      const msg = `Copy failed: ${e instanceof Error ? e.message : String(e)}`
      result.errors.push(msg)
      console.error(msg)
      return result
    }
  }

  // Step 2: Enrich datasets
  if (!args.skipDatasets) {
    console.log("\n=== Enriching datasets ===")
    const datasetResult = await enrichDatasets(args.humId, useCache, delayMs)
    result.datasetsEnriched = datasetResult.enriched
    result.datasetsSkipped = datasetResult.skipped
    result.errors.push(...datasetResult.errors)
  }

  // Step 3: Enrich research (DOI)
  if (!args.skipResearch) {
    console.log("\n=== Enriching research (DOI) ===")
    const researchResult = await enrichResearch(args.humId, useCache, delayMs)
    result.researchEnriched = researchResult.enriched
    result.researchSkipped = researchResult.skipped
    result.errors.push(...researchResult.errors)
  }

  return result
}

// === CLI ===

const argv = await yargs(hideBin(process.argv))
  .option("hum-id", {
    alias: "i",
    type: "string",
    description: "Process only the specified humId",
  })
  .option("force", {
    alias: "f",
    type: "boolean",
    description: "Overwrite enriched-json even if it exists",
    default: false,
  })
  .option("no-cache", {
    type: "boolean",
    description: "Ignore cache and fetch fresh from APIs",
    default: false,
  })
  .option("skip-copy", {
    type: "boolean",
    description: "Skip copying structured-json to enriched-json",
    default: false,
  })
  .option("skip-datasets", {
    type: "boolean",
    description: "Skip dataset enrichment",
    default: false,
  })
  .option("skip-research", {
    type: "boolean",
    description: "Skip research (DOI) enrichment",
    default: false,
  })
  .option("delay-ms", {
    type: "number",
    description: "Delay between API calls in milliseconds",
    default: 100,
  })
  .help()
  .parse()

const args: EnrichArgs = {
  humId: argv["hum-id"],
  force: argv.force,
  noCache: argv["no-cache"],
  skipCopy: argv["skip-copy"],
  skipDatasets: argv["skip-datasets"],
  skipResearch: argv["skip-research"],
  delayMs: argv["delay-ms"],
}

console.log("=== Enrich Unified JSON ===")
console.log(`humId: ${args.humId ?? "all"}`)
console.log(`force: ${args.force}`)
console.log(`noCache: ${args.noCache}`)
console.log(`skipCopy: ${args.skipCopy}`)
console.log(`skipDatasets: ${args.skipDatasets}`)
console.log(`skipResearch: ${args.skipResearch}`)
console.log(`delayMs: ${args.delayMs}`)

const result = await main(args)

console.log("\n=== Summary ===")
console.log(`Datasets enriched: ${result.datasetsEnriched}`)
console.log(`Datasets skipped: ${result.datasetsSkipped}`)
console.log(`Research enriched: ${result.researchEnriched}`)
console.log(`Research skipped: ${result.researchSkipped}`)

if (result.errors.length > 0) {
  console.log(`\nErrors (${result.errors.length}):`)
  for (const err of result.errors) {
    console.log(`  - ${err}`)
  }
  process.exit(1)
}

console.log("\nDone!")
