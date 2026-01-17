/**
 * HTML download CLI
 *
 * Downloads HTML from the HumanDBs portal site and saves it as cache
 * in crawler-results/html/.
 *
 * Usage:
 *   bun run crawler:download                    # Download all humIds
 *   bun run crawler:download --hum-id hum0001   # Download specific humId only
 *   bun run crawler:download --lang ja          # Japanese only
 *   bun run crawler:download --force            # Ignore cache and re-download
 */
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { shouldSkipPage, DEFAULT_CONCURRENCY, MAX_CONCURRENCY, MAX_VERSION } from "@/crawler/config"
import { parseAllHumIds } from "@/crawler/home"
import {
  readHtml,
  genDetailUrl,
  genReleaseUrl,
} from "@/crawler/io"
import type { LangType, CrawlArgs } from "@/crawler/types"

const parseArgs = (): CrawlArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string", describe: "Target humId (e.g., hum0001)" })
    .option("lang", { choices: ["ja", "en"] as const, describe: "Language to download" })
    .option("force", { alias: "f", type: "boolean", default: false, describe: "Ignore existing cache and re-download" })
    .option("concurrency", { type: "number", default: DEFAULT_CONCURRENCY, describe: "Number of concurrent downloads" })
    .parseSync() as CrawlArgs & { force?: boolean }

export const downloadOne = async (
  humVersionId: string,
  lang: LangType,
  useCache: boolean,
): Promise<{ detail: boolean; release: boolean }> => {
  // Detail page
  await readHtml(
    genDetailUrl(humVersionId, lang),
    `detail-${humVersionId}-${lang}.html`,
    useCache,
  )

  // Release page (may not exist for all versions)
  let releaseDownloaded = false
  try {
    await readHtml(
      genReleaseUrl(humVersionId, lang),
      `release-${humVersionId}-${lang}-release.html`,
      useCache,
    )
    releaseDownloaded = true
  } catch {
    // Release page doesn't exist for this version - this is expected
  }

  return { detail: true, release: releaseDownloaded }
}

/**
 * Download all versions for a humId by trying v1, v2, v3... until 404.
 * Returns the number of versions downloaded.
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
      } catch (e) {
        // If detail page returns 404, this version doesn't exist
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes("404")) {
          // Version doesn't exist, stop trying higher versions
          continue
        }
        // Other errors (network issues, etc.)
        errors++
        console.error(`Error: ${humVersionId} (${lang}): ${msg}`)
      }
    }

    // If no language succeeded for this version, assume no more versions exist
    if (!versionExists) break
  }

  return { downloaded, errors }
}

const main = async (): Promise<void> => {
  const args = parseArgs() as CrawlArgs & { force?: boolean }
  const useCache = !args.force
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]
  const humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)

  console.log(`Downloading HTML for ${humIds.length} humId(s), langs: ${langs.join(", ")}`)
  console.log(`Cache: ${useCache ? "enabled" : "disabled"}`)

  const conc = Math.max(1, Math.min(MAX_CONCURRENCY, args.concurrency ?? DEFAULT_CONCURRENCY))
  console.log(`Starting download with concurrency: ${conc}`)

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
    console.log(`Progress: ${completedHumIds}/${humIds.length} humIds (${percent}%), ${totalDownloaded} files${totalErrors > 0 ? ` [${totalErrors} errors]` : ""}`)
  }

  console.log(`Done: ${totalDownloaded} downloaded, ${totalErrors} errors`)
}

if (require.main === module) {
  await main()
}
