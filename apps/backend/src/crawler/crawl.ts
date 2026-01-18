/**
 * Crawl CLI - Parse HTML files and generate JSON
 *
 * Parses downloaded HTML files from crawler-results/html/ and generates
 * structured JSON in crawler-results/detail-json/.
 *
 * Usage:
 *   bun run crawler:crawl                    # Parse all humIds
 *   bun run crawler:crawl --hum-id hum0001   # Parse specific humId only
 *   bun run crawler:crawl --lang ja          # Japanese only
 */
import { existsSync, readFileSync, readdirSync } from "fs"
import { join } from "path"

import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { shouldSkipPage, DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "@/crawler/config"
import { parseDetailPage } from "@/crawler/detail"
import { getHtmlDir, writeDetailJson } from "@/crawler/io"
import { parseReleasePage } from "@/crawler/release"
import type { LangType, CrawlArgs, CrawlOneResult, CrawlHumIdResult } from "@/crawler/types"

// =============================================================================
// CLI argument parsing
// =============================================================================

const parseArgs = (): CrawlArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string", describe: "Target humId (e.g., hum0001)" })
    .option("lang", { choices: ["ja", "en"] as const, describe: "Language to parse" })
    .option("concurrency", { type: "number", default: DEFAULT_CONCURRENCY, describe: "Number of concurrent parses" })
    .parseSync() as CrawlArgs

// =============================================================================
// HTML file discovery
// =============================================================================

/**
 * Find the latest version number for a humId from HTML files
 * @example findLatestVersionFromHtml("hum0001") => 3
 */
export const findLatestVersionFromHtml = (humId: string): number => {
  const htmlDir = getHtmlDir()
  const files = readdirSync(htmlDir)
  const pattern = new RegExp(`^detail-${humId}-v(\\d+)-(ja|en)\\.html$`)

  let maxVersion = 0
  for (const file of files) {
    const match = file.match(pattern)
    if (match) {
      const version = parseInt(match[1], 10)
      if (version > maxVersion) maxVersion = version
    }
  }

  return maxVersion
}

/**
 * Find all humIds from HTML files
 */
export const findAllHumIdsFromHtml = (): string[] => {
  const htmlDir = getHtmlDir()
  const files = readdirSync(htmlDir)
  const humIds = new Set<string>()
  const pattern = /^detail-(hum\d+)-v\d+-(ja|en)\.html$/

  for (const file of files) {
    const match = file.match(pattern)
    if (match) {
      humIds.add(match[1])
    }
  }

  return Array.from(humIds).sort()
}

// =============================================================================
// Parsing functions
// =============================================================================

/**
 * Parse one humVersionId + lang from HTML files
 */
export const crawlOne = (
  humVersionId: string,
  lang: LangType,
): CrawlOneResult => {
  const htmlDir = getHtmlDir()

  // Detail page
  const detailPath = join(htmlDir, `detail-${humVersionId}-${lang}.html`)
  if (!existsSync(detailPath)) {
    return { success: false, hasRelease: false, error: `Detail HTML not found: ${detailPath}` }
  }
  const detailHtml = readFileSync(detailPath, "utf8")
  const parsed = parseDetailPage(detailHtml, humVersionId, lang)

  // Release page (may not exist)
  let hasRelease = false
  const releasePath = join(htmlDir, `release-${humVersionId}-${lang}-release.html`)
  if (existsSync(releasePath)) {
    const releaseHtml = readFileSync(releasePath, "utf8")
    const releases = parseReleasePage(releaseHtml, humVersionId, lang)
    parsed.releases = releases
    hasRelease = true
  }

  writeDetailJson(humVersionId, lang, parsed)
  return { success: true, hasRelease }
}

/**
 * Parse all versions for a humId
 */
const crawlAllVersionsForHumId = async (
  humId: string,
  langs: LangType[],
): Promise<CrawlHumIdResult> => {
  const latestVersion = findLatestVersionFromHtml(humId)
  if (latestVersion === 0) {
    return { parsed: 0, errors: 0, noRelease: 0 }
  }

  let parsed = 0
  let errors = 0
  let noRelease = 0

  for (let v = 1; v <= latestVersion; v++) {
    const humVersionId = `${humId}-v${v}`

    for (const lang of langs) {
      if (shouldSkipPage(humVersionId, lang)) continue

      try {
        const result = crawlOne(humVersionId, lang)
        if (result.success) {
          parsed++
          if (!result.hasRelease) noRelease++
        } else {
          errors++
          if (result.error) {
            console.error(`Error: ${humVersionId} (${lang}): ${result.error}`)
          }
        }
      } catch (e) {
        errors++
        console.error(`Error: ${humVersionId} (${lang}): ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return { parsed, errors, noRelease }
}

// =============================================================================
// Main function
// =============================================================================

const main = async (): Promise<void> => {
  const args = parseArgs()
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]
  const humIds = args.humId ? [args.humId] : findAllHumIdsFromHtml()

  if (humIds.length === 0) {
    console.log("No HTML files found. Run 'bun run crawler:download' first.")
    return
  }

  console.log(`Parsing ${humIds.length} humId(s), langs: ${langs.join(", ")}`)

  const conc = Math.max(1, Math.min(MAX_CONCURRENCY, args.concurrency ?? DEFAULT_CONCURRENCY))
  console.log(`Starting with concurrency: ${conc}`)

  let totalParsed = 0
  let totalErrors = 0
  let totalNoRelease = 0
  let completedHumIds = 0

  // Process humIds in batches
  for (let i = 0; i < humIds.length; i += conc) {
    const batch = humIds.slice(i, i + conc)
    const results = await Promise.all(
      batch.map(humId => crawlAllVersionsForHumId(humId, langs)),
    )

    for (const { parsed, errors, noRelease } of results) {
      totalParsed += parsed
      totalErrors += errors
      totalNoRelease += noRelease
    }
    completedHumIds += batch.length

    const percent = Math.round((completedHumIds / humIds.length) * 100)
    console.log(`Progress: ${completedHumIds}/${humIds.length} humIds (${percent}%), ${totalParsed} parsed${totalErrors > 0 ? ` [${totalErrors} errors]` : ""}`)
  }

  console.log(`Done: ${totalParsed} parsed, ${totalErrors} errors, ${totalNoRelease} without release page`)
}

if (import.meta.main) {
  await main()
}
