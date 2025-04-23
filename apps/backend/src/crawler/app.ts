import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { dumpDetailJsons } from "@/crawler/detail-json-dump"
import { parseAllHumIds } from "@/crawler/home-parser"

import { dumpSummaryJson } from "./summary-dump"

interface Args {
  process?: "json" | "detail-json" | "summary"
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
      choices: ["json", "detail-json", "summary"] as const,
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
      ["$0", "Dump all humIds entries to JSON files"],
      ["$0 --process html", "Dump only HTML files"],
      ["$0 -p json-lines --humId 12345", "Dump JSON-Lines files for a specific humId"],
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
  if (processType === "json") {
    console.log("Dumping JSON files...")
    // await dumpDetailJsons(humIds, useCache)
  } else if (processType === "detail-json") {
    console.log("Dumping detail JSON files...")
    await dumpDetailJsons(humIds, useCache)
  } else if (processType === "summary") {
    console.log("Dumping summary files...")
    await dumpSummaryJson(humIds, useCache)
  }
}

if (require.main === module) {
  await main()
}
