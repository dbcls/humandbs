/**
 * Home page parser
 *
 * Extracts the list of humIds from the HumanDBs home page
 */
import { JSDOM } from "jsdom"

import { DETAIL_PAGE_BASE_URL } from "@/crawler/config/urls"
import type { LangType } from "@/crawler/types"
import { fetchHtmlCached } from "@/crawler/utils/http"
import { logger } from "@/crawler/utils/logger"

const normalizeUrl = (href: string): string => {
  try {
    return new URL(href, DETAIL_PAGE_BASE_URL).href
  } catch {
    return href
  }
}

/**
 * Extract humId list from home page HTML (pure function)
 * Exported for testing
 */
export const parseHomeHtml = (html: string): string[] => {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const rows = doc.querySelectorAll("#list-of-all-researches > tbody > tr")
  const ids = new Set<string>()

  for (const row of rows) {
    const anchor = row.querySelector("th a[href]")
    if (!anchor) continue
    const url = normalizeUrl(anchor.getAttribute("href")!)
    const m = /\/(hum\d+)-v\d+/.exec(url)
    if (!m) continue
    ids.add(m[1])
  }

  const result = Array.from(ids).sort()
  logger.debug("Home page parsed", { humIdCount: result.length })
  return result
}

/**
 * Extract humId -> title mapping from home page HTML (pure function)
 * Exported for testing
 */
export const parseHomeTitles = (html: string): Record<string, string> => {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const rows = doc.querySelectorAll("#list-of-all-researches > tbody > tr")
  const mapping: Record<string, string> = {}

  for (const row of rows) {
    const anchor = row.querySelector("th a[href]")
    if (!anchor) continue
    const url = normalizeUrl(anchor.getAttribute("href")!)
    const m = /\/(hum\d+)-v\d+/.exec(url)
    if (!m) continue
    const humId = m[1]

    const tds = row.querySelectorAll("td")
    if (tds.length < 1) continue
    const title = tds[0].textContent?.trim().replace(/\s+/g, " ")
    if (title) mapping[humId] = title
  }

  logger.debug("Home titles parsed", { titleCount: Object.keys(mapping).length })
  return mapping
}

/** Fetch all humIds from home page (with caching) */
export const parseAllHumIds = async (useCache = true): Promise<string[]> => {
  const html = await fetchHtmlCached(DETAIL_PAGE_BASE_URL, "home.html", useCache)
  return parseHomeHtml(html)
}

/** Fetch humId -> title mapping from home page (with caching) */
export const humIdToTitle = async (
  lang: LangType = "ja",
  useCache = true,
): Promise<Record<string, string>> => {
  const base = lang === "ja" ? DETAIL_PAGE_BASE_URL : `${DETAIL_PAGE_BASE_URL}en/`
  const html = await fetchHtmlCached(base, `home-${lang}.html`, useCache)
  return parseHomeTitles(html)
}
