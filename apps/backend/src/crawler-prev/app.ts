import { readFileSync } from "fs"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { dumpDetailJsons } from "@/crawler/detail-json-dump"
import { generateEsJson } from "@/crawler/es-json-generator"
import { dumpSummaryFiles } from "@/crawler/summary-dump"

interface Args {
  process?: "elasticsearch" | "detail" | "summary"
  humId?: string
  noCache: boolean
}

const parseArgs = (): Args => {
  const version = process.env.npm_package_version ?? "0.0.0"
  const args = yargs(hideBin(process.argv))
    .usage(`Usage: $0 [options]

HumanDBs backend crawler for fetching and processing previous portal site data.`)
    .option("process", {
      alias: "p",
      choices: ["elasticsearch", "detail", "summary"] as const,
    })
    .option("hum-id", {
      alias: "i",
      type: "string",
      description: "Specify the humId to process (default: all humIds)",
    })
    .option("no-cache", {
      type: "boolean",
      default: false,
      description: "Disable cache for HTML files",
    })
    .example([
      ["$0", "Dump all humIds entries to elasticsearch JSON files"],
      ["$0 --process summary", "Dump summary files"],
      ["$0 -p detail --humId 12345", "Dump detail JSON files for humId 12345"],
      ["$0 -p summary", "Dump summary files for all humIds"],
    ])
    .help()
    .alias("help", "h")
    .version(version)
    .alias("version", "v")
    .parseSync()

  return args
}

const FILTER_HUM_IDS = [
  "hum0031", // MRI 関係
  "hum0043", // MRI 関係
  "hum0235", // MRI 関係
  "hum0250", // MRI 関係
  "hum0395", // 健康調査
  "hum0396", // 健康調査
  "hum0397", // 健康調査
  "hum0398", // 健康調査
  "hum0375", // hot fix... (多分手作業で html が修正され、html の構造がまた変わっている。。。)
  "hum0499", // hot fix...
  "hum0501", // hot fix...
  "hum0505", // hot fix...
  "hum0003", // 例外が多すぎる
  "hum0009", // 例外が多すぎる
  "hum0014", // 例外が多すぎる
  "hum0197", // 例外が多すぎる
  "hum0015", // 例外が多すぎる
  "hum0082", // 例外が多すぎる
  //
  "hum0158", // Duplicate datasetIdLang found
  "hum0160", // Duplicate datasetIdLang found
  "hum0184", // Duplicate datasetIdLang found
  "hum0214", // Duplicate datasetIdLang found
  "hum0319", // Duplicate datasetIdLang found
]

const main = async () => {
  const args = parseArgs()
  const useCache = !args.noCache
  // let humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)
  // TODO: for debug
  const PAIR_PATH = "/app/apps/backend/src/crawler/hum-id-pair.json"
  const raw = readFileSync(PAIR_PATH, "utf-8")
  const pairs = JSON.parse(raw) as { humId: string; version: string }[]
  let humIds = Array.from(new Set(pairs.map((p) => p.humId)))
  // for debug done

  console.log(`Processing ${humIds.length} humIds...`)
  humIds = humIds.filter(humId => !FILTER_HUM_IDS.includes(humId))

  const processType = args.process ?? "json"
  if (processType === "elasticsearch") {
    console.log("Dumping elasticsearch JSON files...")
    await generateEsJson(humIds, useCache)
  } else if (processType === "detail") {
    console.log("Dumping detail JSON files...")
    await dumpDetailJsons(humIds, useCache)
  } else if (processType === "summary") {
    console.log("Dumping summary files...")
    await dumpSummaryFiles(humIds, useCache)
  }
}

if (require.main === module) {
  await main()
}
