/**
 * The old portal's research pages, read cell by cell.
 *
 * Every research version had a page in the old portal's CMS (Joomla), one per
 * language, and v1 read its values out of the tables on them. The text v1 kept
 * is rewritten — brackets and colons made half-width, spaces put around
 * brackets, line breaks made spaces — and the HTML it kept beside most of it is
 * a copy that has at times lost the cell's paragraphs or folded several cells
 * into one; the type of data has no HTML at all. The pages are still there, so
 * a value can be written the way its page wrote it: the cell with the same
 * words, on a page of the same research, is looked up here.
 *
 * **"The same words" ignores only what v1 changed about the writing**: the width
 * of a character, quote marks and dashes, the list separator (`、` against
 * `, `) and whitespace. Letter case and every other character count, so a value
 * v1 reworded is not matched to the wording on the page.
 */

import type { Element, ElementContent, Root, RootContent } from "hast"

import { parseFragment, type Lang } from "./richtext-html"

export type Site = "prod" | "staging"

/** An article as the CMS dump holds it. */
export interface PageArticle {
  title: string
  catid: number
  state: number
  introtext: string
}

/** The CMS category of the research pages in each language. */
const CATEGORY_LANG: ReadonlyMap<number, Lang> = new Map([[10, "ja"], [16, "en"]])

const RESEARCH_PAGE_TITLE = /^\s*(hum\d{4})\.v(\d+)\s*$/

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"" }

/**
 * The words of a text, without what v1 changed about how it is written. v1's
 * text holds some of the page's HTML as it was (`14名<br />&nbsp;ワクチン`), which
 * is markup and not words.
 */
export function sameWords(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:#(\d+)|([a-z]+));/g, (entity, code: string | undefined, name: string | undefined) =>
      code === undefined ? ENTITIES[name ?? ""] ?? entity : String.fromCodePoint(Number(code)))
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[、，,]/g, ",")
    .replace(/[\s\u200b]+/g, "")
}

/**
 * A text as v1 stored a table cell: v1's `normalizeText` without a language.
 * Of the cells on one page with the same words, the one that gives exactly
 * what v1 stored is the one v1 read.
 */
export function asV1Stored(text: string): string {
  const raw = text.trim()
  if (raw === "" || /^https?:\/\//i.test(raw)) return raw
  return raw
    .normalize("NFC")
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[（）]/g, (bracket) => (bracket === "（" ? "(" : ")"))
    .replace(/／/g, "/")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[‐-‒–—―]/g, "-")
    .replace(/\s*[:：]\s*/g, ": ")
    .replace(/\r\n?|\n/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function textOf(node: Root | RootContent): string {
  if (node.type === "text") return node.value
  if (node.type === "element" || node.type === "root") return node.children.map(textOf).join("")
  return ""
}

const BREAKING = new Set(["p", "div", "li", "ul", "ol", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"])

/**
 * A bullet typed at the start of a line. v1 wrote every one of them as markdown's
 * `- `, which reading its text leaves out, so a cell's are left out too.
 */
const TYPED_BULLET = /^\s*[-*・]\s+/gm

/** The text of a cell without the bullets typed at the start of its lines. */
function withoutBullets(cell: Element): string {
  const parts: string[] = []
  const walk = (node: ElementContent) => {
    if (node.type === "text") parts.push(node.value.replace(/\s+/g, " "))
    if (node.type !== "element") return
    if (node.tagName === "br") parts.push("\n")
    const breaks = BREAKING.has(node.tagName)
    if (breaks) parts.push("\n")
    node.children.forEach(walk)
    if (breaks) parts.push("\n")
  }
  cell.children.forEach(walk)
  return parts.join("").replace(TYPED_BULLET, "")
}

function elements(node: Root | Element, tag: string, into: Element[] = []): Element[] {
  for (const child of node.children) {
    if (child.type !== "element") continue
    if (child.tagName === tag) into.push(child)
    elements(child, tag, into)
  }
  return into
}

/** The rows of a table as cells, a cell spanning rows repeated in each. Rows of a table nested in a cell are not the table's. */
export function tableRows(table: Element): Element[][] {
  const rows: Element[] = []
  const collect = (node: Element) => {
    for (const child of node.children) {
      if (child.type !== "element" || child.tagName === "table") continue
      if (child.tagName === "tr") rows.push(child)
      else collect(child)
    }
  }
  collect(table)
  const spanning: ({ cell: Element, left: number } | undefined)[] = []
  return rows.map((tr) => {
    const cells = tr.children.filter((child): child is Element => child.type === "element" && (child.tagName === "td" || child.tagName === "th"))
    const row: Element[] = []
    let next = 0
    for (let column = 0; next < cells.length || spanning.slice(column).some((one) => one !== undefined); column += 1) {
      const held = spanning[column]
      if (held !== undefined) {
        row.push(held.cell)
        held.left -= 1
        if (held.left === 0) spanning[column] = undefined
        continue
      }
      const cell = cells[next]
      if (cell === undefined) break
      next += 1
      row.push(cell)
      const rowSpan = Number(cell.properties.rowSpan ?? 1)
      if (rowSpan > 1) spanning[column] = { cell, left: rowSpan - 1 }
    }
    return row
  })
}

const squashed = (text: string) => text.replace(/\s+/g, "").toLowerCase()
const TYPE_OF_DATA_HEADERS = new Set(["内容", "typeofdata"])
const RELEASE_DATE_HEADERS = new Set(["公開日", "releasedate"])

/** The cells of the data ID table's type-of-data column (データID / 内容 / 制限 / 公開日), if the table is one. */
function typeOfDataCells(rows: Element[][]): Set<Element> {
  const headerAt = rows.findIndex((row) =>
    row.some((cell) => TYPE_OF_DATA_HEADERS.has(squashed(textOf(cell))))
    && row.some((cell) => RELEASE_DATE_HEADERS.has(squashed(textOf(cell)))))
  if (headerAt === -1) return new Set()
  const column = (rows[headerAt] ?? []).findIndex((cell) => TYPE_OF_DATA_HEADERS.has(squashed(textOf(cell))))
  return new Set(rows.slice(headerAt + 1).flatMap((row) => {
    const cell = row[column]
    return cell?.tagName === "td" ? [cell] : []
  }))
}

interface PageCell {
  version: number
  site: Site
  cell: Element
  stored: string
}

/**
 * Which page's cell to take when several have the words: the nearest page to
 * the preferred version, on it the cell that gives exactly what v1 stored, then
 * a later page before an earlier and the preferred site's before the other's.
 */
export interface Preferred {
  /** The research version whose page is looked at first; the nearest ones follow, a later one before an earlier. */
  version: number | null
  site: Site
}

export interface ResearchPages {
  /** The type-of-data cell of the data ID table with the words of `text`, on a page of the research. */
  typeOfData: (humId: string, lang: Lang, text: string, preferred: Preferred) => Element | null
  /** Any other table cell with the words of `text`, on a page of the research. */
  tableValue: (humId: string, lang: Lang, text: string, preferred: Preferred) => Element | null
}

/**
 * The research pages of both sites of the old portal. On one site a
 * published article wins over one that is not, where a research version has
 * two.
 */
export function researchPages(sites: readonly { site: Site, articles: Iterable<PageArticle> }[]): ResearchPages {
  const pages = new Map<string, { article: PageArticle, humId: string, version: number, lang: Lang, site: Site }>()
  for (const { site, articles } of sites) {
    for (const article of articles) {
      const lang = CATEGORY_LANG.get(article.catid)
      const titled = RESEARCH_PAGE_TITLE.exec(article.title)
      if (lang === undefined || titled === null) continue
      const [, humId = "", version = ""] = titled
      const key = `${site}/${humId}/${version}/${lang}`
      const held = pages.get(key)
      if (held?.article.state === 1 && article.state !== 1) continue
      pages.set(key, { article, humId, version: Number(version), lang, site })
    }
  }

  const typeOfData = new Map<string, PageCell[]>()
  const tableValues = new Map<string, PageCell[]>()
  const add = (index: Map<string, PageCell[]>, key: string, one: PageCell) => {
    const held = index.get(key)
    if (held === undefined) index.set(key, [one])
    else held.push(one)
  }
  for (const { article, humId, version, lang, site } of pages.values()) {
    for (const table of elements(parseFragment(article.introtext), "table")) {
      const rows = tableRows(table)
      const types = typeOfDataCells(rows)
      for (const cell of new Set(rows.flat())) {
        if (cell.tagName !== "td") continue
        const text = textOf(cell)
        const isType = types.has(cell)
        // The type of data was stored as the cell's text; a table value as
        // markdown, whose bullets reading it leaves out.
        const words = sameWords(isType ? text : withoutBullets(cell))
        if (words === "") continue
        add(isType ? typeOfData : tableValues, `${humId}/${lang}/${words}`, { version, site, cell, stored: asV1Stored(text) })
      }
    }
  }

  const find = (index: Map<string, PageCell[]>) => (humId: string, lang: Lang, text: string, preferred: Preferred): Element | null => {
    const found = index.get(`${humId}/${lang}/${sameWords(text)}`)
    if (found === undefined) return null
    const stored = asV1Stored(text)
    const distance = (one: PageCell) => preferred.version === null ? 0 : Math.abs(one.version - preferred.version)
    const ranked = found.toSorted((a, b) =>
      distance(a) - distance(b)
      || Number(a.stored !== stored) - Number(b.stored !== stored)
      || b.version - a.version
      || Number(a.site !== preferred.site) - Number(b.site !== preferred.site))
    return ranked[0]?.cell ?? null
  }

  return { typeOfData: find(typeOfData), tableValue: find(tableValues) }
}
