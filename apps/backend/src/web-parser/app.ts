import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { json } from "stream/consumers"

import { parseDetailPage, ParseResult } from "@/web-parser/detailParser"
import { parseHumIds } from "@/web-parser/homeParser"
import { humIds as allHumIds } from "@/web-parser/humIds"
import type { LangType } from "@/web-parser/types"
import { fetchHtmlUsingCache, getCacheDirPath } from "@/web-parser/utils"

const HOME_PAGE_URL = "https://humandbs.dbcls.jp/"
const DETAIL_PAGE_BASE_URL = "https://humandbs.dbcls.jp/"

export const headLatestVersionNum = async (humId: string): Promise<string> => {
  // Accessing https://humandbs.dbcls.jp/hum0001 will result in a redirect to https://humandbs.dbcls.jp/hum0001-v1.
  // This redirection mechanism is used to determine the latest version.
  // Returns the version number like "1"
  const url = `${DETAIL_PAGE_BASE_URL}${humId}`
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
    })
    const redirectedUrl = response.url
    const match = redirectedUrl.match(/https:\/\/humandbs\.dbcls\.jp\/(hum\d+)-v(\d+)/)
    if (match === null) {
      throw new Error(`Failed to parse hum id and version from ${redirectedUrl}`)
    }

    const versionStr = match[2]
    if (versionStr === undefined) {
      throw new Error(`Failed to parse version from ${redirectedUrl}`)
    }
    if (Number.isNaN(Number(versionStr))) {
      throw new Error(`Invalid version number: ${versionStr}`)
    }

    return versionStr
  } catch (error) {
    throw new Error(`Failed to HEAD ${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
export const findLatestVersionNum = (cacheDir: string, humId: string): string | null => {
  const files = readdirSync(cacheDir)
  const versionNums = files
    .filter(file => file.endsWith(".html"))
    .filter(file => file.startsWith(`detail-${humId}-`))
    .map(file => {
      const match = file.match(/detail-.*-v(\d+)-(ja|en)\.html/)
      if (match === null) {
        return null
      }
      return match[1]
    })
    .map(Number)
    .sort((a, b) => b - a)

  if (versionNums.length === 0) {
    return null
  }

  return String(versionNums[0])
}

interface ResearchSeriesWithHtml {
  humId: string
  versions: Record<string, Record<LangType, string | null>> // key: v1, value: { ja: "<html>", en: "<html>" }
  latestVersion: string
}

export const fetchResearchSeries = async (humId: string, cacheDir: string): Promise<ResearchSeriesWithHtml> => {
  let latestVersionNum = findLatestVersionNum(cacheDir, humId)
  if (latestVersionNum === null) {
    latestVersionNum = await headLatestVersionNum(humId)
  }

  const researchSeries: ResearchSeriesWithHtml = {
    humId,
    versions: {},
    latestVersion: `v${latestVersionNum}`,
  }
  for (let i = 1; i <= Number(latestVersionNum); i++) {
    const humVersionId = `${humId}-v${i}`

    const url = `${DETAIL_PAGE_BASE_URL}${humVersionId}`
    const html = await fetchHtmlUsingCache(url, cacheDir, `detail-${humVersionId}-ja.html`)

    let enHtml: string | null
    if (["hum0003"].some(humId => humVersionId.startsWith(humId))) {
      enHtml = null
    } else {
      const enUrl = `${DETAIL_PAGE_BASE_URL}en/${humVersionId}`
      enHtml = await fetchHtmlUsingCache(enUrl, cacheDir, `detail-${humVersionId}-en.html`)
    }
    researchSeries.versions[`v${i}`] = { ja: html, en: enHtml }
  }

  return researchSeries
}

const main = async () => {
  const cacheDir = getCacheDirPath()
  mkdirSync(cacheDir, { recursive: true })

  // Parse the home page to get humIds
  const homePageHtml = await fetchHtmlUsingCache(HOME_PAGE_URL, cacheDir, "home.html")
  let humIds = parseHumIds(homePageHtml)
  // let humIds = allHumIds
  humIds = humIds.filter(humId => !["hum0031", "hum0043", "hum0064", "hum0235", "hum0250", "hum0395", "hum0396", "hum0397", "hum0398"].includes(humId))
  const researchSeriesArray = await Promise.all(humIds.map(humId => fetchResearchSeries(humId, cacheDir)))

  // Parse the detail page
  // for (const researchSeries of researchSeriesArray) {
  //   for (const version of Object.keys(researchSeries.versions)) {
  //     // const humVersionId = `${researchSeries.humId}.${researchSeries.latestVersion}`
  //     const humVersionId = `${researchSeries.humId}.${version}`
  //     const latestVersion = researchSeries.versions[version]
  //     if (latestVersion.ja !== null) {
  //       try {
  //         const jaResult = parseDetailPage(humVersionId, latestVersion.ja, "ja")
  //         const jaFilePath = join(cacheDir, `${humVersionId}-ja.json`)
  //         writeFileSync(jaFilePath, JSON.stringify(jaResult, null, 2))
  //       } catch (error) {
  //         console.error("================================")
  //         console.error(`Failed to parse ${humVersionId} (ja): ${error instanceof Error ? error.message : String(error)}`)
  //         console.error(error.stack)
  //       }
  //     }
  //     if (latestVersion.en !== null) {
  //       try {
  //         const enResult = parseDetailPage(humVersionId, latestVersion.en, "en")
  //         const enFilePath = join(cacheDir, `${humVersionId}-en.json`)
  //         writeFileSync(enFilePath, JSON.stringify(enResult, null, 2))
  //       } catch (error) {
  //         console.error("================================")
  //         console.error(`Failed to parse ${humVersionId} (en): ${error instanceof Error ? error.message : String(error)}`)
  //         console.error(error.stack)
  //       }
  //     }
  //   }
  // }

  // === for debug ===
  const jsonFiles = readdirSync(cacheDir).filter(file => file.endsWith(".json"))
  const value = {
    ja: {
      aims: [] as string[],
      methods: [] as string[],
      targets: [] as string[],
      summary_url: [] as string[],
      datasets_dataId: [] as string[],
      datasets_typeOfData: [] as string[],
      datasets_criteria: [] as string[],
      datasets_releaseDate: [] as string[],
      molecularDataIds: [] as string[],
      molecularDataFooters: [] as string[],
      moleculerDataKeys: [] as string[],
      moleculerDataTargets: [] as string[],
    },
    en: {
      aims: [] as string[],
      methods: [] as string[],
      targets: [] as string[],
      summary_url: [] as string[],
      datasets_dataId: [] as string[],
      datasets_typeOfData: [] as string[],
      datasets_criteria: [] as string[],
      datasets_releaseDate: [] as string[],
      molecularDataIds: [] as string[],
      molecularDataFooters: [] as string[],
      moleculerDataKeys: [] as string[],
      moleculerDataTargets: [] as string[],
    },
  }
  const foundVal = []
  for (const jsonFile of jsonFiles) {
    const humVersionId = jsonFile.replace(/{-ja|-en}\.json/, "")
    const humId = humVersionId.split(".")[0]
    const version = humVersionId.split(".")[1]
    if (!humIds.includes(humId)) {
      continue
    }
    const jsonFilePath = join(cacheDir, jsonFile)
    const json = JSON.parse(readFileSync(jsonFilePath, "utf8")) as ParseResult
    const lang = jsonFile.includes("-ja.json") ? "ja" : "en"

    // push sentences
    value[lang].aims.push(json.summary.aims)
    value[lang].methods.push(json.summary.methods)
    value[lang].targets.push(json.summary.targets)
    value[lang].summary_url = value[lang].summary_url.concat(json.summary.url)
    // json.summary.url.forEach(url => {
    //   if (url === "JPDSC") {
    //     foundVal.push([humVersionId, lang])
    //   }
    // })
    const datasetsDataIds = json.datasets.flatMap(dataset => dataset.dataId.flatMap(dataId => dataId))
    // datasetsDataIds.forEach(dataId => {
    // if (dataId.includes("データ追加")) {
    //   foundVal.push([humVersionId, lang])
    // }
    // if (dataId === "（JGA000122）") {
    //   foundVal.push([humVersionId, lang])
    // }
    // })
    value[lang].datasets_dataId = value[lang].datasets_dataId.concat(datasetsDataIds)

    value[lang].datasets_typeOfData = value[lang].datasets_typeOfData.concat(json.datasets.flatMap(dataset => dataset.typeOfData.flatMap(typeOfData => typeOfData)))
    value[lang].datasets_criteria = value[lang].datasets_criteria.concat(json.datasets.flatMap(dataset => dataset.criteria.flatMap(criteria => criteria)))
    value[lang].datasets_releaseDate = value[lang].datasets_releaseDate.concat(json.datasets.flatMap(dataset => dataset.releaseDate.flatMap(releaseDate => releaseDate)))

    // molData
    value[lang].moleculerDataKeys = value[lang].moleculerDataKeys.concat(json.molecularData.flatMap(molData => Object.keys(molData.data)))
    value[lang].moleculerDataTargets = value[lang].moleculerDataTargets.concat(
      json.molecularData.flatMap(molData =>
        Object.entries(molData.data)
          .filter(([key, _]) => key === "Targets" || key === "規模")
          .flatMap(([_, value]) => value as string[]),
      ),
    )
    value[lang].molecularDataIds = value[lang].molecularDataIds.concat(json.molecularData.flatMap(molData => molData.ids))
    value[lang].molecularDataFooters = value[lang].molecularDataFooters.concat(json.molecularData.flatMap(molData => molData.footers))
  }

  type Lang = keyof typeof value
  for (const lang of ["ja", "en"] as Lang[]) {
    for (const [key, arr] of Object.entries(value[lang])) {
      const sorted_and_unique_values = [...new Set(arr)].sort()
      const tmp_result = `/app/apps/backend/tmp_results/${key}_${lang}.json`
      writeFileSync(tmp_result, JSON.stringify(sorted_and_unique_values, null, 2))
    }
  }
  console.log(foundVal)
}

if (require.main === module) {
  await main()
}
