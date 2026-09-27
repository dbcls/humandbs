/**
 * A page's description, preview and JSON-LD as its route's `meta` returns
 * them. **Apart from the module that builds them** (`structured-data.server.ts`):
 * `meta` runs in the browser as well, and may reach no server module.
 */

import type { MetaDescriptor } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

export interface PageSeo {
  /** The page's own address, in its language. */
  url: string
  /** A sentence or two, for a search result and a link preview. */
  description: string
  jsonLd: Record<string, unknown>
}

/** The page's title, description, preview and JSON-LD, as a route's `meta` returns them. */
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
    { "script:ld+json": seo.jsonLd },
  ]
}
