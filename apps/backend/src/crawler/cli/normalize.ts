#!/usr/bin/env bun
/**
 * Normalize CLI - Normalize parsed JSON data
 *
 * Normalizes parsed data from crawler-results/detail-json/ and generates
 * normalized JSON in crawler-results/normalized-json/
 *
 * Normalization includes:
 * - Value interpretation: "-" as empty, annotations filtering
 * - Text normalization: whitespace, full-width characters, quotes
 * - Date formatting: YYYY/M/D → YYYY-MM-DD
 * - Dataset ID processing: expansion, JGAS→JGAD conversion
 * - Criteria canonicalization: Japanese/English → canonical form
 *
 * Usage:
 *   bun run crawler:normalize                    # Normalize all humIds
 *   bun run crawler:normalize --hum-id hum0001   # Normalize specific humId only
 *   bun run crawler:normalize --lang ja          # Japanese only
 */
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { getDatasetsFromStudy, saveRelationCache } from "@/crawler/api/jga"
import { extractIdsByType } from "@/crawler/config/patterns"
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY, HUMANDBS_BASE_URL } from "@/crawler/config/urls"
import { normalizeParseResult, type NormalizeOptions } from "@/crawler/processors/normalize"
import type { LangType, RawParseResult } from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getErrorMessage } from "@/crawler/utils/error"
import {
  listParsedFiles,
  readParsedJson,
  writeNormalizedJson,
} from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

// CLI argument types

interface NormalizeArgs {
  humId?: string
  lang?: LangType
  concurrency: number
  verbose?: boolean
  quiet?: boolean
}

// CLI argument parsing

const parseArgs = (): NormalizeArgs => {
  const args = withCommonOptions(
    yargs(hideBin(process.argv))
      .option("hum-id", { alias: "i", type: "string", describe: "Target humId (e.g., hum0001)" })
      .option("lang", { choices: ["ja", "en"] as const, describe: "Language to normalize" })
      .option("concurrency", { type: "number", default: DEFAULT_CONCURRENCY, describe: "Number of concurrent normalizations" }),
  ).parseSync() as NormalizeArgs

  applyLogLevel(args)
  return args
}

// Normalize one file

interface NormalizeOneResult {
  success: boolean
  error?: string
}

const normalizeOne = async (
  humVersionId: string,
  lang: LangType,
  options: NormalizeOptions,
): Promise<NormalizeOneResult> => {
  try {
    const parsed = readParsedJson<RawParseResult>(humVersionId, lang)
    if (!parsed) {
      return { success: false, error: `Parsed JSON not found: ${humVersionId}-${lang}` }
    }

    const normalized = await normalizeParseResult(parsed, humVersionId, lang, options)
    writeNormalizedJson(humVersionId, lang, normalized)

    return { success: true }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

// Main function

const main = async (): Promise<void> => {
  const args = parseArgs()
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]

  const files = listParsedFiles({ humId: args.humId, langs })

  if (files.length === 0) {
    logger.info("No parsed JSON files found. Run 'bun run crawler:parse-html' first.")
    return
  }

  logger.info(`Starting normalize: ${files.length} file(s), langs: ${langs.join(", ")}`)

  // Prepare normalize options
  const options: NormalizeOptions = {
    baseUrl: HUMANDBS_BASE_URL,
    getDatasetsFromStudy,
    extractIdsByType,
  }

  const conc = Math.max(1, Math.min(MAX_CONCURRENCY, args.concurrency))
  logger.info(`Starting with concurrency: ${conc}`)

  let totalNormalized = 0
  let totalErrors = 0
  let validationErrors = 0
  let completedFiles = 0

  // Update options with validation error callback
  const optionsWithCallback: NormalizeOptions = {
    ...options,
    onValidationError: () => { validationErrors++ },
  }

  // Process files in batches (using Promise.allSettled to continue on partial failures)
  for (let i = 0; i < files.length; i += conc) {
    const batch = files.slice(i, i + conc)
    const settledResults = await Promise.allSettled(
      batch.map(({ humVersionId, lang }) => normalizeOne(humVersionId, lang, optionsWithCallback)),
    )

    for (let j = 0; j < settledResults.length; j++) {
      const result = settledResults[j]
      if (result.status === "fulfilled") {
        if (result.value.success) {
          totalNormalized++
        } else {
          totalErrors++
          if (result.value.error) {
            logger.error("Normalize failed", { ...batch[j], error: result.value.error })
          }
        }
      } else {
        totalErrors++
        logger.error("Batch normalize failed", { ...batch[j], error: getErrorMessage(result.reason) })
      }
    }
    completedFiles += batch.length

    const percent = Math.round((completedFiles / files.length) * 100)
    logger.info(`Progress: ${completedFiles}/${files.length} files (${percent}%)`, { normalized: totalNormalized, errors: totalErrors })
  }

  // Save JGA API cache
  saveRelationCache()

  logger.info("Completed", { normalized: totalNormalized, errors: totalErrors, validationErrors })
}

if (import.meta.main) {
  await main()
}
