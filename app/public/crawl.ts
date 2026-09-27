/**
 * What the site tells crawlers: `robots.txt` and the sitemap.
 *
 * **Both are written against the deployment's own origin**, so a sitemap never
 * points one deployment's crawler at another's pages. A deployment that keeps
 * itself out of search engines disallows everything and has no sitemap.
 */

import { DEFAULT_LOCALE, LOCALES, type Locale } from "~/i18n/locale"

import { href } from "./urls"

export function robotsText(input: { origin: string, noindex: boolean }): string {
  return input.noindex
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nDisallow:\n\nSitemap: ${input.origin}/sitemap.xml\n`
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
