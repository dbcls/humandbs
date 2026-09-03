/**
 * The site-content screens: what they read, and what their forms do.
 *
 * Everything here asks for `manage-site-content`. What is written down is the
 * publishing — a guideline going out or coming down is a change to what readers
 * see, which is what the audit trail is for (`docs/publishing.md` の「証跡」) —
 * while writing a draft, renaming a slug and moving a pointer are not.
 *
 * **Editing always writes the draft, and publishing moves it across.** One path
 * rather than two, so "what is published" is never something an edit can change
 * by accident. A locale that has never been published still has a draft; its
 * published body is an empty article nobody can reach.
 *
 * **A slug is an address and the space spans two tables**, so every write that
 * introduces or moves one checks both (`app/admin/contents.ts`).
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { redirect } from "react-router"

import { requireCapability } from "~/auth/actor.server"
import type { Actor } from "~/auth/capabilities"
import { recordEvent } from "~/auth/events.server"
import { checkArticleBody, type ArticleSyntax } from "~/content/article.server"
import type { ArticleContent } from "~/content/types"
import { getDb, type Executor } from "~/db/client.server"
import { alert, document, documentContent, documentSeries, news, newsContent } from "~/db/schema"
import { LOCALES, type Locale } from "~/i18n/locale"
import { isLocale } from "~/i18n/locale"
import { href, readLocale } from "~/public/urls"

import { today } from "~/dates"
import {
  adminContentsPath,
  adminDocumentPath,
  adminNewsListPath,
  adminNewsPath,
} from "./urls"
import {
  parseVersionNumber,
  siteTree,
  slugProblem,
  unansweredLocales,
  versionNumberIn,
  versionSlug,
  type DocumentRow,
  type LocaleStates,
  type SeriesRow,
  type TreeEntry,
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
  = | "malformed-slug"
    | "reserved-slug"
    | "duplicate-slug"
    | "missing-title"
    | "missing-translation"
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

export type ContentsResult
  = | { status: "ok" }
    | { status: ContentsProblem }
    | { status: "body", problems: BodyProblem[] }

export interface AlertRow {
  id: string
  active: boolean
  ja: string
  en: string
}

export interface ContentsView {
  locale: Locale
  tree: TreeEntry[]
  /** Version-less slugs whose current revision does not answer in some language. */
  unanswered: { slug: string, locales: Locale[] }[]
  alerts: AlertRow[]
}

export interface LocaleEditor {
  locale: Locale
  published: boolean
  publishedAt: string | null
  /** What readers see now. Empty until the first publish. */
  title: string
  body: string
  /** What the form holds: the draft if there is one, otherwise what is published. */
  draftTitle: string
  draftBody: string
  hasDraft: boolean
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

export interface NewsSummary {
  id: string
  title: string
  publishedAt: string | null
  states: LocaleStates
}

export interface NewsListView {
  locale: Locale
  items: NewsSummary[]
  page: number
  pageCount: number
}

export interface NewsView {
  locale: Locale
  id: string
  publishedAt: string | null
  editors: LocaleEditor[]
}

const NEWS_PER_PAGE = 20

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

function emptyStates(): LocaleStates {
  return {
    ja: { published: false, hasDraft: false },
    en: { published: false, hasDraft: false },
  }
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
  hasDraft: boolean | null
  title: string | null
}

async function documentRows(db: Executor): Promise<DocumentRow[]> {
  const rows: ContentRow[] = await db
    .select({
      id: document.id,
      slug: document.slug,
      locale: documentContent.locale,
      published: documentContent.published,
      hasDraft: sql<boolean>`${documentContent.draftContent} is not null`,
      title: sql<string>`coalesce(${documentContent.draftContent}, ${documentContent.content})->>'title'`,
    })
    .from(document)
    .leftJoin(documentContent, eq(documentContent.documentId, document.id))
    .orderBy(asc(document.slug))

  const byId = new Map<string, DocumentRow>()
  for (const row of rows) {
    const found = byId.get(row.id)
      ?? { id: row.id, slug: row.slug, title: "", states: emptyStates() }
    if (row.locale !== null) {
      found.states[row.locale] = {
        published: row.published === true,
        hasDraft: row.hasDraft === true,
      }
      // Japanese names the page; English does when there is no Japanese side.
      if (found.title === "" || row.locale === "ja") found.title = row.title ?? ""
    }
    byId.set(row.id, found)
  }
  return [...byId.values()]
}

async function seriesRows(db: Executor, documents: readonly DocumentRow[]): Promise<SeriesRow[]> {
  const rows = await db
    .select({ id: documentSeries.id, slug: documentSeries.slug, currentId: documentSeries.currentId })
    .from(documentSeries)
    .orderBy(asc(documentSeries.slug))

  return rows.map((row) => ({
    ...row,
    revisions: documents
      .filter((one) => versionNumberIn(row.slug, one.slug) !== null)
      .sort((a, b) => (versionNumberIn(row.slug, b.slug) ?? 0) - (versionNumberIn(row.slug, a.slug) ?? 0)),
  }))
}

export async function contentsPage(request: Request): Promise<ContentsView> {
  await requireCapability(request, "manage-site-content")
  const db = getDb()
  const documents = await documentRows(db)
  const series = await seriesRows(db, documents)
  const alerts = await db
    .select({ id: alert.id, active: alert.active, content: alert.content })
    .from(alert)
    .orderBy(asc(alert.createdAt))

  const tree = siteTree(documents, series)
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    tree,
    unanswered: tree.flatMap((entry) => {
      if (entry.kind !== "series") return []
      const locales = unansweredLocales(entry.current, LOCALES)
      return locales.length === 0 ? [] : [{ slug: entry.series.slug, locales }]
    }),
    alerts: alerts.map((row) => ({
      id: row.id,
      active: row.active,
      ja: row.content.body.ja,
      en: row.content.body.en,
    })),
  }
}

function editorsFrom(rows: {
  locale: Locale
  content: ArticleContent
  draftContent: ArticleContent | null
  published: boolean
  publishedAt?: string | null
  revision: number
}[]): LocaleEditor[] {
  return LOCALES.map((locale) => {
    const row = rows.find((one) => one.locale === locale)
    const draft = row?.draftContent ?? row?.content ?? EMPTY_ARTICLE
    return {
      locale,
      published: row?.published ?? false,
      publishedAt: row?.publishedAt ?? null,
      title: row?.content.title ?? "",
      body: row?.content.body ?? "",
      draftTitle: draft.title,
      draftBody: draft.body,
      hasDraft: row?.draftContent != null,
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
    // The address carries a uuid; anything else is not a document rather than a
    // malformed request for one.
    .where(idIs(document.id, documentId))
    .limit(1)
  if (row === undefined) return null

  const contents = await db
    .select({
      locale: documentContent.locale,
      content: documentContent.content,
      draftContent: documentContent.draftContent,
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

export async function newsListPage(request: Request): Promise<NewsListView> {
  await requireCapability(request, "manage-site-content")
  const db = getDb()
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1)

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(news)
  const pageCount = Math.max(1, Math.ceil((total?.count ?? 0) / NEWS_PER_PAGE))
  const at = Math.min(page, pageCount)

  // The page is taken from the items and their locales fetched after, rather
  // than from the join: a row per locale would make the page size depend on how
  // many languages each item happens to have.
  const rows = await db
    .select({ id: news.id, publishedAt: news.publishedAt })
    .from(news)
    // Undated items are the ones being written, so they sit at the top.
    .orderBy(desc(news.publishedAt), desc(news.id))
    .limit(NEWS_PER_PAGE)
    .offset((at - 1) * NEWS_PER_PAGE)

  const items = new Map<string, NewsSummary>(rows.map((row) => [
    row.id,
    { id: row.id, title: "", publishedAt: row.publishedAt, states: emptyStates() },
  ]))

  const contents = items.size === 0
    ? []
    : await db
        .select({
          id: newsContent.newsId,
          locale: newsContent.locale,
          published: newsContent.published,
          hasDraft: sql<boolean>`${newsContent.draftContent} is not null`,
          title: sql<string>`coalesce(${newsContent.draftContent}, ${newsContent.content})->>'title'`,
        })
        .from(newsContent)
        .where(inArray(newsContent.newsId, [...items.keys()]))

  for (const row of contents) {
    const found = items.get(row.id)
    if (found === undefined) continue
    found.states[row.locale] = { published: row.published, hasDraft: row.hasDraft }
    if (found.title === "" || row.locale === "ja") found.title = row.title
  }

  return {
    locale: readLocale(url.pathname).locale,
    items: [...items.values()],
    page: at,
    pageCount,
  }
}

export async function newsPage(request: Request, newsId: string): Promise<NewsView | null> {
  await requireCapability(request, "manage-site-content")
  const db = getDb()
  const [row] = await db
    .select({ id: news.id, publishedAt: news.publishedAt })
    .from(news)
    .where(idIs(news.id, newsId))
    .limit(1)
  if (row === undefined) return null

  const contents = await db
    .select({
      locale: newsContent.locale,
      content: newsContent.content,
      draftContent: newsContent.draftContent,
      published: newsContent.published,
      revision: newsContent.revision,
    })
    .from(newsContent)
    .where(eq(newsContent.newsId, row.id))

  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    id: row.id,
    publishedAt: row.publishedAt,
    editors: editorsFrom(contents),
  }
}

// --- writing -----------------------------------------------------------------

/** Whether either table already answers at this address. */
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
type Applied = ContentsResult & { goTo?: string }

function settle(request: Request, applied: Applied): ContentsResult {
  if (applied.goTo === undefined) return applied
  const { locale } = readLocale(new URL(request.url).pathname)
  throw redirect(href(locale, applied.goTo))
}

export async function contentsAction(request: Request): Promise<ContentsResult> {
  const actor = await requireCapability(request, "manage-site-content")
  const form = await request.formData()
  const intent = text(form, "intent")

  const applied = await getDb().transaction(async (tx): Promise<Applied> => {
    switch (intent) {
      case "create-document":
        return createDocument(tx, form)
      case "repoint-series":
        return repointSeries(tx, form)
      case "add-version":
        return addVersion(tx, form)
      case "delete-series":
        return deleteSeries(tx, form, actor)
      case "create-alert":
        return createAlert(tx)
      case "update-alert":
        return updateAlert(tx, form, actor)
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

async function repointSeries(tx: Executor, form: FormData): Promise<ContentsResult> {
  const seriesId = text(form, "seriesId")
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
  // Only a revision of this series may be named: the pointer says which version
  // is current, not which page to show.
  if (versionNumberIn(series.slug, target.slug) === null) return { status: "not-a-revision" }

  await tx
    .update(documentSeries)
    .set({ currentId: target.id })
    .where(eq(documentSeries.id, series.id))
  return { status: "ok" }
}

/**
 * The next revision, empty, ready to be written and then pointed at. The number
 * comes from the form; the screen only fills the box with the one that follows.
 */
async function addVersion(tx: Executor, form: FormData): Promise<Applied> {
  const seriesId = text(form, "seriesId")
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
 * address it left behind used to answer with. So a series is either kept or
 * removed whole. One at a time would not do either: the revision the pointer
 * names cannot be deleted on its own, so it would be the one thing left with
 * nothing left to point at it.
 */
async function deleteSeries(tx: Executor, form: FormData, actor: Actor): Promise<Applied> {
  const seriesId = text(form, "seriesId")
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

  // The pointer goes first: it names a revision and refuses to let it go.
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
  return { status: "ok", goTo: adminContentsPath() }
}

async function createAlert(tx: Executor): Promise<ContentsResult> {
  await tx.insert(alert).values({ content: { body: { ja: "", en: "" } }, active: false })
  return { status: "ok" }
}

async function updateAlert(
  tx: Executor,
  form: FormData,
  actor: Actor,
): Promise<ContentsResult> {
  const id = text(form, "alertId")
  const active = form.get("active") !== null
  const [before] = await tx
    .select({ id: alert.id, active: alert.active })
    .from(alert)
    .where(idIs(alert.id, id))
    .limit(1)
  if (before === undefined) return { status: "unknown-target" }

  const ja = body(form, "ja")
  const en = body(form, "en")
  const problems = [
    ...checkArticleBody(ja).map((problem) => ({ locale: "ja" as const, ...problem })),
    ...checkArticleBody(en).map((problem) => ({ locale: "en" as const, ...problem })),
  ]
  if (problems.length > 0) return { status: "body", problems }

  // **A banner that is up has to be up in both languages.** It stands on every
  // page of the site, so a reader on the language that is missing is handed a
  // box they cannot read — and the announcement it holds is the kind that is
  // worth a banner. Only switching one on is held to this: an announcement can
  // be written a language at a time while it is off.
  if (active && (ja === "" || en === "")) return { status: "missing-translation" }

  await tx
    .update(alert)
    .set({ content: { body: { ja, en } }, active })
    .where(eq(alert.id, before.id))
  if (active !== before.active) {
    await recordEvent(tx, {
      actor,
      action: active ? "publish-site-content" : "unpublish-site-content",
      subjectType: "alert",
      subjectId: before.id,
    })
  }
  return { status: "ok" }
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
  return { status: "ok" }
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
 * carried no revision is saying "there was no row when I was drawn", and if
 * there is one now that claim is as stale as a revision that no longer matches.
 */
async function insertLocale(
  tx: Executor,
  target: ContentTarget,
  locale: Locale,
  article: ArticleContent,
  published: boolean,
): Promise<boolean> {
  const values = {
    locale,
    content: published ? article : EMPTY_ARTICLE,
    draftContent: published ? null : article,
    published,
  }
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
  draftContent?: ArticleContent | null
  published?: boolean
  /** Documents only: the day it first went out. */
  stampPublishedAt?: boolean
}

/**
 * What a write to a locale sets, whichever of the two tables holds it. The two
 * tables carry the same columns, so the shape of a save is decided here and the
 * branches below differ only in which table and which owner column they name —
 * which is the part the ORM's types cannot be made to share.
 */
function localeSet(revision: number, update: LocaleUpdate) {
  return {
    ...update.content === undefined ? {} : { content: update.content },
    ...update.draftContent === undefined ? {} : { draftContent: update.draftContent },
    ...update.published === undefined ? {} : { published: update.published },
    revision: revision + 1,
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

async function saveDraft(
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
      ? { status: "ok" }
      : { status: "stale" }
  }
  return await updateLocale(tx, target, locale, revision, { draftContent: article })
    ? { status: "ok" }
    : { status: "stale" }
}

/**
 * Publishing takes what the form holds rather than what was last saved: the
 * two buttons sit under the same body, and publishing the version before the
 * one on screen is not something anybody pressing "publish" means.
 *
 * Taking a locale down and discarding its draft are a separate form, so they
 * cannot swallow an edit that was never sent.
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
        draftContent: null,
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
  return { status: "ok" }
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
  return { status: "ok" }
}

async function discardDraft(
  tx: Executor,
  target: ContentTarget,
  form: FormData,
): Promise<ContentsResult> {
  const locale = localeOf(form)
  const revision = revisionOf(form)
  if (locale === null || revision === null) return { status: "unknown-target" }
  return await updateLocale(tx, target, locale, revision, { draftContent: null })
    ? { status: "ok" }
    : { status: "stale" }
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
      case "save-draft":
        return saveDraft(tx, target, form)
      case "publish":
        return publishLocale(tx, target, form, actor)
      case "unpublish":
        return unpublishLocale(tx, target, form, actor)
      case "discard-draft":
        return discardDraft(tx, target, form)
      case "cut-into-version":
        return cutIntoVersion(tx, target, form)
      case "delete-document":
        return deleteDocument(tx, target, actor)
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
  const slug = text(form, "slug")
  if (slug === target.slug) return { status: "ok" }
  const problem = await guardSlug(tx, slug, target.id)
  if (problem !== null) return { status: problem }
  await tx.update(document).set({ slug }).where(eq(document.id, target.id))
  return { status: "ok" }
}

/**
 * Giving a document its first version: the body moves to `{slug}/version/{n}`
 * and the address it had becomes a pointer at it. Nothing is copied, so there
 * is never a moment where the same text lives at two addresses.
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
  // A revision cannot be split again: it already answers under a pointer, and
  // `{base}/version/3/version/1` is not an address anybody meant to make.
  const already = series.some((one) => one.slug === target.slug
    || one.currentId === target.id
    || versionNumberIn(one.slug, target.slug) !== null)
  if (already) return { status: "not-a-revision" }

  const number = parseVersionNumber(text(form, "number"))
  if (number === null) return { status: "malformed-version" }

  const slug = versionSlug(target.slug, number)
  if (await slugTaken(tx, slug)) return { status: "duplicate-slug" }

  await tx.update(document).set({ slug }).where(eq(document.id, target.id))
  await tx.insert(documentSeries).values({ slug: target.slug, currentId: target.id })
  return { status: "ok" }
}

async function deleteDocument(
  tx: Executor,
  target: ContentTarget & { kind: "document" },
  actor: Actor,
): Promise<Applied> {
  const [pointed] = await tx
    .select({ id: documentSeries.id })
    .from(documentSeries)
    .where(eq(documentSeries.currentId, target.id))
    .limit(1)
  // The version-less address has to keep answering, so the revision it names
  // cannot be taken away underneath it.
  if (pointed !== undefined) return { status: "in-use" }

  const published = await tx
    .select({ locale: documentContent.locale })
    .from(documentContent)
    .where(and(eq(documentContent.documentId, target.id), eq(documentContent.published, true)))

  await tx.delete(document).where(eq(document.id, target.id))
  if (published.length > 0) {
    await recordEvent(tx, {
      actor,
      action: "unpublish-site-content",
      subjectType: "document",
      subjectId: target.id,
      detail: { slug: target.slug, deleted: true, locales: published.map((one) => one.locale) },
    })
  }
  return { status: "ok", goTo: adminContentsPath() }
}

// --- news --------------------------------------------------------------------

export async function newsListAction(request: Request): Promise<ContentsResult> {
  await requireCapability(request, "manage-site-content")
  const form = await request.formData()
  if (text(form, "intent") !== "create-news") return { status: "unknown-target" }
  const [created] = await getDb()
    .insert(news)
    .values({ publishedAt: today() })
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
      .select({ id: news.id })
      .from(news)
      .where(idIs(news.id, newsId))
      .limit(1)
    if (row === undefined) return { status: "unknown-target" }
    const target: ContentTarget = { kind: "news", id: row.id }

    switch (intent) {
      case "set-date":
        return setNewsDate(tx, row.id, form)
      case "save-draft":
        return saveDraft(tx, target, form)
      case "publish":
        return publishLocale(tx, target, form, actor)
      case "unpublish":
        return unpublishLocale(tx, target, form, actor)
      case "discard-draft":
        return discardDraft(tx, target, form)
      case "delete-news":
        return deleteNews(tx, row.id, actor)
      default:
        return { status: "unknown-target" }
    }
  })
  return settle(request, applied)
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function setNewsDate(tx: Executor, id: string, form: FormData): Promise<ContentsResult> {
  const value = text(form, "publishedAt")
  if (value !== "" && !DATE.test(value)) return { status: "unknown-target" }
  await tx.update(news).set({ publishedAt: value === "" ? null : value }).where(eq(news.id, id))
  return { status: "ok" }
}

async function deleteNews(tx: Executor, id: string, actor: Actor): Promise<Applied> {
  const published = await tx
    .select({ locale: newsContent.locale })
    .from(newsContent)
    .where(and(eq(newsContent.newsId, id), eq(newsContent.published, true)))

  await tx.delete(news).where(eq(news.id, id))
  if (published.length > 0) {
    await recordEvent(tx, {
      actor,
      action: "unpublish-site-content",
      subjectType: "news",
      subjectId: id,
      detail: { deleted: true, locales: published.map((one) => one.locale) },
    })
  }
  return { status: "ok", goTo: adminNewsListPath() }
}
