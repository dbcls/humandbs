/**
 * The pages the sitemap lists, read from what is published now.
 *
 * **Research and datasets come from the search rows**, which are the
 * definition of what is published (`search_doc`); both languages always exist.
 * **Articles and announcements are listed by the languages they are published
 * in**, since either can be published in one alone, and an announcement also
 * waits for its time. A version's page is not listed: the research's page has
 * the latest, and the older ones are reached from it.
 */

import { and, eq, sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { document, documentContent, documentSeries, news, newsContent, searchDoc } from "~/db/schema"
import { LOCALES, type Locale } from "~/i18n/locale"

import type { SitemapPage } from "./crawl"
import { datasetPath, listPath, newsItemPath, newsPath, researchPath } from "./urls"

const BOTH = [...LOCALES]

/** The newest of a page's dates, or null when it has none. */
function newest(dates: readonly (string | null)[]): string | null {
  return dates.reduce<string | null>((latest, date) => date !== null && (latest === null || date > latest) ? date : latest, null)
}

/** Rows of one page in several languages, gathered into the page. */
function byPath(rows: readonly { path: string, locale: Locale, lastModified: string | null }[]): SitemapPage[] {
  const pages = new Map<string, { locales: Locale[], dates: (string | null)[] }>()
  for (const row of rows) {
    const page = pages.get(row.path) ?? { locales: [], dates: [] }
    if (!page.locales.includes(row.locale)) page.locales.push(row.locale)
    page.dates.push(row.lastModified)
    pages.set(row.path, page)
  }
  return [...pages].map(([path, page]) => ({
    path,
    locales: LOCALES.filter((locale) => page.locales.includes(locale)),
    lastModified: newest(page.dates),
  }))
}

export async function sitemapPages(db: Executor): Promise<SitemapPage[]> {
  const day = (column: unknown) => sql<string>`to_char(${column}, 'YYYY-MM-DD')`
  const [objects, documents, series, announcements] = await Promise.all([
    db
      .select({
        targetType: searchDoc.targetType,
        humLabel: searchDoc.humLabel,
        datasetLabel: searchDoc.datasetLabel,
        dateModified: sql<string | null>`${searchDoc.dateModified}::text`,
      })
      .from(searchDoc)
      .where(sql`${searchDoc.targetType} IN ('research', 'dataset')`)
      // A research before its datasets.
      .orderBy(searchDoc.humLabel, sql`${searchDoc.datasetLabel} NULLS FIRST`),
    db
      .select({ slug: document.slug, locale: documentContent.locale, lastModified: day(documentContent.updatedAt) })
      .from(documentContent)
      .innerJoin(document, eq(document.id, documentContent.documentId))
      .where(eq(documentContent.published, true))
      .orderBy(document.slug),
    // A series is reached at its own slug as well, which shows its current revision.
    db
      .select({ slug: documentSeries.slug, locale: documentContent.locale, lastModified: day(documentContent.updatedAt) })
      .from(documentSeries)
      .innerJoin(documentContent, and(eq(documentContent.documentId, documentSeries.currentId), eq(documentContent.published, true)))
      .orderBy(documentSeries.slug),
    db
      .select({ id: news.id, locale: newsContent.locale, lastModified: day(newsContent.updatedAt) })
      .from(newsContent)
      .innerJoin(news, eq(news.id, newsContent.newsId))
      .where(and(
        eq(newsContent.published, true),
        sql`${news.publishedAt} <= (now() at time zone 'Asia/Tokyo')`,
      ))
      .orderBy(sql`${news.publishedAt} DESC`),
  ])

  return [
    ...["/", listPath("research"), listPath("dataset"), newsPath()]
      .map((path): SitemapPage => ({ path, locales: BOTH, lastModified: null })),
    ...objects.flatMap((row): SitemapPage[] => {
      if (row.targetType === "research") return [{ path: researchPath(row.humLabel), locales: BOTH, lastModified: row.dateModified }]
      return row.datasetLabel === null ? [] : [{ path: datasetPath(row.datasetLabel), locales: BOTH, lastModified: row.dateModified }]
    }),
    ...byPath([...documents, ...series].map((row) => ({ path: `/${row.slug}`, locale: row.locale, lastModified: row.lastModified }))),
    ...byPath(announcements.map((row) => ({ path: newsItemPath(row.id), locale: row.locale, lastModified: row.lastModified }))),
  ]
}
