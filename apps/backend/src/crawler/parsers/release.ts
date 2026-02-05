/**
 * Release page parser for HumanDBs portal
 *
 * Parses the release page HTML and extracts version release information
 * The release page contains:
 * - A table listing all versions with release dates
 * - Detailed release notes for each version
 */
import { JSDOM } from "jsdom"

import { compareHeaders } from "@/crawler/processors/normalize"
import type { LangType, RawRelease } from "@/crawler/types"
import { logger } from "@/crawler/utils/logger"

import { cleanText, cleanInnerHtml } from "./utils"

// hum0086 specific: HTML contains accumulated dates in single cell
// The release table shows multiple version dates stacked in each row,
// making it impossible to parse correctly with generic logic.
// Correct dates from original page:
//   hum0086-v1: 2017-09-25, hum0086-v2: 2017-12-26, hum0086-v3: 2018-06-26
const HUM0086_RELEASE_DATES: Record<string, string> = {
  "hum0086-v1": "2017-09-25",
  "hum0086.v1": "2017-09-25",
  "hum0086-v2": "2017-12-26",
  "hum0086.v2": "2017-12-26",
  "hum0086-v3": "2018-06-26",
  "hum0086.v3": "2018-06-26",
}

// Utility functions

/**
 * Convert version format from dot to hyphen
 * @example fromDotToHyphen("hum0006.v1") => "hum0006-v1"
 */
export const fromDotToHyphen = (humVersionId: string): string => {
  return humVersionId.replace(/\./g, "-")
}

/**
 * Escape special regex characters in a string
 */
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const NOTE_RE = /^note\s*[:：]?/i

// Table parsing

const EXPECT_HEADERS_JA = ["Research ID", "公開日", "内容"]
const EXPECT_HEADERS_EN = ["Research ID", "Release Date", "Type of Data"]

/**
 * Validate release table headers match expected format
 */
export const validateTableHeaders = (headers: string[], lang: LangType): boolean => {
  const expected = lang === "ja" ? EXPECT_HEADERS_JA : EXPECT_HEADERS_EN
  return compareHeaders(headers, expected)
}

/**
 * Parse the release table and extract basic version info
 */
export const parseReleaseTable = (
  table: HTMLTableElement,
  lang: LangType,
  humVersionId: string,
): Partial<RawRelease>[] => {
  const releases: Partial<RawRelease>[] = []

  const headerCells = Array.from(table.querySelectorAll("thead th")).map(th =>
    cleanText(th.textContent),
  )

  if (!validateTableHeaders(headerCells, lang)) {
    logger.debug("Unexpected release table headers", { humVersionId, lang, headers: headerCells })
  }

  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    if (cells.length < 3) continue

    // HTML may contain multiple lines (e.g., hum0086 accumulated release dates)
    // Take only the first line for humVersionId
    const rawHumVersionId = cleanText(cells[0].textContent)
    const normalizedVersionId = rawHumVersionId.split("\n")[0].trim()

    // hum0086 specific: use hardcoded dates instead of parsing multi-line cell
    const rawReleaseDate = cleanText(cells[1].textContent)
    const releaseDate = HUM0086_RELEASE_DATES[normalizedVersionId]
      ?? rawReleaseDate.split("\n")[0].trim()

    releases.push({
      humVersionId: normalizedVersionId,
      releaseDate,
      content: cleanText(cells[2].textContent),
    })
  }

  return releases
}

// Detail parsing

/**
 * Find and attach release details (release notes) to each release entry
 */
export const findReleaseDetails = (
  container: Element,
  releases: Partial<RawRelease>[],
  humVersionId: string,
  lang: LangType,
): void => {
  const versions = releases.map(r => r.humVersionId!)
  const allElements = Array.from(container.children)

  let index = 0
  let _noteStartIndex: number | null = null

  while (index < allElements.length) {
    const node = allElements[index]
    const text = cleanText(node.textContent)

    if (NOTE_RE.test(text)) {
      _noteStartIndex = index
      break
    }

    let matchedVersion: string | null = null
    for (const version of versions) {
      const escaped = escapeRegex(version)
      const re = new RegExp(`^${escaped}\\b`)
      if (re.test(text)) {
        matchedVersion = version
        break
      }
    }

    if (!matchedVersion) {
      index++
      continue
    }

    const release = releases.find(r => r.humVersionId === matchedVersion)
    if (!release) {
      logger.debug("Cannot find release entry for version", { humVersionId, lang, version: matchedVersion })
      index++
      continue
    }

    // Collect all subsequent nodes until the next version header or end
    const detailNodes: Element[] = []
    index++

    while (index < allElements.length) {
      const nextNode = allElements[index]
      const nextText = cleanText(nextNode.textContent)

      if (NOTE_RE.test(nextText)) {
        _noteStartIndex = index
        break
      }

      let isNextVersion = false
      for (const version of versions) {
        const escaped = escapeRegex(version)
        const re = new RegExp(`^${escaped}\\b`)
        if (re.test(nextText)) {
          isNextVersion = true
          break
        }
      }
      if (isNextVersion) break

      detailNodes.push(nextNode)
      index++
    }

    const textParts: string[] = []
    const rawHtmlParts: string[] = []

    for (const dn of detailNodes) {
      const t = cleanText(dn.textContent)
      if (t) textParts.push(t)
      const rh = cleanInnerHtml(dn)
      if (rh) rawHtmlParts.push(rh)
    }

    release.releaseNote = {
      text: textParts.join("\n").trim(),
      rawHtml: rawHtmlParts.join("\n").trim(),
    }
  }
}

// Main parser function

/**
 * Parse a release page HTML and extract all version releases
 */
export const parseReleasePage = (
  html: string,
  humVersionId: string,
  lang: LangType,
): RawRelease[] => {
  const dom = new JSDOM(html)
  const container =
    dom.window.document.querySelector(
      "#jsn-mainbody > div.item-page > div.articleBody",
    ) ?? dom.window.document.querySelector("div.articleBody")
  if (!container) {
    logger.debug("Release page main container not found", { humVersionId, lang })
    return []
  }

  // (1) Parse release table
  const table = container.querySelector("table")
  if (!table) {
    logger.debug("Release table not found", { humVersionId, lang })
    return []
  }

  const releases = parseReleaseTable(table, lang, humVersionId)

  if (releases.length === 0) {
    logger.debug("No releases found in the table", { humVersionId, lang })
    return []
  }

  // (2) Find and attach release details
  findReleaseDetails(container, releases, humVersionId, lang)

  // (3) Convert to final format
  return releases.map(r => ({
    humVersionId: fromDotToHyphen(r.humVersionId!),
    releaseDate: r.releaseDate!,
    content: r.content!,
    ...(r.releaseNote ? { releaseNote: r.releaseNote } : {}),
  }))
}
