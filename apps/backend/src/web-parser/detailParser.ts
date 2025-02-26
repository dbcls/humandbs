import { JSDOM } from "jsdom"

import type { LangType, Summary } from "@/web-parser/types"
import { extractTagsFromElement, sameArray, cleanJapaneseText, insertAt } from "@/web-parser/utils"

export const parseDetailPage = (humVersionId: string, html: string, lang: LangType): Record<string, any> => {
  const sections = splitToSection(humVersionId, html, lang)

  parseHeader(humVersionId, sections.header) // do nothing (only validate)
  const [summary, datasets] = parseSummary(humVersionId, sections.summary, lang)
  const [molecularData] = parseMolecularData(humVersionId, sections.molecularData, lang)
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
  ],
  en: [
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS"], // hum0009
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS", "USERS (Controlled-access Data)"],
    ["SUMMARY", "MOLECULAR DATA", "DATA PROVIDER", "PUBLICATIONS", "USRES (Controlled-access Data)"], // TODO: typo in the original page
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
    throw new Error(`Failed to find articleBody in ${humVersionId}`)
  }

  const sectionLabels = Array.from(articleBody.querySelectorAll("h1"))
    .map(h1 => h1.textContent)
    .filter((label) => label !== null)
    .map((label) => label.trim())
  if (!SECTION_LABELS[lang].some(labels => sameArray(sectionLabels, labels))) {
    throw new Error(`Unexpected section labels in ${humVersionId}: ${sectionLabels}`)
  }

  const sections: Partial<DetailPageSections> = {}
  let currentSectionDom: JSDOM = new JSDOM("<!DOCTYPE html><html><body></body></html>")
  let currentSectionKey: SectionType = "header"
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

  const expectedTags = ["P", "P"]
  const actualTags = extractTagsFromElement(body)
  if (!sameArray(actualTags, expectedTags)) {
    throw new Error(`Unexpected tags in header section of ${humVersionId}: ${actualTags}`)
  }

  const nbdcResearchId = body.querySelector("p > span > strong")?.textContent?.replace("NBDC Research ID:", "").trim()
  if (nbdcResearchId === undefined) {
    throw new Error(`Failed to find NBDC Research ID in ${humVersionId}`)
  }
  if (humVersionId !== nbdcResearchId) {
    throw new Error(`NBDC Research ID does not match: ${humVersionId} !== ${nbdcResearchId}`)
  }
}

interface Dataset {
  dataId: string[]
  typeOfData: string[]
  criteria: string[]
  releaseDate: string[]
}
type DatasetKeys = keyof Dataset
const DATASET_KEYS: DatasetKeys[] = ["dataId", "typeOfData", "criteria", "releaseDate"]

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
    throw new Error(`Unexpected tags in summary section of ${humVersionId}: ${tagsString}`)
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
    url: [] as string[],
  }
  type SummaryKeys = keyof typeof parsedSummary
  const SUMMARY_KEYS: SummaryKeys[] = Object.keys(parsedSummary) as SummaryKeys[]
  let currentKey: SummaryKeys | null = null
  const SUMMARY_HEADERS: Record<LangType, string[]> = {
    ja: ["目的：", "方法：", "対象：", "URL："],
    en: ["Aims:", "Methods:", "Participants/Materials:", "URL:"],
  }
  const REPLACE_EXPRESSIONS: Record<LangType, RegExp> = {
    ja: /目的：|方法：|対象：|URL：/g,
    en: /Aims:|Methods:|Participants\/Materials:|URL:/g,
  }

  for (const node of summaryChildren) {
    const text = node.textContent?.trim() ?? ""
    if (text === "") continue

    for (const header of SUMMARY_HEADERS[lang]) {
      if (text.startsWith(header)) {
        currentKey = SUMMARY_KEYS[SUMMARY_HEADERS[lang].indexOf(header)]
        break
      }
    }
    if (currentKey === null) {
      throw new Error(`Unexpected text in summary section of ${humVersionId}: ${text}`)
    }

    parsedSummary[currentKey].push(text.replace(REPLACE_EXPRESSIONS[lang], "").trim())
  }

  if (parsedSummary.url.length > 1) {
    throw new Error(`Unexpected URL in summary section of ${humVersionId}: ${parsedSummary.url}`)
  }

  const joinText = (values: string[], lang: LangType): string => {
    return lang === "ja" ? values.map(cleanJapaneseText).join("\n") : values.join("\n")
  }
  const summary: Summary = {
    aims: joinText(parsedSummary.aims, lang),
    methods: joinText(parsedSummary.methods, lang),
    targets: joinText(parsedSummary.targets, lang),
    url: parsedSummary.url.length === 0 ? null : parsedSummary.url[0],
  }

  // === Table ===
  const TABLE_HEADERS: Record<LangType, string[]> = {
    ja: ["データID", "内容", "制限", "公開日"],
    en: ["Dataset ID", "Type of Data", "Criteria", "Release Date"],
  }
  const actualTableHeaders = Array.from(tableChild.querySelectorAll("thead th")).map(th => th.textContent?.trim() ?? "")
  if (!sameArray(actualTableHeaders, TABLE_HEADERS[lang])) {
    throw new Error(`Unexpected table headers in summary section of ${humVersionId}: ${actualTableHeaders}`)
  }

  const datasets: Dataset[] = []
  for (const row of Array.from(tableChild.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    if (cells.length !== 4) {
      throw new Error(`Unexpected number of cells in table of summary section of ${humVersionId}: ${cells.length}`)
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
    ],
    en: [
      "*Release Note",
      "*Data users need to apply",
      "* Data users need to apply", // hum0004
      "*When the research results",
      "* When the research results", // hum0009
      "* The data provider changed", // hum0009
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

interface LinkData {
  text: string
  href: string
}
interface MoleculerData {
  ids: string[]
  data: Record<string, (string | LinkData)[]>
}

export const parseMolecularData = (humVersionId: string, dom: JSDOM, lang: LangType): MoleculerData[] => {
  // ["P", "TABLE", "P", "P", "TABLE", "P", "P", "TABLE", "P", "P", "TABLE", "P", "P", "TABLE", "P", "P"]
  // PTABLEP => P: IDs, TABLE: table, P: empty line
  // last P => empty line (only japanese page)
  if (humVersionId.startsWith("hum0009")) {
    return [] // TODO: skip this section for now
  }

  const body = dom.window.document.body

  const tags = extractTagsFromElement(body)
  const tagsString = tags.join("")
  const isValidPattern = /^(PTABLEP)+P?$/g
  if (!isValidPattern.test(tagsString)) {
    throw new Error(`Unexpected tags in molecularData section of ${humVersionId}: ${tagsString}`)
  }

  const ID_SPLITTER: Record<LangType, string> = {
    ja: "、",
    en: ",",
  }

  const tableNum = tags.filter(tag => tag === "TABLE").length
  const molecularData: MoleculerData[] = []
  for (let i = 0; i < tableNum; i++) {
    const firstP = body.children[i * 3]
    const table = body.children[i * 3 + 1]
    const secondP = body.children[i * 3 + 2]

    if (secondP.textContent?.trim() !== "") {
      throw new Error(`Unexpected text in the second P of molecularData section of ${humVersionId}: ${secondP.textContent?.trim()}`)
    }

    const ids = firstP.textContent?.trim().split(ID_SPLITTER[lang]) ?? []
    const data: Record<string, (string | LinkData)[]> = {}
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const cells = Array.from(row.querySelectorAll("td"))
      if (cells.length !== 2) {
        throw new Error(`Unexpected number of cells in table of molecularData section of ${humVersionId}: ${cells.length}`)
      }

      const key = cells[0].textContent?.trim() ?? ""
      const value: (string | LinkData)[] = []
      const valueNode = cells[1]
      // valueNode's children: A, P, SPAN
      // However, there may be an A in P
      const valueNodeTags = extractTagsFromElement(valueNode)
      const isValid = valueNodeTags.every(tag => ["A", "P", "SPAN"].includes(tag))
      if (!isValid) {
        throw new Error(`Unexpected tags in value node of molecularData section of ${humVersionId}: ${key}: ${valueNodeTags}`)
      }
      for (const valueChild of Array.from(valueNode.children)) {
        if (valueChild.tagName === "A") {
          value.push({
            text: valueChild.textContent?.trim() ?? "",
            href: valueChild.getAttribute("href") ?? "",
          })
        } else if (valueChild.tagName === "P") {
          const anchor = valueChild.querySelector("a")
          if (anchor !== null) {
            value.push({
              text: anchor.textContent?.trim() ?? "",
              href: anchor.getAttribute("href") ?? "",
            })
          } else {
            value.push(valueChild.textContent?.trim() ?? "")
          }
        } else if (valueChild.tagName === "SPAN") {
          value.push(valueChild.textContent?.trim() ?? "")
        }
      }

      data[key] = value
    }
    molecularData.push({ ids, data })
  }

  const lastP = body.children[tableNum * 3]
  if (lastP !== undefined) {
    if (lastP.textContent?.trim() !== "") {
      throw new Error(`Unexpected text in the last P of molecularData section of ${humVersionId}: ${lastP.textContent?.trim()}`)
    }
  }

  return molecularData
}

interface Grant {
  grantName: string[]
  projectTitle: string[]
  grantId: string[]
}
type GrantKeys = keyof Grant
const GRANT_KEYS: GrantKeys[] = ["grantName", "projectTitle", "grantId"]

interface DataProvider {
  principalInvestigator: string
  affiliation: string
  projectName?: string | null
  projectUrl?: string | null
  grants: Grant[]
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
  if (!["PPPTABLEP", "PPPPTABLEP", "PPPPPTABLEP"].includes(tagsString)) {
    throw new Error(`Unexpected tags in dataProvider section of ${humVersionId}: ${tagsString}`)
  }

  const SUMMARY_HEADERS: Record<LangType, string[][]> = {
    ja: [
      ["研究代表者：", "所 属 機 関：", "科研費/助成金（Research Project Number）："],
      ["研究代表者：", "所 属 機 関：", "プロジェクト/研究グループ名：", "科研費/助成金（Research Project Number）："],
      ["研究代表者：", "所 属 機 関：", "プロジェクト/研究グループ名：", "URL：", "科研費/助成金（Research Project Number）："],
    ],
    en: [
      ["Principal Investigator:", "Affiliation:", "Funds / Grants (Research Project Number):"],
      ["Principal Investigator:", "Affiliation:", "Project / Group Name:", "Funds / Grants (Research Project Number):"],
      ["Principal Investigator:", "Affiliation:", "Project / Group Name:", "URL：", "Funds / Grants (Research Project Number):"],
    ],
  }
  const TABLE_HEADERS: Record<LangType, string[]> = {
    ja: ["科研費・助成金名", "タイトル", "研究課題番号"],
    en: ["Name", "Title", "Project Number"],
  }

  // === header ===
  const numP = tags.filter(tag => tag === "P").length - 1 // 3, 4, or 5
  const expectSummaryHeaders = SUMMARY_HEADERS[lang][numP - 3]
  // typo in the original page
  if (["hum0004", "hum0009"].some(humId => humVersionId.startsWith(humId)) && lang === "en") {
    expectSummaryHeaders[2] = "Project / Groupe Name:"
  }
  if (["hum0006", "hum0007"].some(humId => humVersionId.startsWith(humId)) && lang === "en") {
    expectSummaryHeaders[3] = "URL:"
  }

  const firstPText = body.children[0].textContent?.trim() ?? ""
  if (!firstPText.startsWith(expectSummaryHeaders[0])) {
    throw new Error(`Unexpected text in the first P of dataProvider section of ${humVersionId}: ${firstPText}`)
  }
  const principalInvestigator = firstPText.replace(expectSummaryHeaders[0], "").trim()

  const secondPText = body.children[1].textContent?.trim() ?? ""
  if (!secondPText.startsWith(expectSummaryHeaders[1])) {
    throw new Error(`Unexpected text in the second P of dataProvider section of ${humVersionId}: ${secondPText}`)
  }
  const affiliation = secondPText.replace(expectSummaryHeaders[1], "").trim()

  let projectName: string | null = null
  let projectUrl: string | null = null
  if (numP === 4 || numP === 5) {
    const namePText = body.children[2].textContent?.trim() ?? ""
    if (!namePText.startsWith(expectSummaryHeaders[2])) {
      throw new Error(`Unexpected text in the third P of dataProvider section of ${humVersionId}: ${namePText}`)
    }
    projectName = namePText.replace(expectSummaryHeaders[2], "").trim()

    if (numP === 5) {
      const urlPText = body.children[3].textContent?.trim() ?? ""
      if (!urlPText.startsWith(expectSummaryHeaders[3])) {
        throw new Error(`Unexpected text in the fourth P of dataProvider section of ${humVersionId}: ${urlPText}`)
      }
      projectUrl = urlPText.replace(expectSummaryHeaders[3], "").trim()
    }
  }

  const tablePText = body.children[numP - 1].textContent?.trim() ?? ""
  if (!tablePText.startsWith(expectSummaryHeaders[numP - 1])) {
    throw new Error(`Unexpected text in the header for table of dataProvider section of ${humVersionId}: ${tablePText}`)
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

  const lastP = body.children[body.children.length - 1]
  const lastPText = lastP.textContent?.trim() ?? ""
  if (lastPText !== "") {
    throw new Error(`Unexpected text in the last P of dataProvider section of ${humVersionId}: ${lastPText}`)
  }

  return {
    principalInvestigator,
    affiliation,
    projectName,
    projectUrl,
    grants,
  }
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
  if (!sameArray(actualTableHeaders, TABLE_HEADERS[lang])) {
    throw new Error(`Unexpected table headers in publications section of ${humVersionId}: ${actualTableHeaders}`)
  }

  const publications: Publication[] = []
  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    const tmpValues = cells.map((cell) => cell.textContent?.trim() ?? "").slice(1)
    if (tmpValues.every(value => value === "")) {
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

interface ControlledAccessUser {
  principalInvestigator: string
  affiliation: string
  country?: string | null
  researchTitle?: string | null
  datasetIds: string[]
  periodOfDataUse: string
}
type ControlledAccessUserKeys = keyof ControlledAccessUser
const CONTROLLED_ACCESS_USER_KEYS: ControlledAccessUserKeys[] = ["principalInvestigator", "affiliation", "country", "researchTitle", "datasetIds", "periodOfDataUse"]
const CONTROLLED_ACCESS_USER_KEYS_LEN_4: ControlledAccessUserKeys[] = ["principalInvestigator", "affiliation", "datasetIds", "periodOfDataUse"]

export const parseControlledAccessUsers = (humVersionId: string, dom: JSDOM, lang: LangType): ControlledAccessUser[] => {
  // ["TABLE"]
  const body = dom.window.document.body

  const tags = extractTagsFromElement(body)
  if (!sameArray(tags, ["TABLE"])) {
    throw new Error(`Unexpected tags in controlledAccessUsers section of ${humVersionId}: ${tags}`)
  }

  const TABLE_HEADERS: Record<LangType, string[]> = {
    ja: ["研究代表者", "所属機関", "国・州名", "研究題目", "利用データID", "利用期間"],
    en: ["Principal Investigator", "Affiliation", "Country/Region", "Research Title", "Data in Use (Dataset ID)", "Period of Data Use"],
  }
  const TABLE_HEADERS_LEN_4: Record<LangType, string[]> = {
    ja: ["研究代表者", "所属機関", "利用データID", "利用期間"],
    en: ["Principal Investigator", "Affiliation", "Data in Use (Dataset ID)", "Period of Data Use"],
  }

  const ID_SPLITTER: Record<LangType, string> = {
    ja: "、",
    en: ",",
  }

  const table = body.children[0]
  const actualTableHeaders = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent?.trim() ?? "")
  const expectedTableHeaders = actualTableHeaders.length === 4 ?
    TABLE_HEADERS_LEN_4[lang] :
    TABLE_HEADERS[lang]
  if (["hum0008", "hum0010"].some(humId => humVersionId.startsWith(humId)) && lang === "en") {
    expectedTableHeaders[0] = "Principal Investigator:"
    expectedTableHeaders[1] = "Affiliation:"
  }

  if (!sameArray(actualTableHeaders, expectedTableHeaders)) {
    throw new Error(`Unexpected table headers in controlledAccessUsers section of ${humVersionId}: ${actualTableHeaders}`)
  }

  const users: ControlledAccessUser[] = []
  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll("td"))
    const tmpValues = cells.map((cell) => cell.textContent?.trim() ?? "")
    if (tmpValues.every(value => value === "")) {
      // empty row
      continue
    }

    if (![4, 6].includes(cells.length)) {
      throw new Error(`Unexpected number of cells in table of controlledAccessUsers section of ${humVersionId}: ${cells.length}`)
    }

    const user: Partial<ControlledAccessUser> = {}
    for (const [index, cell] of cells.entries()) {
      const tags = extractTagsFromElement(cell) // only SPAN
      const userKey = actualTableHeaders.length === 6 ?
        CONTROLLED_ACCESS_USER_KEYS[index] :
        CONTROLLED_ACCESS_USER_KEYS_LEN_4[index]
      if (tags.length === 0) {
        user[userKey] = undefined
        continue
      }
      if (!sameArray(tags, ["SPAN"])) {
        throw new Error(`Unexpected tags in cell of controlledAccessUsers section of ${humVersionId}: ${tags}`)
      }
      if (userKey === "datasetIds") {
        user[userKey] = cell.textContent?.trim().split(ID_SPLITTER[lang]) ?? []
      } else {
        user[userKey] = cell.textContent?.trim() ?? ""
      }
    }

    if (Object.values(user).some(value => value !== undefined)) {
      users.push(user as ControlledAccessUser)
    }
  }

  return users
}
