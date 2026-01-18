/**
 * Detail page parser for HumanDBs portal
 *
 * Parses the detail page HTML and extracts structured data.
 * The page is divided into 5 main sections:
 * - Summary: Research overview, aims, methods, targets, and datasets
 * - Molecular Data: Detailed experiment/sample information tables
 * - Data Provider: Principal investigator, affiliation, grants
 * - Publications: Related papers with DOIs
 * - Controlled Access Users: List of approved data users
 *
 * @module crawler/detail
 */
import { JSDOM } from "jsdom"

import { findSpecialControlledAccessRow } from "@/crawler/config"
import { HUM_IDS_WITH_DATA_SUMMARY } from "@/crawler/const"
import type { LangType, ParseResult, Summary, Dataset, MolecularData, DataProvider, Publication, ControlledAccessUser, TextValue } from "@/crawler/types"

// =============================================================================
// Utility functions
// =============================================================================

/**
 * Clean whitespace from text
 */
export const cleanText = (str: string | null | undefined): string => {
  return str?.trim() ?? ""
}

/**
 * Clean innerHTML by removing style/class/id attributes
 */
export const cleanInnerHtml = (node: Element): string => {
  const clone = node.cloneNode(true) as Element

  const removeAttrs = (el: Element) => {
    el.removeAttribute("style")
    el.removeAttribute("class")
    el.removeAttribute("id")
    el.removeAttribute("rel")
    el.removeAttribute("target")
    for (const child of Array.from(el.children)) {
      removeAttrs(child)
    }
  }
  removeAttrs(clone)

  return clone.innerHTML.trim()
}

/**
 * Convert Element to TextValue (text + rawHtml)
 */
const toTextValue = (el: Element): TextValue => ({
  text: cleanText(el.textContent),
  rawHtml: cleanInnerHtml(el),
})

/**
 * Compare table headers with expected headers (case-insensitive, whitespace-normalized)
 */
const compareHeaders = (headers: string[], expected: string[]): boolean => {
  if (headers.length !== expected.length) return false
  for (let i = 0; i < headers.length; i++) {
    const act = headers[i].replace(/\s+/g, "").toLowerCase().trim()
    const exp = expected[i].replace(/\s+/g, "").toLowerCase().trim()
    if (act !== exp) return false
  }
  return true
}

/**
 * Normalize cell value: empty string or "-" becomes null
 */
const normalizeCellValue = (cell: HTMLTableCellElement): string | null => {
  const t = cleanText(cell.textContent)
  return t === "" || t === "-" ? null : t
}

/**
 * Parse values separated by <br> tags from a table cell
 * Used for grantId and other fields that use <br> as a separator
 */
const parseBrSeparatedValues = (cell: Element): string[] => {
  let html = cell.innerHTML
  html = html.replace(/<br\s*\/?>/gi, "\n")
  html = html.replace(/<\/p>/gi, "\n")
  html = html.replace(/<\/div>/gi, "\n")

  const text = html.replace(/<[^>]+>/g, "")
  const parts = text.split(/\n+/)

  const values: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed || trimmed === "-" || trimmed === "\u00a0") continue
    values.push(trimmed)
  }

  return values
}

/**
 * Parse dataset IDs from a table cell
 *
 * Handles various HTML formats:
 * - IDs separated by <br> tags
 * - IDs separated by <p> tags
 * - IDs separated by commas
 * - IDs separated by whitespace/newlines
 *
 * Returns each ID as a separate string in the array.
 * Range formats like "JGAD000144-JGAD000201" are preserved as-is.
 */
const parseDatasetIdsFromCell = (cell: Element): string[] => {
  // Get innerHTML and replace block-level separators with newlines
  let html = cell.innerHTML
  html = html.replace(/<br\s*\/?>/gi, "\n")
  html = html.replace(/<\/p>/gi, "\n")
  html = html.replace(/<\/div>/gi, "\n")
  html = html.replace(/<\/li>/gi, "\n")

  // Remove all remaining HTML tags
  const text = html.replace(/<[^>]+>/g, "")

  // Split by separators: newline, comma, ideographic comma
  const parts = text.split(/[\n,\u3001]+/)

  // Clean up each part and filter
  const ids: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    // Skip empty, "-", or whitespace-only
    if (!trimmed || trimmed === "-" || trimmed === "\u00a0") continue
    // Skip notes/comments starting with special characters
    if (/^[※*（(]/.test(trimmed) && !/^[（(]?[A-Z]/.test(trimmed)) continue
    ids.push(trimmed)
  }

  return ids
}

/**
 * Check if a line should be ignored (notes, empty, etc.)
 */
const isIgnorableLine = (text: string): boolean => {
  const t = text.trim()
  if (!t) return true
  if (/^(※|\*|NOTE:|Note:)/.test(t)) return true
  if (t === "\u00a0") return true
  return false
}

/**
 * Check if a node is empty (no meaningful text content)
 */
const isEmptyNode = (node: Node): boolean => {
  const ELEMENT_NODE = 1
  const TEXT_NODE = 3

  if (node.nodeType === TEXT_NODE) {
    return (node.textContent?.trim() ?? "") === ""
  } else if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element
    return (el.textContent?.trim() ?? "") === ""
  }
  return false
}

/**
 * Generic table parser
 */
const parseTable = <T>(
  table: HTMLTableElement,
  mapRow: (headers: string[], cells: HTMLTableCellElement[]) => T | null,
): T[] => {
  const thead = table.querySelector("thead")
  const tbody = table.querySelector("tbody")
  if (!thead || !tbody) return []

  const headerCells = Array.from(thead.querySelectorAll("th"))
  const headers = headerCells.map(th => cleanText(th.textContent))

  const results: T[] = []
  for (const row of Array.from(tbody.querySelectorAll("tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    const parsed = mapRow(headers, cells)
    if (parsed) results.push(parsed)
  }
  return results
}

// =============================================================================
// Section detection and splitting
// =============================================================================

type SectionType =
  | "summary"
  | "molecularData"
  | "dataProvider"
  | "publications"
  | "controlledAccessUsers"
  | "dataSummary"
  | "mriEquipment"

/**
 * Map heading text to section type
 */
const mapHeadingTextToSectionType = (headingText: string): SectionType | null => {
  if (!headingText) return null

  const s = headingText
    .trim()
    .toUpperCase()
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")

  if (/^SUMMARY$|^研究内容の概要$/.test(s)) return "summary"
  if (/^MOLECULAR\s*DATA$|^分子データ$/.test(s)) return "molecularData"
  if (/^DATA\s*PROVIDER$|^提供者情報$/.test(s)) return "dataProvider"
  if (/^PUBLICATIONS$|^関連論文$/.test(s)) return "publications"
  if (/^(USERS|USRES).*CONTROLLED.*DATA\)$|^制限公開データの利用者一覧$/.test(s)) return "controlledAccessUsers"
  if (/^DATA\s*SUMMARY$|^データ概要$/.test(s)) return "dataSummary"
  if (/^MRI\s*EQUIPMENT$|^MRI装置情報$/.test(s)) return "mriEquipment"

  return null
}

/**
 * Check if a node is a heading and return its section type
 */
const isHeadingNode = (node: Node): SectionType | null => {
  const ELEMENT_NODE = 1
  const TEXT_NODE = 3

  let text = ""
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element
    const tag = el.tagName.toUpperCase()
    if (/^H[1-6]$/.test(tag)) {
      text = el.textContent?.trim() ?? ""
    } else if (tag === "P" || tag === "DIV") {
      text = el.textContent?.trim() ?? ""
    }
  } else if (node.nodeType === TEXT_NODE) {
    text = node.textContent?.trim() ?? ""
  }

  return mapHeadingTextToSectionType(text)
}

type SectionedDocument = Partial<Record<SectionType, Element>>

/**
 * Split HTML document into sections based on headings
 */
const splitToSection = (
  html: string,
  humVersionId: string,
  lang: LangType,
): SectionedDocument => {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const body = doc.querySelector("div.articleBody")
  if (!body) {
    throw new Error("splitToSection: articleBody not found")
  }

  const sectionElements: Partial<Record<SectionType, Element>> = {}
  const allChildren = Array.from(body.childNodes)

  let idx = 0

  // Skip until first heading, ignore header part
  while (idx < allChildren.length) {
    const maybeHeading = isHeadingNode(allChildren[idx])
    if (maybeHeading !== null) break
    idx++
  }

  // Parse from first heading onward
  while (idx < allChildren.length) {
    const node = allChildren[idx]
    const sectionKey = isHeadingNode(node)
    idx++

    if (sectionKey === null) continue

    // Collect until next heading
    const container = doc.createElement("div")
    while (idx < allChildren.length) {
      const nextNode = allChildren[idx]
      const nextSectionKey = isHeadingNode(nextNode)
      if (nextSectionKey !== null) break
      container.appendChild(nextNode.cloneNode(true))
      idx++
    }

    sectionElements[sectionKey] = container
  }

  // Hotfix for hum0474: publications table misplaced in controlledAccessUsers section
  // The publications table appears after the controlled access users heading
  if (sectionElements.controlledAccessUsers) {
    const container = sectionElements.controlledAccessUsers
    const tables = Array.from(container.querySelectorAll("table"))
    if (tables.length > 0) {
      const firstTable = tables[0]
      const headerTexts = Array.from(firstTable.querySelectorAll("thead th"))
        .map(th => cleanText(th.textContent).toLowerCase())

      // Heuristic: publication table has title, doi, dataset id headers
      const isPublicationTable =
        headerTexts.includes("title") &&
        headerTexts.includes("doi") &&
        headerTexts.includes("dataset id")

      if (isPublicationTable) {
        container.removeChild(firstTable)

        if (!sectionElements.publications) {
          sectionElements.publications = doc.createElement("div")
        }
        sectionElements.publications.appendChild(firstTable)
      }
    }
  }

  // Case for molecularData header is missing but table exists in summary
  if (sectionElements.summary && !sectionElements.molecularData) {
    let foundMolecularTable = false
    const summaryElem = sectionElements.summary!
    const tables = Array.from(summaryElem.querySelectorAll("table"))
    if (tables.length >= 2) {
      foundMolecularTable = true
      const secondTable = tables[1]
      const children = Array.from(summaryElem.childNodes)
      const tableIndex = children.indexOf(secondTable)
      let startIndex = tableIndex - 1
      while (startIndex >= 0) {
        const node = children[startIndex]
        if (isEmptyNode(node)) {
          startIndex--
          continue
        }
        if (isHeadingNode(node) !== null) {
          startIndex++
        }
        break
      }

      if (startIndex < 0) startIndex = tableIndex

      const container = doc.createElement("div")
      for (let i = startIndex; i < children.length; i++) {
        container.appendChild(children[i].cloneNode(true))
      }
      sectionElements.molecularData = container

      // Remove these nodes from summary
      for (let i = startIndex; i < children.length; i++) {
        summaryElem.removeChild(children[i])
      }
    }
    if (!foundMolecularTable) {
      const humId = humVersionId.split("-v")[0]
      if (!HUM_IDS_WITH_DATA_SUMMARY.includes(humId)) {
        console.debug(`[DEBUG] - ${humVersionId} (${lang}): molecularData section not found.`)
      }
    }
  }

  return sectionElements
}

// =============================================================================
// Summary section parser
// =============================================================================

const SUMMARY_FIELD_PATTERNS: { field: "aims" | "methods" | "targets" | "url"; regex: RegExp }[] = [
  { field: "aims", regex: /^(目的|aims?)\s*[:：]?/i },
  { field: "methods", regex: /^(方法|methods?)\s*[:：]?/i },
  { field: "targets", regex: /^(対象|participants\/materials|participants|materials?)\s*[:：]?/i },
  { field: "url", regex: /^url\s*[:：]?/i },
]

const detectSummaryField = (text: string): "aims" | "methods" | "targets" | "url" | null => {
  const t = text.trim()
  for (const { field, regex } of SUMMARY_FIELD_PATTERNS) {
    if (regex.test(t)) return field
  }
  return null
}

const stripSummaryPrefix = (text: string): string => {
  let result = text
  for (const { regex } of SUMMARY_FIELD_PATTERNS) {
    result = result.replace(regex, "")
  }
  return result.trim()
}

/**
 * Parse the Summary section
 * Contains: aims, methods, targets, url, datasets table, footers
 */
const parseSummarySection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): Summary => {
  const summary: Summary = {
    aims: { text: "", rawHtml: "" },
    methods: { text: "", rawHtml: "" },
    targets: { text: "", rawHtml: "" },
    url: [],
    datasets: [],
    footers: [],
  }

  if (!element) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): Summary section not found.`)
    return summary
  }

  const children = Array.from(element.children)
  const tableIndex = children.findIndex(ch => ch.tagName.toLowerCase() === "table")
  const before = tableIndex >= 0 ? children.slice(0, tableIndex) : children
  const after = tableIndex >= 0 ? children.slice(tableIndex + 1) : []

  // Parse text sections before the table
  type FieldKey = "aims" | "methods" | "targets" | "url" | null
  let currentField: FieldKey = null
  for (const el of before) {
    if (isEmptyNode(el)) continue

    const text = cleanText(el.textContent)
    const rawHtml = cleanInnerHtml(el)

    const strong = el.querySelector("strong, b")
    if (strong) {
      const headerText = cleanText(strong.textContent)
      const detected = detectSummaryField(headerText)
      if (detected) {
        currentField = detected
      }
    }

    if (currentField) {
      if (currentField === "url") {
        for (const a of Array.from(el.querySelectorAll("a"))) {
          const href = a.getAttribute("href")?.trim() ?? ""
          const linkText = cleanText(a.textContent)
          if (href && linkText) {
            summary.url.push({ text: linkText, url: href })
          }
        }
      } else {
        const cleanedText = stripSummaryPrefix(text)
        summary[currentField].text += (summary[currentField].text ? "\n" : "") + cleanedText
        summary[currentField].rawHtml += (summary[currentField].rawHtml ? "\n" : "") + rawHtml
      }
    } else {
      console.debug(`[DEBUG] - ${humVersionId} (${lang}): Text outside recognized summary fields: ${text}`)
    }
  }

  // Parse dataset table
  const EXPECT_HEADERS: Record<LangType, string[]> = {
    ja: ["データID", "内容", "制限", "公開日"],
    en: ["Dataset ID", "Type of Data", "Criteria", "Release Date"],
  }
  if (tableIndex >= 0) {
    const table = children[tableIndex] as HTMLTableElement
    const rows = parseTable<Dataset>(table, (headers, cells) => {
      if (headers.length === 5 && cells.length === 5) {
        headers = headers.slice(1)
        cells = cells.slice(1)
      }

      if (!compareHeaders(headers, EXPECT_HEADERS[lang])) {
        console.debug(`[DEBUG] - ${humVersionId} (${lang}): Dataset table headers do not match expected format.`)
      }
      return {
        datasetId: normalizeCellValue(cells[0]),
        typeOfData: normalizeCellValue(cells[1]),
        criteria: normalizeCellValue(cells[2]),
        releaseDate: normalizeCellValue(cells[3]),
      }
    })
    summary.datasets = rows.filter(r => r !== null)
  }

  // Parse footer section (after the table)
  for (const el of after) {
    if (isEmptyNode(el)) continue
    summary.footers.push(toTextValue(el))
  }

  return summary
}

// =============================================================================
// Molecular Data section parser
// =============================================================================

/**
 * Find the nearest identifier element before a table
 */
const findNearestIdIndex = (children: Element[], tableIndex: number): number | null => {
  for (let i = tableIndex - 1; i >= 0; i--) {
    const text = cleanText(children[i].textContent)
    if (isIgnorableLine(text)) continue
    return i
  }
  return null
}

/**
 * Collect footer elements between two indices
 */
const collectFooters = (children: Element[], startIndex: number, endIndex: number): TextValue[] => {
  const footers: TextValue[] = []

  for (let i = startIndex; i < endIndex; i++) {
    const el = children[i]
    if (isEmptyNode(el)) continue
    footers.push(toTextValue(el))
  }

  return footers
}

interface ActiveRowspan {
  el: Element
  remaining: number
}

/**
 * Expand rowspan cells into a regular grid
 * This handles tables with rowspan attributes by duplicating cells
 */
const expandRowspan = (table: HTMLTableElement): Element[][] => {
  const rows = Array.from(table.querySelectorAll("tr"))

  const grid: Element[][] = []
  const activeRowspans: (ActiveRowspan | null)[] = []

  for (const tr of rows) {
    const logicalRow: Element[] = []
    let col = 0

    // Fill in cells from active rowspans
    while (activeRowspans[col]) {
      const active = activeRowspans[col]!
      logicalRow.push(active.el.cloneNode(true) as Element)
      active.remaining--
      if (active.remaining === 0) {
        activeRowspans[col] = null
      }
      col++
    }

    // Process actual cells
    const cells = Array.from(tr.children).filter(el =>
      ["TD", "TH"].includes(el.tagName.toUpperCase()),
    )
    for (const cell of cells) {
      const rowspan = Number(cell.getAttribute("rowspan") ?? "1")

      logicalRow.push(cell.cloneNode(true) as Element)

      if (rowspan > 1) {
        activeRowspans[col] = {
          el: cell,
          remaining: rowspan - 1,
        }
      }

      col++
    }

    grid.push(logicalRow)
  }

  return grid
}

/**
 * Parse the Molecular Data section
 * Contains multiple tables, each with an identifier header and key-value rows
 */
const parseMolecularDataSection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): MolecularData[] => {
  if (!element) return []

  const children = Array.from(element.children)
  const tables = children
    .map((el, idx) => ({ el, idx }))
    .filter(({ el }) => el.tagName.toUpperCase() === "TABLE")
    .map(({ el, idx }) => ({ table: el as HTMLTableElement, index: idx }))

  const results: MolecularData[] = []
  for (let i = 0; i < tables.length; i++) {
    const { table, index: tableIndex } = tables[i]

    // Find identifier (header)
    const idIndex = findNearestIdIndex(children, tableIndex)
    if (idIndex === null) {
      console.debug(`[DEBUG] - ${humVersionId} (${lang}): Could not find identifier element for molecular data table at index ${tableIndex}.`)
      continue
    }
    const idElem = children[idIndex]
    const id = toTextValue(idElem)

    // Parse table rows as key-value pairs
    const data: Record<string, TextValue | null> = {}
    const gridTable = expandRowspan(table)
    for (const row of gridTable) {
      if (row.length < 2) continue

      const keyCell = row[0]
      const valueCells = row.slice(1)
      const keyText = cleanText(keyCell.textContent)
      if (!keyText) continue

      const valueTexts: string[] = []
      const valueHtmls: string[] = []
      for (const vc of valueCells) {
        const vt = cleanText(vc.textContent)
        if (!vt || vt === "-") continue
        valueTexts.push(vt)
        valueHtmls.push(cleanInnerHtml(vc))
      }

      if (valueTexts.length === 0) {
        if (!(keyText in data)) {
          data[keyText] = null
        }
      } else {
        if (keyText in data && data[keyText] !== null) {
          data[keyText] = {
            text: data[keyText]!.text + "\n" + valueTexts.join(" "),
            rawHtml: data[keyText]!.rawHtml + "\n" + valueHtmls.join("\n"),
          }
        } else {
          data[keyText] = {
            text: valueTexts.join(" "),
            rawHtml: valueHtmls.join("\n"),
          }
        }
      }
    }

    // Collect footers between this table and the next
    const nextTable = tables[i + 1]
    const nextIdIndex = nextTable
      ? findNearestIdIndex(children, nextTable.index)
      : children.length
    const footerStart = tableIndex + 1
    const footerEnd = nextIdIndex ?? children.length

    const footers = collectFooters(children, footerStart, footerEnd)

    results.push({ id, data, footers })
  }

  return results
}

// =============================================================================
// Data Provider section parser
// =============================================================================

type DataProviderField = "principalInvestigator" | "affiliation" | "projectName" | "projectUrl" | "header"
const DATA_PROVIDER_FIELD_PATTERNS: { field: DataProviderField; regex: RegExp }[] = [
  // ja
  { field: "principalInvestigator", regex: /^研究代表者(?:[（(]所属機関[）)])?\s*[:：]?\s*/ },
  { field: "affiliation", regex: /^所\s*属\s*機\s*関\s*[:：]?\s*/ },
  { field: "projectName", regex: /^プロジェクト\/研究グループ名\s*[:：]?\s*/ },
  { field: "projectUrl", regex: /^URL\s*[:：]?\s*/ },
  { field: "header", regex: /^科研費\/助成金/ },

  // en
  { field: "principalInvestigator", regex: /^Principal Investigators?\s*(\(Affiliation\))?\s*[:：]?\s*/i },
  { field: "affiliation", regex: /^Affiliation\s*[:：]?\s*/i },
  { field: "projectName", regex: /^(?:(?:Project|Group)\s*(?:\/\s*(?:Group|Groupe))?\s*Name)\s*[:：]?\s*/i },
  { field: "projectUrl", regex: /^URL\s*[:：]?\s*/i },
  { field: "header", regex: /^Funds\s*\/\s*Grants\s*(?:[(（]Research Project Number[)）])?\s*[:：]?\s*/i },
]

const detectDataProviderField = (text: string): DataProviderField | null => {
  const t = text.trim()
  for (const { field, regex } of DATA_PROVIDER_FIELD_PATTERNS) {
    if (regex.test(t)) return field
  }
  return null
}

const stripDataProviderPrefix = (text: string): string => {
  let result = text
  for (const { regex } of DATA_PROVIDER_FIELD_PATTERNS) {
    result = result.replace(regex, "")
  }
  return result.trim()
}

/**
 * Parse the Data Provider section
 * Contains: principal investigator, affiliation, project name, URL, grants table
 */
const parseDataProviderSection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): DataProvider => {
  const dataProvider: DataProvider = {
    principalInvestigator: [],
    affiliation: [],
    projectName: [],
    projectUrl: [],
    grants: [],
  }

  if (!element) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): Data Provider section not found.`)
    return dataProvider
  }

  const children = Array.from(element.children)
  const tableIndex = children.findIndex(el => el.tagName.toUpperCase() === "TABLE")
  const before = tableIndex >= 0 ? children.slice(0, tableIndex) : children
  const table = tableIndex >= 0 ? (children[tableIndex] as HTMLTableElement) : null

  // Parse text sections before the table
  let currentField: DataProviderField | null = null
  for (const el of before) {
    if (isEmptyNode(el)) continue

    const text = cleanText(el.textContent)
    const rawHtml = cleanInnerHtml(el)

    const detected = detectDataProviderField(text)
    if (detected) {
      currentField = detected
    }

    if (currentField === null) {
      console.debug(`[DEBUG] - ${humVersionId} (${lang}): Text outside recognized data provider fields: ${text}`)
      continue
    }

    if (currentField === "projectUrl") {
      for (const a of Array.from(el.querySelectorAll("a"))) {
        const href = a.getAttribute("href")?.trim() ?? ""
        const linkText = cleanText(a.textContent)
        if (href && linkText) {
          dataProvider.projectUrl.push({ text: linkText, url: href })
        }
      }
    } else {
      if (currentField === "header") {
        // Ignore lines after header
        continue
      }
      const cleanedText = stripDataProviderPrefix(text)
      if (!cleanedText || cleanedText === "-") continue
      dataProvider[currentField].push({ text: cleanedText, rawHtml })
    }
  }

  // Parse grants table
  const EXPECT_HEADERS: Record<LangType, string[]> = {
    ja: ["科研費・助成金名", "タイトル", "研究課題番号"],
    en: ["Name", "Title", "Project Number"],
  }
  if (table) {
    const headerCells = Array.from(table.querySelectorAll("thead th")).map(th =>
      cleanText(th.textContent),
    )

    if (!compareHeaders(headerCells, EXPECT_HEADERS[lang])) {
      console.debug(
        `[DEBUG] - ${humVersionId} (${lang}): Unexpected grant table headers: ${headerCells}`,
      )
    }

    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const cells = Array.from(row.querySelectorAll("td"))
      if (cells.length !== 3) {
        console.debug(
          `[DEBUG] - ${humVersionId}: Skipping grant row with ${cells.length} cells`,
        )
        continue
      }

      dataProvider.grants.push({
        grantName: normalizeCellValue(cells[0]),
        projectTitle: normalizeCellValue(cells[1]),
        grantId: parseBrSeparatedValues(cells[2]),
      })
    }
  }

  return dataProvider
}

// =============================================================================
// Publications section parser
// =============================================================================

/**
 * Parse the Publications section
 * Contains a table with title, DOI, and dataset IDs
 */
const parsePublicationsSection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): Publication[] => {
  // Missing or empty section check
  if (!element || !cleanText(element.textContent)) {
    return []
  }

  const children = Array.from(element.children)
  const table = children.find(
    el => el.tagName.toUpperCase() === "TABLE",
  ) as HTMLTableElement | undefined
  if (!table) {
    console.debug(`[DEBUG] - ${humVersionId} (${lang}): Publications section has no table.`)
    return []
  }

  // Table header validation
  const EXPECT_HEADERS: Record<LangType, string[]> = {
    ja: ["", "タイトル", "DOI", "データID"],
    en: ["", "Title", "DOI", "Dataset ID"],
  }

  const headers = Array.from(table.querySelectorAll("thead th")).map(th =>
    cleanText(th.textContent),
  )

  // Try exact match, then fallback variations
  const expected = [...EXPECT_HEADERS[lang]]
  if (!compareHeaders(headers, expected)) {
    expected[3] = "Data ID"
    if (!compareHeaders(headers, expected)) {
      expected[3] = "Data Set ID"
      if (!compareHeaders(headers, expected)) {
        console.debug(
          `[DEBUG] - ${humVersionId} (${lang}): Unexpected publication table headers: ${headers}`,
        )
      }
    }
  }

  // Parse rows
  const publications: Publication[] = []

  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))

    if (cells.length < 4) {
      console.debug(
        `[DEBUG] - ${humVersionId}: Skipping malformed publication row (${cells.length} cells)`,
      )
      continue
    }

    const title = normalizeCellValue(cells[1])
    const doiCell = cells[2]
    const datasetCell = cells[3]

    // Skip all-empty rows
    const allText = cells.map(c => cleanText(c.textContent)).slice(1)
    if (allText.every(v => !v || v === "-")) continue

    // Extract DOI
    let doi: string | null = null
    const doiAnchor = doiCell.querySelector("a")
    if (doiAnchor) {
      const href = doiAnchor.getAttribute("href")?.trim()
      if (href) doi = href
    } else {
      doi = normalizeCellValue(doiCell)
    }

    // Extract dataset IDs using the common parser
    const datasetIds = parseDatasetIdsFromCell(datasetCell)

    publications.push({ title, doi, datasetIds })
  }

  return publications
}

// =============================================================================
// Controlled Access Users section parser
// =============================================================================

type ControlledAccessUserKey =
  | "principalInvestigator"
  | "affiliation"
  | "country"
  | "researchTitle"
  | "datasetIds"
  | "periodOfDataUse"

const CONTROLLED_ACCESS_HEADER_PATTERNS: { key: ControlledAccessUserKey; regex: RegExp }[] = [
  // ja
  { key: "principalInvestigator", regex: /^研究代表者$/ },
  { key: "affiliation", regex: /^所属機関$/ },
  { key: "country", regex: /^国・州名$/ },
  { key: "researchTitle", regex: /^研究題目$/ },
  { key: "datasetIds", regex: /^利用データID$/ },
  { key: "periodOfDataUse", regex: /^利用期間$/ },

  // en
  { key: "principalInvestigator", regex: /^PI$|^Principal Investigator:?$/i },
  { key: "affiliation", regex: /^Affiliation:?$/i },
  { key: "country", regex: /^Country\/Region$/i },
  { key: "researchTitle", regex: /^Research Title$/i },
  { key: "datasetIds", regex: /^Data in Use\s*\((Dataset|Data Set) ID\)$/i },
  { key: "periodOfDataUse", regex: /^Period of Data Use$/i },
]

const detectControlledAccessKey = (text: string): ControlledAccessUserKey | null => {
  const t = text.trim()
  for (const { key, regex } of CONTROLLED_ACCESS_HEADER_PATTERNS) {
    if (regex.test(t)) return key
  }
  return null
}

const normalizeCellText = (cell: Element): string[] => {
  const values: string[] = []

  if (cell.children.length === 0) {
    const t = normalizeCellValue(cell as HTMLTableCellElement)
    if (t) values.push(t)
    return values
  }

  for (const child of Array.from(cell.children)) {
    const t = normalizeCellValue(child as HTMLTableCellElement)
    if (t) values.push(t)
  }
  return values
}

/**
 * Parse the Controlled Access Users section
 * Contains a table listing approved data users with their details
 */
const parseControlledAccessUsersSection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): ControlledAccessUser[] => {
  if (!element) return []

  const table = element.querySelector("table")
  if (!table) {
    console.debug(
      `[DEBUG] - ${humVersionId} (${lang}): controlledAccessUsers table not found.`,
    )
    return []
  }

  // Build header-to-key mapping
  const headerCells = Array.from(table.querySelectorAll("thead th"))
  const headerMap = new Map<number, ControlledAccessUserKey>()

  headerCells.forEach((th, idx) => {
    const text = cleanText(th.textContent)
    const key = detectControlledAccessKey(text)
    if (key) {
      headerMap.set(idx, key)
    } else {
      console.debug(
        `[DEBUG] - ${humVersionId} (${lang}): Unknown controlledAccessUsers header: ${text}`,
      )
    }
  })

  if (headerMap.size === 0) {
    console.debug(
      `[DEBUG] - ${humVersionId} (${lang}): No recognizable headers in controlledAccessUsers table.`,
    )
    return []
  }

  // Parse rows
  const users: ControlledAccessUser[] = []

  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))

    // Skip empty rows
    if (cells.every(c => !cleanText(c.textContent))) continue

    const user: ControlledAccessUser = {
      principalInvestigator: null,
      affiliation: null,
      country: null,
      researchTitle: null,
      datasetIds: [],
      periodOfDataUse: null,
    }

    // Check for special malformed rows defined in config
    const firstCellText = cells[0]?.textContent?.trim() ?? ""
    const specialRow = findSpecialControlledAccessRow(humVersionId, cells.length, firstCellText)
    if (specialRow) {
      users.push(specialRow.data)
      continue
    }

    cells.forEach((cell, idx) => {
      const key = headerMap.get(idx)

      if (!key) {
        console.debug(
          `[DEBUG] - ${humVersionId} (${lang}): No key mapping for controlledAccessUsers cell index ${idx}.`,
        )
        return
      }

      if (key === "datasetIds") {
        // Use the common parser for dataset IDs
        const ids = parseDatasetIdsFromCell(cell)
        user.datasetIds.push(...ids)
      } else {
        const values = normalizeCellText(cell)
        const joined = values.join("\n")
        if (joined) {
          user[key] = joined
        }
      }
    })

    // Only add if has meaningful data
    if (
      user.principalInvestigator ||
      user.affiliation ||
      user.country ||
      user.researchTitle ||
      user.datasetIds.length > 0 ||
      user.periodOfDataUse
    ) {
      users.push(user)
    }
  }

  return users
}

// =============================================================================
// Main parser function
// =============================================================================

/**
 * Parse a detail page HTML and extract all structured data
 *
 * @param html - The raw HTML string of the detail page
 * @param humVersionId - The version identifier (e.g., "hum0001-v1")
 * @param lang - The language ("ja" or "en")
 * @returns ParseResult containing all extracted sections
 */
export const parseDetailPage = (
  html: string,
  humVersionId: string,
  lang: LangType,
): ParseResult => {
  const sections = splitToSection(html, humVersionId, lang)

  const summary = parseSummarySection(sections.summary, humVersionId, lang)
  const molecularData = parseMolecularDataSection(sections.molecularData, humVersionId, lang)
  const dataProvider = parseDataProviderSection(sections.dataProvider, humVersionId, lang)
  const publications = parsePublicationsSection(sections.publications, humVersionId, lang)
  const controlledAccessUsers = parseControlledAccessUsersSection(sections.controlledAccessUsers, humVersionId, lang)

  const result: ParseResult = {
    summary,
    molecularData,
    dataProvider,
    publications,
    controlledAccessUsers,
    releases: [], // Placeholder, to be filled in parseReleasePage
  }

  return result
}
