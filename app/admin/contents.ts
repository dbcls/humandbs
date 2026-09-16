/**
 * The rules the site-content screens run on: what a slug may be, how the tree
 * is shaped, and which revision a series may name.
 *
 * Nothing here reaches the database — this module says what an answer means,
 * and `contents.server.ts` says where the rows are.
 *
 * **A slug is an address**, so the checks here are about the URL space rather
 * than about the text: it has to be shaped like a path, it must not be one a
 * route already owns (a document behind a route is unreachable, not shadowed),
 * and it must not be taken by a document or by a series — the two share one
 * space and no single constraint can span them
 * (`docs/data-model.md` の「サイトコンテンツ」).
 */

import type { Locale } from "~/i18n/locale"
import { SCREEN_PATHS } from "~/public/urls"

/** Lowercase words joined by `/` or `-`, which is the shape v1's slugs have. */
const SLUG = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/

/** `{base}/version/{n}` — where a revision of `base` answers. */
const VERSION = /^(.+)\/version\/(0|[1-9][0-9]*)$/

/**
 * First segments nothing may take. The screens own theirs, and `ja` / `en` are
 * read as the language prefix before a slug is ever looked up, so a document
 * under either is unreachable for the same reason.
 */
const RESERVED = new Set([
  ...SCREEN_PATHS.map((path) => path.split("/")[1] ?? ""),
  "ja",
  "en",
].filter((segment) => segment !== ""))

export type SlugProblem = "malformed-slug" | "reserved-slug"

export function slugProblem(slug: string): SlugProblem | null {
  if (!SLUG.test(slug)) return "malformed-slug"
  const [first = ""] = slug.split("/")
  return RESERVED.has(first) ? "reserved-slug" : null
}

export function versionSlug(base: string, number: number): string {
  return `${base}/version/${number}`
}

/** The revision number this slug carries under `base`, or null if it is not one. */
export function versionNumberIn(base: string, slug: string): number | null {
  const match = VERSION.exec(slug)
  if (match === null) return null
  if (match[1] !== base) return null
  const number = Number(match[2])
  return number >= 1 ? number : null
}

/**
 * The number the next revision of `base` is offered. Numbers are not reused, so
 * it counts from the highest that exists rather than from how many there are.
 *
 * **This is a suggestion rather than the answer.** An author types the number,
 * because the `Ver.` a body announces is not always the count of the revisions
 * before it, and a body that disagrees with its own address is worse than a gap
 * in the numbering.
 */
export function nextVersionNumber(base: string, slugs: readonly string[]): number {
  const numbers = slugs.map((slug) => versionNumberIn(base, slug) ?? 0)
  return Math.max(0, ...numbers) + 1
}

/** The revision number a form carries, or null if what it carries is not one. */
export function parseVersionNumber(input: string): number | null {
  const trimmed = input.trim()
  if (!/^[0-9]+$/.test(trimmed)) return null
  const number = Number(trimmed)
  return number >= 1 ? number : null
}

/** What one language of a document or a news item is up to. */
export interface LocaleState {
  published: boolean
  hasDraft: boolean
}

export type LocaleStates = Record<Locale, LocaleState>

export interface DocumentRow {
  id: string
  slug: string
  title: string
  states: LocaleStates
}

export interface SeriesRow {
  id: string
  slug: string
  currentId: string
  /** Newest first. Every document whose slug is a revision of this one. */
  revisions: DocumentRow[]
}

export type TreeEntry
  = | { kind: "document", depth: number, document: DocumentRow }
    | { kind: "series", depth: number, series: SeriesRow, current: DocumentRow | null }

/**
 * How far under the root this slug sits. `guidelines/data-sharing-guidelines`
 * is one below `guidelines`, which is what makes the listing a tree without
 * anything storing a parent.
 *
 * **It is read from the slug alone, not from what else the listing holds.** The
 * listing can be narrowed and paged, so the entry above this one is not always
 * on screen — a depth counted from its neighbours would move as the reader
 * types.
 */
function depthOf(slug: string): number {
  return slug.split("/").length - 1
}

/**
 * The tree the screen shows: every document that is not a revision, every
 * series, in slug order. **Revisions hang off their series** rather than
 * appearing beside it — 9 revisions of one guideline would otherwise be 9 rows
 * that read like 9 documents.
 */
export function siteTree(documents: readonly DocumentRow[], series: readonly SeriesRow[]): TreeEntry[] {
  const revisions = new Set(series.flatMap((s) => s.revisions.map((r) => r.id)))
  const top: { slug: string, entry: (depth: number) => TreeEntry }[] = [
    ...documents
      .filter((document) => !revisions.has(document.id))
      .map((document) => ({
        slug: document.slug,
        entry: (depth: number): TreeEntry => ({ kind: "document", depth, document }),
      })),
    ...series.map((one) => ({
      slug: one.slug,
      entry: (depth: number): TreeEntry => ({
        kind: "series",
        depth,
        series: one,
        current: one.revisions.find((r) => r.id === one.currentId) ?? null,
      }),
    })),
  ]

  return top
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) => entry.entry(depthOf(entry.slug)))
}

/** What a row of the listing is called and titled, whichever kind it is. */
export function entryNames(entry: TreeEntry): { slug: string, title: string } {
  if (entry.kind === "document") return { slug: entry.document.slug, title: entry.document.title }
  return { slug: entry.series.slug, title: entry.current?.title ?? "" }
}

/**
 * The entries holding what was typed, in either the address or the title.
 *
 * **A series is matched on what its row shows** — its own slug and the title of
 * the revision it points at. The revisions under it are not rows here, and a
 * listing that answered on them would offer a line whose words are nowhere in
 * it.
 */
export function matchingEntries(entries: readonly TreeEntry[], words: string): TreeEntry[] {
  const needle = words.trim().toLowerCase()
  if (needle === "") return [...entries]
  return entries.filter((entry) => {
    const { slug, title } = entryNames(entry)
    return slug.toLowerCase().includes(needle) || title.toLowerCase().includes(needle)
  })
}

/**
 * Whether an article keeps numbered revisions.
 *
 * **This says what kind of row it is rather than what state it is in**: a
 * versioned article's row stands for the pointer and everything under it at
 * once, and a plain one stands for a body.
 */
export type Versioning = "versioned" | "plain"

export const VERSIONINGS: readonly Versioning[] = ["versioned", "plain"]

/** Whether one language of an article answers a reader. */
export type PublishState = "published" | "unpublished"

export const PUBLISH_STATES: readonly PublishState[] = ["published", "unpublished"]

export function isVersioning(value: string): value is Versioning {
  return (VERSIONINGS as readonly string[]).includes(value)
}

export function isPublishState(value: string): value is PublishState {
  return (PUBLISH_STATES as readonly string[]).includes(value)
}

export function emptyStates(): LocaleStates {
  return {
    ja: { published: false, hasDraft: false },
    en: { published: false, hasDraft: false },
  }
}

/**
 * What a row's two languages are up to.
 *
 * **A series wears the states of the revision it points at**, because that is
 * what its address answers with. A pointer naming nothing readable answers in
 * neither language, and is read here as exactly that.
 */
export function entryStates(entry: TreeEntry): LocaleStates {
  if (entry.kind === "document") return entry.document.states
  return entry.current?.states ?? emptyStates()
}

/** Which kind of row this is, which is what one axis of the listing reads. */
export function versioningOf(entry: TreeEntry): Versioning {
  return entry.kind === "series" ? "versioned" : "plain"
}

/** Whether one language of a row answers a reader, which is what the other two read. */
export function publishStateOf(entry: TreeEntry, locale: Locale): PublishState {
  return publishStateIn(entryStates(entry), locale)
}

/**
 * The same read taken from the states alone, for the rows that are not
 * articles. An announcement carries the pair a document does, and the axis a
 * curator narrows either listing by has to mean the same thing on both.
 */
export function publishStateIn(states: LocaleStates, locale: Locale): PublishState {
  return states[locale].published ? "published" : "unpublished"
}

export interface ContentsFilter {
  keyword: string
  /** Which kinds to keep. Empty is every kind, as an untouched axis is. */
  versioning: readonly Versioning[]
  ja: readonly PublishState[]
  en: readonly PublishState[]
}

/**
 * The rows a filter leaves.
 *
 * **The box and the three axes combine as an AND; within an axis the choices
 * are an OR** — the same rule the research listing runs on
 * (`app/admin/listing.ts`). An axis nothing is ticked on narrows nothing, so
 * the bare listing is every article there is.
 */
export function filterEntries(
  entries: readonly TreeEntry[],
  filter: ContentsFilter,
): TreeEntry[] {
  return matchingEntries(entries, filter.keyword).filter((entry) => {
    if (filter.versioning.length > 0 && !filter.versioning.includes(versioningOf(entry))) {
      return false
    }
    for (const [locale, wanted] of [["ja", filter.ja], ["en", filter.en]] as const) {
      if (wanted.length > 0 && !wanted.includes(publishStateOf(entry, locale))) return false
    }
    return true
  })
}

/**
 * The languages in which a version-less slug does not answer. The address is
 * baked into submission metadata held elsewhere, so this is the one way the
 * promise that it keeps answering can break (`docs/editing.md` の
 * 「サイトコンテンツ」).
 */
export function unansweredLocales(
  current: DocumentRow | null,
  locales: readonly Locale[],
): Locale[] {
  if (current === null) return [...locales]
  return locales.filter((locale) => !current.states[locale].published)
}

// === announcements ===

/**
 * One announcement as the listing shows it: the day it is dated, the title it
 * is read by, and what each of its languages is up to.
 *
 * **The title is one string rather than one per language.** The listing is a
 * way to reach an announcement rather than a reading of it, and a row carrying
 * both languages of a sentence is two lines of prose where a curator is
 * scanning for a date.
 */
export interface NewsRow {
  id: string
  title: string
  publishedAt: string | null
  /**
   * Whether the date is still ahead, which is what keeps a published
   * announcement off the public side until it arrives.
   */
  scheduled: boolean
  states: LocaleStates
}

/**
 * The orders the announcements can be read in.
 *
 * **The day it goes out is what an announcement is filed under**, so that is
 * the order the listing opens in, newest first. The title is the other way in:
 * an editor looking for one they wrote does not know its date.
 */
export const NEWS_SORT_KEYS = ["published", "title"] as const

export type NewsSortKey = typeof NEWS_SORT_KEYS[number]

export const NEWS_SORT: NewsSortKey = NEWS_SORT_KEYS[0]

export function isNewsSortKey(value: string | null): value is NewsSortKey {
  return value !== null && (NEWS_SORT_KEYS as readonly string[]).includes(value)
}

/**
 * **Announcements without a day sink to the end whichever way the order runs.**
 * A row with nothing to be measured by has no place on the scale, and treating
 * the absence as a value walks it from one end of the listing to the other
 * every time the direction is turned.
 *
 * **The order is total**: the identity decides between two rows sharing a day
 * or a title, so that a pair does not swap between requests and get read twice
 * across a page boundary.
 */
export function sortedNews(
  rows: readonly NewsRow[],
  sort: NewsSortKey,
  order: "asc" | "desc",
): NewsRow[] {
  const way = order === "asc" ? 1 : -1
  const by = (row: NewsRow): string | null => sort === "title" ? row.title : row.publishedAt
  return [...rows].sort((left, right) => {
    const one = by(left)
    const other = by(right)
    // Ranked apart from the scale rather than at one end of it: a row with
    // nothing to measure would otherwise cross the listing as the way turns.
    if (one === null || other === null) {
      if (one !== other) return one === null ? 1 : -1
    } else if (one !== other) {
      return one < other ? -way : way
    }
    // **The identity settles it, and turns with the order.** The listing read
    // newest first before it offered a choice of order, and two announcements
    // put out at the same minute kept that way round; a tie broken the same
    // way whichever direction the rest of the listing runs would stand out as
    // the one pair reading backwards.
    return left.id < right.id ? -way : way
  })
}

/**
 * Whether an announcement has been given its day.
 *
 * **An undated announcement is one still being written.** The date is what the
 * public listing orders by, so an item without one has nowhere to appear even
 * where its body is published — which makes "no date" the thing about an
 * announcement a curator hunts for rather than reads.
 */
export type NewsDating = "dated" | "undated"

export const NEWS_DATINGS: readonly NewsDating[] = ["dated", "undated"]

export function isNewsDating(value: string): value is NewsDating {
  return (NEWS_DATINGS as readonly string[]).includes(value)
}

/** Which kind of row this is, which is what one axis of the listing reads. */
export function datingOf(row: NewsRow): NewsDating {
  return row.publishedAt === null ? "undated" : "dated"
}

export interface NewsFilter {
  keyword: string
  /** Which to keep. Empty is every one, as an untouched axis is. */
  dating: readonly NewsDating[]
  ja: readonly PublishState[]
  en: readonly PublishState[]
}

/**
 * The announcements a filter leaves.
 *
 * **What is typed is looked for in the date as well as the title**, because the
 * date is what an announcement is addressed by here: `2026-06` is how a month
 * of them is asked for, and the listing offers no other way to ask. **The two
 * are read one at a time** rather than as one line, so that a word ending a
 * date and beginning a title is not a match neither of them holds.
 *
 * The box and the three axes combine as an AND; within an axis the choices are
 * an OR — the rule the other listings run on (`app/admin/listing.ts`).
 */
export function filterNewsRows(rows: readonly NewsRow[], filter: NewsFilter): NewsRow[] {
  const needle = filter.keyword.trim().toLowerCase()
  return rows.filter((row) => {
    if (needle !== "") {
      const held = [row.publishedAt ?? "", row.title]
      if (!held.some((one) => one.toLowerCase().includes(needle))) return false
    }
    if (filter.dating.length > 0 && !filter.dating.includes(datingOf(row))) return false
    for (const [locale, wanted] of [["ja", filter.ja], ["en", filter.en]] as const) {
      if (wanted.length > 0 && !wanted.includes(publishStateIn(row.states, locale))) return false
    }
    return true
  })
}
