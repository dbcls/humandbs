import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { json } from "stream/consumers"

import { parseDetailPage, ParseResult } from "@/web-parser/detailParser"
import { parseHumIds } from "@/web-parser/homeParser"
import { humIds as allHumIds } from "@/web-parser/humIds"
import { normalizer } from "@/web-parser/normalizer"
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

export const parseAndDumpJson = (researchSeriesArray: ResearchSeriesWithHtml[], cacheDir: string): void => {
  for (const researchSeries of researchSeriesArray) {
    for (const version of Object.keys(researchSeries.versions)) {
      const humVersionId = `${researchSeries.humId}.${version}`
      const latestVersion = researchSeries.versions[version]
      if (latestVersion.ja !== null) {
        try {
          const jaResult = parseDetailPage(humVersionId, latestVersion.ja, "ja")
          normalizer(humVersionId, "ja", jaResult)
          const jaFilePath = join(cacheDir, `${humVersionId}-ja.json`)
          writeFileSync(jaFilePath, JSON.stringify(jaResult, null, 2))
        } catch (error) {
          console.error("================================")
          console.error(`Failed to parse ${humVersionId} (ja): ${error instanceof Error ? error.message : String(error)}`)
          if (error instanceof Error) {
            console.error(error.stack)
          }
        }
      }
      if (latestVersion.en !== null) {
        try {
          const enResult = parseDetailPage(humVersionId, latestVersion.en, "en")
          normalizer(humVersionId, "en", enResult)
          const enFilePath = join(cacheDir, `${humVersionId}-en.json`)
          writeFileSync(enFilePath, JSON.stringify(enResult, null, 2))
        } catch (error) {
          console.error("================================")
          console.error(`Failed to parse ${humVersionId} (en): ${error instanceof Error ? error.message : String(error)}`)
          if (error instanceof Error) {
            console.error(error.stack)
          }
        }
      }
    }
  }
}

export const dumpSummaryFiles = (cacheDir: string): void => {
  const jsonFiles = readdirSync(cacheDir).filter(file => file.endsWith(".json"))

  const summarizedValue: Record<LangType, Record<string, any>> = {} // eslint-disable-line @typescript-eslint/no-explicit-any

  const pushValue = (lang: LangType, humVersionId: string, key: string, value: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (summarizedValue[lang] === undefined) summarizedValue[lang] = {}
    if (summarizedValue[lang][key] === undefined) summarizedValue[lang][key] = []
    if (value === null) return
    if (Array.isArray(value)) {
      value.forEach((v: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (v === null) return
        summarizedValue[lang][key].push({ humVersionId, value: v })
      })
    } else {
      summarizedValue[lang][key].push({ humVersionId, value })
    }
  }

  for (const jsonFile of jsonFiles) {
    const humVersionId = jsonFile.replace(/(-ja|-en)\.json/, "")
    const humId = humVersionId.split(".")[0]
    const version = humVersionId.split(".")[1]
    const lang = jsonFile.includes("-ja.json") ? "ja" : "en"
    const jsonFilePath = join(cacheDir, jsonFile)
    const jsonData = JSON.parse(readFileSync(jsonFilePath, "utf8")) as ParseResult
    normalizer(humVersionId, lang, jsonData)

    // SUMMARY
    pushValue(lang, humVersionId, "summary-aims", jsonData.summary.aims)
    pushValue(lang, humVersionId, "summary-methods", jsonData.summary.methods)
    pushValue(lang, humVersionId, "summary-targets", jsonData.summary.targets)
    pushValue(lang, humVersionId, "summary-url", jsonData.summary.url)

    // Dataset
    pushValue(lang, humVersionId, "dataset-dataId", jsonData.datasets.flatMap(dataset => dataset.dataId.flatMap(dataId => dataId)))
    pushValue(lang, humVersionId, "dataset-typeOfData", jsonData.datasets.flatMap(dataset => dataset.typeOfData.flatMap(typeOfData => typeOfData)))
    pushValue(lang, humVersionId, "dataset-criteria", jsonData.datasets.flatMap(dataset => dataset.criteria.flatMap(criteria => criteria)))
    pushValue(lang, humVersionId, "dataset-releaseDate", jsonData.datasets.flatMap(dataset => dataset.releaseDate.flatMap(releaseDate => releaseDate)),
    )

    // MOLECULAR DATA
    pushValue(lang, humVersionId, "moldata-keys", jsonData.molecularData.flatMap(molData => Object.keys(molData.data)))
    pushValue(lang, humVersionId, "moldata-targets-values", jsonData.molecularData.flatMap(molData =>
      Object.entries(molData.data)
        .filter(([key, _]) => key === "Targets" || key === "規模")
        .flatMap(([_, value]) => value as string[]),
    ).map(value => {
      if (typeof value === "object") {
        return value.text as string
      } else {
        return value
      }
    }))
    pushValue(lang, humVersionId, "moldata-ids", jsonData.molecularData.flatMap(molData => molData.ids))
    pushValue(lang, humVersionId, "moldata-footers", jsonData.molecularData.flatMap(molData => molData.footers))

    // DATA PROVIDER
    pushValue(lang, humVersionId, "datapro-pi", jsonData.dataProvider.principalInvestigator)
    pushValue(lang, humVersionId, "datapro-affiliation", jsonData.dataProvider.affiliation)
    pushValue(lang, humVersionId, "datapro-projectName", jsonData.dataProvider.projectName)
    pushValue(lang, humVersionId, "datapro-projectUrl", jsonData.dataProvider.projectUrl)
    pushValue(lang, humVersionId, "datapro-grant-grantName", jsonData.dataProvider.grants.flatMap(grant => grant.grantName))
    pushValue(lang, humVersionId, "datapro-grant-grantId", jsonData.dataProvider.grants.flatMap(grant => grant.grantId))
    pushValue(lang, humVersionId, "datapro-grant-projectTitle", jsonData.dataProvider.grants.flatMap(grant => grant.projectTitle))

    // PUBLICATION
    pushValue(lang, humVersionId, "publication-title", jsonData.publications.flatMap(pub => pub.title))
    pushValue(lang, humVersionId, "publication-doi", jsonData.publications.flatMap(pub => pub.doi))
    pushValue(lang, humVersionId, "publication-datasetIds", jsonData.publications.flatMap(pub => pub.datasetIds))

    // CONTROLLED ACCESS USERS
    pushValue(lang, humVersionId, "ca-users-pi", jsonData.controlledAccessUsers.flatMap(caUser => caUser.principalInvestigator))
    pushValue(lang, humVersionId, "ca-users-affiliation", jsonData.controlledAccessUsers.flatMap(caUser => caUser.affiliation))
    pushValue(lang, humVersionId, "ca-users-country", jsonData.controlledAccessUsers.flatMap(caUser => caUser.country))
    pushValue(lang, humVersionId, "ca-users-datasetIds", jsonData.controlledAccessUsers.flatMap(caUser => caUser.datasetIds))
    pushValue(lang, humVersionId, "ca-users-periodOfDataUse", jsonData.controlledAccessUsers.flatMap(caUser => caUser.periodOfDataUse))
  }

  for (const lang of ["ja", "en"] as LangType[]) {
    for (const [key, value] of Object.entries(summarizedValue[lang])) {
      const tmpResultPath = `/app/apps/backend/tmp_results/${key}-${lang}.json`
      const sortedAndUniqueValues = [...new Set(value.map((v: any) => v.value))].sort() // eslint-disable-line @typescript-eslint/no-explicit-any
      writeFileSync(tmpResultPath, JSON.stringify(sortedAndUniqueValues, null, 2))

      if (value.length !== 0) {
        if (typeof value[0].value === "object") {
          const insideKeys = Object.keys(value[0].value)
          for (const insideKey of insideKeys) {
            const tmpResultPathWithInsideKey = `/app/apps/backend/tmp_results/${key}-${lang}-${insideKey}.json`
            const sortedAndUniqueValuesInsideKey = [...new Set(value.map((v: any) => v.value[insideKey]))].sort() // eslint-disable-line @typescript-eslint/no-explicit-any
            writeFileSync(tmpResultPathWithInsideKey, JSON.stringify(sortedAndUniqueValuesInsideKey, null, 2))
          }
        }
      }

      const tmpResultPathWithHumIds = `/app/apps/backend/tmp_results/${key}-${lang}-with-humIds.json`
      writeFileSync(tmpResultPathWithHumIds, JSON.stringify(value, null, 2))
    }
  }

  // Dump for mol data targets and keys
  // moldata-keys
  for (const lang of ["ja", "en"] as LangType[]) {
    const molDataKeysRows = {}
    const items = summarizedValue[lang]["moldata-keys"]
    for (const item of items) {
      if (molDataKeysRows[item.value] === undefined) {
        molDataKeysRows[item.value] = [item.value, "", [item.humVersionId]]
      } else {
        molDataKeysRows[item.value][2].push(item.humVersionId)
      }
    }
    const filePath = `/app/apps/backend/tmp_results/moldata-keys-${lang}.tsv`
    writeFileSync(filePath, Object.values(molDataKeysRows).map(row => row.join("\t")).join("\n"))
  }

  // moldata-targets-values
  const header = ["実際の値", "正規化された値", "humVersionIds"]
  for (const key of ["dataset-typeOfData", "moldata-targets-values", "moldata-keys"]) {
    for (const lang of ["ja", "en"] as LangType[]) {
      const molDataKeysRows = {}
      const items = summarizedValue[lang][key]
      for (const item of items) {
        if (molDataKeysRows[item.value] === undefined) {
          molDataKeysRows[item.value] = [item.value, "", [item.humVersionId]]
        } else {
          molDataKeysRows[item.value][2].push(item.humVersionId)
        }
      }
      const filePath = `/app/apps/backend/tmp_results/${key}-${lang}.tsv`
      writeFileSync(filePath, [header, ...Object.values(molDataKeysRows)].map(row => row.join("\t")).join("\n"))
    }
  }
}

const main = async () => {
  const cacheDir = getCacheDirPath()
  mkdirSync(cacheDir, { recursive: true })

  // Parse the home page to get humIds
  // const homePageHtml = await fetchHtmlUsingCache(HOME_PAGE_URL, cacheDir, "home.html")
  // let humIds = parseHumIds(homePageHtml)
  let humIds = allHumIds
  humIds = humIds.filter(humId => !FILTER_HUM_IDS.includes(humId))
  const researchSeriesArray = await Promise.all(humIds.map(humId => fetchResearchSeries(humId, cacheDir)))

  // Parse the detail page
  // parseAndDumpJson(researchSeriesArray, cacheDir)

  // === for debug ===
  dumpSummaryFiles(cacheDir)
}

if (require.main === module) {
  await main()
}
