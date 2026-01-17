/**
 * HTML ダウンロード専用 CLI
 *
 * HumanDBs のポータルサイトから HTML をダウンロードし、
 * crawler-results/html/ にキャッシュとして保存する。
 *
 * Usage:
 *   bun run crawler:download                     # 全ての humId をダウンロード
 *   bun run crawler:download --hum-id hum0001   # 特定の humId のみ
 *   bun run crawler:download --lang ja          # 日本語のみ
 *   bun run crawler:download --no-cache         # キャッシュを無視して再取得
 */
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import {
  readHtml,
  genDetailUrl,
  genReleaseUrl,
  findLatestVersionNum,
  headLatestVersionNum,
} from "@/crawler/fetch"
import { parseAllHumIds } from "@/crawler/home"
import type { LangType, CrawlArgs } from "@/crawler/types"

const parseArgs = (): CrawlArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string", describe: "Target humId (e.g., hum0001)" })
    .option("lang", { choices: ["ja", "en"] as const, describe: "Language to download" })
    .option("no-cache", { type: "boolean", default: false, describe: "Ignore existing cache and re-download" })
    .option("concurrency", { type: "number", default: 4, describe: "Number of concurrent downloads" })
    .parseSync()

const downloadOne = async (
  humVersionId: string,
  lang: LangType,
  useCache: boolean,
): Promise<void> => {
  // Detail page
  await readHtml(
    genDetailUrl(humVersionId, lang),
    `detail-${humVersionId}-${lang}.html`,
    useCache,
  )
  console.log(`Downloaded detail: ${humVersionId} (${lang})`)

  // Release page (may not exist for all versions)
  try {
    await readHtml(
      genReleaseUrl(humVersionId, lang),
      `release-${humVersionId}-${lang}-release.html`,
      useCache,
    )
    console.log(`Downloaded release: ${humVersionId} (${lang})`)
  } catch {
    // Release page doesn't exist for this version - this is expected
  }
}

const main = async (): Promise<void> => {
  const args = parseArgs()
  const useCache = !args.noCache
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]
  const humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)

  console.log(`Downloading HTML for ${humIds.length} humId(s), langs: ${langs.join(", ")}`)
  console.log(`Cache: ${useCache ? "enabled" : "disabled"}`)

  const tasks: (() => Promise<void>)[] = []

  for (const humId of humIds) {
    const latest = await findLatestVersionNum(humId, useCache).catch(() =>
      headLatestVersionNum(humId),
    )

    for (let v = 1; v <= latest; v++) {
      const humVersionId = `${humId}-v${v}`

      for (const lang of langs) {
        // Skip known missing pages
        if (humVersionId === "hum0003-v1" && lang === "en") continue

        tasks.push(async () => {
          try {
            await downloadOne(humVersionId, lang, useCache)
          } catch (e) {
            console.error(
              `Error downloading ${humVersionId} (${lang}): ${e instanceof Error ? e.message : String(e)}`,
            )
          }
        })
      }
    }
  }

  const conc = Math.max(1, Math.min(32, args.concurrency ?? 4))
  console.log(`Starting download with concurrency: ${conc}`)

  for (let i = 0; i < tasks.length; i += conc) {
    await Promise.all(tasks.slice(i, i + conc).map(fn => fn()))
  }

  console.log(`Download complete. Total tasks: ${tasks.length}`)
}

if (require.main === module) {
  await main()
}
