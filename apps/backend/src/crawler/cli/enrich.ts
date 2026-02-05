#!/usr/bin/env bun
/**
 * Enrich Unified JSON with external API metadata
 *
 * Enriches structured-json in-place with:
 * - DOI search for publications (via Crossref API)
 * - Original metadata from JGAD/DRA APIs
 *
 * Idempotent: skips files that are already enriched (unless --force)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join, basename } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { batchSearchDois } from "@/crawler/api/doi"
import { getDraMetadata, getDraReleaseDate, isDraAccession } from "@/crawler/api/dra"
import { getJgadMetadata, getJgadReleaseDate } from "@/crawler/api/jga"
import { DEFAULT_API_DELAY_MS } from "@/crawler/config/urls"
import type {
  Research,
  Dataset,
  EnrichedResearch,
  EnrichedDataset,
  EnrichedPublication,
} from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getErrorMessage } from "@/crawler/utils/error"
import { getResultsDir } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// Types

interface EnrichArgs {
  humId?: string
  force?: boolean
  noCache?: boolean
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

// Directory Paths

const getStructuredJsonDir = (): string =>
  join(getResultsDir(), "structured-json")

// Dataset Enrichment

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

/**
 * Get release date from DDBJ Search API (datePublished)
 * Returns ISO 8601 date string (YYYY-MM-DD) or null
 */
const getReleaseDateFromDdbj = async (
  datasetId: string,
): Promise<string | null> => {
  // Try JGAD first
  if (datasetId.startsWith("JGAD")) {
    return await getJgadReleaseDate(datasetId)
  }

  // Try DRA/ERA/SRA
  if (isDraAccession(datasetId)) {
    return await getDraReleaseDate(datasetId)
  }

  return null
}

const enrichDatasets = async (
  humId: string | undefined,
  useCache: boolean,
  delayMs: number,
  force: boolean,
): Promise<{ enriched: number; skipped: number; errors: string[] }> => {
  const datasetDir = join(getStructuredJsonDir(), "dataset")
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
      const dataset = JSON.parse(content) as Dataset

      // Skip if already has originalMetadata (unless --force)
      const existingEnriched = dataset as EnrichedDataset
      if (!force && existingEnriched.originalMetadata !== undefined) {
        skipped++
        continue
      }

      // Get original metadata
      const metadata = await getOriginalMetadata(dataset.datasetId, useCache)

      // Get release date from DDBJ Search API (if available, overwrites existing value)
      const ddbjReleaseDate = await getReleaseDateFromDdbj(dataset.datasetId)
      const finalReleaseDate = ddbjReleaseDate ?? dataset.releaseDate

      // Write enriched dataset with updated releaseDate
      const enrichedDataset: EnrichedDataset = {
        ...dataset,
        releaseDate: finalReleaseDate,
        originalMetadata: metadata,
      }

      writeFileSync(filePath, JSON.stringify(enrichedDataset, null, 2))
      enriched++

      logger.info("Enriched dataset", { file })

      // Rate limiting
      if (i < files.length - 1 && metadata !== null) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    } catch (error) {
      const msg = `Failed to enrich dataset ${file}: ${getErrorMessage(error)}`
      errors.push(msg)
      logger.error("Failed to enrich dataset", { file, error: getErrorMessage(error) })
    }
  }

  return { enriched, skipped, errors }
}

// Research Enrichment

const enrichResearch = async (
  humId: string | undefined,
  useCache: boolean,
  delayMs: number,
  force: boolean,
): Promise<{ enriched: number; skipped: number; errors: string[] }> => {
  const researchDir = join(getStructuredJsonDir(), "research")
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
      const research = JSON.parse(content) as Research

      // Check if all publications already have DOI (unless --force)
      const needsDoi = research.relatedPublication.some(
        pub => pub.doi === undefined || pub.doi === null,
      )

      if (!force && !needsDoi) {
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
        research.datePublished,
        useCache,
        delayMs,
      )

      // Enrich publications with DOI results
      const enrichedPublications: EnrichedPublication[] = research.relatedPublication.map(pub => {
        const title = pub.title.en ?? pub.title.ja ?? ""
        const result = doiResults.get(title)

        if (result?.doi) {
          return {
            ...pub,
            doi: result.doi,
          }
        }

        return pub
      })

      // Write enriched research
      const enrichedResearch: EnrichedResearch = {
        ...research,
        relatedPublication: enrichedPublications,
      }

      writeFileSync(filePath, JSON.stringify(enrichedResearch, null, 2))
      enriched++

      logger.info("Enriched research", { file })
    } catch (error) {
      const msg = `Failed to enrich research ${file}: ${getErrorMessage(error)}`
      errors.push(msg)
      logger.error("Failed to enrich research", { file, error: getErrorMessage(error) })
    }
  }

  return { enriched, skipped, errors }
}

// Main

const main = async (args: EnrichArgs): Promise<EnrichResult> => {
  const useCache = !args.noCache
  const delayMs = args.delayMs ?? DEFAULT_API_DELAY_MS
  const force = args.force ?? false

  const result: EnrichResult = {
    datasetsEnriched: 0,
    datasetsSkipped: 0,
    researchEnriched: 0,
    researchSkipped: 0,
    errors: [],
  }

  // Enrich datasets
  if (!args.skipDatasets) {
    logger.info("Starting dataset enrichment")
    const datasetResult = await enrichDatasets(args.humId, useCache, delayMs, force)
    result.datasetsEnriched = datasetResult.enriched
    result.datasetsSkipped = datasetResult.skipped
    result.errors.push(...datasetResult.errors)
  }

  // Enrich research (DOI)
  if (!args.skipResearch) {
    logger.info("Starting research (DOI) enrichment")
    const researchResult = await enrichResearch(args.humId, useCache, delayMs, force)
    result.researchEnriched = researchResult.enriched
    result.researchSkipped = researchResult.skipped
    result.errors.push(...researchResult.errors)
  }

  return result
}

// CLI

const argv = await withCommonOptions(
  yargs(hideBin(process.argv))
    .option("hum-id", {
      alias: "i",
      type: "string",
      description: "Process only the specified humId",
    })
    .option("force", {
      alias: "f",
      type: "boolean",
      description: "Re-enrich even if already enriched",
      default: false,
    })
    .option("cache", {
      type: "boolean",
      description: "Use cache for API calls (use --no-cache to disable)",
      default: true,
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
    }),
)
  .help()
  .parse()

applyLogLevel(argv)

const args: EnrichArgs = {
  humId: argv["hum-id"],
  force: argv.force,
  noCache: !argv.cache,
  skipDatasets: argv["skip-datasets"],
  skipResearch: argv["skip-research"],
  delayMs: argv["delay-ms"],
}

logger.info("Starting enrich", {
  humId: args.humId ?? "all",
  force: args.force,
  noCache: args.noCache,
  skipDatasets: args.skipDatasets,
  skipResearch: args.skipResearch,
  delayMs: args.delayMs,
})

const result = await main(args)

logger.info("Completed", {
  datasetsEnriched: result.datasetsEnriched,
  datasetsSkipped: result.datasetsSkipped,
  researchEnriched: result.researchEnriched,
  researchSkipped: result.researchSkipped,
})

if (result.errors.length > 0) {
  logger.error(`Errors occurred: ${result.errors.length}`)
  for (const err of result.errors) {
    logger.error(err)
  }
  process.exit(1)
}
