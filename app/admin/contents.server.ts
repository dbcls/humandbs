/**
 * The site-content screens: what they read, and what their forms do.
 *
 * Everything here requests `manage-site-content`. What is written down is the
 * publishing — a guideline going out or coming down is a change to what readers
 * see, which is what the audit trail is for — while writing a draft, renaming
 * a slug and moving a pointer are not.
 *
 * **Saving and publishing write the same row.** A locale keeps one body, with
 * a `published` flag on it — there is no separate draft table for publishing
 * to move content across from. Saving a locale that is already published
 * changes what readers see the moment the write lands; a locale that has
 * never been published keeps `published` false until publishing sets it.
 *
 * **A slug is an address and the space spans two tables**, so every write that
 * introduces or moves one checks both (`app/admin/contents.ts`).
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { redirect } from "react-router"
import { z } from "zod"

import { requireCapability } from "~/auth/actor.server"
import type { Actor } from "~/auth/capabilities"
import { recordEvent } from "~/auth/events.server"
import { checkArticleBody, type ArticleSyntax } from "~/content/article.server"
import type { ArticleContent } from "~/content/types"
import { getDb, type Executor } from "~/db/client.server"
import { alert, document, documentContent, documentSeries, event, news, newsContent } from "~/db/schema"
import { LOCALES, type Locale } from "~/i18n/locale"
import { isLocale } from "~/i18n/locale"
import { renderMarkdown } from "~/public/markdown.server"
import type { ArticleView } from "~/public/site.server"
import { href, readLocale } from "~/public/urls"
import { isPageSize, PAGE_SIZE, type PageSize } from "~/search/page-size"

import { stampFromLocalInput, today } from "~/dates"
import { axisCounts, pageOf, type ListingPage } from "./listing"
import { readPage } from "./pages.server"
import {
  adminDocumentsPath,
  adminDocumentPath,
  adminNewsListPath,
  adminNewsPath,
  adminSeriesPath,
} from "./urls"
import {
  type ContentsFilter,
  datingOf,
  type DocumentRow,
  emptyStates,
  filterEntries,
  filterNewsRows,
  isNewsDating,
  isNewsSortKey,
  isNewsState,
  isPublishState,
  isVersioning,
  NEWS_DATINGS,
  NEWS_SORT,
  NEWS_STATES,
  type NewsDating,
  type NewsFilter,
  type NewsRow,
  type NewsSortKey,
  type NewsState,
  newsStateIn,
  parseVersionNumber,
  PUBLISH_STATES,
  type PublishState,
  publishStateOf,
  type SeriesRow,
  siteTree,
  slugProblem,
  sortedNews,
  type TreeEntry,
  unansweredLocales,
  type Versioning,
  versioningOf,
  VERSIONINGS,
  versionNumberIn,
  versionSlug,
} from "./contents"

/**
 * A row named by an identifier that arrived in the address.
 *
 * The comparison casts the column rather than the value, because a `uuid`
 * column will not compare with a string that is not shaped like one — and an
 * identifier from an address is whatever somebody typed. Casting the other way
 * makes a mistyped id a 500 instead of "there is no such thing".
 */
function idIs(column: PgColumn, value: string) {
  return sql`${column}::text = ${value}`
}

/** What a locale looks like before anybody has written its body. */
const EMPTY_ARTICLE: ArticleContent = { title: "", body: "" }

export type ContentsProblem
  = | "undated"
    | "dated-while-published"
    | "malformed-slug"
    | "reserved-slug"
    | "duplicate-slug"
    | "missing-title"
    | "missing-translation"
    | "period-reversed"
    | "stale"
    | "in-use"
    | "not-a-revision"
    | "malformed-version"
    | "unknown-target"

export interface BodyProblem {
  locale: Locale
  syntax: ArticleSyntax
  line: number
}

/**
 * What a form that went through did, so that the answer can report it — 「公開しました」
 * rather than the same 「保存しました」 for every button on the screen.
 */
export type ContentsDone
  = | "saved"
    | "published"
    | "unpublished"
    | "renamed"
    | "cut"
    | "repointed"
    | "alert-created"
    | "alert-saved"
    | "alert-shown"
    | "alert-hidden"
    | "alert-deleted"
    | "dated"

export type ContentsResult
  = | { status: "ok", done: ContentsDone }
    | { status: ContentsProblem }
    | { status: "body", problems: BodyProblem[] }

export interface AlertRow {
  id: string
  active: boolean
  /**
   * The JST day it was put up, while it is up.
   *
   * **Read from the trail rather than kept on the row.** Putting an alert up
   * is recorded there in the same transaction, so the day is true without a
   * second thing being written — and it is the day of the *latest* raising,
   * because what a reader of the screen wants to know is how long the sentence
   * has been standing, not when it first went up. An alert that comes across
   * from v1 standing is put up in the trail by the load, at the instant v1
   * holds for it, so it has a day as well.
   */
  shownAt: string | null
  /** The period it is seen in, as JST wall clocks (`news.publishedAt`); null is no end on that side. */
  displayFrom: string | null
  displayUntil: string | null
  /** Where now falls against the period: before its start, within it, or at or past its end. */
  period: AlertPeriod
  ja: string
  en: string
}

export type AlertPeriod = "ahead" | "within" | "over"

export interface ContentsView extends ListingPage<TreeEntry> {
  locale: Locale
  /** The conditions in force, as the address has them. */
  keyword: string
  versioning: Versioning[]
  ja: PublishState[]
  en: PublishState[]
  /**
   * How many articles each choice of the pane would leave, counted the way the
   * public panel counts (`app/admin/listing.ts` の `axisCounts`).
   */
  counts: {
    versioning: Record<Versioning, number>
    ja: Record<PublishState, number>
    en: Record<PublishState, number>
  }
  size: PageSize
  /**
   * Version-less slugs whose current revision does not respond in some language.
   *
   * **Read from every series, not from the page.** It is a report of what is
   * broken rather than a part of the listing, and one that came and went as the
   * reader narrowed would be read as "narrowing fixed it".
   */
  unanswered: { slug: string, locales: Locale[] }[]
}

export interface SeriesView {
  locale: Locale
  series: SeriesRow
  /** The revision the pointer names, or null if it identifies nothing readable. */
  current: DocumentRow | null
  /** Languages the version-less slug does not respond in. */
  unanswered: Locale[]
}

export interface AlertsView {
  locale: Locale
  alerts: AlertRow[]
}

export interface LocaleEditor {
  locale: Locale
  published: boolean
  publishedAt: string | null
  /** The one body there is, public or not. Empty until something is saved. */
  title: string
  body: string
  /** The body drawn as readers would see it, for the pane beside the form before a key is pressed. */
  html: string
  /** Null when no row exists yet, which is what tells a save to insert. */
  revision: number | null
}

export interface DocumentView {
  locale: Locale
  id: string
  slug: string
  /** Set when this document is a revision: the series it belongs to. */
  seriesOf: { id: string, slug: string, number: number, isCurrent: boolean } | null
  editors: LocaleEditor[]
}

export interface NewsListView extends ListingPage<NewsRow> {
  locale: Locale
  /** The conditions in force, as the address has them. */
  keyword: string
  dating: NewsDating[]
  ja: NewsState[]
  en: NewsState[]
  /**
   * How many announcements each choice of the pane would leave, counted the way
   * the articles are (`app/admin/listing.ts` の `axisCounts`).
   */
  counts: {
    dating: Record<NewsDating, number>
    ja: Record<NewsState, number>
    en: Record<NewsState, number>
  }
  size: PageSize
  sort: NewsSortKey
  order: "asc" | "desc"
}

export interface NewsView {
  locale: Locale
  id: string
  publishedAt: string | null
  /** Whether the date is still ahead, which keeps it off the public side. */
  scheduled: boolean
  editors: LocaleEditor[]
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * A textarea posts CRLF. Normalising it here is what makes saving a body twice
 * without touching it store the same bytes twice.
 */
function body(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value.replaceAll("\r\n", "\n") : ""
}

function revisionOf(form: FormData): number | null {
  const value = text(form, "revision")
  if (value === "") return null
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

function localeOf(form: FormData): Locale | null {
  const value = text(form, "locale")
  return isLocale(value) ? value : null
}

/** The article a form is proposing, or everything about it a page cannot hold. */
function articleFrom(form: FormData, locale: Locale): ArticleContent | BodyProblem[] {
  const article = { title: text(form, "title"), body: body(form, "body") }
  const problems = checkArticleBody(article.body)
  if (problems.length > 0) return problems.map((problem) => ({ locale, ...problem }))
  return article
}

// --- reading -----------------------------------------------------------------

interface ContentRow {
  id: string
  slug: string
  locale: Locale | null
  published: boolean | null
  title: string | null
}

/**
 * Every document, whichever screen is asking. **The catalog screen reads this
 * too**, to offer the vocabulary editor a document to link a term's label to
 * (`app/admin/catalog.server.ts`) — the same rows, because there is one list
 * of documents on the site rather than one per screen that wants to name one.
 */
export async function documentRows(db: Executor): Promise<DocumentRow[]> {
  const rows: ContentRow[] = await db
    .select({
      id: document.id,
      slug: document.slug,
      locale: documentContent.locale,
      published: documentContent.published,
      title: sql<string>`${documentContent.content}->>'title'`,
    })
    .from(document)
    .leftJoin(documentContent, eq(documentContent.documentId, document.id))
    .orderBy(asc(document.slug))

  const byId = new Map<string, DocumentRow>()
  for (const row of rows) {
    const found = byId.get(row.id)
      ?? { id: row.id, slug: row.slug, title: "", states: emptyStates() }
    if (row.locale !== null) {
      found.states[row.locale] = { published: row.published === true }
      // Japanese names the page; English does when there is no Japanese side.
      if (found.title === "" || row.locale === "ja") found.title = row.title ?? ""
    }
    byId.set(row.id, found)
  }
  return [...byId.values()]
}

async function seriesRows(
  db: Executor,
  documents: readonly DocumentRow[],
  onlyId?: string,
): Promise<SeriesRow[]> {
  const rows = await db
    .select({ id: documentSeries.id, slug: documentSeries.slug, currentId: documentSeries.currentId })
    .from(documentSeries)
    .where(onlyId === undefined ? undefined : idIs(documentSeries.id, onlyId))
    .orderBy(asc(documentSeries.slug))

  return rows.map((row) => ({
    ...row,
    revisions: documents
      .filter((one) => versionNumberIn(row.slug, one.slug) !== null)
      .sort((a, b) => (versionNumberIn(row.slug, b.slug) ?? 0) - (versionNumberIn(row.slug, a.slug) ?? 0)),
  }))
}

/**
 * The listing: one row per article, narrowed by what was typed and split into
 * pages.
 *
 * **The whole tree is built before it is narrowed**, because a row's depth and
 * a series' revisions are read from the set of articles rather than from the
 * rows on screen (`app/admin/contents.ts`). There are tens of articles, not
 * thousands, so the page is sliced here rather than asked of the database.
 */
export async function contentsPage(request: Request): Promise<ContentsView> {
  await requireCapability(request, "manage-site-content")
  const db = getDb()
  const url = new URL(request.url)
  const filter: ContentsFilter = {
    keyword: url.searchParams.get("q") ?? "",
    versioning: url.searchParams.getAll("versioning").filter(isVersioning),
    ja: url.searchParams.getAll("ja").filter(isPublishState),
    en: url.searchParams.getAll("en").filter(isPublishState),
  }
  // A size that is not one of the offered ones is read as none asked for, the
  // way the other listings read theirs: an address arriving from somewhere else
  // should respond rather than refuse.
  const askedSize = Number(url.searchParams.get("size") ?? "")
  const size: PageSize = isPageSize(askedSize) ? askedSize : PAGE_SIZE

  const documents = await documentRows(db)
  const series = await seriesRows(db, documents)
  const tree = siteTree(documents, series)

  // Each axis is counted over the articles the *other* conditions leave, so
  // that a second value of an axis is still reachable after the first is ticked.
  const counts = {
    versioning: axisCounts(
      filterEntries(tree, { ...filter, versioning: [] }),
      VERSIONINGS,
      (entry, value) => versioningOf(entry) === value,
    ),
    ja: axisCounts(
      filterEntries(tree, { ...filter, ja: [] }),
      PUBLISH_STATES,
      (entry, value) => publishStateOf(entry, "ja") === value,
    ),
    en: axisCounts(
      filterEntries(tree, { ...filter, en: [] }),
      PUBLISH_STATES,
      (entry, value) => publishStateOf(entry, "en") === value,
    ),
  }

  return {
    locale: readLocale(url.pathname).locale,
    keyword: filter.keyword,
    versioning: [...filter.versioning],
    ja: [...filter.ja],
    en: [...filter.en],
    counts,
    size,
    ...pageOf(filterEntries(tree, filter), readPage(url.searchParams.get("page")), size),
    unanswered: tree.flatMap((entry) => {
      if (entry.kind !== "series") return []
      const locales = unansweredLocales(entry.current, LOCALES)
      return locales.length === 0 ? [] : [{ slug: entry.series.slug, locales }]
    }),
  }
}

/**
 * One versioned article: the pointer, and the revisions under it.
 *
 * Everything that acts on a series as a whole is here rather than in the
 * listing — moving the pointer, adding a revision, retiring the lot. A listing
 * that included them would hold a row that is a form, which is a row that cannot be
 * scanned beside its neighbours.
 */
export async function seriesPage(request: Request, seriesId: string): Promise<SeriesView | null> {
  await requireCapability(request, "manage-site-content")
  const db = getDb()
  const documents = await documentRows(db)
  const [series] = await seriesRows(db, documents, seriesId)
  if (series === undefined) return null

  const current = series.revisions.find((one) => one.id === series.currentId) ?? null
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    series,
    current,
    unanswered: unansweredLocales(current, LOCALES),
  }
}

export async function alertsPage(request: Request): Promise<AlertsView> {
  await requireCapability(request, "manage-site-content")
  // The last time each alert was put up, as the JST day (`AlertRow`). The
  // trail is the one place that knows: the row only records whether it is up now.
  const lastShown = getDb()
    .select({
      subjectId: event.subjectId,
      day: sql<string>`to_char(max(${event.occurredAt}) at time zone 'Asia/Tokyo', 'YYYY-MM-DD')`.as("day"),
    })
    .from(event)
    .where(and(eq(event.action, "publish-site-content"), eq(event.subjectType, "alert")))
    .groupBy(event.subjectId)
    .as("last_shown")
  const alerts = await getDb()
    .select({
      id: alert.id,
      active: alert.active,
      content: alert.content,
      shownDay: lastShown.day,
      displayFrom: alert.displayFrom,
      displayUntil: alert.displayUntil,
      ahead: sql<boolean>`coalesce(${alert.displayFrom} > (now() at time zone 'Asia/Tokyo'), false)`,
      over: sql<boolean>`coalesce(${alert.displayUntil} <= (now() at time zone 'Asia/Tokyo'), false)`,
    })
    .from(alert)
    // The trail names its subject as text, whatever the subject's own key is.
    .leftJoin(lastShown, sql`${lastShown.subjectId} = ${alert.id}::text`)
    // **Two alerts made in the same moment still have an order.** Rows written
    // in one statement share a timestamp, and ordering by the time alone hands
    // them back in whatever order they happen to lie in — which moves as soon as
    // one of them is saved. The id is a v7, so it encodes the order they were
    // made in.
    .orderBy(asc(alert.createdAt), asc(alert.id))

  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    alerts: alerts.map((row) => ({
      id: row.id,
      active: row.active,
      shownAt: row.active ? row.shownDay : null,
      displayFrom: row.displayFrom,
      displayUntil: row.displayUntil,
      period: row.ahead ? "ahead" : row.over ? "over" : "within",
      ja: row.content.body.ja,
      en: row.content.body.en,
    })),
  }
}

function editorsFrom(rows: {
  locale: Locale
  content: ArticleContent
  published: boolean
  publishedAt?: string | null
  revision: number
}[]): LocaleEditor[] {
  return LOCALES.map((locale) => {
    const row = rows.find((one) => one.locale === locale)
    const content = row?.content ?? EMPTY_ARTICLE
    return {
      locale,
      published: row?.published ?? false,
      publishedAt: row?.publishedAt ?? null,
      title: content.title,
      body: content.body,
      html: paneHtml(content.body, locale),
      revision: row?.revision ?? null,
    }
  })
}

export async function documentPage(
  request: Request,
  documentId: string,
): Promise<DocumentView | null> {
  await requireCapability(request, "manage-site-content")
  const db = getDb()
  const [row] = await db
    .select({ id: document.id, slug: document.slug })
    .from(document)
    // The address has a uuid; anything else is not a document rather than a
    // malformed request for one.
    .where(idIs(document.id, documentId))
    .limit(1)
  if (row === undefined) return null

  const contents = await db
    .select({
      locale: documentContent.locale,
      content: documentContent.content,
      published: documentContent.published,
      publishedAt: documentContent.publishedAt,
      revision: documentContent.revision,
    })
    .from(documentContent)
    .where(eq(documentContent.documentId, row.id))

  const series = await db
    .select({ id: documentSeries.id, slug: documentSeries.slug, currentId: documentSeries.currentId })
    .from(documentSeries)
  const owner = series.find((one) => versionNumberIn(one.slug, row.slug) !== null)

  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    id: row.id,
    slug: row.slug,
    seriesOf: owner === undefined
      ? null
      : {
          id: owner.id,
          slug: owner.slug,
          number: versionNumberIn(owner.slug, row.slug) ?? 0,
          isCurrent: owner.currentId === row.id,
        },
    editors: editorsFrom(contents),
  }
}

/**
 * Every announcement there is, newest first, with what each of its languages is
 * up to.
 *
 * **The two statements are the same two whatever the reader has asked for.**
 * The pane shows how many rows each of its values would leave, which is a count
 * over the announcements the other conditions leave rather than over the page —
 * so the page is sliced here, as it is for the articles.
 *
 * The locales are fetched after the items rather than joined to them: a row per
 * locale would make what is read depend on how many languages each item happens
 * to have.
 */
async function newsRows(db: Executor): Promise<NewsRow[]> {
  const rows = await db
    .select({
      id: news.id,
      publishedAt: news.publishedAt,
      // **Read in the clock the value is written in.** The column holds a JST
      // wall clock, so comparing it against a bare `now()` would depend on the
      // zone the database happens to run in. An undated item is not scheduled —
      // it is unwritten, and there is no moment it is waiting for.
      scheduled: sql<boolean>`coalesce(${news.publishedAt} > (now() at time zone 'Asia/Tokyo'), false)`,
    })
    .from(news)
    // Where the sorting starts from; which order the reader gets is decided
    // after the rows are built.
    .orderBy(desc(news.publishedAt), desc(news.id))

  const byId = new Map<string, NewsRow>(rows.map((row) => [
    row.id,
    {
      id: row.id,
      title: "",
      publishedAt: row.publishedAt,
      scheduled: row.scheduled,
      states: emptyStates(),
    },
  ]))

  const contents = byId.size === 0
    ? []
    : await db
        .select({
          id: newsContent.newsId,
          locale: newsContent.locale,
          published: newsContent.published,
          title: sql<string>`${newsContent.content}->>'title'`,
        })
        .from(newsContent)

  for (const row of contents) {
    const found = byId.get(row.id)
    if (found === undefined) continue
    found.states[row.locale] = { published: row.published }
    // Japanese names the item; English does when there is no Japanese side.
    if (found.title === "" || row.locale === "ja") found.title = row.title
  }
  return [...byId.values()]
}

/**
 * The listing: one row per announcement, narrowed by what was typed and cut
 * into pages.
 *
 * **Undated items sort to the top.** The date is the announcement's own — it is
 * what the public listing orders by — so an item without one is a draft that
 * has not been given its day yet.
 */
export async function newsListPage(request: Request): Promise<NewsListView> {
  await requireCapability(request, "manage-site-content")
  const db = getDb()
  const url = new URL(request.url)
  const filter: NewsFilter = {
    keyword: url.searchParams.get("q") ?? "",
    dating: url.searchParams.getAll("dating").filter(isNewsDating),
    ja: url.searchParams.getAll("ja").filter(isNewsState),
    en: url.searchParams.getAll("en").filter(isNewsState),
  }
  // A size that is not one of the offered ones is read as none asked for, the
  // way the other listings read theirs.
  const askedSize = Number(url.searchParams.get("size") ?? "")
  const size: PageSize = isPageSize(askedSize) ? askedSize : PAGE_SIZE
  // Unreadable is the default rather than a refusal, the way the other
  // listings read their own address.
  const asked = url.searchParams.get("sort")
  const sort = isNewsSortKey(asked) ? asked : NEWS_SORT
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc"

  const rows = await newsRows(db)

  // Each axis is counted over the announcements the *other* conditions leave, so
  // that a second value of an axis is still reachable after the first is ticked.
  const counts = {
    dating: axisCounts(
      filterNewsRows(rows, { ...filter, dating: [] }),
      NEWS_DATINGS,
      (row, value) => datingOf(row) === value,
    ),
    ja: axisCounts(
      filterNewsRows(rows, { ...filter, ja: [] }),
      NEWS_STATES,
      (row, value) => newsStateIn(row, "ja") === value,
    ),
    en: axisCounts(
      filterNewsRows(rows, { ...filter, en: [] }),
      NEWS_STATES,
      (row, value) => newsStateIn(row, "en") === value,
    ),
  }

  return {
    locale: readLocale(url.pathname).locale,
    keyword: filter.keyword,
    dating: [...filter.dating],
    ja: [...filter.ja],
    en: [...filter.en],
    counts,
    size,
    sort,
    order,
    ...pageOf(
      sortedNews(filterNewsRows(rows, filter), sort, order),
      readPage(url.searchParams.get("page")),
      size,
    ),
  }
}

export async function newsPage(request: Request, newsId: string): Promise<NewsView | null> {
  await requireCapability(request, "manage-site-content")
  const db = getDb()
  const [row] = await db
    .select({
      id: news.id,
      publishedAt: news.publishedAt,
      // The same reading as the listing's.
      scheduled: sql<boolean>`coalesce(${news.publishedAt} > (now() at time zone 'Asia/Tokyo'), false)`,
    })
    .from(news)
    .where(idIs(news.id, newsId))
    .limit(1)
  if (row === undefined) return null

  const contents = await db
    .select({
      locale: newsContent.locale,
      content: newsContent.content,
      published: newsContent.published,
      revision: newsContent.revision,
    })
    .from(newsContent)
    .where(eq(newsContent.newsId, row.id))

  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    id: row.id,
    publishedAt: row.publishedAt,
    scheduled: row.scheduled,
    editors: editorsFrom(contents),
  }
}

// --- writing -----------------------------------------------------------------

/** Whether either table already responds at this address. */
async function slugTaken(db: Executor, slug: string, exceptDocumentId?: string): Promise<boolean> {
  const [held] = await db
    .select({ slug: document.slug })
    .from(document)
    .where(exceptDocumentId === undefined
      ? eq(document.slug, slug)
      : and(eq(document.slug, slug), sql`${document.id}::text <> ${exceptDocumentId}`))
    .limit(1)
  if (held !== undefined) return true
  const [series] = await db
    .select({ slug: documentSeries.slug })
    .from(documentSeries)
    .where(eq(documentSeries.slug, slug))
    .limit(1)
  return series !== undefined
}

async function guardSlug(
  db: Executor,
  slug: string,
  exceptDocumentId?: string,
): Promise<ContentsProblem | null> {
  const problem = slugProblem(slug)
  if (problem !== null) return problem
  return await slugTaken(db, slug, exceptDocumentId) ? "duplicate-slug" : null
}

/**
 * Where the screen goes next, when what was done leaves it nowhere to be.
 * **The redirect is thrown after the transaction commits**, not inside it: a
 * throw is how a transaction is rolled back.
 */
type Applied = ContentsResult | { status: "ok", goTo: string }

function settle(request: Request, applied: Applied): ContentsResult {
  if (!("goTo" in applied)) return applied
  const { locale } = readLocale(new URL(request.url).pathname)
  throw redirect(href(locale, applied.goTo))
}

export async function contentsAction(request: Request): Promise<ContentsResult> {
  await requireCapability(request, "manage-site-content")
  const form = await request.formData()
  const intent = text(form, "intent")

  const applied = await getDb().transaction(async (tx): Promise<Applied> => {
    switch (intent) {
      case "create-document":
        return createDocument(tx, form)
      default:
        return { status: "unknown-target" }
    }
  })
  return settle(request, applied)
}

/**
 * What the screen for one series does: move the pointer, add a revision, retire
 * the whole thing.
 *
 * **The series is named by the address rather than by a hidden field.** The
 * screen is about one of them, so a field indicating which would be the second
 * place that is written down — and the one a form could get wrong.
 */
export async function seriesAction(request: Request, seriesId: string): Promise<ContentsResult> {
  const actor = await requireCapability(request, "manage-site-content")
  const form = await request.formData()
  const intent = text(form, "intent")

  const applied = await getDb().transaction(async (tx): Promise<Applied> => {
    switch (intent) {
      case "repoint-series":
        return repointSeries(tx, seriesId, form)
      case "add-version":
        return addVersion(tx, seriesId, form)
      case "delete-series":
        return deleteSeries(tx, seriesId, actor)
      default:
        return { status: "unknown-target" }
    }
  })
  return settle(request, applied)
}

/**
 * The alert is edited on a screen of its own, so its intents are answered
 * apart from the tree's. Both screens still use the one result type: what a
 * refusal reads like belongs to site content as a whole rather than to the
 * screen the refusal came from.
 */
export async function alertAction(request: Request): Promise<ContentsResult> {
  const actor = await requireCapability(request, "manage-site-content")
  const form = await request.formData()
  const intent = text(form, "intent")

  const applied = await getDb().transaction(async (tx): Promise<Applied> => {
    switch (intent) {
      case "create-alert":
        return createAlert(tx)
      case "update-alert":
        return updateAlert(tx, form, actor, null)
      // **Putting an alert up and writing it are one request.** What is on the
      // screen is what goes up, so an alert cannot be shown in a wording nobody
      // has read.
      case "show-alert":
        return updateAlert(tx, form, actor, true)
      case "hide-alert":
        return updateAlert(tx, form, actor, false)
      case "delete-alert":
        return deleteAlert(tx, form, actor)
      default:
        return { status: "unknown-target" }
    }
  })
  return settle(request, applied)
}

async function createDocument(tx: Executor, form: FormData): Promise<Applied> {
  const slug = text(form, "slug")
  const problem = await guardSlug(tx, slug)
  if (problem !== null) return { status: problem }
  const [created] = await tx.insert(document).values({ slug }).returning({ id: document.id })
  if (created === undefined) return { status: "unknown-target" }
  return { status: "ok", goTo: adminDocumentPath(created.id) }
}

async function repointSeries(
  tx: Executor,
  seriesId: string,
  form: FormData,
): Promise<ContentsResult> {
  const documentId = text(form, "documentId")
  const [series] = await tx
    .select({ id: documentSeries.id, slug: documentSeries.slug })
    .from(documentSeries)
    .where(idIs(documentSeries.id, seriesId))
    .limit(1)
  if (series === undefined) return { status: "unknown-target" }

  const [target] = await tx
    .select({ id: document.id, slug: document.slug })
    .from(document)
    .where(idIs(document.id, documentId))
    .limit(1)
  if (target === undefined) return { status: "unknown-target" }
  // Only a revision of this series may be named: the pointer records which version
  // is current, not which page to show.
  if (versionNumberIn(series.slug, target.slug) === null) return { status: "not-a-revision" }

  await tx
    .update(documentSeries)
    .set({ currentId: target.id, updatedAt: sql`now()` })
    .where(eq(documentSeries.id, series.id))
  return { status: "ok", done: "repointed" }
}

/**
 * The next revision, empty, ready to be written and then pointed at. The number
 * comes from the form; the screen only fills the box with the one that follows.
 */
async function addVersion(tx: Executor, seriesId: string, form: FormData): Promise<Applied> {
  const [series] = await tx
    .select({ slug: documentSeries.slug })
    .from(documentSeries)
    .where(idIs(documentSeries.id, seriesId))
    .limit(1)
  if (series === undefined) return { status: "unknown-target" }

  const number = parseVersionNumber(text(form, "number"))
  if (number === null) return { status: "malformed-version" }

  const slug = versionSlug(series.slug, number)
  if (await slugTaken(tx, slug)) return { status: "duplicate-slug" }

  const [created] = await tx.insert(document).values({ slug }).returning({ id: document.id })
  if (created === undefined) return { status: "unknown-target" }
  return { status: "ok", goTo: adminDocumentPath(created.id) }
}

/**
 * Retiring a guideline: the version-less slug and every revision under it go at
 * once.
 *
 * There is no way to take the versioning back off and keep the addresses — the
 * body would have to move to the version-less slug, which is what the numbered
 * address it left behind used to respond with. So a series is either kept or
 * removed whole. One at a time would not do either: the revision the pointer
 * names cannot be deleted on its own, so it would be the one thing left with
 * nothing left to point at it.
 */
async function deleteSeries(tx: Executor, seriesId: string, actor: Actor): Promise<Applied> {
  const [series] = await tx
    .select({ id: documentSeries.id, slug: documentSeries.slug })
    .from(documentSeries)
    .where(idIs(documentSeries.id, seriesId))
    .limit(1)
  if (series === undefined) return { status: "unknown-target" }

  const revisions = await tx
    .select({ id: document.id, slug: document.slug })
    .from(document)
    .where(sql`${document.slug} like ${`${series.slug}/version/%`}`)
  const ids = revisions.map((one) => one.id)

  const published = ids.length === 0
    ? []
    : await tx
        .select({ documentId: documentContent.documentId, locale: documentContent.locale })
        .from(documentContent)
        .where(and(inArray(documentContent.documentId, ids), eq(documentContent.published, true)))

  // The pointer goes first: it identifies a revision and refuses to let it go.
  await tx.delete(documentSeries).where(eq(documentSeries.id, series.id))
  if (ids.length > 0) await tx.delete(document).where(inArray(document.id, ids))

  const slugOf = new Map(revisions.map((one) => [one.id, one.slug]))
  for (const id of new Set(published.map((one) => one.documentId))) {
    await recordEvent(tx, {
      actor,
      action: "unpublish-site-content",
      subjectType: "document",
      subjectId: id,
      detail: {
        slug: slugOf.get(id) ?? series.slug,
        deleted: true,
        locales: published.filter((one) => one.documentId === id).map((one) => one.locale),
      },
    })
  }
  return { status: "ok", goTo: adminDocumentsPath() }
}

async function createAlert(tx: Executor): Promise<ContentsResult> {
  await tx.insert(alert).values({ content: { body: { ja: "", en: "" } }, active: false })
  return { status: "ok", done: "alert-created" }
}

async function updateAlert(
  tx: Executor,
  form: FormData,
  actor: Actor,
  /** Whether the alert is to stand or come down; `null` leaves it as it was. */
  showing: boolean | null,
): Promise<ContentsResult> {
  const id = text(form, "alertId")
  const [before] = await tx
    .select({ id: alert.id, active: alert.active })
    .from(alert)
    .where(idIs(alert.id, id))
    .limit(1)
  if (before === undefined) return { status: "unknown-target" }
  const active = showing ?? before.active

  const ja = body(form, "ja")
  const en = body(form, "en")
  const problems = [
    ...checkArticleBody(ja).map((problem) => ({ locale: "ja" as const, ...problem })),
    ...checkArticleBody(en).map((problem) => ({ locale: "en" as const, ...problem })),
  ]
  if (problems.length > 0) return { status: "body", problems }

  // **An alert that is up has to be up in both languages.** It is shown on every
  // page of the site, so a reader on the language that is missing is handed a
  // box they cannot read — and the announcement it holds is the kind that is
  // worth an alert. Only switching one on is held to this: an announcement can
  // be written a language at a time while it is off.
  if (active && (ja === "" || en === "")) return { status: "missing-translation" }

  // **Either end may be left empty**, and an empty box is no end on that side.
  // A value the box could not have sent is a form that was gone around.
  const from = text(form, "displayFrom")
  const until = text(form, "displayUntil")
  const displayFrom = from === "" ? null : stampFromLocalInput(from)
  const displayUntil = until === "" ? null : stampFromLocalInput(until)
  if ((from !== "" && displayFrom === null) || (until !== "" && displayUntil === null)) {
    return { status: "unknown-target" }
  }
  // The stamps are one fixed-width shape, so their order is the text's.
  if (displayFrom !== null && displayUntil !== null && displayFrom >= displayUntil) {
    return { status: "period-reversed" }
  }

  await tx
    .update(alert)
    .set({ content: { body: { ja, en } }, active, displayFrom, displayUntil, updatedAt: sql`now()` })
    .where(eq(alert.id, before.id))
  if (active !== before.active) {
    await recordEvent(tx, {
      actor,
      action: active ? "publish-site-content" : "unpublish-site-content",
      subjectType: "alert",
      subjectId: before.id,
    })
  }
  if (showing === null || showing === before.active) return { status: "ok", done: "alert-saved" }
  return { status: "ok", done: showing ? "alert-shown" : "alert-hidden" }
}

async function deleteAlert(tx: Executor, form: FormData, actor: Actor): Promise<ContentsResult> {
  const id = text(form, "alertId")
  const [row] = await tx
    .select({ id: alert.id, active: alert.active })
    .from(alert)
    .where(idIs(alert.id, id))
    .limit(1)
  if (row === undefined) return { status: "unknown-target" }

  await tx.delete(alert).where(eq(alert.id, row.id))
  if (row.active) {
    await recordEvent(tx, {
      actor,
      action: "unpublish-site-content",
      subjectType: "alert",
      subjectId: row.id,
      detail: { deleted: true },
    })
  }
  return { status: "ok", done: "alert-deleted" }
}

// --- one locale of a document or a news item ---------------------------------

type ContentTarget
  = | { kind: "document", id: string, slug: string }
    | { kind: "news", id: string }

function subjectOf(target: ContentTarget): { type: "document" | "news", detail: Record<string, unknown> } {
  return target.kind === "document"
    ? { type: "document", detail: { slug: target.slug } }
    : { type: "news", detail: {} }
}

/**
 * The first write to a locale. **The insert is conditional**: a form that
 * sent no revision means "there was no row when I was drawn", and if
 * there is one now that claim is as stale as a revision that no longer matches.
 */
async function insertLocale(
  tx: Executor,
  target: ContentTarget,
  locale: Locale,
  article: ArticleContent,
  published: boolean,
): Promise<boolean> {
  const values = { locale, content: article, published }
  const inserted = target.kind === "document"
    ? await tx
        .insert(documentContent)
        .values({
          documentId: target.id,
          ...values,
          publishedAt: published ? today() : null,
        })
        .onConflictDoNothing()
        .returning({ locale: documentContent.locale })
    : await tx
        .insert(newsContent)
        .values({ newsId: target.id, ...values })
        .onConflictDoNothing()
        .returning({ locale: newsContent.locale })
  return inserted.length > 0
}

interface LocaleUpdate {
  content?: ArticleContent
  published?: boolean
  /** Documents only: the day it first went out. */
  stampPublishedAt?: boolean
}

/**
 * What a write to a locale sets, whichever of the two tables holds it. The two
 * tables have the same columns, so the shape of a save is decided here and the
 * branches below differ only in which table and which owner column they name —
 * which is the part the ORM's types cannot be made to share.
 */
function localeSet(revision: number, update: LocaleUpdate) {
  return {
    ...update.content === undefined ? {} : { content: update.content },
    ...update.published === undefined ? {} : { published: update.published },
    revision: revision + 1,
    updatedAt: sql`now()`,
  }
}

/**
 * The one shape a write to a locale takes: match the revision the form read,
 * and step it. **A save that matched nothing is a 409** rather than a silent
 * overwrite of somebody else's edit.
 */
async function updateLocale(
  tx: Executor,
  target: ContentTarget,
  locale: Locale,
  revision: number,
  update: LocaleUpdate,
): Promise<boolean> {
  if (target.kind === "document") {
    const changed = await tx
      .update(documentContent)
      .set({
        ...localeSet(revision, update),
        ...update.stampPublishedAt === true
          ? { publishedAt: sql`coalesce(${documentContent.publishedAt}, ${today()}::date)` }
          : {},
      })
      .where(and(
        eq(documentContent.documentId, target.id),
        eq(documentContent.locale, locale),
        eq(documentContent.revision, revision),
      ))
      .returning({ locale: documentContent.locale })
    return changed.length > 0
  }

  const changed = await tx
    .update(newsContent)
    .set(localeSet(revision, update))
    .where(and(
      eq(newsContent.newsId, target.id),
      eq(newsContent.locale, locale),
      eq(newsContent.revision, revision),
    ))
    .returning({ locale: newsContent.locale })
  return changed.length > 0
}

/**
 * Saving writes the one body there is. **A published page changes the moment
 * it is saved** — there is no draft to hold the words back; a rewrite that
 * must not be read on the way is a new revision under a series.
 */
async function saveLocale(
  tx: Executor,
  target: ContentTarget,
  form: FormData,
): Promise<ContentsResult> {
  const locale = localeOf(form)
  if (locale === null) return { status: "unknown-target" }
  const article = articleFrom(form, locale)
  if (Array.isArray(article)) return { status: "body", problems: article }
  if (article.title === "") return { status: "missing-title" }

  const revision = revisionOf(form)
  if (revision === null) {
    return await insertLocale(tx, target, locale, article, false)
      ? { status: "ok", done: "saved" }
      : { status: "stale" }
  }
  return await updateLocale(tx, target, locale, revision, { content: article })
    ? { status: "ok", done: "saved" }
    : { status: "stale" }
}

/**
 * Publishing takes what the form holds rather than what was last saved: the
 * two buttons sit under the same body, and publishing the version before the
 * one on screen is not something anybody pressing "publish" means.
 *
 * Taking a locale down is a separate form, so it cannot swallow an edit that
 * was never sent.
 */
async function publishLocale(
  tx: Executor,
  target: ContentTarget,
  form: FormData,
  actor: Actor,
): Promise<ContentsResult> {
  const locale = localeOf(form)
  if (locale === null) return { status: "unknown-target" }
  const article = articleFrom(form, locale)
  if (Array.isArray(article)) return { status: "body", problems: article }
  if (article.title === "") return { status: "missing-title" }

  const revision = revisionOf(form)
  const changed = revision === null
    ? await insertLocale(tx, target, locale, article, true)
    : await updateLocale(tx, target, locale, revision, {
        content: article,
        published: true,
        stampPublishedAt: true,
      })
  if (!changed) return { status: "stale" }

  const subject = subjectOf(target)
  await recordEvent(tx, {
    actor,
    action: "publish-site-content",
    subjectType: subject.type,
    subjectId: target.id,
    detail: { ...subject.detail, locale },
  })
  return { status: "ok", done: "published" }
}

async function unpublishLocale(
  tx: Executor,
  target: ContentTarget,
  form: FormData,
  actor: Actor,
): Promise<ContentsResult> {
  const locale = localeOf(form)
  const revision = revisionOf(form)
  if (locale === null || revision === null) return { status: "unknown-target" }

  const changed = await updateLocale(tx, target, locale, revision, { published: false })
  if (!changed) return { status: "stale" }

  const subject = subjectOf(target)
  await recordEvent(tx, {
    actor,
    action: "unpublish-site-content",
    subjectType: subject.type,
    subjectId: target.id,
    detail: { ...subject.detail, locale },
  })
  return { status: "ok", done: "unpublished" }
}

/**
 * Taking the whole thing away: the item, and every language written into it.
 *
 * **What a series points at is refused before anything is deleted.** The
 * version-less address has to keep responding, and the way to remove it is
 * the series' own screen, which takes the pointer with it.
 *
 * **One event for the item rather than one per language**, the way a series
 * records its revisions: what happened is that the item went, and the
 * languages that were public at the time are the detail of it.
 */
async function deleteItem(tx: Executor, target: ContentTarget, actor: Actor): Promise<Applied> {
  if (target.kind === "document") {
    const [pointed] = await tx
      .select({ id: documentSeries.id })
      .from(documentSeries)
      .where(eq(documentSeries.currentId, target.id))
      .limit(1)
    if (pointed !== undefined) return { status: "in-use" }
  }

  const published = target.kind === "document"
    ? await tx
        .select({ locale: documentContent.locale })
        .from(documentContent)
        .where(and(eq(documentContent.documentId, target.id), eq(documentContent.published, true)))
    : await tx
        .select({ locale: newsContent.locale })
        .from(newsContent)
        .where(and(eq(newsContent.newsId, target.id), eq(newsContent.published, true)))

  // **A revision's screen goes back to its series, not to the listing.** The
  // listing has no row for a revision, and the curator who took one out is
  // looking at the rest of them. Read before the row goes, since the slug is
  // what records which series it was under.
  const owner = target.kind === "document"
    ? (await tx.select({ id: documentSeries.id, slug: documentSeries.slug }).from(documentSeries))
        .find((one) => versionNumberIn(one.slug, target.slug) !== null)
    : undefined

  if (target.kind === "document") await tx.delete(document).where(eq(document.id, target.id))
  else await tx.delete(news).where(eq(news.id, target.id))

  if (published.length > 0) {
    const subject = subjectOf(target)
    await recordEvent(tx, {
      actor,
      action: "unpublish-site-content",
      subjectType: subject.type,
      subjectId: target.id,
      detail: { ...subject.detail, deleted: true, locales: published.map((one) => one.locale) },
    })
  }
  return {
    status: "ok",
    goTo: target.kind !== "document"
      ? adminNewsListPath()
      : owner === undefined ? adminDocumentsPath() : adminSeriesPath(owner.id),
  }
}

// --- one document ------------------------------------------------------------

export async function documentAction(
  request: Request,
  documentId: string,
): Promise<ContentsResult> {
  const actor = await requireCapability(request, "manage-site-content")
  const form = await request.formData()
  const intent = text(form, "intent")

  const applied = await getDb().transaction(async (tx): Promise<Applied> => {
    const [row] = await tx
      .select({ id: document.id, slug: document.slug })
      .from(document)
      .where(idIs(document.id, documentId))
      .limit(1)
    if (row === undefined) return { status: "unknown-target" }
    const target: ContentTarget = { kind: "document", id: row.id, slug: row.slug }

    switch (intent) {
      case "rename":
        return renameDocument(tx, target, form)
      case "save":
        return saveLocale(tx, target, form)
      case "publish":
        return publishLocale(tx, target, form, actor)
      case "unpublish":
        return unpublishLocale(tx, target, form, actor)
      case "delete-document":
        return deleteItem(tx, target, actor)
      case "cut-into-version":
        return cutIntoVersion(tx, target, form)
      default:
        return { status: "unknown-target" }
    }
  })
  return settle(request, applied)
}

async function renameDocument(
  tx: Executor,
  target: ContentTarget & { kind: "document" },
  form: FormData,
): Promise<ContentsResult> {
  // **A revision's address is the series' slug and its number**, neither of
  // which is this document's own to change: renaming one would take it out
  // from under its series without the series knowing.
  const series = await tx.select({ slug: documentSeries.slug }).from(documentSeries)
  if (series.some((one) => versionNumberIn(one.slug, target.slug) !== null)) return { status: "not-a-revision" }

  const slug = text(form, "slug")
  if (slug === target.slug) return { status: "ok", done: "renamed" }
  const problem = await guardSlug(tx, slug, target.id)
  if (problem !== null) return { status: problem }
  await tx.update(document).set({ slug, updatedAt: sql`now()` }).where(eq(document.id, target.id))
  return { status: "ok", done: "renamed" }
}

/**
 * Giving a document its first version: the body moves to `{slug}/version/{n}`
 * and the address it had becomes a pointer at it. Nothing is copied, so there
 * is never a moment where the same text is kept at two addresses.
 *
 * The number is typed rather than fixed at 1, because a guideline that is
 * already at `Ver.9` when the portal first learns to version it should not
 * start again from the beginning.
 */
async function cutIntoVersion(
  tx: Executor,
  target: ContentTarget & { kind: "document" },
  form: FormData,
): Promise<ContentsResult> {
  const series = await tx
    .select({ slug: documentSeries.slug, currentId: documentSeries.currentId })
    .from(documentSeries)
  // A revision cannot be split again: it already responds under a pointer, and
  // `{base}/version/3/version/1` is not an address anybody meant to make.
  const already = series.some((one) => one.slug === target.slug
    || one.currentId === target.id
    || versionNumberIn(one.slug, target.slug) !== null)
  if (already) return { status: "not-a-revision" }

  const number = parseVersionNumber(text(form, "number"))
  if (number === null) return { status: "malformed-version" }

  const slug = versionSlug(target.slug, number)
  if (await slugTaken(tx, slug)) return { status: "duplicate-slug" }

  await tx.update(document).set({ slug, updatedAt: sql`now()` }).where(eq(document.id, target.id))
  await tx.insert(documentSeries).values({ slug: target.slug, currentId: target.id })
  return { status: "ok", done: "cut" }
}

// --- news --------------------------------------------------------------------

export async function newsListAction(request: Request): Promise<ContentsResult> {
  await requireCapability(request, "manage-site-content")
  const form = await request.formData()
  if (text(form, "intent") !== "create-news") return { status: "unknown-target" }
  const [created] = await getDb()
    .insert(news)
    // **Undated until somebody dates it.** The date is the announcement's own
    // — what readers see and what the listing orders by — and the moment a
    // curator pressed "create" is not that; an item dated by that press reads
    // as dated on purpose. Nothing can be published under it until it is
    // dated (`newsAction`).
    .values({})
    .returning({ id: news.id })
  if (created === undefined) return { status: "unknown-target" }
  return settle(request, { status: "ok", goTo: adminNewsPath(created.id) })
}

export async function newsAction(request: Request, newsId: string): Promise<ContentsResult> {
  const actor = await requireCapability(request, "manage-site-content")
  const form = await request.formData()
  const intent = text(form, "intent")

  const applied = await getDb().transaction(async (tx): Promise<Applied> => {
    const [row] = await tx
      .select({ id: news.id, publishedAt: news.publishedAt })
      .from(news)
      .where(idIs(news.id, newsId))
      .limit(1)
    if (row === undefined) return { status: "unknown-target" }
    const target: ContentTarget = { kind: "news", id: row.id }

    switch (intent) {
      case "set-date":
        return setNewsDate(tx, row.id, form)
      case "save":
        return saveLocale(tx, target, form)
      case "publish":
        // **Nothing goes out undated.** The public side shows a language only
        // once the item's date has come, so publishing an undated item would
        // set a state that changes nothing; the screen keeps the control
        // shut for the same reason, and this is what holds when it did not.
        if (row.publishedAt === null) return { status: "undated" }
        return publishLocale(tx, target, form, actor)
      case "unpublish":
        return unpublishLocale(tx, target, form, actor)
      case "delete-news":
        return deleteItem(tx, target, actor)
      default:
        return { status: "unknown-target" }
    }
  })
  return settle(request, applied)
}

/**
 * The date an announcement goes out under, as the field sent it.
 *
 * **An empty field clears the date, but not from under a published language.**
 * A published language with no date is a state the public side reads as
 * nothing and the screen reads as "公開中" — the two would disagree, and the
 * only undo is to take the languages down first. Anything else has to be the
 * minute the field is made of — the value reaches here as text, and one that
 * is not is a form that was not the screen's.
 */
async function setNewsDate(tx: Executor, id: string, form: FormData): Promise<ContentsResult> {
  const value = text(form, "publishedAt")
  const stamp = value === "" ? null : stampFromLocalInput(value)
  if (value !== "" && stamp === null) return { status: "unknown-target" }
  if (stamp === null) {
    const [up] = await tx
      .select({ locale: newsContent.locale })
      .from(newsContent)
      .where(and(eq(newsContent.newsId, id), eq(newsContent.published, true)))
      .limit(1)
    if (up !== undefined) return { status: "dated-while-published" }
  }
  await tx.update(news).set({ publishedAt: stamp, updatedAt: sql`now()` }).where(eq(news.id, id))
  return { status: "ok", done: "dated" }
}

const previewSchema = z.object({
  locale: z.enum(["ja", "en"]),
  title: z.string(),
  body: z.string(),
})

/**
 * A body drawn as readers would see it, for the pane beside the form.
 *
 * **The same function the public page runs** (`renderMarkdown`), so what the
 * pane shows is what will be published rather than a second reading of the
 * markdown. **Less the link each heading offers in the margin**: that link
 * hands out the heading's address, and the pane has none to hand — pressed
 * there, it would put the heading's name on the end of the editing screen's
 * address. The ids stay, so a contents list the article writes still lands on
 * its heading in the pane.
 */
function paneHtml(body: string, locale: Locale): string {
  return renderMarkdown(body, locale, { headingLinks: false })
}

/**
 * The typed body drawn for the pane (`paneHtml`). Nothing is written and
 * nothing is looked up: the words come from the form and go back drawn, which
 * is why the address names no article.
 */
export async function articlePreviewAction(request: Request): Promise<ArticleView> {
  await requireCapability(request, "manage-site-content")
  const payload = previewSchema.safeParse(await request.json())
  if (!payload.success) throw new Response(null, { status: 400, statusText: "Bad Request" })
  const { locale, title, body } = payload.data
  return { title, html: paneHtml(body, locale) }
}
