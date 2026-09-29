/**
 * A page's description, preview and JSON-LD as its route's `meta` returns
 * them. **Apart from the module that builds them** (`structured-data.server.ts`):
 * `meta` runs in the browser as well, and may reach no server module.
 */

import type { MetaDescriptor } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { ListingSize } from "~/search/page-size"

import { apiPath, listPath, searchQuery } from "./urls"

export interface PageSeo {
  /** The page's own address, in its language. */
  url: string
  /** Where the JSON API has the same content (`apiPath`). */
  api: string
  /** A sentence or two, for a search result and a link preview. */
  description: string
  /** Null for a page that shares its subject with another page holding the JSON-LD. */
  jsonLd: Record<string, unknown> | null
}

/** The page's title, description, preview and, where the page has one, JSON-LD, as a route's `meta` returns them. */
export function seoMeta(seo: PageSeo, title: string, locale: Locale): MetaDescriptor[] {
  return [
    { title },
    { name: "description", content: seo.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: messagesFor(locale).siteName },
    { property: "og:title", content: title },
    { property: "og:description", content: seo.description },
    { property: "og:url", content: seo.url },
    { property: "og:locale", content: locale === "ja" ? "ja_JP" : "en_US" },
    ...seo.jsonLd === null ? [] : [{ "script:ld+json": seo.jsonLd }],
    jsonAlternate(seo.api),
  ]
}

/**
 * The same content from the JSON API, named for a program that has found the
 * page first: the API gives it every value typed and in both languages.
 */
export function jsonAlternate(api: string): MetaDescriptor {
  return { tagName: "link", rel: "alternate", type: "application/json", href: api }
}

export interface ListingRequest {
  query: string
  parseError: unknown
  requestedSort: string | null
  requestedOrder: string | null
  requestedSize: ListingSize | null
  page: number
}

/**
 * A listing's results from the JSON API: the same search in the same order,
 * and the same page where a page holds the default number of rows — the API
 * holds that number on every page, so any other size numbers its pages
 * differently. None for a search that could not be read, which the API
 * refuses.
 */
export function listingAlternate(target: "research" | "dataset", listing: ListingRequest): MetaDescriptor[] {
  if (listing.parseError !== null) return []
  return [jsonAlternate(apiPath(listPath(target)) + searchQuery({
    q: listing.query,
    sort: listing.requestedSort,
    order: listing.requestedOrder,
    page: listing.requestedSize === null ? listing.page : 1,
  }))]
}
