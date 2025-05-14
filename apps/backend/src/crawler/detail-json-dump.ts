import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"

import { DETAIL_PAGE_BASE_URL } from "@/crawler/const"
import { parseDetailPage, type ParseResult } from "@/crawler/detail-parser"
import { normalizer } from "@/crawler/normalizer"
import { parseReleasePage } from "@/crawler/release-parser"
import type { LangType } from "@/crawler/types"
import { findLatestVersionNum, readHtml, getResultsDirPath } from "@/crawler/utils"

export const dumpDetailJsons = async (humIds: string[], useCache = true): Promise<void> => {
  for (const humId of humIds) {
    const latestVersionNum = await findLatestVersionNum(humId, useCache)
    let langs: LangType[] = ["ja", "en"]
    if (["hum0003"].includes(humId)) {
      langs = ["ja"]
    }
    for (let versionNum = 1; versionNum <= latestVersionNum; versionNum++) {
      const humVersionId = `${humId}-v${versionNum}`
      for (const lang of langs) {
        await dumpDetailJson(humVersionId, lang, useCache)
      }
    }
  }
}

export const dumpDetailJson = async (humVersionId: string, lang: LangType, useCache = true): Promise<void> => {
  const detailJsonDir = join(getResultsDirPath(), "detail-json")
  if (!existsSync(detailJsonDir)) {
    mkdirSync(detailJsonDir, { recursive: true })
  }

  const detailPageUrl = lang === "ja" ?
    `${DETAIL_PAGE_BASE_URL}${humVersionId}` :
    `${DETAIL_PAGE_BASE_URL}en/${humVersionId}`
  const detailHtmlFileName = `detail-${humVersionId}-${lang}.html`
  const detailHtml = await readHtml(detailPageUrl, detailHtmlFileName, useCache)

  const parseResult = parseDetailPage(humVersionId, detailHtml, lang)
  normalizer(lang, parseResult)

  if (lang === "ja" && humVersionId === "hum0329-v1") {
    // do not parse hum0329 release page
  } else {
    const releasePageUrl = lang === "ja" ?
      `${DETAIL_PAGE_BASE_URL}${humVersionId}-release` :
      `${DETAIL_PAGE_BASE_URL}en/${humVersionId}-release`
    const releaseHtmlFileName = `release-${humVersionId}-${lang}.html`
    const releaseHtml = await readHtml(releasePageUrl, releaseHtmlFileName, useCache)
    const releaseParseResult = parseReleasePage(humVersionId, releaseHtml)
    parseResult.releases = releaseParseResult.releases
  }

  const jsonFilePath = join(detailJsonDir, `${humVersionId}-${lang}.json`)
  const jsonData = JSON.stringify(parseResult, null, 2)
  writeFileSync(jsonFilePath, jsonData, "utf8")
}

export const loadDetailJson = (humVersionId: string, lang: LangType, useCache = true): ParseResult => {
  const filePath = join(getResultsDirPath(), "detail-json", `${humVersionId}-${lang}.json`)
  const fileExists = existsSync(filePath)

  const shouldDump = !useCache || !fileExists

  if (shouldDump) {
    dumpDetailJson(humVersionId, lang, useCache)
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as ParseResult
}
