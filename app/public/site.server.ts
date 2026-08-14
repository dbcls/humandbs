/**
 * What the site-content pages load.
 *
 * Site content has no versions and no pins, so none of the machinery the
 * research pages need applies: there is no label to resolve, no published set
 * to consult, and no public projection. A row of `document_content` or
 * `news_content` marked published *is* the published thing.
 *
 * **A locale that is not published is a 404, not a fallback.** Publication is
 * per locale here — the rule that it goes by version rather than by language is
 * a statement about versions — so a document that exists only in Japanese
 * answers only in Japanese, and the English address for it says so.
 *
 * **A slug resolves to a document, or to the revision a series names.** The
 * version-less address of a guideline holds no body of its own; it answers with
 * whichever revision is current, at 200 rather than through a redirect, the way
 * `/research/{humId}` answers with the newest version.
 */

import { and, desc, eq, or, sql } from "drizzle-orm"

import { getDb } from "~/db/client.server"
import { alert, document, documentContent, documentSeries, news, newsContent } from "~/db/schema"
import { resolveBilingual } from "~/i18n/locale"
import type { Locale } from "~/i18n/locale"

import { leadingText, renderMarkdown } from "./markdown.server"

/** The public side never distinguishes "not published" from "no such thing". */
function notFound(): never {
  throw new Response(null, { status: 404, statusText: "Not Found" })
}

export interface ArticleView {
  title: string
  /** HTML built on the server from the stored markdown. */
  html: string
}

export async function findDocument(slug: string, locale: Locale): Promise<ArticleView | null> {
  const db = getDb()
  const ownSlug = sql<boolean>`${document.slug} = ${slug}`
  const rows = await db
    .select({ content: documentContent.content })
    .from(documentContent)
    .innerJoin(document, eq(document.id, documentContent.documentId))
    .leftJoin(documentSeries, eq(documentSeries.currentId, document.id))
    .where(and(
      or(eq(document.slug, slug), eq(documentSeries.slug, slug)),
      eq(documentContent.locale, locale),
      eq(documentContent.published, true),
    ))
    // A document answers at its own slug before it answers as somebody's
    // current revision, so one address cannot resolve to two pages. The two
    // cannot both exist — the save path refuses it — and this settles what
    // happens if they ever do.
    .orderBy(desc(ownSlug))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null
  return { title: row.content.title, html: renderMarkdown(row.content.body) }
}

export async function documentPage(slug: string, locale: Locale): Promise<ArticleView> {
  return await findDocument(slug, locale) ?? notFound()
}

export interface NewsSummary {
  id: string
  title: string
  publishedAt: string | null
  /** The opening of the body as plain words, for the listing to show a line of. */
  excerpt: string
}

export interface NewsListView {
  items: NewsSummary[]
  page: number
  pageCount: number
  /** Every announcement the search matched, not the page being looked at. */
  total: number
}

export const NEWS_PER_PAGE = 20

/**
 * Newest first, by the date the item carries rather than the row's age: the
 * announcements are dated by the release they announce.
 */
/**
 * Announcements, newest first, optionally narrowed by a word.
 *
 * **The word is matched against the title and the body with `ILIKE`, not
 * through the search index.** Announcements are not part of the public search
 * (`docs/public-pages.md`), and at 682 rows a scan is the whole cost — putting
 * them into the index would mean maintaining a second kind of row for a
 * listing that is read by date.
 */
export async function newsList(
  locale: Locale,
  page: number,
  perPage: number = NEWS_PER_PAGE,
  find = "",
): Promise<NewsListView> {
  const db = getDb()
  const wanted = find.trim()
  const matching = and(
    eq(newsContent.locale, locale),
    eq(newsContent.published, true),
    ...(wanted === ""
      ? []
      : [sql`(${newsContent.content} ->> 'title' ILIKE ${`%${likeEscaped(wanted)}%`} ESCAPE '\\'
           OR ${newsContent.content} ->> 'body' ILIKE ${`%${likeEscaped(wanted)}%`} ESCAPE '\\')`]),
  )

  // Counted rather than answered with "is there one more page": the reader is
  // told how many announcements there are, and the page links need to know how
  // far the listing goes to offer the far end of it.
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(newsContent)
    .innerJoin(news, eq(news.id, newsContent.newsId))
    .where(matching)
  const total = counted?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const at = Math.min(Math.max(page, 1), pageCount)

  const rows = await db
    .select({ id: news.id, publishedAt: news.publishedAt, content: newsContent.content })
    .from(newsContent)
    .innerJoin(news, eq(news.id, newsContent.newsId))
    .where(matching)
    .orderBy(desc(news.publishedAt), desc(news.id))
    .limit(perPage)
    .offset((at - 1) * perPage)

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.content.title,
      publishedAt: row.publishedAt,
      excerpt: leadingText(row.content.body),
    })),
    page: at,
    pageCount,
    total,
  }
}

/** A literal to match, with what LIKE would otherwise read as a pattern escaped. */
function likeEscaped(value: string): string {
  return value.replaceAll(/[\\%_]/g, (char) => `\\${char}`)
}

export interface NewsItemView extends ArticleView {
  publishedAt: string | null
}

export async function newsItemPage(id: string, locale: Locale): Promise<NewsItemView> {
  const db = getDb()
  const rows = await db
    .select({ publishedAt: news.publishedAt, content: newsContent.content })
    .from(newsContent)
    .innerJoin(news, eq(news.id, newsContent.newsId))
    .where(and(
      // The address carries a uuid; anything else is not a news item rather
      // than a malformed query for one.
      sql`${newsContent.newsId}::text = ${id}`,
      eq(newsContent.locale, locale),
      eq(newsContent.published, true),
    ))
    .limit(1)

  const row = rows[0]
  if (row === undefined) notFound()
  return {
    title: row.content.title,
    publishedAt: row.publishedAt,
    html: renderMarkdown(row.content.body),
  }
}

/**
 * The banner every page carries. Its text is a translated pair rather than a
 * per-locale row, because a banner is one announcement shown in whichever
 * language the reader is on.
 */
export async function activeAlerts(locale: Locale): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({ content: alert.content })
    .from(alert)
    .where(eq(alert.active, true))
    .orderBy(alert.createdAt)

  return rows
    .map((row) => renderMarkdown(resolveBilingual(row.content.body, locale)))
    .filter((html) => html !== "")
}
