/**
 * What the site tells crawlers: `robots.txt` and the sitemap.
 *
 * **Both are written against the deployment's own origin**, so a sitemap never
 * points one deployment's crawler at another's pages. A deployment that keeps
 * itself out of search engines disallows its pages and has no sitemap, but
 * leaves the API and its documentation page open: they are there to be read
 * by programs, and an agent that honours robots.txt would otherwise be turned
 * away from the one part of the site written for it.
 *
 * **A deployment that is indexed still keeps crawlers off the listings once a
 * condition is written, and off the exports.** The refinements combine without
 * end, so a crawler following them never runs out of addresses, and every one
 * of them is a search. The pages the listings lead to are in the sitemap.
 */

/** The API and what its documentation page loads (`api/docs.ts`). */
const OPEN_WHEN_NOINDEX = ["/api/", "/swagger-ui/"]

import { DEFAULT_LOCALE, LOCALES, type Locale } from "~/i18n/locale"

import { exportPath, href, listPath } from "./urls"

/** A listing with a condition written, and an export, in every language. */
const CLOSED_WHEN_INDEXED = LOCALES.flatMap((locale) => (["research", "dataset"] as const).flatMap((target) => [
  `${href(locale, listPath(target))}?`,
  href(locale, exportPath(target)),
]))

/**
 * The `rel` of a link to an address: `nofollow` where an indexed deployment's
 * robots.txt keeps crawlers off the address, so the page and robots.txt give a
 * crawler the same answer.
 */
export function crawlRel(to: string): "nofollow" | undefined {
  return CLOSED_WHEN_INDEXED.some((path) => to.startsWith(path)) ? "nofollow" : undefined
}

export function robotsText(input: { origin: string, noindex: boolean }): string {
  return input.noindex
    ? `User-agent: *\n${OPEN_WHEN_NOINDEX.map((path) => `Allow: ${path}\n`).join("")}Disallow: /\n`
    : `User-agent: *\n${CLOSED_WHEN_INDEXED.map((path) => `Disallow: ${path}\n`).join("")}\nSitemap: ${input.origin}/sitemap.xml\n`
}

export interface SitemapPage {
  /** The address without the language prefix. */
  path: string
  /** The languages the page is published in, in the site's order. A page with none is not listed. */
  locales: readonly Locale[]
  /** `YYYY-MM-DD`, or null when the page has no date of its own. */
  lastModified: string | null
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;")
}

/**
 * One `<url>` for each language a page is published in, each naming the page's
 * addresses in all of those languages — the sitemap's own way of saying they
 * are one page, for the pages that cannot say it themselves.
 */
export function sitemapXml(pages: readonly SitemapPage[], origin: string): string {
  const entries = pages.flatMap((page) => {
    const locales = LOCALES.filter((locale) => page.locales.includes(locale))
    const addressIn = (locale: Locale) => escapeXml(`${origin}${href(locale, page.path)}`)
    const alternates = locales.length < 2
      ? []
      : [
          ...locales.map((locale) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${addressIn(locale)}"/>`),
          ...locales.includes(DEFAULT_LOCALE)
            ? [`    <xhtml:link rel="alternate" hreflang="x-default" href="${addressIn(DEFAULT_LOCALE)}"/>`]
            : [],
        ]
    return locales.map((locale) => [
      "  <url>",
      `    <loc>${addressIn(locale)}</loc>`,
      ...page.lastModified === null ? [] : [`    <lastmod>${page.lastModified}</lastmod>`],
      ...alternates,
      "  </url>",
    ].join("\n"))
  })
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...entries,
    "</urlset>",
    "",
  ].join("\n")
}

/**
 * A page's addresses in each language and the default, for the pages that
 * exist in both: the address as asked for, the language prefix aside, and its
 * query kept, since the other language's page of a listing is the same search.
 */
export function pageAlternates(origin: string, path: string, search: string): { hrefLang: string, href: string }[] {
  const addressIn = (locale: Locale) => `${origin}${href(locale, path)}${search}`
  return [
    ...LOCALES.map((locale) => ({ hrefLang: locale, href: addressIn(locale) })),
    { hrefLang: "x-default", href: addressIn(DEFAULT_LOCALE) },
  ]
}
