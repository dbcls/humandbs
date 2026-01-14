import { JSDOM } from "jsdom"

import { readHtml, DETAIL_PAGE_BASE_URL } from "@/crawler/fetch"
import type { LangType } from "@/crawler/types"

const normalizeUrl = (href: string): string => {
  try {
    return new URL(href, DETAIL_PAGE_BASE_URL).href
  } catch {
    return href
  }
}

export const parseAllHumIds = async (
  useCache = true,
): Promise<string[]> => {
  const html = await readHtml(`${DETAIL_PAGE_BASE_URL}`, "home.html", useCache)
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const rows = doc.querySelectorAll("#list-of-all-researches > tbody > tr")
  const ids = new Set<string>()

  for (const row of rows) {
    const anchor = row.querySelector("th a[href]")
    if (!anchor) continue
    const url = normalizeUrl(anchor.getAttribute("href")!)
    const m = url.match(/\/(hum\d+)-v\d+/)
    if (!m) continue
    ids.add(m[1])
  }

  return Array.from(ids).sort()
}

export const humIdToTitle = async (
  lang: LangType = "ja",
  useCache = true,
): Promise<Record<string, string>> => {
  const base = lang === "ja" ? DETAIL_PAGE_BASE_URL : `${DETAIL_PAGE_BASE_URL}en/`
  const html = await readHtml(base, `home-${lang}.html`, useCache)
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const rows = doc.querySelectorAll("#list-of-all-researches > tbody > tr")
  const mapping: Record<string, string> = {}

  for (const row of rows) {
    const anchor = row.querySelector("th a[href]")
    if (!anchor) continue
    const url = normalizeUrl(anchor.getAttribute("href")!)
    const m = url.match(/\/(hum\\d+)-v\\d+/)
    if (!m) continue
    const humId = m[1]

    const tds = row.querySelectorAll("td")
    if (tds.length < 2) continue
    const title = tds[1].textContent?.trim().replace(/\\s+/g, " ")
    if (title) mapping[humId] = title
  }

  return mapping
}
