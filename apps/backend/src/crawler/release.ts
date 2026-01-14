import { JSDOM } from "jsdom"

import { cleanText, cleanInnerHtml } from "@/crawler/detail"
import type { LangType, TextValue, Release } from "@/crawler/types"

const sameArray = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * hum0006.v1 -> hum0006-v1
 */
const fromDotToHyphen = (humVersionId: string): string => {
  return humVersionId.replace(/\./g, "-")
}

const NOTE_RE = /^note\s*[:：]?/i

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

  const releases: Partial<Release>[] = []

  // === (1) table parse ===
  const table = container.querySelector("table")
  if (!table) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): release table not found.`)
  } else {
    const headerCells = Array.from(table.querySelectorAll("thead th")).map(th =>
      cleanText(th.textContent),
    )
    const EXPECT_HEADERS_JA = ["Research ID", "公開日", "内容"]
    const EXPECT_HEADERS_EN = ["Research ID", "Release Date", "Type of Data"]

    const isJa = lang === "ja" && sameArray(headerCells, EXPECT_HEADERS_JA)
    const isEn = lang === "en" && sameArray(headerCells, EXPECT_HEADERS_EN)

    if (!isJa && !isEn) {
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
  }

  if (releases.length === 0) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): no releases found in the table.`)
    return []
  }

  // === (2) details parse ===
  const versions = releases.map(r => r.humVersionId as string)
  const allElements = Array.from(container.children)

  let index = 0
  let noteStartIndex: number | null = null

  while (index < allElements.length) {
    const node = allElements[index]
    const text = cleanText(node.textContent)

    if (NOTE_RE.test(text)) {
      // mark note start
      noteStartIndex = index
      break
    }

    let matchedVersion: string | null = null
    for (const version of versions) {
      const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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

    // find corresponding table entry
    const release = releases.find(r => r.humVersionId === matchedVersion)
    if (!release) {
      console.debug(`[DEBUG] - ${humVersionId} (${lang}): cannot find release entry for version ${matchedVersion}`)
      index++
      continue
    }

    // collect all subsequent nodes until the next version header or end
    const detailNodes: Element[] = []
    index++

    while (index < allElements.length) {
      const nextNode = allElements[index]
      const nextText = cleanText(nextNode.textContent)

      if (NOTE_RE.test(nextText)) {
        noteStartIndex = index
        break
      }

      let isNextVersion = false
      for (const version of versions) {
        const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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

  if (noteStartIndex !== null) {
    const noteText: string[] = []
    const noteRawHtml: string[] = []

    for (let i = noteStartIndex; i < allElements.length; i++) {
      const node = allElements[i]
      const t = cleanText(node.textContent)
        .replace(/^note\s*[:：]?\s*/i, "")
        .trim()
      if (t) {
        noteText.push(t)
      }
      const rh = cleanInnerHtml(node)
      if (rh) noteRawHtml.push(rh)
    }
    const joinedText = noteText.join("\n").trim()
    if (joinedText) {
      // hum0043, hum0112, hum0235, hum0250
      // Include mri scanner and pet scanner info in the last release note
      // Need to discuss if this is the best way to handle it
    }
  }

  return releases.map(r => ({
    humVersionId: fromDotToHyphen(r.humVersionId as string),
    releaseDate: r.releaseDate as string,
    content: r.content as string,
    releaseNote: r.releaseNote as TextValue,
  }))
}
