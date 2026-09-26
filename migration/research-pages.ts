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

import type { Line, RichText, Span } from "~/content/types"

import { parseFragment, richTextFromCell, type Lang, type RecoverContext } from "./richtext-html"

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
/** A research version's release note, a page of its own beside the research page. */
const RELEASE_NOTE_TITLE = /^\s*(hum\d{4})\.v(\d+)_release note\s*$/
/** The listing of every research, one article in each language. */
const LISTING_TITLES: ReadonlyMap<string, Lang> = new Map([["利用可能な研究データ一覧", "ja"], ["List of All Research Projects", "en"]])

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"" }

/** The research version and language an article is the page of, or null for any other article. */
export function researchPageOf(article: PageArticle): { humId: string, version: number, lang: Lang } | null {
  const lang = CATEGORY_LANG.get(article.catid)
  const titled = RESEARCH_PAGE_TITLE.exec(article.title)
  if (lang === undefined || titled === null) return null
  return { humId: titled[1] ?? "", version: Number(titled[2]), lang }
}

/**
 * The words of a text, without what v1 changed about how it is written. v1's
 * text holds some of the page's HTML as it was (`14名<br />&nbsp;ワクチン`), which
 * is markup and not words.
 */
export function sameWords(text: string): string {
  return withoutMarkup(text)
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[、，,]/g, ",")
    .replace(/[\s\u200b]+/g, "")
}

/** A text without the page's markup v1's text kept: tags go, and character references are the characters. */
export function withoutMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:#(\d+)|([a-z]+));/g, (entity, code: string | undefined, name: string | undefined) =>
      code === undefined ? ENTITIES[name ?? ""] ?? entity : String.fromCodePoint(Number(code)))
}

/**
 * How closely two texts folded the way v1 folded its text are compared.
 * `spaced` keeps the whitespace between two letters or digits (`宇佐美 真一`),
 * which v1 never added or took away, and drops the rest, v1's spacing around
 * brackets and colons; `bare` drops all of it, for prose whose line breaks v1
 * dropped in one language and made spaces in the other; `commas aside` also
 * drops commas, for the old listing's lines v1 joined with `, `.
 */
export type Likeness = "spaced" | "bare" | "commas aside"

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿⁱ"
const SUPERSCRIPTED = "0123456789+-()ni"

/**
 * Whether two folded texts are alike. The markup v1's text kept (`<br />`,
 * `&nbsp;`), the superscript form a page's `<sup>` becomes and a full-width
 * letter or digit, which the clean-ups make ASCII anyway, are not writing.
 */
export function alike(a: string, b: string, how: Likeness): boolean {
  const comparable = (text: string) => {
    const plain = withoutMarkup(text)
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿⁱ]/g, (c) => SUPERSCRIPTED[SUPERSCRIPTS.indexOf(c)] ?? c)
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    if (how === "bare") return plain.replace(/\s+/g, "")
    if (how === "commas aside") return plain.replace(/[\s,]+/g, "")
    return plain.split(/(?<=[\p{L}\p{N}])\s+(?=[\p{L}\p{N}])/u).map((part) => part.replace(/\s+/g, "")).join(" ")
  }
  return comparable(a) === comparable(b)
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

/**
 * A link's address as v1's text and a page both write it: v1 wrote the
 * portal's own addresses from the root (`/files/…`, `/en/nbdc-policy`), a page
 * relative to it (`files/…`), at times with the portal's host.
 */
function comparableAddress(href: string): string {
  let address = href.trim()
  try {
    address = decodeURI(address)
  } catch {
    // An address with a stray `%` is compared as it is written.
  }
  return address
    .replace(/^https?:\/\/humandbs\.(?:biosciencedbc|dbcls)\.jp/, "")
    .replace(/^\/+/, "")
    .replace(/^(?:en|ja)\//, "")
    .replace(/\/+$/, "")
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
 * the preferred version, on it the cell with every link v1's text has (the ID
 * linked to its file in the experiment's table, not to the page's own anchor
 * in the data ID table), then the one that gives exactly what v1 stored, then
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
  /** Any other table cell with the words of `text`, on a page of the research; `links` are the addresses v1's text links. */
  tableValue: (humId: string, lang: Lang, text: string, preferred: Preferred, links?: readonly string[]) => Element | null
  /**
   * The stretches of the research's pages and release note pages with the
   * words of `text`, as each page shows it: its lines, and its links resolved
   * the way a cell's are. The nearest page's come first, and on a page a
   * stretch that is a whole line, or the rest of a line after a field name
   * (`目的：`), before one inside a line.
   */
  passages: (humId: string, lang: Lang, text: string, preferred: Preferred) => Iterable<RichText>
  /**
   * The cell of the listing's row for the research with the words of `text`,
   * commas aside: v1 joined the lines of some cells with `, `. The published
   * site's listing is looked at before the other's.
   */
  listingCell: (humId: string, lang: Lang, text: string, site: Site) => Element | null
}

/**
 * The research pages of both sites of the old portal. On one site a
 * published article wins over one that is not, where a research version has
 * two.
 */
export function researchPages(
  sites: readonly { site: Site, articles: Iterable<PageArticle> }[],
  ctx: RecoverContext = {},
): ResearchPages {
  const pages = new Map<string, Page>()
  const releaseNotes = new Map<string, Page>()
  const listings: { site: Site, lang: Lang, article: PageArticle }[] = []
  const keep = (into: Map<string, Page>, page: Page) => {
    const key = `${page.site}/${page.humId}/${page.version}/${page.lang}`
    const held = into.get(key)
    if (held?.article.state === 1 && page.article.state !== 1) return
    into.set(key, page)
  }
  for (const { site, articles } of sites) {
    for (const article of articles) {
      const listed = LISTING_TITLES.get(article.title.trim())
      if (listed !== undefined && CATEGORY_LANG.get(article.catid) === listed) listings.push({ site, lang: listed, article })
      const lang = CATEGORY_LANG.get(article.catid)
      if (lang === undefined) continue
      for (const [pattern, into] of [[RESEARCH_PAGE_TITLE, pages], [RELEASE_NOTE_TITLE, releaseNotes]] as const) {
        const titled = pattern.exec(article.title)
        if (titled === null) continue
        const [, humId = "", version = ""] = titled
        keep(into, { article, humId, version: Number(version), lang, site, kind: into === pages ? "page" : "release note" })
      }
    }
  }

  const typeOfData = new Map<string, PageCell[]>()
  const tableValues = new Map<string, PageCell[]>()
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
        addTo(isType ? typeOfData : tableValues, `${humId}/${lang}/${words}`, { version, site, cell, stored: asV1Stored(text) })
      }
    }
  }

  const find = (index: Map<string, PageCell[]>) => (humId: string, lang: Lang, text: string, preferred: Preferred, links: readonly string[] = []): Element | null => {
    const found = index.get(`${humId}/${lang}/${sameWords(text)}`)
    if (found === undefined) return null
    const stored = asV1Stored(text)
    const distance = (one: PageCell) => preferred.version === null ? 0 : Math.abs(one.version - preferred.version)
    const wanted = links.map(comparableAddress)
    const linked = (one: PageCell) => {
      const held = new Set(elements(one.cell, "a").flatMap((a) => (typeof a.properties.href === "string" ? [comparableAddress(a.properties.href)] : [])))
      return wanted.every((address) => held.has(address))
    }
    const ranked = found.toSorted((a, b) =>
      distance(a) - distance(b)
      || Number(!linked(a)) - Number(!linked(b))
      || Number(a.stored !== stored) - Number(b.stored !== stored)
      || b.version - a.version
      || Number(a.site !== preferred.site) - Number(b.site !== preferred.site))
    return ranked[0]?.cell ?? null
  }

  const readable = new Map<string, Page[]>()
  for (const page of [...pages.values(), ...releaseNotes.values()]) addTo(readable, `${page.humId}/${page.lang}`, page)
  const read = shownPages(readable, ctx)
  function* passages(humId: string, lang: Lang, text: string, preferred: Preferred): Iterable<RichText> {
    const distance = (one: ShownPage) => preferred.version === null ? 0 : Math.abs(one.version - preferred.version)
    const ranked = read(humId, lang).toSorted((a, b) =>
      distance(a) - distance(b)
      || b.version - a.version
      || Number(a.site !== preferred.site) - Number(b.site !== preferred.site)
      || Number(a.kind !== "page") - Number(b.kind !== "page"))
    // v1 made a list one line, so the bullets of the lines after the first
    // are inside it (`- RNAs … - DNAs …`), where reading its text keeps them.
    const targets = [...new Set([sameWords(text), sameWords(withoutInlineBullets(text))])].filter((one) => one !== "")
    for (const target of targets) {
      let found = false
      for (const shown of ranked) {
        for (const one of stretchesOf(shown, target)) {
          found = true
          yield one
        }
      }
      if (found) return
    }
  }

  const listingCells = new Map<string, { site: Site, cell: Element }[]>()
  for (const { site, lang, article } of listings) {
    for (const table of elements(parseFragment(article.introtext), "table")) {
      for (const row of tableRows(table)) {
        const humId = /(hum\d{4})\.v\d+/.exec(row.map(textOf).join(" "))?.[1]
        if (humId === undefined) continue
        for (const cell of row) {
          if (cell.tagName !== "td") continue
          const words = withoutCommas(sameWords(textOf(cell)))
          if (words === "") continue
          addTo(listingCells, `${humId}/${lang}/${words}`, { site, cell })
        }
      }
    }
  }
  const listingCell = (humId: string, lang: Lang, text: string, site: Site): Element | null => {
    const found = listingCells.get(`${humId}/${lang}/${withoutCommas(sameWords(text))}`) ?? []
    return found.toSorted((a, b) => Number(a.site !== site) - Number(b.site !== site))[0]?.cell ?? null
  }

  return { typeOfData: find(typeOfData), tableValue: find(tableValues), passages, listingCell }
}

function addTo<T>(index: Map<string, T[]>, key: string, one: T): void {
  const held = index.get(key)
  if (held === undefined) index.set(key, [one])
  else held.push(one)
}

const withoutCommas = (words: string) => words.replace(/,/g, "")

interface Page {
  article: PageArticle
  humId: string
  version: number
  lang: Lang
  site: Site
  kind: "page" | "release note"
}

/**
 * A page as rich text, and its words one character at a time: for each
 * character of `words`, the line, the span and the character in the span it
 * comes from. A bullet typed at the start of a line is not among the words,
 * as reading v1's text leaves it out.
 */
interface ShownPage {
  site: Site
  version: number
  kind: Page["kind"]
  rich: RichText
  words: string
  line: Int32Array
  span: Int32Array
  at: Int32Array
}

/** A character's part of `sameWords`: the same folding, one character at a time. */
function wordsOfChar(char: string): string {
  return char
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[、，,]/g, ",")
    .replace(/[\s\u200b]+/g, "")
}

const LINE_BULLET = /^\s*[-*・]\s+/
/** A bullet a list's line started with, left inside the one line v1 made of the list. */
const INLINE_BULLET = /(^|\s)[-*・]\s+/g

/** A text without the bullets v1 left inside the one line it made of a list. */
export function withoutInlineBullets(text: string): string {
  return text.replace(INLINE_BULLET, "$1")
}

function lineText(line: Line): string {
  return line.map((span) => span.text).join("")
}

function shown(page: Page, ctx: RecoverContext): ShownPage {
  const root = parseFragment(page.article.introtext)
  const rich = richTextFromCell({ type: "element", tagName: "div", properties: {}, children: root.children as ElementContent[] }, ctx).value
  const words: string[] = []
  const line: number[] = []
  const span: number[] = []
  const at: number[] = []
  rich.forEach((spans, l) => {
    const bullet = Array.from(LINE_BULLET.exec(lineText(spans))?.[0] ?? "").length
    let offset = 0
    spans.forEach((one, s) => {
      Array.from(one.text).forEach((char, c) => {
        if (offset++ < bullet) return
        for (const folded of wordsOfChar(char.normalize("NFC"))) {
          words.push(folded)
          line.push(l)
          span.push(s)
          at.push(c)
        }
      })
    })
  })
  return {
    site: page.site,
    version: page.version,
    kind: page.kind,
    rich,
    words: words.join(""),
    line: Int32Array.from(line),
    span: Int32Array.from(span),
    at: Int32Array.from(at),
  }
}

/** How many research's pages are kept read at once. The load reads one research's values together. */
const SHOWN_KEPT = 16

function shownPages(readable: ReadonlyMap<string, Page[]>, ctx: RecoverContext): (humId: string, lang: Lang) => ShownPage[] {
  const kept = new Map<string, ShownPage[]>()
  return (humId, lang) => {
    const key = `${humId}/${lang}`
    const held = kept.get(key)
    if (held !== undefined) {
      kept.delete(key)
      kept.set(key, held)
      return held
    }
    const made = (readable.get(key) ?? []).map((page) => shown(page, ctx))
    kept.set(key, made)
    if (kept.size > SHOWN_KEPT) kept.delete(kept.keys().next().value ?? key)
    return made
  }
}

interface Place {
  line: number
  span: number
  at: number
}

/** The line's text before and after a place, the place itself excluded. */
function around(rich: RichText, place: Place): { before: string, after: string } {
  const spans = rich[place.line] ?? []
  const chars = (s: number) => Array.from(spans[s]?.text ?? "")
  const before = spans.slice(0, place.span).map((one) => one.text).join("") + chars(place.span).slice(0, place.at).join("")
  const after = chars(place.span).slice(place.at + 1).join("") + spans.slice(place.span + 1).map((one) => one.text).join("")
  return { before, after }
}

/** A stretch that starts a line, or follows a field name or a bullet on it, and ends it. */
function isWhole(rich: RichText, start: Place, end: Place): boolean {
  const before = around(rich, start).before.trim()
  return (before === "" || /(^|[:：])\s*[-*・]?$/.test(before)) && around(rich, end).after.trim() === ""
}

/** The stretches of a page with the words, those that are whole lines first. */
function stretchesOf(page: ShownPage, target: string): RichText[] {
  const placeOf = (i: number): Place => ({ line: page.line[i] ?? 0, span: page.span[i] ?? 0, at: page.at[i] ?? 0 })
  const whole: RichText[] = []
  const inside: RichText[] = []
  for (let i = page.words.indexOf(target); i !== -1; i = page.words.indexOf(target, i + 1)) {
    const found: [Place, Place] = [placeOf(i), placeOf(i + target.length - 1)]
    ;(isWhole(page.rich, ...found) ? whole : inside).push(sliced(page.rich, ...found))
  }
  return [...whole, ...inside]
}

/**
 * The bullet typed right before a place, at the start of its line or after a
 * field name (`対象： - …`), which the words leave out.
 */
function bulletBefore(rich: RichText, place: Place): string {
  const found = /(^|[:：])\s*([-*・]\s*)$/.exec(around(rich, place).before)
  return found?.[2] ?? ""
}

/** The lines between two places, both included, with a bullet typed before the first kept. */
function sliced(rich: RichText, start: Place, to: Place): RichText {
  const bullet = bulletBefore(rich, start)
  const out: Line[] = []
  for (let l = start.line; l <= to.line; l += 1) {
    const line: Span[] = []
    ;(rich[l] ?? []).forEach((span, s) => {
      if ((l === start.line && s < start.span) || (l === to.line && s > to.span)) return
      const chars = Array.from(span.text)
      const text = chars.slice(l === start.line && s === start.span ? start.at : 0, l === to.line && s === to.span ? to.at + 1 : chars.length).join("")
      if (text !== "") line.push(span.href === undefined ? { text } : { text, href: span.href })
    })
    const [head] = line
    if (head !== undefined) head.text = head.text.replace(/^\s+/, "")
    const tail = line.at(-1)
    if (tail !== undefined) tail.text = tail.text.replace(/\s+$/, "")
    const kept = line.filter((span) => span.text !== "")
    if (kept.length > 0) out.push(kept)
  }
  const [first] = out
  const head = first?.[0]
  if (bullet !== "" && first !== undefined && head !== undefined) {
    out[0] = head.href === undefined ? [{ text: bullet + head.text }, ...first.slice(1)] : [{ text: bullet }, ...first]
  }
  return out
}
