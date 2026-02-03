/**
 * Detail page parser for HumanDBs portal
 *
 * Parses the detail page HTML and extracts structured data
 * The page is divided into 5 main sections:
 * - Summary: Research overview, aims, methods, targets, and datasets
 * - Molecular Data: Detailed experiment/sample information tables
 * - Data Provider: Principal investigator, affiliation, grants
 * - Publications: Related papers with DOIs
 * - Controlled Access Users: List of approved data users
 */
import { JSDOM } from "jsdom"

import { findSpecialControlledAccessRow, getHumIdsWithDataSummary } from "@/crawler/config/mapping"
import { compareHeaders, normalizeCellValue } from "@/crawler/processors/normalize"
import type {
  LangType,
  RawParseResult,
  RawSummary,
  RawDataset,
  RawMolecularData,
  RawDataProvider,
  RawPublication,
  RawControlledAccessUser,
  TextValue,
} from "@/crawler/types"
import { logger } from "@/crawler/utils/logger"

import {
  cleanText,
  cleanInnerHtml,
  toTextValue,
  parseBrSeparatedValues,
  parseDatasetIdsFromCell,
} from "./utils"

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

// Section detection and splitting
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
  if (sectionElements.controlledAccessUsers) {
    const container = sectionElements.controlledAccessUsers
    const tables = Array.from(container.querySelectorAll("table"))
    if (tables.length > 0) {
      const firstTable = tables[0]
      const headerTexts = Array.from(firstTable.querySelectorAll("thead th"))
        .map(th => cleanText(th.textContent).toLowerCase())

      const isPublicationTable =
        headerTexts.includes("title") &&
        headerTexts.includes("doi") &&
        headerTexts.includes("dataset id")

      if (isPublicationTable) {
        container.removeChild(firstTable)

        sectionElements.publications ??= doc.createElement("div")
        sectionElements.publications.appendChild(firstTable)
      }
    }
  }

  // Case for molecularData header is missing but table exists in summary
  if (sectionElements.summary && !sectionElements.molecularData) {
    let foundMolecularTable = false
    const summaryElem = sectionElements.summary
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
      const humIdsWithDataSummary = getHumIdsWithDataSummary()
      if (!humIdsWithDataSummary.includes(humId)) {
        logger.debug("Molecular data section not found", { humVersionId, lang })
      }
    }
  }

  return sectionElements
}

// Summary section parser
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
 */
const parseSummarySection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): RawSummary => {
  const summary: RawSummary = {
    aims: { text: "", rawHtml: "" },
    methods: { text: "", rawHtml: "" },
    targets: { text: "", rawHtml: "" },
    url: [],
    datasets: [],
    footers: [],
  }

  if (!element) {
    logger.debug("Summary section not found", { humVersionId, lang })
    return summary
  }

  const children = Array.from(element.children)
  const tableIndex = children.findIndex(ch => ch.tagName.toLowerCase() === "table")
  const before = tableIndex >= 0 ? children.slice(0, tableIndex) : children
  const after = tableIndex >= 0 ? children.slice(tableIndex + 1) : []

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
      logger.debug("Text outside recognized summary fields", { humVersionId, lang, text })
    }
  }

  // Parse dataset table
  const EXPECT_HEADERS: Record<LangType, string[]> = {
    ja: ["データID", "内容", "制限", "公開日"],
    en: ["Dataset ID", "Type of Data", "Criteria", "Release Date"],
  }
  if (tableIndex >= 0) {
    const table = children[tableIndex] as HTMLTableElement
    const rows = parseTable<RawDataset>(table, (headers, cells) => {
      if (headers.length === 5 && cells.length === 5) {
        headers = headers.slice(1)
        cells = cells.slice(1)
      }

      if (!compareHeaders(headers, EXPECT_HEADERS[lang])) {
        logger.debug("Dataset table headers do not match expected format", { humVersionId, lang })
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

  // Parse footer section
  for (const el of after) {
    if (isEmptyNode(el)) continue
    summary.footers.push(toTextValue(el))
  }

  return summary
}

// Molecular Data section parser
const findNearestIdIndex = (children: Element[], tableIndex: number): number | null => {
  for (let i = tableIndex - 1; i >= 0; i--) {
    const text = cleanText(children[i].textContent)
    if (isIgnorableLine(text)) continue
    return i
  }
  return null
}

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

const expandRowspan = (table: HTMLTableElement): Element[][] => {
  const rows = Array.from(table.querySelectorAll("tr"))
  const grid: Element[][] = []
  const activeRowspans: (ActiveRowspan | null)[] = []

  for (const tr of rows) {
    const logicalRow: Element[] = []
    let col = 0

    while (activeRowspans[col]) {
      const active = activeRowspans[col]!
      logicalRow.push(active.el.cloneNode(true) as Element)
      active.remaining--
      if (active.remaining === 0) {
        activeRowspans[col] = null
      }
      col++
    }

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

const parseMolecularDataSection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): RawMolecularData[] => {
  if (!element) return []

  const children = Array.from(element.children)
  const tables = children
    .map((el, idx) => ({ el, idx }))
    .filter(({ el }) => el.tagName.toUpperCase() === "TABLE")
    .map(({ el, idx }) => ({ table: el as HTMLTableElement, index: idx }))

  const results: RawMolecularData[] = []
  for (let i = 0; i < tables.length; i++) {
    const { table, index: tableIndex } = tables[i]

    const idIndex = findNearestIdIndex(children, tableIndex)
    if (idIndex === null) {
      logger.debug("Could not find identifier element for molecular data table", { humVersionId, lang, tableIndex })
      continue
    }
    const idElem = children[idIndex]
    const id = toTextValue(idElem)

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
            text: data[keyText].text + "\n" + valueTexts.join(" "),
            rawHtml: data[keyText].rawHtml + "\n" + valueHtmls.join("\n"),
          }
        } else {
          data[keyText] = {
            text: valueTexts.join(" "),
            rawHtml: valueHtmls.join("\n"),
          }
        }
      }
    }

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

// Data Provider section parser
type DataProviderField = "principalInvestigator" | "affiliation" | "projectName" | "projectUrl" | "header"
const DATA_PROVIDER_FIELD_PATTERNS: { field: DataProviderField; regex: RegExp }[] = [
  { field: "principalInvestigator", regex: /^研究代表者(?:[（(]所属機関[）)])?\s*[:：]?\s*/ },
  { field: "affiliation", regex: /^所\s*属\s*機\s*関\s*[:：]?\s*/ },
  { field: "projectName", regex: /^プロジェクト\/研究グループ名\s*[:：]?\s*/ },
  { field: "projectUrl", regex: /^URL\s*[:：]?\s*/ },
  { field: "header", regex: /^科研費\/助成金/ },
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

const parseDataProviderSection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): RawDataProvider => {
  const dataProvider: RawDataProvider = {
    principalInvestigator: [],
    affiliation: [],
    projectName: [],
    projectUrl: [],
    grants: [],
  }

  if (!element) {
    logger.debug("Data Provider section not found", { humVersionId, lang })
    return dataProvider
  }

  const children = Array.from(element.children)
  const tableIndex = children.findIndex(el => el.tagName.toUpperCase() === "TABLE")
  const before = tableIndex >= 0 ? children.slice(0, tableIndex) : children
  const table = tableIndex >= 0 ? (children[tableIndex] as HTMLTableElement) : null

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
      logger.debug("Text outside recognized data provider fields", { humVersionId, lang, text })
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
      if (currentField === "header") continue
      const cleanedText = stripDataProviderPrefix(text)
      if (!cleanedText || cleanedText === "-") continue
      dataProvider[currentField].push({ text: cleanedText, rawHtml })
    }
  }

  const EXPECT_HEADERS: Record<LangType, string[]> = {
    ja: ["科研費・助成金名", "タイトル", "研究課題番号"],
    en: ["Name", "Title", "Project Number"],
  }
  if (table) {
    const headerCells = Array.from(table.querySelectorAll("thead th")).map(th =>
      cleanText(th.textContent),
    )

    if (!compareHeaders(headerCells, EXPECT_HEADERS[lang])) {
      logger.debug("Unexpected grant table headers", { humVersionId, lang, headers: headerCells })
    }

    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const cells = Array.from(row.querySelectorAll("td"))
      if (cells.length !== 3) {
        logger.debug("Skipping grant row with unexpected cell count", { humVersionId, cellCount: cells.length })
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

// Publications section parser
const parsePublicationsSection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): RawPublication[] => {
  if (!element || !cleanText(element.textContent)) {
    return []
  }

  const children = Array.from(element.children)
  const table = children.find(
    el => el.tagName.toUpperCase() === "TABLE",
  ) as HTMLTableElement | undefined
  if (!table) {
    logger.debug("Publications section has no table", { humVersionId, lang })
    return []
  }

  const EXPECT_HEADERS: Record<LangType, string[]> = {
    ja: ["", "タイトル", "DOI", "データID"],
    en: ["", "Title", "DOI", "Dataset ID"],
  }

  const headers = Array.from(table.querySelectorAll("thead th")).map(th =>
    cleanText(th.textContent),
  )

  const expected = [...EXPECT_HEADERS[lang]]
  if (!compareHeaders(headers, expected)) {
    expected[3] = "Data ID"
    if (!compareHeaders(headers, expected)) {
      expected[3] = "Data Set ID"
      if (!compareHeaders(headers, expected)) {
        logger.debug("Unexpected publication table headers", { humVersionId, lang, headers })
      }
    }
  }

  const publications: RawPublication[] = []

  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))

    if (cells.length < 4) {
      logger.debug("Skipping malformed publication row", { humVersionId, cellCount: cells.length })
      continue
    }

    const title = normalizeCellValue(cells[1])
    const doiCell = cells[2]
    const datasetCell = cells[3]

    const allText = cells.map(c => cleanText(c.textContent)).slice(1)
    if (allText.every(v => !v || v === "-")) continue

    let doi: string | null = null
    const doiAnchor = doiCell.querySelector("a")
    if (doiAnchor) {
      const href = doiAnchor.getAttribute("href")?.trim()
      if (href) doi = href
    } else {
      doi = normalizeCellValue(doiCell)
    }

    const datasetIds = parseDatasetIdsFromCell(datasetCell)

    publications.push({ title, doi, datasetIds })
  }

  return publications
}

// Controlled Access Users section parser
type ControlledAccessUserKey =
  | "principalInvestigator"
  | "affiliation"
  | "country"
  | "researchTitle"
  | "datasetIds"
  | "periodOfDataUse"

const CONTROLLED_ACCESS_HEADER_PATTERNS: { key: ControlledAccessUserKey; regex: RegExp }[] = [
  { key: "principalInvestigator", regex: /^研究代表者$/ },
  { key: "affiliation", regex: /^所属機関$/ },
  { key: "country", regex: /^国・州名$/ },
  { key: "researchTitle", regex: /^研究題目$/ },
  { key: "datasetIds", regex: /^利用データID$/ },
  { key: "periodOfDataUse", regex: /^利用期間$/ },
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

const parseControlledAccessUsersSection = (
  element: Element | undefined,
  humVersionId: string,
  lang: LangType,
): RawControlledAccessUser[] => {
  if (!element) return []

  const table = element.querySelector("table")
  if (!table) {
    logger.debug("Controlled access users table not found", { humVersionId, lang })
    return []
  }

  const headerCells = Array.from(table.querySelectorAll("thead th"))
  const headerMap = new Map<number, ControlledAccessUserKey>()

  headerCells.forEach((th, idx) => {
    const text = cleanText(th.textContent)
    const key = detectControlledAccessKey(text)
    if (key) {
      headerMap.set(idx, key)
    } else {
      logger.debug("Unknown controlled access users header", { humVersionId, lang, header: text })
    }
  })

  if (headerMap.size === 0) {
    logger.debug("No recognizable headers in controlled access users table", { humVersionId, lang })
    return []
  }

  const users: RawControlledAccessUser[] = []

  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))

    if (cells.every(c => !cleanText(c.textContent))) continue

    const user: RawControlledAccessUser = {
      principalInvestigator: null,
      affiliation: null,
      country: null,
      researchTitle: null,
      datasetIds: [],
      periodOfDataUse: null,
    }

    const firstCellText = cells[0]?.textContent?.trim() ?? ""
    const specialRow = findSpecialControlledAccessRow(humVersionId, cells.length, firstCellText)
    if (specialRow) {
      users.push(specialRow.data)
      continue
    }

    cells.forEach((cell, idx) => {
      const key = headerMap.get(idx)

      if (!key) {
        logger.debug("No key mapping for controlled access users cell index", { humVersionId, lang, cellIndex: idx })
        return
      }

      if (key === "datasetIds") {
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

// Main parser function
/**
 * Parse a detail page HTML and extract all structured data
 */
export const parseDetailPage = (
  html: string,
  humVersionId: string,
  lang: LangType,
): RawParseResult => {
  const sections = splitToSection(html, humVersionId, lang)

  const summary = parseSummarySection(sections.summary, humVersionId, lang)
  const molecularData = parseMolecularDataSection(sections.molecularData, humVersionId, lang)
  const dataProvider = parseDataProviderSection(sections.dataProvider, humVersionId, lang)
  const publications = parsePublicationsSection(sections.publications, humVersionId, lang)
  const controlledAccessUsers = parseControlledAccessUsersSection(sections.controlledAccessUsers, humVersionId, lang)

  const result: RawParseResult = {
    title: "",
    summary,
    molecularData,
    dataProvider,
    publications,
    controlledAccessUsers,
    releases: [],
  }

  return result
}
