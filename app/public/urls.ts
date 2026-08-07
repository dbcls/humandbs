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
  page: number
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
  if (params.page > 1) search.set("page", String(params.page))
  const written = search.toString()
  return written === "" ? "" : `?${written}`
}

export function newsPath(): string {
  return "/news"
}

export function newsItemPath(id: string): string {
  return `/news/${encodeURIComponent(id)}`
}

/**
 * The addresses a route owns rather than a document. Everything else under the
 * root is a document slug, so this is also the list of slugs a document may not
 * take — a document named `news` would be unreachable behind the route.
 */
export const SCREEN_PATHS = [
  "/",
  "/data-submission",
  "/data-use",
  "/contact-us",
  "/news",
  "/research",
  "/dataset",
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
