import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { dumpDetailJsons } from "@/crawler/detail-json-dump"
import { generateEsJson } from "@/crawler/es-json-generator"
import { parseAllHumIds } from "@/crawler/home-parser"
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
]

const main = async () => {
  const args = parseArgs()
  const useCache = !args.noCache
  let humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)
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
