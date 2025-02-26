import { mkdirSync, writeFileSync, readdirSync } from "fs"
import { join, dirname } from "path"

import { parseDetailPage } from "@/web-parser/detailParser"
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
  for (const researchSeries of researchSeriesArray) {
    for (const version of Object.keys(researchSeries.versions)) {
      // const humVersionId = `${researchSeries.humId}.${researchSeries.latestVersion}`
      const humVersionId = `${researchSeries.humId}.${version}`
      const latestVersion = researchSeries.versions[version]
      if (latestVersion.ja !== null) {
        try {
          const jaResult = parseDetailPage(humVersionId, latestVersion.ja, "ja")
          const jaFilePath = join(cacheDir, `${humVersionId}-ja.json`)
          writeFileSync(jaFilePath, JSON.stringify(jaResult, null, 2))
        } catch (error) {
          console.error("================================")
          console.error(`Failed to parse ${humVersionId} (ja): ${error instanceof Error ? error.message : String(error)}`)
          console.error(error.stack)
        }
      }
      if (latestVersion.en !== null) {
        try {
          const enResult = parseDetailPage(humVersionId, latestVersion.en, "en")
          const enFilePath = join(cacheDir, `${humVersionId}-en.json`)
          writeFileSync(enFilePath, JSON.stringify(enResult, null, 2))
        } catch (error) {
          console.error("================================")
          console.error(`Failed to parse ${humVersionId} (en): ${error instanceof Error ? error.message : String(error)}`)
          console.error(error.stack)
        }
      }
    }
  }
}

if (require.main === module) {
  await main()
}
