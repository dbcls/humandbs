import { JSDOM } from "jsdom"

import type { LangType } from "@/crawler/types"
import { extractTagsFromElement, sameArray, cleanJapaneseText } from "@/crawler/utils"

interface SummaryUrl {
  url: string
  text: string
}

interface Summary {
  aims: string
  methods: string
  targets: string
  url: SummaryUrl[]
}

interface Dataset {
  dataId: string[]
  typeOfData: string[]
  criteria: string[]
  releaseDate: string[]
}
type DatasetKeys = keyof Dataset
const DATASET_KEYS: DatasetKeys[] = ["dataId", "typeOfData", "criteria", "releaseDate"]

// interface LinkData {
//   text: string
//   url: string
// }

interface MoleculerData {
  ids: string[]
  // data: Record<string, (string | LinkData)[]>
  data: Record<string, string> // TODO: 一旦 raw html にする
  footers: string[]
}

interface Grant {
  grantName: string[]
  projectTitle: string[]
  grantId: string[]
}
type GrantKeys = keyof Grant
const GRANT_KEYS: GrantKeys[] = ["grantName", "projectTitle", "grantId"]

interface DataProvider {
  principalInvestigator: string[]
  affiliation: string[]
  projectName: string[]
  projectUrl: string[]
  grants: Grant[]
}
type DataProviderKeys = keyof DataProvider

interface ControlledAccessUser {
  principalInvestigator: string | null
  affiliation: string | null
  country: string | null
  researchTitle: string | null
  datasetIds: string[]
  periodOfDataUse: string | null
}
type ControlledAccessUserKeys = keyof ControlledAccessUser

interface Release {
  humVersionId: string
  releaseDate: string // YYYY-MM-DD
  content: string
  releaseNote: string[]
}

export interface ParseResult {
  summary: Summary
  datasets: Dataset[]
  molecularData: MoleculerData[]
  dataProvider: DataProvider
  publications: Publication[]
  controlledAccessUsers: ControlledAccessUser[]
  releases?: Release[]
}

// === Parser impl. ===

export const parseDetailPage = (humVersionId: string, html: string, lang: LangType): ParseResult => {
  const sections = splitToSection(humVersionId, html, lang)

  // parseHeader(humVersionId, sections.header) // do nothing (only validate)
  const [summary, datasets] = parseSummary(humVersionId, sections.summary, lang)
  const molecularData = parseMolecularData(humVersionId, sections.molecularData, lang)
  const dataProvider = parseDataProvider(humVersionId, sections.dataProvider, lang)
  const publications = parsePublications(humVersionId, sections.publications, lang)
  const controlledAccessUsers = sections.controlledAccessUsers !== undefined ?
    parseControlledAccessUsers(humVersionId, sections.controlledAccessUsers, lang) :
    []

  return {
    summary,
    datasets,
    molecularData,
    dataProvider,
    publications,
    controlledAccessUsers,
  }
}

type SectionType = "header" | "summary" | "molecularData" | "dataProvider" | "publications" | "controlledAccessUsers"
const SECTION_TYPE: SectionType[] = ["header", "summary", "molecularData", "dataProvider", "publications", "controlledAccessUsers"]
const SECTION_LABELS: Record<LangType, string[][]> = {
  ja: [
    ["研究内容の概要", "分子データ", "提供者情報", "関連論文"],
    ["研究内容の概要", "分子データ", "提供者情報", "関連論文", "制限公開データの利用者一覧"],
    ["研究内容の概要", "データ概要", "提供者情報", "関連論文", "制限公開データの利用者一覧"], // TODO hum0043
  ],
  en: [
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS"], // hum0009
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS", "USERS (Controlled-access Data)"],
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS", "USRES (Controlled-access Data)"], // TODO: typo in the original page (hum0005?)
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS", "USERS (Controlled-sccess Data)"], // TODO: typo (hum0041)
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS", "USERS (Controlled-Access Data)"], // TODO: typo (hum0042)
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS", "USRES (Controlled-Access Data)"], // TODO: typo (hum0120)
    ["SUMMARY", "Data Summary", "DATA PROVIDER", "PUBLICATIONS", "USRES (Controlled-access Data)"], // hum0235
    ["SUMMARY", "DATA PROVIDER", "PUBLICATIONS", "USRES (Controlled-access Data)"], // no MOLECULAR DATA HEADER
    ["SUMMARY", "DATA PROVIDER", "PUBLICATIONS", "USRES (Controlled-Access Data)"], // no MOLECULAR DATA HEADER
    ["SUMMARY", "DATA PROVIDER", "PUBLICATIONS"], // no MOLECULAR DATA HEADER and NO USERS (hum0335)
    ["SUMMARY", "MOLECULAR DATA", "PUBLICATIONS"], // 10 // DATA PROVIDER header is P instead of H1
    ["SUMMARY", "MOLECULAR DATA", "PUBLICATIONS", "USRES (Controlled-access Data)"],// 11 // DATA PROVIDER header is P instead of H1
    ["SUMMARY", "MOLECULAR DATA", "PUBLICATIONS", "USERS (Controlled-Access Data)"], // 12 // PUBLICATIONS header is P instead of H1 (hum0332, hum0342)
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "USRES (Controlled-Access Data)"], // 13 // PUBLICATIONS header is P instead of H1 (hum0332, hum0342)
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "USRES (Controlled-access Data)"], // 14 // PUBLICATIONS header is P instead of H1 (hum0342)
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS", "USRES (Controlled Access Data)"], // hum0009.v2
  ],
}

type DetailPageSections = Record<SectionType, JSDOM>

export const splitToSection = (humVersionId: string, html: string, lang: LangType): DetailPageSections => {
  // As children of articleBody,
  // the structure is like ["P", "P", "H1", "P", "P", "P", "P", "P", "P", "TABLE", "P", "P", "P", "P", "H1", "P", "TABLE", "P", "P", "TABLE", "H1", "P", "P", "P", "TABLE", "P", "H1", "TABLE", "P", "H1", "TABLE"]
  // Split them into separate sections using the H1 tag as a delimiter.
  const dom = new JSDOM(html)
  const articleBody = dom.window.document.querySelector("div.articleBody")
  if (articleBody === null) {
    throw new Error(`Failed to find articleBody in ${humVersionId} ${lang}`)
  }

  let sectionLabels = Array.from(articleBody.querySelectorAll("h1"))
    .map(h1 => h1.textContent)
    .filter((label) => label !== null)
    .map((label) => label.trim())
  if (!SECTION_LABELS[lang].some(labels => sameArray(sectionLabels, labels))) {
    throw new Error(`Unexpected section labels in ${humVersionId}: ${sectionLabels}`)
  }

  const sections: Partial<DetailPageSections> = {}
  let currentSectionDom: JSDOM = new JSDOM("<!DOCTYPE html><html><body></body></html>")
  let currentSectionKey: SectionType = "header"

  if (
    (sameArray(sectionLabels, SECTION_LABELS.en[7]) || sameArray(sectionLabels, SECTION_LABELS.en[8]) || sameArray(sectionLabels, SECTION_LABELS.en[9])) &&
    lang === "en"
  ) {
    // no MOLECULAR DATA HEADER
    const tags = extractTagsFromElement(articleBody)
    const secondTableIndex = tags.indexOf("TABLE", tags.indexOf("TABLE") + 1)
    const newH1 = dom.window.document.createElement("h1")
    newH1.textContent = "MOLECULAR DATA"
    articleBody.insertBefore(newH1, articleBody.children[secondTableIndex - 1])
    // Update
    sectionLabels = Array.from(articleBody.querySelectorAll("h1"))
      .map(h1 => h1.textContent)
      .filter((label) => label !== null)
      .map((label) => label.trim())
  }

  if (
    (sameArray(sectionLabels, SECTION_LABELS.en[10]) || sameArray(sectionLabels, SECTION_LABELS.en[11]) || sameArray(sectionLabels, SECTION_LABELS.en[12])) &&
    lang === "en"
  ) {
    // DATA PROVIDER header is P instead of H1
    const newH1 = dom.window.document.createElement("h1")
    newH1.textContent = "DATA PROVIDER"
    let prevPIndex = -1
    for (const [index, child] of Array.from(articleBody.children).entries()) {
      if (child.tagName === "P" && child.textContent?.trim() === "DATA PROVIDER") {
        prevPIndex = index
        break
      }
    }
    if (prevPIndex === -1) {
      throw new Error(`Failed to find DATA PROVIDER in ${humVersionId}`)
    }
    articleBody.replaceChild(newH1, articleBody.children[prevPIndex])
    // Update
    sectionLabels = Array.from(articleBody.querySelectorAll("h1"))
      .map(h1 => h1.textContent)
      .filter((label) => label !== null)
      .map((label) => label.trim())
  }

  if (
    (sameArray(sectionLabels, SECTION_LABELS.en[13]) || sameArray(sectionLabels, SECTION_LABELS.en[14])) &&
    lang === "en"
  ) {
    // PUBLICATIONS header is P instead of H1
    const newH1 = dom.window.document.createElement("h1")
    newH1.textContent = "PUBLICATIONS"
    let prevPIndex = -1
    for (const [index, child] of Array.from(articleBody.children).entries()) {
      if (child.tagName === "P" && child.textContent?.trim() === "PUBLICATIONS") {
        prevPIndex = index
        break
      }
    }
    if (prevPIndex === -1) {
      throw new Error(`Failed to find PUBLICATIONS in ${humVersionId}`)
    }
    articleBody.replaceChild(newH1, articleBody.children[prevPIndex])
    // Update
    sectionLabels = Array.from(articleBody.querySelectorAll("h1"))
      .map(h1 => h1.textContent)
      .filter((label) => label !== null)
      .map((label) => label.trim())
  }

  if (humVersionId.startsWith("hum0474")) {
    // publications table is placed after USERS (Controlled-access Data) section
    const tags = extractTagsFromElement(articleBody)
    const tableIndexes = tags.map((tag, index) => tag === "TABLE" ? index : -1).filter((index) => index !== -1)
    const pubTableIndex = tableIndexes[tableIndexes.length - 2]
    const pubTable = articleBody.children[pubTableIndex]

    const h1Indexes = tags.map((tag, index) => tag === "H1" ? index : -1).filter((index) => index !== -1)
    const pubH1Index = h1Indexes[h1Indexes.length - 2]
    const pubH1 = articleBody.children[pubH1Index]
    articleBody.insertBefore(pubTable, pubH1.nextSibling)
  }

  Array.from(articleBody.children).forEach((child) => {
    if (child.tagName === "H1") {
      sections[currentSectionKey] = currentSectionDom

      currentSectionDom = new JSDOM("<!DOCTYPE html><html><body></body></html>")
      const nextSectionIndex = sectionLabels.indexOf(child.textContent?.trim() ?? "") + 1
      currentSectionKey = SECTION_TYPE[nextSectionIndex]
    } else {
      currentSectionDom.window.document.body.appendChild(child.cloneNode(true))
    }
  })
  sections[currentSectionKey] = currentSectionDom

  return sections as DetailPageSections
}

export const parseHeader = (humVersionId: string, dom: JSDOM): void => {
  const body = dom.window.document.body

  const nbdcResearchId = body.querySelector("p > span > strong")?.textContent?.replace("NBDC Research ID:", "").trim()
  if (nbdcResearchId === undefined) {
    throw new Error(`Failed to find NBDC Research ID in ${humVersionId}`)
  }
  if (humVersionId !== nbdcResearchId) {
    if (["hum0145", "hum0175", "hum0208"].some(humId => humVersionId.startsWith(humId))) {
      // skip
    } else {
      throw new Error(`NBDC Research ID does not match: ${humVersionId} !== ${nbdcResearchId}`)
    }
  }
}

export const parseSummary = (humVersionId: string, dom: JSDOM, lang: LangType): [Summary, Dataset[]] => {
  // ["P", "P", "P", "P", "P", "P", "TABLE", "P", "P", "P", "P"]
  // The content before the table follows this order: objective, method, subject, and URL.
  // The table contains information about the dataset.
  // The content after the table mainly consists of standardized text.
  const body = dom.window.document.body

  const tags = extractTagsFromElement(body)
  const tagsString = tags.join("")
  const isValidPattern = /^P+(TABLE)P+/g
  if (!isValidPattern.test(tagsString)) {
    if (["hum0028"].some(humId => humVersionId.startsWith(humId))) {
      // skip PDIVPPPTABLEPPP
    } else {
      throw new Error(`Unexpected tags in summary section of ${humVersionId}: ${tagsString}`)
    }
  }

  const tableIndex = tags.indexOf("TABLE")
  const summaryChildren = Array.from(body.children).slice(0, tableIndex)
  const tableChild = body.children[tableIndex]
  const restChildren = Array.from(body.children).slice(tableIndex + 1)

  // === Summary ===
  const parsedSummary = {
    aims: [] as string[],
    methods: [] as string[],
    targets: [] as string[],
    url: [] as SummaryUrl[],
  }
  type SummaryKeys = keyof typeof parsedSummary
  const SUMMARY_HEADERS: Record<LangType, Record<string, SummaryKeys>> = {
    ja: {
      "目的：": "aims",
      "方法：": "methods",
      "対象：": "targets",
      "URL：": "url",
      "URL:": "url", // hum0094
    },
    en: {
      "Aims:": "aims",
      "Aims :": "aims", // hum0082
      "Methods:": "methods",
      "Methods :": "methods", // hum0082
      "Participants/Materials:": "targets",
      "Participants/Materials": "targets", // hum0007
      "Materials:": "targets", // hum0012
      "Materials :": "targets", // hum0082
      "URL:": "url",
      "URL：": "url", // hum0021
    },
  }

  const IGNORE_STRONG_LINES = [
    "1. Genome & Genetic research", // hum0064,
    "2. Retrospective study", // hum0064
    "1. PEG-IFN/RBVの治療応答性（血中C型肝炎ウイルス排除の有無）", // hum0074
    "2. C型肝炎PEG-IFN/RBV併用療法による血小板減少", // hum0074
    "3. 進展に伴うヘモグロビン減少", // hum0074
    "4. インターフェロン治療によるC型肝炎ウイルス排除（sustained virological response：SVR）後の肝発がん", // hum0074
    "1. virologic response to PEG-INF/RBV treatment", // hum0074
    "2. decrease of PLT in response to PEG-IFN/RBV treatment", // hum0074
    "3. Hb reduction", // hum0074
    "4. hepatocellular carcinoma (HCC) development after eradication of HCV by IFN-based treatment", // hum0074
  ]

  let currentKey: SummaryKeys | null = null
  let currentPrefix: string | null = null
  for (const node of summaryChildren) {
    const text = node.textContent?.trim() ?? ""
    if (text === "") continue

    const strongNode = node.querySelector("strong")
    if (strongNode !== null) {
      const strongText = strongNode.textContent?.trim() ?? ""
      let found = false
      if (IGNORE_STRONG_LINES.includes(strongText)) {
        found = true
      } else {
        for (const [prefix, key] of Object.entries(SUMMARY_HEADERS[lang])) {
          if (strongText.startsWith(prefix)) {
            currentKey = key
            currentPrefix = prefix
            found = true
            break
          }
        }
      }
      if (!found) {
        throw new Error(`Unexpected text in summary section of ${humVersionId}: ${strongText}`)
      }
    }
    if (currentKey === "url") {
      for (const aNode of node.querySelectorAll("a")) {
        const text = aNode.textContent?.trim() ?? ""
        let url = aNode.getAttribute("href") ?? ""
        if (text === "" || url === "") continue
        if (text === "JPDSC") {
          url = "https://humandbs.dbcls.jp/hum0013-jpdsc"
        }
        parsedSummary.url.push({ text, url })
      }
    } else {
      parsedSummary[currentKey!].push(text.replace(currentPrefix!, "").trim())
    }
  }

  const joinText = (values: string[], lang: LangType): string => {
    return lang === "ja" ?
      values.map(cleanJapaneseText).filter(text => text !== "").join("\n") :
      values.filter(text => text !== "").join("\n")
  }
  const summary: Summary = {
    aims: joinText(parsedSummary.aims, lang),
    methods: joinText(parsedSummary.methods, lang),
    targets: joinText(parsedSummary.targets, lang),
    url: parsedSummary.url,
  }

  // === Table ===
  const TABLE_HEADERS: Record<LangType, string[]> = {
    ja: ["データID", "内容", "制限", "公開日"],
    en: ["Dataset ID", "Type of Data", "Criteria", "Release Date"],
  }
  const expectedTableHeaders = TABLE_HEADERS[lang]
  let actualTableHeaders = Array.from(tableChild.querySelectorAll("thead th")).map(th => th.textContent?.trim() ?? "")
  if (actualTableHeaders.length === 5) {
    // hum0235
    actualTableHeaders = actualTableHeaders.slice(1)
  }
  if (!sameArray(actualTableHeaders, expectedTableHeaders)) {
    expectedTableHeaders[0] = "Data Set ID" // for hum0269
    if (!sameArray(actualTableHeaders, expectedTableHeaders)) {
      throw new Error(`Unexpected table headers in summary section of ${humVersionId}: ${actualTableHeaders}`)
    }
  }

  const datasets: Dataset[] = []
  for (const row of Array.from(tableChild.querySelectorAll("tbody tr"))) {
    let cells = Array.from(row.querySelectorAll("td"))
    if (![4, 5].includes(cells.length)) {
      throw new Error(`Unexpected number of cells in table of summary section of ${humVersionId}: ${cells.length}`)
    }
    if (cells.length === 5) {
      // hum0235
      cells = cells.slice(1)
    }
    // It is expected that multiple `<P>` elements exist in parallel inside `<td>` (with `<SPAN>` or `<A>` inside them).

    const dataset: Partial<Dataset> = {}
    for (const [index, cell] of cells.entries()) {
      const tags = extractTagsFromElement(cell)
      const isValidPattern = /^P*/g
      if (!isValidPattern.test(tags.join(""))) {
        throw new Error(`Unexpected tags in table of summary section of ${humVersionId}: ${tags.join("")}`)
      }

      dataset[DATASET_KEYS[index]] = Array.from(cell.children)
        .map((child) => (child.textContent?.trim() ?? ""))
        .filter((text) => text !== "")
    }
    datasets.push(dataset as Dataset)
  }

  // === Rest ===
  const IGNORE_LINES: Record<LangType, string[]> = {
    ja: [
      "※リリース情報",
      "※制限公開データ",
      "※論文等",
      "※2015/6/30より", // hum0009
      "※2019/1/11より", // hum0015
      "※ 論文等", // hum0214
      "※ リリース情報", // hum0235, hum0250
    ],
    en: [
      "*Release Note",
      "* Release Note", // hum0318
      "*Data users need to apply",
      "* Data users need to apply", // hum0004
      "*When the research results",
      "* When the research results", // hum0009
      "* The data provider changed", // hum0009
      "When the research results", // hum0179
    ],
  }
  for (const restChild of restChildren) {
    const text = restChild.textContent?.trim() ?? ""
    if (text === "") continue

    if (IGNORE_LINES[lang].some(line => text.startsWith(line))) continue
    throw new Error(`Unexpected text in rest parts of summary section of ${humVersionId}: ${text}`)
  }

  return [summary, datasets]
}

export const parseMolecularData = (humVersionId: string, dom: JSDOM, lang: LangType): MoleculerData[] => {
  // ["P", "TABLE", "P", "P", "TABLE", "P", "P", "TABLE", "P", "P", "TABLE", "P", "P", "TABLE", "P", "P"]
  // PTABLEPP => P: IDs, TABLE: table, Ps: footer text or empty line
  if (["hum0014"].some(humId => humVersionId.startsWith(humId))) {
    return [] // TODO: skip this section for now
  }

  const body = dom.window.document.body
  for (const child of body.children) {
    if (child.tagName === "TABLE") break

    if (child.textContent?.trim() === "") {
      // remove empty lines at the beginning
      body.removeChild(child)
    }
  }

  const tags = extractTagsFromElement(body)
  const tagsString = tags.join("")
  const isValidPattern = /^(PTABLEP*)+$/g
  if (!isValidPattern.test(tagsString)) {
    if (
      (["hum0356"].some(humId => humVersionId.startsWith(humId)) && lang === "ja") ||
      (["hum0356"].some(humId => humVersionId.startsWith(humId)) && lang === "en")
    ) {
      // skip PPTABLEP
    } else {
      throw new Error(`Unexpected tags in molecularData section of ${humVersionId}: ${tagsString}`)
    }
  }

  const ID_SPLITTER: Record<LangType, string> = {
    ja: "、",
    en: ",",
  }

  const tableIndexes = tags.
    map((tag, index) => tag === "TABLE" ? index : -1).
    filter((index) => index !== -1)
  const molecularData: MoleculerData[] = []
  for (const [i, tableIndex] of tableIndexes.entries()) {
    let firstP = body.children[tableIndex - 1]
    const table = body.children[tableIndex]
    let restPs = []
    if (i === tableIndexes.length - 1) {
      restPs = Array.from(body.children).slice(tableIndex + 1)
    } else {
      restPs = Array.from(body.children).slice(tableIndex + 1, tableIndexes[i + 1] - 1)
    }

    // for hum0009
    const filterPrefix = lang === "ja" ?
      "DRA003802（JGAD000006）の集計情報です" :
      "Methylation rate at each CpG site"
    if (humVersionId.startsWith("hum0009")) {
      restPs = restPs
        .filter(p => !(p.textContent?.trim() ?? "").startsWith(filterPrefix))
        .filter(p => !(p.textContent?.trim() ?? "").startsWith("hum0009v1.CpG.v1"))
    }
    const firstPText = firstP.textContent?.trim() ?? ""
    if (firstPText.startsWith(filterPrefix)) { // for hum0009
      firstP = body.children[tableIndex - 2]
      restPs.push(body.children[tableIndex - 1])
    }

    const footers = restPs
      .map(p => p.textContent?.trim() ?? "")
      .filter(text => text !== "")

    let ids = []
    if (humVersionId.startsWith("hum0356") && i === 0) {
      const lines = Array.from(body.children).slice(0, tableIndex)
      ids = lines.map(line => line.textContent?.trim() ?? "")
    } else {
      ids = firstP.textContent?.trim().split(ID_SPLITTER[lang]) ?? []
    }
    //   const data: Record<string, (string | LinkData)[]> = {}
    //   for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    //     const cells = Array.from(row.querySelectorAll("td"))
    //     if (cells.length !== 2) {
    //       throw new Error(`Unexpected number of cells in table of molecularData section of ${humVersionId}: ${cells.length}`)
    //     }

    //     const key = cells[0].textContent?.trim() ?? ""
    //     const value: (string | LinkData)[] = []
    //     const valueNode = cells[1]
    //     // valueNode's children: A, P, SPAN
    //     // However, there may be an A in P
    //     const valueNodeTags = extractTagsFromElement(valueNode)
    //     const isValid = valueNodeTags.every(tag => ["A", "P", "SPAN"].includes(tag))
    //     if (!isValid) {
    //       throw new Error(`Unexpected tags in value node of molecularData section of ${humVersionId}: ${key}: ${valueNodeTags}`)
    //     }
    //     for (const valueChild of Array.from(valueNode.children)) {
    //       if (valueChild.tagName === "A") {
    //         value.push({
    //           text: valueChild.textContent?.trim() ?? "",
    //           url: valueChild.getAttribute("href") ?? "",
    //         })
    //       } else if (valueChild.tagName === "P") {
    //         const anchor = valueChild.querySelector("a")
    //         if (anchor !== null) {
    //           value.push({
    //             text: anchor.textContent?.trim() ?? "",
    //             url: anchor.getAttribute("href") ?? "",
    //           })
    //         } else {
    //           value.push(valueChild.textContent?.trim() ?? "")
    //         }
    //       } else if (valueChild.tagName === "SPAN") {
    //         value.push(valueChild.textContent?.trim() ?? "")
    //       }
    //     }

    //     data[key] = value
    //   }
    //   molecularData.push({ ids, data, footers })
    // }

    const data: Record<string, string> = {}
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const cells = Array.from(row.querySelectorAll("td"))
      if (cells.length !== 2) {
        throw new Error(`Unexpected number of cells in table of molecularData section of ${humVersionId}: ${cells.length}`)
      }

      const key = cells[0].textContent?.trim() ?? ""
      const valueNode = cells[1]
      const value = valueNode.textContent?.trim() ?? ""
      data[key] = value
    }
    molecularData.push({ ids, data, footers })
  }

  return molecularData
}

export const parseDataProvider = (humVersionId: string, dom: JSDOM, lang: LangType): DataProvider => {
  // ["P", "P", "P", "TABLE", "P"]
  // 3 P: investigator, affiliation, header for table
  // 4 P: investigator, affiliation, project name, header for table
  // 5 P: investigator, affiliation, project name, url, header for table
  // table: data provider
  // last P: empty line
  const body = dom.window.document.body

  const tags = extractTagsFromElement(body)
  const tagsString = tags.join("")
  const isValidPattern = /^P+TABLEP?/g
  if (!isValidPattern.test(tagsString)) {
    throw new Error(`Unexpected tags in dataProvider section of ${humVersionId}: ${tagsString}`)
  }

  const SUMMARY_HEADERS: Record<LangType, Record<string, DataProviderKeys | "header">> = {
    ja: {
      "研究代表者：": "principalInvestigator",
      "研究代表者（所属機関）：": "principalInvestigator", // hum0099
      "所 属 機 関：": "affiliation",
      "プロジェクト/研究グループ名：": "projectName",
      "URL:": "projectUrl", // "hum0017", etc.
      "URL：": "projectUrl",
      "科研費/助成金（Research Project Number）：": "header",
    },
    en: {
      "Principal Investigator:": "principalInvestigator",
      "Principal Investigators:": "principalInvestigator", // hum0115
      "Principal Investigators (Affiliation):": "principalInvestigator", // hum0099
      "Affiliation:": "affiliation",
      "Project / Group Name:": "projectName",
      "Project / Groupe Name:": "projectName", // hum0004, hum0009, hum0012, etc.
      "Project / Group Name：": "projectName", // hum0173, hum0174
      "Project / Groupe Name：": "projectName", // hum0009.v1
      "Project Name:": "projectName", // hum0035
      "Project Name：": "projectName",
      "Group Name:": "projectName", // 0035
      "Group Name：": "projectName",
      "URL:": "projectUrl", // "hum0006", "hum0007", etc.
      "URL：": "projectUrl",
      "Funds / Grants (Research Project Number):": "header",
      "Funds / Grants (Research Project Number) :": "header", // hum0014, etc.
      "Funds / Grants（Research Project Number）：": "header", // hum0009.v1
    },
  }

  const TABLE_HEADERS: Record<LangType, string[]> = {
    ja: ["科研費・助成金名", "タイトル", "研究課題番号"],
    en: ["Name", "Title", "Project Number"],
  }

  const dataProvider: Partial<DataProvider> = {
    principalInvestigator: [],
    affiliation: [],
    projectName: [],
    projectUrl: [],
  }

  // === header ===
  let currentKey: DataProviderKeys | "header" | null = null
  let currentPrefix: string | null = null
  for (const pNode of Array.from(body.children)) {
    if (pNode.tagName === "TABLE") break

    const pText = pNode.textContent?.trim() ?? ""
    if (pText === "") continue

    const strongNode = pNode.querySelector("strong")
    if (strongNode !== null) {
      const strongText = strongNode.textContent?.trim() ?? ""
      if (strongText !== "") { // for hum0269
        let found = false
        for (const [prefix, key] of Object.entries(SUMMARY_HEADERS[lang])) {
          if (strongText.startsWith(prefix)) {
            currentKey = key
            currentPrefix = prefix
            found = true
            break
          }
        }
        if (!found) {
          throw new Error(`Unexpected text in dataProvider section of ${humVersionId}: ${strongText}`)
        }
      }
    }
    if (currentKey === "header" || currentKey === "grants") {
      continue
    } else {
      if (humVersionId.startsWith("hum0053") &&
        (pText.startsWith("URL: https://www.pref.aichi.jp/") || pText.startsWith("https://www.pref.aichi.jp/"))
      ) {
        dataProvider.projectUrl!.push(pText.replace("URL: ", "").trim())
      } else {
        dataProvider[currentKey!]!.push(pText.replace(currentPrefix!, "").trim())
      }
    }
  }

  // === table ===
  const table = body.querySelector("table")!
  const actualTableHeaders = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent?.trim() ?? "")
  if (!sameArray(actualTableHeaders, TABLE_HEADERS[lang])) {
    throw new Error(`Unexpected table headers in dataProvider section of ${humVersionId}: ${actualTableHeaders}`)
  }

  const grants: Grant[] = []
  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    if (cells.length !== 3) {
      throw new Error(`Unexpected number of cells in table of dataProvider section of ${humVersionId}: ${cells.length}`)
    }

    const grant: Partial<Grant> = {}
    for (const [index, cell] of cells.entries()) {
      const tags = extractTagsFromElement(cell)
      const isValid = tags.every(tag => ["P", "SPAN"].includes(tag))
      if (!isValid) {
        throw new Error(`Unexpected tags in cell of dataProvider section of ${humVersionId}: ${tags}`)
      }

      grant[GRANT_KEYS[index]] = Array.from(cell.children)
        .map((child) => (child.textContent?.trim() ?? ""))
        .filter((text) => text !== "")
    }

    grants.push(grant as Grant)
  }

  dataProvider.grants = grants

  const lastP = body.children[body.children.length - 1]
  if (lastP.tagName === "P") { // for hum0440
    const lastPText = lastP.textContent?.trim() ?? ""
    if (lastPText !== "") {
      throw new Error(`Unexpected text in the last P of dataProvider section of ${humVersionId}: ${lastPText}`)
    }
  }

  return dataProvider as DataProvider
}

interface Publication {
  title: string
  doi: string
  datasetIds: string[]
}

export const parsePublications = (humVersionId: string, dom: JSDOM, lang: LangType): Publication[] => {
  // ["TABLE", "P"]
  // TABLE: publication list
  // P: empty line
  const body = dom.window.document.body

  if (body.textContent?.trim() === "") {
    // for hum0474
    return [] // no publications
  }

  const tags = extractTagsFromElement(body)
  const tagsString = tags.join("")
  if (!["TABLE", "TABLEP"].includes(tagsString)) {
    throw new Error(`Unexpected tags in publications section of ${humVersionId}: ${tags}`)
  }

  const TABLE_HEADERS: Record<LangType, string[]> = {
    ja: ["", "タイトル", "DOI", "データID"],
    en: ["", "Title", "DOI", "Dataset ID"],
  }

  const table = body.children[0]
  const actualTableHeaders = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent?.trim() ?? "")
  const expectedTableHeaders = TABLE_HEADERS[lang]
  if (!sameArray(actualTableHeaders, expectedTableHeaders)) {
    // hum0028 en
    expectedTableHeaders[3] = "Data ID"
    if (!sameArray(actualTableHeaders, expectedTableHeaders)) {
      expectedTableHeaders[3] = "Data Set ID" // hum0269
      if (!sameArray(actualTableHeaders, expectedTableHeaders)) {
        throw new Error(`Unexpected table headers in publications section of ${humVersionId}: ${actualTableHeaders}`)
      }
    }
  }

  const publications: Publication[] = []
  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    const tmpValues = cells.map((cell) => cell.textContent?.trim() ?? "").slice(1)
    if (tmpValues.every(value => ["", "-"].includes(value))) {
      // empty row
      continue
    }

    if (cells.length !== 4) {
      throw new Error(`Unexpected number of cells in table of publications section of ${humVersionId}: ${cells.length}`)
    }

    const titleCell = cells[1] // only SPAN
    if (!sameArray(extractTagsFromElement(titleCell), ["SPAN"])) {
      throw new Error(`Unexpected tags in title cell of publications section of ${humVersionId}: ${extractTagsFromElement(titleCell)}`)
    }
    const title = titleCell.textContent?.trim() ?? ""

    const doiCell = cells[2] // only A, or SPAN -> A
    const tagString = extractTagsFromElement(doiCell).join("")
    if (!["A", "SPAN"].includes(tagString)) {
      throw new Error(`Unexpected tags in DOI cell of publications section of ${humVersionId}: ${extractTagsFromElement(doiCell)}`)
    }
    const doi = doiCell.querySelector("a")?.getAttribute("href") ?? ""

    const datasetIdCell = cells[3] // multiple A, P, SPAN
    const isValidDatasetIdCell = extractTagsFromElement(datasetIdCell).every(tag => ["A", "P", "SPAN"].includes(tag))
    if (!isValidDatasetIdCell) {
      throw new Error(`Unexpected tags in data ID cell of publications section of ${humVersionId}: ${extractTagsFromElement(datasetIdCell)}`)
    }
    const datasetIds = Array.from(datasetIdCell.children)
      .map((child) => (child.textContent?.trim() ?? ""))
      .filter((text) => text !== "")

    publications.push({ title, doi, datasetIds })
  }

  if (tags.length === 2) {
    const lastP = body.children[1]
    if (lastP.textContent?.trim() !== "") {
      throw new Error(`Unexpected text in the last P of publications section of ${humVersionId}: ${lastP.textContent?.trim()}`)
    }
  }

  return publications
}

export const parseControlledAccessUsers = (humVersionId: string, dom: JSDOM, lang: LangType): ControlledAccessUser[] => {
  // ["TABLE"]
  const body = dom.window.document.body

  const TABLE_HEADERS: Record<LangType, Record<string, ControlledAccessUserKeys>> = {
    ja: {
      "研究代表者": "principalInvestigator",
      "所属機関": "affiliation",
      "国・州名": "country",
      "研究題目": "researchTitle",
      "利用データID": "datasetIds",
      "利用期間": "periodOfDataUse",
    },
    en: {
      "Principal Investigator": "principalInvestigator",
      "Principal Investigator:": "principalInvestigator", // hum0008, hum0010, hum0011, etc.
      "PI": "principalInvestigator", // hum0009.v2
      "研究代表者": "principalInvestigator", // hum0294.v1
      "Affiliation": "affiliation",
      "Affiliation:": "affiliation", // hum0008, hum0010, hum0011, etc.,
      "所属機関": "affiliation", // hum0294.v1
      "Country/Region": "country",
      "国・州名": "country", // hum0294.v1
      "Research Title": "researchTitle",
      "研究題目": "researchTitle", // hum0294.v1
      "Data in Use (Dataset ID)": "datasetIds",
      "Data in Use (Data Set ID)": "datasetIds", // hum0269
      "利用データID": "datasetIds", // hum0294.v1
      "Period of Data Use": "periodOfDataUse",
      "利用期間": "periodOfDataUse", // hum0294.v1
    },
  }

  const ID_SPLITTER: Record<LangType, string> = {
    ja: "、",
    en: ",",
  }

  const table = body.querySelector("table")!
  const rowIndex: Record<ControlledAccessUserKeys, number> = {
    principalInvestigator: -1,
    affiliation: -1,
    country: -1,
    researchTitle: -1,
    datasetIds: -1,
    periodOfDataUse: -1,
  }
  const actualTableHeaders = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent?.trim() ?? "")
  for (const actualTableHeader of actualTableHeaders) {
    let found = false
    for (const [header, key] of Object.entries(TABLE_HEADERS[lang])) {
      if (actualTableHeader === header) {
        rowIndex[key] = actualTableHeaders.indexOf(actualTableHeader)
        found = true
        break
      }
    }
    if (!found) {
      throw new Error(`Unexpected table header in controlledAccessUsers section of ${humVersionId}: ${actualTableHeader}`)
    }
  }

  const users: ControlledAccessUser[] = []
  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    const tmpValues = cells.map((cell) => cell.textContent?.trim() ?? "")
    if (tmpValues.every(value => value === "")) {
      // empty row
      continue
    }

    if (cells.length !== actualTableHeaders.length) {
      if (!humVersionId.startsWith("hum0014")) {
        throw new Error(`Unexpected number of cells in table of controlledAccessUsers section of ${humVersionId}: ${cells.length}`)
      }
    }

    const user: ControlledAccessUser = {
      principalInvestigator: null,
      affiliation: null,
      country: null,
      researchTitle: null,
      datasetIds: [],
      periodOfDataUse: null,
    }
    for (const [index, cell] of cells.entries()) {
      let userKeys = []
      if (humVersionId.startsWith("hum0014") && actualTableHeaders.length === 6 && cells.length === 5 && index >= 2) {
        // broken table... at hum0014
        userKeys = Object.entries(rowIndex).filter(([, v]) => v === index + 1)
      } else {
        userKeys = Object.entries(rowIndex).filter(([, v]) => v === index)
      }
      if (userKeys.length !== 1) {
        throw new Error(`Unexpected error in controlledAccessUsers section of ${humVersionId}`)
      }
      const userKey = userKeys[0][0] as ControlledAccessUserKeys
      const tags = extractTagsFromElement(cell) // only SPAN
      if (tags.length === 0) {
        // empty cell
        continue
      }
      const tagString = tags.join("")
      if (tagString === "SPAN") {
        if (userKey === "datasetIds") {
          user[userKey] = cell.textContent?.trim().split(ID_SPLITTER[lang]) ?? []
        } else {
          user[userKey] = cell.textContent?.trim() ?? ""
        }
      } else if (tags.every(tag => tag === "P")) {
        if (userKey === "datasetIds") {
          user[userKey] = Array.from(cell.children)
            .map((child) => (child.textContent?.trim() ?? ""))
            .filter((text) => text !== "")
        } else {
          user[userKey] = cell.textContent?.trim() ?? ""
        }
      } else {
        throw new Error(`Unexpected tags in cell of controlledAccessUsers section of ${humVersionId}: ${tags}`)
      }
    }

    if (Object.values(user).some(value => value !== undefined || value !== null)) {
      users.push(user as ControlledAccessUser)
    }
  }

  return users
}
