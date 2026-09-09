/**
 * The URL space of the public site.
 *
 * The shape is v1's, on purpose. What the outside world has written down is the
 * address of an HTML page: referring sites link to `/research/{humId}` and
 * `/research/{humId}/v{n}`, and DDBJ Search links to the bare `/{humId}`.
 * Those addresses are the only reachability the portal promises, so changing
 * their shape costs everything and buys nothing.
 *
 * **Japanese has no prefix; English lives under `/en`.** A prefix on Japanese
 * would put a redirect in front of every address already written down. `/ja/…`
 * still resolves, but as a redirect, so one page has one address.
 *
 * A label in a URL is resolved through the pin ledger rather than matched
 * against the primary label, so a dataset id that has been superseded and a hum
 * label that was corrected both keep answering — they are cited in article
 * prose, in submission forms and in URL fragments, none of which can be
 * rewritten. Reaching a page by a secondary label redirects to the primary one.
 */

import { DEFAULT_LOCALE, isLocale, type Locale } from "~/i18n/locale"

/** Every locale except the default one is addressed under its own prefix. */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`
}

export interface ReadLocale {
  locale: Locale
  /** The path with the locale prefix removed. Always starts with a slash. */
  path: string
  /**
   * The prefix names the default locale, so the same page is reachable at a
   * shorter address and this one redirects to it.
   */
  redundantPrefix: boolean
}

export function readLocale(pathname: string): ReadLocale {
  const [, head = "", ...rest] = pathname.split("/")
  if (!isLocale(head)) return { locale: DEFAULT_LOCALE, path: pathname, redundantPrefix: false }
  return {
    locale: head,
    path: `/${rest.join("/")}`,
    redundantPrefix: head === DEFAULT_LOCALE,
  }
}

/** Turns an internal path into the address it has in a given language. */
export function href(locale: Locale, path: string): string {
  const prefix = localePrefix(locale)
  return prefix === "" ? path : `${prefix}${path === "/" ? "" : path}`
}

export function researchPath(humLabel: string): string {
  return `/research/${encodeURIComponent(humLabel)}`
}

export function researchVersionPath(humLabel: string, versionNumber: number): string {
  return `${researchPath(humLabel)}/v${versionNumber}`
}

export function researchVersionsPath(humLabel: string): string {
  return `${researchPath(humLabel)}/versions`
}

export function datasetPath(datasetLabel: string): string {
  return `/dataset/${encodeURIComponent(datasetLabel)}`
}

export function listPath(target: "research" | "dataset"): string {
  return target === "research" ? "/research" : "/dataset"
}

export interface SearchParams {
  /** The query language, not what was typed into the box. Omitted when empty. */
  q: string
  sort: string | null
  /**
   * Which way `sort` runs, when it is not the way that key runs on its own.
   * Omitted otherwise, so that the address of a listing opened from a link and
   * the address of the same listing sorted back again are the one address.
   */
  order?: string | null
  page: number
  /**
   * How many rows a page holds, when it is not the default. **`null` is the
   * default size**, decided where the address is read rather than here — this
   * file writes addresses and does not import the search, which runs on the
   * server. Omitting it is what keeps one listing to one address.
   */
  size?: number | null
  /**
   * The facet whose values are shown in full, and what its own box holds. They
   * say what the panel looks like rather than what the search is, which is why
   * they sit beside the query instead of inside it.
   */
  facet?: string | null
  find?: string | null
}

/**
 * The query string of a search. Only what differs from the default is written,
 * so the first page of an unfiltered browse is the bare address and the same
 * search always reads the same way.
 */
export function searchQuery(params: SearchParams): string {
  const search = new URLSearchParams()
  if (params.q !== "") search.set("q", params.q)
  if (params.sort !== null) search.set("sort", params.sort)
  if (params.order != null && params.order !== "") search.set("order", params.order)
  if (params.page > 1) search.set("page", String(params.page))
  if (params.size != null) search.set("size", String(params.size))
  if (params.facet != null && params.facet !== "") search.set("facet", params.facet)
  if (params.find != null && params.find !== "") search.set("find", params.find)
  return writtenQuery(search)
}

/**
 * The query of the address being read, spelled the one way.
 *
 * **The same address does not arrive as the same characters on both sides.** A
 * comma, a colon and a bracket are legal in a query unencoded, so a browser
 * keeps `?q=a,b` as it is while the page is rendered on the server from
 * `?q=a%2Cb` — two spellings of one search. Anything that carries the current
 * query into a link (the language pair, the way back after signing in) then
 * draws one address on the server and a different one in the browser, and every
 * page reached by a hand-written address hydrates with a mismatch.
 *
 * Reading it through `URLSearchParams` on both sides settles which spelling is
 * written down. **The search is not changed** — the pairs are the same pairs,
 * written the way this file writes every other address it builds.
 */
export function normalizeQuery(search: string): string {
  return writtenQuery(new URLSearchParams(search))
}

/** An empty query is no query at all, rather than a bare `?`. */
function writtenQuery(search: URLSearchParams): string {
  const written = search.toString()
  return written === "" ? "" : `?${written}`
}

export function newsPath(): string {
  return "/news"
}

export function newsItemPath(id: string): string {
  return `/news/${encodeURIComponent(id)}`
}

/** Where the datasets a reader has collected are listed. */
export function cartPath(): string {
  return "/cart"
}

/**
 * Where a listing hands over its results as a table.
 *
 * Under the listing rather than beside it, so the two addresses cannot drift
 * apart. Nothing is shadowed by it: a research is addressed by a hum label,
 * which `export` is not.
 */
export function exportPath(target: "research" | "dataset"): string {
  return `${listPath(target)}/export`
}

/**
 * Where a JGA study is described, which is not here.
 *
 * The portal holds the accession and the edge to it, but nothing about the
 * study itself — the archive is what describes it, so the name is shown as a
 * way there rather than as a string to copy.
 */
export function jgaStudyUrl(accession: string): string {
  return `https://ddbj.nig.ac.jp/search/entry/jga-study/${encodeURIComponent(accession)}/`
}

/**
 * Where a published file is fetched from.
 *
 * **No route answers this.** The front proxy passes `/files/…` to the store,
 * where it is the path-style address of the public bucket — which is why the
 * key there carries the hum label rather than the identity, and why the address
 * is the same one the current portal publishes. The proxy is also what adds
 * `nosniff` and the disposition, so nothing may link past it.
 *
 * It takes no language prefix: a file is the same file in both languages.
 * Segments are escaped one at a time, because a listed name can contain a
 * separator (`dac/DAC_summary-1.pdf`) and that separator is part of the address.
 */
export function filePath(humLabel: string, name: string): string {
  const escaped = name.split("/").map(encodeURIComponent).join("/")
  return `/files/${encodeURIComponent(humLabel)}/${escaped}`
}

/**
 * The addresses a route owns rather than a document. Everything else under the
 * root is a document slug, so this is also the list of slugs a document may not
 * take — a document named `news` would be unreachable behind the route.
 *
 * `/files` and `/private` are here although no route serves them: the proxy
 * takes both to the store, so a document by either name would be shadowed by
 * something a route cannot even see. `/dev` is here although the route under it
 * exists only outside production, so that a slug is refused or accepted the
 * same way in every environment.
 *
 * **It is the first segment that is taken**, not the whole address: the routes
 * above own everything below theirs, so `news/x` is as unreachable as `news`.
 * The screen that creates a document reads this list to say so.
 */
export const SCREEN_PATHS = [
  "/",
  "/data-submission",
  "/data-use",
  "/contact-us",
  "/news",
  "/research",
  "/dataset",
  "/cart",
  "/preview",
  "/admin",
  "/auth",
  "/api",
  "/healthz",
  "/files",
  "/private",
  "/dev",
] as const

/**
 * The `v{n}` segment of a version address.
 *
 * Leading zeros are rejected rather than accepted and normalised: one version
 * has one address, and `v01` would be a second one for the same page.
 */
export function parseVersionSegment(segment: string): number | null {
  const match = /^v(0|[1-9][0-9]*)$/.exec(segment)
  if (match === null) return null
  const number = Number(match[1])
  return number >= 1 ? number : null
}

/** The hum label a pattern captured, lowercased, or null if it did not match. */
function humLabelIn(pattern: RegExp, segment: string): string | null {
  const captured = pattern.exec(segment)?.[1]
  return captured === undefined ? null : captured.toLowerCase()
}

/**
 * The path a legacy address resolves to, or null if it is not one.
 *
 * These are the addresses the old Joomla site published and the bare hum label
 * DDBJ Search links to. All of them answer with a page rather than a dead end,
 * and the resolution happens on the server — v1 rescued them with a redirect
 * issued by the browser, which never reached a client that does not run
 * JavaScript.
 */
export function legacyTarget(path: string): string | null {
  const segment = path.replace(/^\/+/, "").replace(/\/+$/, "")
  if (segment === "") return null

  const releaseOf = humLabelIn(/^(hum\d+)-(?:v\d+|latest)-release$/i, segment)
  if (releaseOf !== null) return researchVersionsPath(releaseOf)

  const versioned = /^(hum\d+)-v(\d+)$/i.exec(segment)
  if (versioned !== null) {
    const [, humLabel, number] = versioned
    if (humLabel !== undefined && number !== undefined) {
      return researchVersionPath(humLabel.toLowerCase(), Number(number))
    }
  }

  const bare = humLabelIn(/^(hum\d+)(?:-latest)?$/i, segment)
  return bare === null ? null : researchPath(bare)
}
