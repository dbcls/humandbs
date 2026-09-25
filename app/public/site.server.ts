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
 * answers only in Japanese, and the English address for it shows that.
 *
 * **A slug resolves to a document, or to the revision a series names.** The
 * version-less address of a guideline holds no body of its own; it responds with
 * whichever revision is current, at 200 rather than through a redirect, the way
 * `/research/{humId}` responds with the newest version.
 */

import { and, desc, eq, or, sql } from "drizzle-orm"

import { getDb } from "~/db/client.server"
import { likeEscaped } from "~/db/like"
import { alert, document, documentContent, documentSeries, news, newsContent } from "~/db/schema"
import { resolveBilingual } from "~/i18n/locale"
import { pageRange } from "~/paging"
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
    // A document is matched at its own slug before it is matched as somebody's
    // current revision, so one address cannot resolve to two pages. The two
    // cannot both exist — the save path refuses it — and this settles what
    // happens if they ever do.
    .orderBy(desc(ownSlug))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null
  return { title: row.content.title, html: renderMarkdown(row.content.body, locale) }
}

export async function documentPage(slug: string, locale: Locale): Promise<ArticleView> {
  return await findDocument(slug, locale) ?? notFound()
}

export interface NewsSummary {
  id: string
  title: string
  /** A JST wall clock. Never absent here: an undated announcement is unpublished. */
  publishedAt: string
  /** The opening of the body as plain words, for the listing to show a line of. */
  excerpt: string
}

export interface NewsListView {
  items: NewsSummary[]
  page: number
  pageCount: number
  /** Every announcement the search matched, not the page being looked at. */
  total: number
  /**
   * Where this page sits in that total, counted from one, or zero when nothing
   * matched. Counted here rather than in the listing because how many rows a
   * page holds is this module's business — and a route module that reads that
   * number out of a `.server` module cannot be split from its loader, so the
   * page stops loading on the way in from another one.
   */
  rangeFrom: number
  rangeTo: number
}

const NEWS_PER_PAGE = 20

/**
 * Newest first, by the date the item has rather than the row's age: the
 * announcements are dated by the release they announce.
 */
/**
 * Announcements, newest first, optionally narrowed by a word.
 *
 * **The word is matched against the title and the body with `ILIKE`, not
 * through the search index.** Announcements are not part of the public
 * search, and at 682 rows a scan is the whole cost — putting them into the
 * index would mean maintaining a second kind of row for a listing that is
 * read by date.
 */
/**
 * The half of "is this readable" that the announcement itself answers: it is
 * dated, and the date has come.
 *
 * **The stored value is a JST wall clock, and "now" is read in the same
 * clock**, so the comparison names the zone rather than leaning on how the
 * server's clock is set — left to `now()` alone, an item dated nine in the
 * morning would appear the previous afternoon wherever the database runs in
 * UTC. An announcement with no date is one still being written, so there is no
 * moment for it to have arrived at.
 */
function arrived() {
  return sql`${news.publishedAt} is not null
    and ${news.publishedAt} <= (now() at time zone 'Asia/Tokyo')`
}

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
    arrived(),
    ...(wanted === ""
      ? []
      : [sql`(${newsContent.content} ->> 'title' ILIKE ${`%${likeEscaped(wanted)}%`} ESCAPE '\\'
           OR ${newsContent.content} ->> 'body' ILIKE ${`%${likeEscaped(wanted)}%`} ESCAPE '\\')`]),
  )

  // Counted rather than checked with "is there one more page": the reader is
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
    .select({
      id: news.id,
      // Not nullable here, because `arrived()` is part of every condition this
      // runs under.
      publishedAt: sql<string>`${news.publishedAt}`,
      content: newsContent.content,
    })
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
    ...pageRange(at, perPage, total),
  }
}

export interface NewsItemView extends ArticleView {
  /** A JST wall clock. Never absent here: an undated announcement is unpublished. */
  publishedAt: string
}

export async function newsItemPage(id: string, locale: Locale): Promise<NewsItemView> {
  const db = getDb()
  const rows = await db
    .select({
      // Not nullable here, for the same reason as the listing.
      publishedAt: sql<string>`${news.publishedAt}`,
      content: newsContent.content,
    })
    .from(newsContent)
    .innerJoin(news, eq(news.id, newsContent.newsId))
    .where(and(
      // The address has a uuid; anything else is not a news item rather
      // than a malformed query for one.
      sql`${newsContent.newsId}::text = ${id}`,
      eq(newsContent.locale, locale),
      eq(newsContent.published, true),
      arrived(),
    ))
    .limit(1)

  const row = rows[0]
  if (row === undefined) notFound()
  return {
    title: row.content.title,
    publishedAt: row.publishedAt,
    html: renderMarkdown(row.content.body, locale),
  }
}

/**
 * The alert every page has. Its text is a translated pair rather than a
 * per-locale row, because an alert is one announcement shown in whichever
 * language the reader is on.
 */
export interface AlertView {
  html: string
  /**
   * The reader's language had nothing, so what is shown here is the other one.
   *
   * **Shown rather than hidden**: what the office announces today reaches more
   * readers in a language some of them cannot read than in none at all. The
   * screen shows which language it is, so that a reader who cannot read it knows
   * that is why rather than wondering what they are looking at.
   */
  untranslated: boolean
}

/**
 * The alerts a reader sees now: on, and within their period. An empty end is
 * no end, and "now" is JST, the clock the period is written in
 * (`news.publishedAt`); the end itself is already outside.
 */
export async function activeAlerts(locale: Locale): Promise<AlertView[]> {
  const db = getDb()
  const now = sql`(now() at time zone 'Asia/Tokyo')`
  const rows = await db
    .select({ content: alert.content })
    .from(alert)
    .where(and(
      eq(alert.active, true),
      sql`(${alert.displayFrom} IS NULL OR ${alert.displayFrom} <= ${now})`,
      sql`(${alert.displayUntil} IS NULL OR ${now} < ${alert.displayUntil})`,
    ))
    // The id breaks the tie: alerts written in one statement share a
    // timestamp, and the v7 id encodes the order they were made in.
    .orderBy(alert.createdAt, alert.id)

  return rows
    .map((row) => ({
      html: renderMarkdown(resolveBilingual(row.content.body, locale), locale),
      untranslated: row.content.body[locale] === "",
    }))
    .filter((one) => one.html !== "")
}
