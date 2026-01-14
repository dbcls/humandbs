import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { parseDetailPage } from "@/crawler/detail"
import {
  readHtml,
  genDetailUrl,
  findLatestVersionNum,
  headLatestVersionNum,
  writeDetailJson,
  genReleaseUrl,
} from "@/crawler/fetch"
import { parseAllHumIds } from "@/crawler/home"
import { parseReleasePage } from "@/crawler/release"
import type { LangType, CrawlArgs } from "@/crawler/types"

const parseArgs = (): CrawlArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string" })
    .option("lang", { choices: ["ja", "en"] as const })
    .option("no-cache", { type: "boolean", default: false })
    .option("concurrency", { type: "number", default: 4 })
    .parseSync()

const processOneDetail = async (
  humVersionId: string,
  lang: LangType,
  useCache: boolean,
): Promise<void> => {
  const detailHtml = await readHtml(
    genDetailUrl(humVersionId, lang),
    `detail-${humVersionId}-${lang}.html`,
    useCache,
  )
  const parsed = parseDetailPage(detailHtml, humVersionId, lang)
  try {
    const releaseHtml = await readHtml(
      genReleaseUrl(humVersionId, lang),
      `release-${humVersionId}-${lang}-release.html`,
      useCache,
    )
    const releases = parseReleasePage(releaseHtml, humVersionId, lang)
    parsed.releases = releases
  } catch (e) {
    console.error(`Failed to fetch release page for ${humVersionId} (${lang}): ${e instanceof Error ? e.message : String(e)}`)
  }

  writeDetailJson(humVersionId, lang, parsed)
}

const main = async (): Promise<void> => {
  const args = parseArgs()
  const useCache = !args.noCache
  const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]
  const humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)

  const tasks: (() => Promise<void>)[] = []

  for (const humId of humIds) {
    const latest = await findLatestVersionNum(humId, useCache).catch(() =>
      headLatestVersionNum(humId),
    )

    for (let v = 1; v <= latest; v++) {
      const humVersionId = `${humId}-v${v}`

      for (const lang of langs) {
        if (humVersionId === "hum0003-v1" && lang === "en") continue

        tasks.push(async () => {
          try {
            await processOneDetail(humVersionId, lang, useCache)
          } catch (e) {
            console.error(
              `Error processing ${humVersionId} (${lang}): ${e instanceof Error ? e.message : String(e)
              }`,
            )
          }
        })
      }
    }
  }

  const conc = Math.max(1, Math.min(32, args.concurrency ?? 4))
  for (let i = 0; i < tasks.length; i += conc) {
    await Promise.all(tasks.slice(i, i + conc).map(fn => fn()))
  }
}

if (require.main === module) {
  await main()
}
