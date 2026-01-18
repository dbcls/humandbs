/**
 * Release page parser for HumanDBs portal
 *
 * Parses the release page HTML and extracts version release information.
 * The release page contains:
 * - A table listing all versions with release dates
 * - Detailed release notes for each version
 *
 * @module crawler/release
 */
import { JSDOM } from "jsdom"

import { cleanText, cleanInnerHtml } from "@/crawler/detail"
import type { LangType, Release } from "@/crawler/types"

// =============================================================================
// Utility functions
// =============================================================================

/**
 * Compare two arrays for equality
 */
const sameArray = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

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

// =============================================================================
// Table parsing
// =============================================================================

const EXPECT_HEADERS_JA = ["Research ID", "公開日", "内容"]
const EXPECT_HEADERS_EN = ["Research ID", "Release Date", "Type of Data"]

/**
 * Validate release table headers match expected format
 */
export const validateTableHeaders = (headers: string[], lang: LangType): boolean => {
  if (lang === "ja") {
    return sameArray(headers, EXPECT_HEADERS_JA)
  }
  return sameArray(headers, EXPECT_HEADERS_EN)
}

/**
 * Parse the release table and extract basic version info
 */
export const parseReleaseTable = (
  table: HTMLTableElement,
  lang: LangType,
  humVersionId: string,
): Partial<Release>[] => {
  const releases: Partial<Release>[] = []

  const headerCells = Array.from(table.querySelectorAll("thead th")).map(th =>
    cleanText(th.textContent),
  )

  if (!validateTableHeaders(headerCells, lang)) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): unexpected release table headers: ${JSON.stringify(headerCells)}`)
  }

  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    if (cells.length < 3) continue

    releases.push({
      humVersionId: cleanText(cells[0].textContent),
      releaseDate: cleanText(cells[1].textContent),
      content: cleanText(cells[2].textContent),
    })
  }

  return releases
}

// =============================================================================
// Detail parsing
// =============================================================================

/**
 * Find and attach release details (release notes) to each release entry
 */
export const findReleaseDetails = (
  container: Element,
  releases: Partial<Release>[],
  humVersionId: string,
  lang: LangType,
): void => {
  const versions = releases.map(r => r.humVersionId as string)
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
      console.debug(`[DEBUG] - ${humVersionId} (${lang}): cannot find release entry for version ${matchedVersion}`)
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

  // ==========================================================================
  // Note section parsing (CURRENTLY UNUSED - preserved for future use)
  // ==========================================================================
  // Some release pages have a "Note:" section at the end containing additional info:
  // - hum0043, hum0235, hum0250: MRI/PET scanner lists (related to HUM_IDS_WITH_DATA_SUMMARY)
  // - hum0112: IHEC Data Portal info
  //
  // These are currently not extracted into the Release type because:
  // 1. The content varies significantly between humIds
  // 2. It's unclear how to structure this data (scanner tables, free text, etc.)
  // 3. The primary use case doesn't require this information yet
  //
  // When needed, consider:
  // - Adding a `notes: TextValue[]` field to Release type
  // - Or creating a separate parser for scanner info
  //
  // Implementation sketch (_noteStartIndex is already detected above):
  // if (_noteStartIndex !== null) {
  //   const noteText: string[] = []
  //   for (let i = _noteStartIndex; i < allElements.length; i++) {
  //     const node = allElements[i]
  //     const t = cleanText(node.textContent).replace(/^note\s*[:：]?\s*/i, "").trim()
  //     if (t) noteText.push(t)
  //   }
  //   // Use noteText as needed
  // }
  // ==========================================================================
}

// =============================================================================
// Main parser function
// =============================================================================

/**
 * Parse a release page HTML and extract all version releases
 *
 * @param html - The raw HTML string of the release page
 * @param humVersionId - The version identifier (e.g., "hum0001-v1")
 * @param lang - The language ("ja" or "en")
 * @returns Array of Release objects
 */
export const parseReleasePage = (
  html: string,
  humVersionId: string,
  lang: LangType,
): Release[] => {
  const dom = new JSDOM(html)
  const container =
    dom.window.document.querySelector(
      "#jsn-mainbody > div.item-page > div.articleBody",
    ) ?? dom.window.document.querySelector("div.articleBody")
  if (!container) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): release page main container not found.`)
    return []
  }

  // (1) Parse release table
  const table = container.querySelector("table")
  if (!table) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): release table not found.`)
    return []
  }

  const releases = parseReleaseTable(table, lang, humVersionId)

  if (releases.length === 0) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): no releases found in the table.`)
    return []
  }

  // (2) Find and attach release details
  findReleaseDetails(container, releases, humVersionId, lang)

  // (3) Convert to final format
  return releases.map(r => ({
    humVersionId: fromDotToHyphen(r.humVersionId as string),
    releaseDate: r.releaseDate as string,
    content: r.content as string,
    ...(r.releaseNote ? { releaseNote: r.releaseNote } : {}),
  }))
}
