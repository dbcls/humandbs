/**
 * HTML download CLI
 *
 * Downloads HTML from the HumanDBs portal site and saves it as cache
 * in crawler-results/html/
 *
 * Usage:
 *   bun run crawler:download                    # Download all humIds
 *   bun run crawler:download --hum-id hum0001   # Download specific humId only
 *   bun run crawler:download --lang ja          # Japanese only
 *   bun run crawler:download --force            # Ignore cache and re-download
 */
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { shouldSkipPage, genReleaseUrl } from "@/crawler/config/mapping"
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY, MAX_VERSION, genDetailUrl } from "@/crawler/config/urls"
import { parseAllHumIds } from "@/crawler/parsers/home"
import type { LangType, CrawlArgs } from "@/crawler/types"
import { getErrorMessage } from "@/crawler/utils/error"
import { fetchHtmlCached } from "@/crawler/utils/http"
import { getResultsDir } from "@/crawler/utils/io"
import { logger, setLogLevel } from "@/crawler/utils/logger"

const parseArgs = (): CrawlArgs => {
  const args = yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string", describe: "Target humId (e.g., hum0001)" })
    .option("lang", { choices: ["ja", "en"] as const, describe: "Language to download" })
    .option("force", { alias: "f", type: "boolean", default: false, describe: "Ignore existing cache and re-download" })
    .option("concurrency", { type: "number", default: DEFAULT_CONCURRENCY, describe: "Number of concurrent downloads" })
    .option("verbose", { alias: "v", type: "boolean", default: false, describe: "Show debug logs" })
    .option("quiet", { alias: "q", type: "boolean", default: false, describe: "Show only warnings and errors" })
    .parseSync() as CrawlArgs

  if (args.verbose) {
    setLogLevel("debug")
  } else if (args.quiet) {
    setLogLevel("warn")
  }

  return args
}

export const downloadOne = async (
  humVersionId: string,
  lang: LangType,
  useCache: boolean,
): Promise<{ detail: boolean; release: boolean }> => {
  // Detail page: 404 is expected for speculative version probing - don't log as warn
  await fetchHtmlCached(
    genDetailUrl(humVersionId, lang),
    `detail-${humVersionId}-${lang}.html`,
    useCache,
    { expectedErrorStatuses: [404] },
  )

  // Release page: should exist if detail exists, so 404 should warn
  let releaseDownloaded = false
  try {
    await fetchHtmlCached(
      genReleaseUrl(humVersionId, lang),
      `release-${humVersionId}-${lang}-release.html`,
      useCache,
    )
    releaseDownloaded = true
  } catch {
    // Release page fetch failed - logged as warn if 404
  }

  return { detail: true, release: releaseDownloaded }
}

/**
 * Download all versions for a humId by trying v1, v2, v3... until 404
 * Returns the number of versions downloaded
 */
const downloadAllVersionsForHumId = async (
  humId: string,
  langs: LangType[],
  useCache: boolean,
): Promise<{ downloaded: number; errors: number }> => {
  let downloaded = 0
  let errors = 0

  for (let v = 1; v <= MAX_VERSION; v++) {
    const humVersionId = `${humId}-v${v}`
    let versionExists = false

    for (const lang of langs) {
      if (shouldSkipPage(humVersionId, lang)) continue

      try {
        await downloadOne(humVersionId, lang, useCache)
        versionExists = true
        downloaded++
      } catch (error) {
        // If detail page returns 404, this version doesn't exist
        const msg = getErrorMessage(error)
        if (msg.includes("404")) {
          // Version doesn't exist, stop trying higher versions
          continue
        }
        // Other errors (network issues, etc.)
        errors++
        logger.error("Download failed", { humVersionId, lang, error: msg })
      }
    }

    // If no language succeeded for this version, assume no more versions exist
    if (!versionExists) break
  }

  return { downloaded, errors }
}

const main = async (): Promise<void> => {
  const args = parseArgs()
  const useCache = !args.force
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]
  const humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)

  logger.info(`Starting download: ${humIds.length} humId(s), langs: ${langs.join(", ")}`)
  logger.info(`Cache: ${useCache ? "enabled" : "disabled"}`)

  const conc = Math.max(1, Math.min(MAX_CONCURRENCY, args.concurrency ?? DEFAULT_CONCURRENCY))
  logger.info(`Starting with concurrency: ${conc}`)

  let totalDownloaded = 0
  let totalErrors = 0
  let completedHumIds = 0

  // Process humIds in batches
  for (let i = 0; i < humIds.length; i += conc) {
    const batch = humIds.slice(i, i + conc)
    const results = await Promise.all(
      batch.map(humId => downloadAllVersionsForHumId(humId, langs, useCache)),
    )

    for (const { downloaded, errors } of results) {
      totalDownloaded += downloaded
      totalErrors += errors
    }
    completedHumIds += batch.length

    const percent = Math.round((completedHumIds / humIds.length) * 100)
    logger.info(`Progress: ${completedHumIds}/${humIds.length} humIds (${percent}%)`, { downloaded: totalDownloaded, errors: totalErrors })
  }

  const outputDir = join(getResultsDir(), "html")
  logger.info("Completed", { downloaded: totalDownloaded, errors: totalErrors, outputDir })
}

if (import.meta.main) {
  await main()
}
