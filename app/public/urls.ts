/**
 * The URL space of the public site.
 *
 * The shape is v1's, on purpose. What the outside world has written down is the
 * address of an HTML page: referring sites link to `/research/{humId}` and
 * `/research/{humId}/v{n}`, and DDBJ Search links to the bare `/{humId}`.
 * Those addresses are the only reachability the portal promises, so changing
 * their shape costs everything and buys nothing.
 *
 * **Japanese has no prefix; English is served under `/en`.** A prefix on Japanese
 * would put a redirect in front of every address already written down. `/ja/…`
 * still resolves, but as a redirect, so one page has one address.
 *
 * A label in a URL is resolved through the `label_pin` table rather than matched
 * against the primary label, so a dataset id that has been superseded and a hum
 * label that was corrected both keep resolving — they are cited in article
 * prose, in submission forms and in URL fragments, none of which can be
 * rewritten. Reaching a page by a secondary label redirects to the primary one.
 */

import { DEFAULT_LOCALE, isLocale, type Locale } from "~/i18n/locale"
import type { ListingSize } from "~/search/page-size"

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

/**
 * What a client navigation appends to the address it requests. The router
 * strips it before it matches a route, but the request's own URL keeps it.
 */
const DATA_SUFFIX = ".data"

/**
 * Where the management area begins. **It is not a public page and has no
 * language prefix** (`href`), so both the builders and the reader of an
 * address have to know it by the same string.
 */
export const ADMIN_ROOT = "/admin"

/**
 * The path a request asked for, without the `.data` a client navigation
 * appends. **Anything that sends the reader back to where they were builds from
 * this, not from `request.url`** — a redirect to `<path>.data` is followed as a
 * page, and no route handles it.
 */
export function askedPath(pathname: string): string {
  return pathname.endsWith(DATA_SUFFIX) ? pathname.slice(0, -DATA_SUFFIX.length) : pathname
}

/**
 * The language an address is written in, and the address with the prefix taken
 * off.
 *
 * **The `.data` a client navigation appends comes off here.** It is stripped
 * before the routes are matched, so the right route is reached, but a loader
 * reading the language out of `request.url` still sees it — and for the English
 * front page, whose whole path is the prefix, `/en.data` has no segment that
 * spells a locale and reads as Japanese. Pressing EN on the front page left it
 * in Japanese while opening `/en` directly did not, and the same suffix left a
 * `.data` on the end of every path returned from a navigation. Taking it off in
 * the one place that reads an address beats asking forty-odd loaders to
 * remember.
 */
export function readLocale(pathname: string): ReadLocale {
  const asked = askedPath(pathname)
  const [, head = "", ...rest] = asked.split("/")
  if (!isLocale(head)) return { locale: DEFAULT_LOCALE, path: asked, redundantPrefix: false }
  return {
    locale: head,
    path: `/${rest.join("/")}`,
    redundantPrefix: head === DEFAULT_LOCALE,
  }
}

/**
 * Turns an internal path into the address it has in a given language.
 *
 * **The management area has one address and it has no language.** Its
 * screens are written for the people who run the portal and exist in Japanese
 * only, so a prefixed address would be a second address serving nothing.
 * **Screens under it still link out to the public side**, and those keep their
 * prefix — what decides is the path being built, not the screen doing the
 * building.
 */
export function href(locale: Locale, path: string): string {
  if (path === ADMIN_ROOT || path.startsWith(`${ADMIN_ROOT}/`)) return path
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

/**
 * The addresses of every public file a research or a dataset has, one to a
 * line, for a tool to fetch them all. **It takes no language prefix**, for the
 * reason `filePath` does not: the list is the same in both languages.
 */
export function researchFileListPath(humLabel: string): string {
  return `${researchPath(humLabel)}/files.txt`
}

export function datasetFileListPath(datasetLabel: string): string {
  return `${datasetPath(datasetLabel)}/files.txt`
}

/**
 * The query of one page of a file list. The page is always written, and the
 * page size only when it is not the default, as a listing writes `?size=`.
 */
export function fileListQuery(page: number, size: number | null): string {
  const search = new URLSearchParams({ files: String(page) })
  if (size !== null) search.set("fileRows", String(size))
  return `?${search.toString()}`
}

export function listPath(target: "research" | "dataset"): string {
  return target === "research" ? "/research" : "/dataset"
}

/**
 * The dataset listing narrowed to one value of one field, which is what the
 * refinement panel writes when the same value is ticked.
 */
export function datasetsUsing(fieldCode: string, termCode: string): string {
  return `${listPath("dataset")}?q=${encodeURIComponent(`${fieldCode}:${termCode}`)}`
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
  size?: ListingSize | null
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
  return writtenQuery(search)
}

/**
 * The query of the address being read, spelled the one way.
 *
 * **The same address does not arrive as the same characters on both sides.** A
 * comma, a colon and a bracket are legal in a query unencoded, so a browser
 * keeps `?q=a,b` as it is while the page is rendered on the server from
 * `?q=a%2Cb` — two spellings of one search. Anything that has the current
 * query into a link (the language pair, the return address after signing in) then
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
 * Where a JGA accession is described, which is not here.
 *
 * The portal holds the accession and the edge to it, but nothing about the
 * study or the dataset itself — the archive is what describes it, so the name
 * is shown as a way there rather than as a string to copy.
 *
 * **The prefix decides which of the archive's two entry addresses it is.** A
 * registration is a study and the datasets under it, and those are all the
 * accessions the portal ever holds of it.
 */
export function jgaEntryUrl(accession: string): string {
  const kind = accession.startsWith("JGAS") ? "jga-study" : "jga-dataset"
  return `https://ddbj.nig.ac.jp/search/entry/${kind}/${encodeURIComponent(accession)}/`
}

/**
 * Where a submission or a use is applied for. The application system is one
 * address for both, and **it picks its language from `lang`, not from the
 * browser**, so an English page has to request English or its reader lands on
 * the Japanese form.
 */
export function applicationUrl(locale: Locale): string {
  const base = "https://humandbs.ddbj.nig.ac.jp/nbdc/application/"
  return locale === "en" ? `${base}?lang=en` : base
}

/**
 * Where a published file is fetched from.
 *
 * **No route handles this.** The front proxy passes `/files/…` to the store,
 * where it is the path-style address of the public bucket — which is why the
 * key there has the hum label rather than the identity, and why the address
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
 * something a route cannot even see.
 *
 * **It is the first segment that is taken**, not the whole address: the routes
 * above own everything below theirs, so `news/x` is as unreachable as `news`.
 * The screen that creates a document reads this list to show that.
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
] as const

/**
 * The `v{n}` segment of a version address.
 *
 * Leading zeros are rejected rather than accepted and normalised: one version
 * has one address, and `v01` would be a second one for the same page. **The
 * page and the JSON API both read the segment here**, so the two name a
 * version the same way. Nine digits is past any version a research will have
 * and inside what the database's integer holds.
 */
export function parseVersionSegment(segment: string): number | null {
  const match = /^v([1-9][0-9]{0,8})$/.exec(segment)
  return match === null ? null : Number(match[1])
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
 * DDBJ Search links to. All of them respond with a page rather than a dead end,
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
