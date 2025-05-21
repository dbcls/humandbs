import { JSDOM } from "jsdom"

import { HOME_HTML, HOME_URL, HOME_HTML_EN, HOME_URL_EN } from "@/crawler/const"
import type { LangType } from "@/crawler/types"
import { readHtml } from "@/crawler/utils"

export const parseAllHumIds = async (useCache = true): Promise<string[]> => {
  const html = await readHtml(HOME_URL, HOME_HTML, useCache)
  const dom = new JSDOM(html)
  const document = dom.window.document

  const rows = document.querySelectorAll(
    "#list-of-all-researches > tbody > tr",
  )

  const firstColumnLinks = Array.from(rows).map(row => {
    const firstCell = row.querySelector("th")
    if (firstCell === null) {
      throw new Error("Failed to find first cell during parsing home page")
    }
    const anchor = firstCell.querySelector("a")
    if (anchor === null) {
      throw new Error("Failed to find anchor during parsing home page")
    }
    return anchor.href
  })

  // like: https://humandbs.dbcls.jp/hum0001-v1
  const humIds = firstColumnLinks.map(link => {
    const match = link.match(/https:\/\/humandbs\.dbcls\.jp\/(hum\d+)-v\d+/)
    if (match === null) {
      throw new Error(`Failed to parse hum id and version from ${link}`)
    }
    return match[1]
  })

  return humIds
}

export const humIdToTitle = async (lang: LangType, useCache = true): Promise<Record<string, string>> => {
  const htmlFile = lang === "ja" ? HOME_HTML : HOME_HTML_EN
  const htmlUrl = lang === "ja" ? HOME_URL : HOME_URL_EN
  const html = await readHtml(htmlUrl, htmlFile, useCache)
  const dom = new JSDOM(html)
  const document = dom.window.document

  const rows = document.querySelectorAll(
    "#list-of-all-researches > tbody > tr",
  )

  const humIdToTitle: Record<string, string> = {}
  for (const row of rows) {
    const firstCell = row.querySelector("th")
    const firstCellContent = firstCell?.textContent?.trim()
    const humVersionIdMatch = firstCellContent!.match(/hum\d{4}\.v\d+/)
    if (!humVersionIdMatch) {
      throw new Error(`Failed to extract humVersionId from: "${firstCellContent}"`)
    }
    const humVersionIdWithDot = humVersionIdMatch[0]
    const humId = humVersionIdWithDot.split(".")[0]
    const secondCell = row.querySelector("td:nth-child(2)")
    const title = secondCell?.textContent?.trim().replace(/\n/g, "")
    if (title === undefined) {
      throw new Error("Failed to find second cell during parsing home page")
    }
    humIdToTitle[humId] = title
  }

  return humIdToTitle
}
