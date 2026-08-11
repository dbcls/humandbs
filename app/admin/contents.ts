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
 * The address the next revision of `base` takes. Numbers are not reused, so it
 * counts from the highest that exists rather than from how many there are.
 */
export function nextVersionSlug(base: string, slugs: readonly string[]): string {
  const numbers = slugs.map((slug) => versionNumberIn(base, slug) ?? 0)
  return versionSlug(base, Math.max(0, ...numbers) + 1)
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
 * How many entries above this one are prefixes of its slug. `guidelines` sits
 * above `guidelines/data-sharing-guidelines`, which is what makes the listing a
 * tree without anything storing a parent.
 */
function depthOf(slug: string, slugs: ReadonlySet<string>): number {
  const segments = slug.split("/")
  let depth = 0
  for (let i = 1; i < segments.length; i += 1) {
    if (slugs.has(segments.slice(0, i).join("/"))) depth += 1
  }
  return depth
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

  const slugs = new Set(top.map((entry) => entry.slug))
  return top
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) => entry.entry(depthOf(entry.slug, slugs)))
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
