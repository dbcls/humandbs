/**
 * HTML download CLI
 *
 * Downloads HTML from the HumanDBs portal site and saves it as cache
 * in crawler-results/html/
 *
 * Usage:
 *   bun run crawler:download-html                    # Download all humIds
 *   bun run crawler:download-html --hum-id hum0001   # Download specific humId only
 *   bun run crawler:download-html --lang ja          # Japanese only
 *   bun run crawler:download-html --force            # Ignore cache and re-download
 */
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { shouldSkipPage, genReleaseUrl } from "@/crawler/config/mapping"
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY, MAX_VERSION, genDetailUrl } from "@/crawler/config/urls"
import { parseAllHumIds } from "@/crawler/parsers/home"
import type { LangType, CrawlArgs } from "@/crawler/types"
import { applyLogLevel, withCommonOptions } from "@/crawler/utils/cli-utils"
import { getErrorMessage } from "@/crawler/utils/error"
import { fetchHtmlCached } from "@/crawler/utils/http"
import { getResultsDir } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

const parseArgs = (): CrawlArgs => {
  const args = withCommonOptions(
    yargs(hideBin(process.argv))
      .option("hum-id", { alias: "i", type: "string", describe: "Target humId (e.g., hum0001)" })
      .option("lang", { choices: ["ja", "en"] as const, describe: "Language to download" })
      .option("force", { alias: "f", type: "boolean", default: false, describe: "Ignore existing cache and re-download" })
      .option("concurrency", { type: "number", default: DEFAULT_CONCURRENCY, describe: "Number of concurrent downloads" }),
  ).parseSync() as CrawlArgs

  applyLogLevel(args)
  return args
}

export const downloadOne = async (
  humVersionId: string,
  lang: LangType,
  useCache: boolean,
): Promise<void> => {
  // Detail page: 404 is expected for speculative version probing - don't log as warn
  await fetchHtmlCached(
    genDetailUrl(humVersionId, lang),
    `detail-${humVersionId}-${lang}.html`,
    useCache,
    { expectedErrorStatuses: [404] },
  )
}

/**
 * Download all versions for a humId by trying v1, v2, v3... until 404
 * Returns the number of versions downloaded
 *
 * Phase 1: Download detail pages for all versions
 * Phase 2: Download release page for latest version only
 *   (latest release page contains release notes for all versions)
 */
const downloadAllVersionsForHumId = async (
  humId: string,
  langs: LangType[],
  useCache: boolean,
): Promise<{ downloaded: number; errors: number }> => {
  let downloaded = 0
  let errors = 0
  let latestVersion = 0

  // Phase 1: Download detail pages for all versions
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
    latestVersion = v
  }

  // Phase 2: Download release page for latest version only
  if (latestVersion > 0) {
    const latestHumVersionId = `${humId}-v${latestVersion}`
    for (const lang of langs) {
      if (shouldSkipPage(latestHumVersionId, lang)) continue
      try {
        await fetchHtmlCached(
          genReleaseUrl(latestHumVersionId, lang),
          `release-${latestHumVersionId}-${lang}-release.html`,
          useCache,
        )
      } catch {
        logger.warn("Release page download failed", { humVersionId: latestHumVersionId, lang })
      }
    }
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

  // Process humIds in batches (using Promise.allSettled to continue on partial failures)
  for (let i = 0; i < humIds.length; i += conc) {
    const batch = humIds.slice(i, i + conc)
    const settledResults = await Promise.allSettled(
      batch.map(humId => downloadAllVersionsForHumId(humId, langs, useCache)),
    )

    for (let j = 0; j < settledResults.length; j++) {
      const result = settledResults[j]
      if (result.status === "fulfilled") {
        totalDownloaded += result.value.downloaded
        totalErrors += result.value.errors
      } else {
        totalErrors++
        logger.error("Batch download failed", { humId: batch[j], error: getErrorMessage(result.reason) })
      }
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
