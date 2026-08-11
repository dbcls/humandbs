/**
 * Reading v1's CMS database.
 *
 * The input is one JSON object taken from the staging CMS with the query in
 * `docs/development.md`. Types here describe the rows as they are; everything
 * v2 decides is done in the functions below, so this file stays a faithful
 * reading of the input.
 *
 * Two shapes are dropped rather than carried:
 *
 * - **the screens.** `data-submission`, `data-use` and `contact-us` are pages
 *   the app owns now, not documents. They are what put a button directive and a
 *   flex layout into the markdown dialect in the first place
 * - **the draft rows.** 68 of the 80 are byte-identical shadows of what is
 *   published, and a development database does not need the one that is not
 *
 * A slug with more than one published version becomes one document per version,
 * at the address it already answers at (`{slug}/version/{n}`) — **the newest
 * included**, so none of those addresses is lost — plus a series row at the
 * version-less slug naming the newest. A slug with a single version is just a
 * document: the version machinery is an artefact of v1's CMS rather than
 * something the page carries.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { AlertContent, ArticleContent } from "~/content/types"

import { htmlToMarkdown, rewriteLinks } from "./html"

export interface CmsDocumentVersion {
  locale: string
  versionNumber: number
  status: string
  title: string | null
  content: string | null
  createdAt: string | null
  publishedAt: string | null
}

export interface CmsDocument {
  slug: string
  versions: CmsDocumentVersion[]
}

export interface CmsNewsTranslation {
  locale: string
  title: string
  content: string
}

export interface CmsNews {
  id: string
  publishedAt: string | null
  translations: CmsNewsTranslation[]
}

export interface CmsAlert {
  id: string
  enabled: boolean | null
  translations: { locale: string, content: string }[]
}

export interface CmsDump {
  documents: CmsDocument[]
  news: CmsNews[]
  alerts: CmsAlert[]
}

/** Documents that are screens in v2 and therefore have no row of their own. */
export const SCREEN_SLUGS = ["data-submission", "data-use", "contact-us"]

const INPUT = join(process.cwd(), "migration", "input")

export function loadCms(): CmsDump {
  return JSON.parse(readFileSync(join(INPUT, "cms.json"), "utf8")) as CmsDump
}

const LOCALES = ["ja", "en"] as const
type Locale = (typeof LOCALES)[number]

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

export interface BuiltDocumentContent {
  locale: Locale
  content: ArticleContent
  publishedAt: string | null
}

export interface BuiltDocument {
  slug: string
  contents: BuiltDocumentContent[]
}

export interface BuiltSeries {
  slug: string
  /** The slug of the revision this one currently names. */
  currentSlug: string
}

export interface BuiltSiteDocuments {
  documents: BuiltDocument[]
  series: BuiltSeries[]
}

/** Where a revision of `slug` answers. The shape the pointer looks for. */
export function versionSlug(slug: string, versionNumber: number): string {
  return `${slug}/version/${versionNumber}`
}

function body(version: CmsDocumentVersion): string {
  return rewriteLinks(htmlToMarkdown(version.content ?? ""))
}

/**
 * A date to publish under. The published rows lost their `published_at` in the
 * v1 migration for 34 of them, and `created_at` is the only date left — using
 * today instead would date every historical guideline to this year.
 */
function publishedOn(version: CmsDocumentVersion): string | null {
  const stamp = version.publishedAt ?? version.createdAt
  return stamp === null ? null : stamp.slice(0, 10)
}

export function buildDocuments(documents: CmsDocument[]): BuiltSiteDocuments {
  const built: BuiltDocument[] = []
  const series: BuiltSeries[] = []

  for (const source of documents) {
    if (SCREEN_SLUGS.includes(source.slug)) continue

    const published = source.versions.filter((v) => v.status === "published" && isLocale(v.locale))
    if (published.length === 0) continue

    const byNumber = new Map<number, CmsDocumentVersion[]>()
    for (const version of published) {
      byNumber.set(version.versionNumber, [...byNumber.get(version.versionNumber) ?? [], version])
    }

    const numbered = [...byNumber].sort((a, b) => a[0] - b[0])
    // One version is v1's bookkeeping rather than a revision anybody published:
    // 54 of the 59 documents carry exactly one, and giving each a pointer would
    // put a second address in front of a page that never had one.
    const versioned = numbered.length > 1

    for (const [number, versions] of numbered) {
      built.push({
        slug: versioned ? versionSlug(source.slug, number) : source.slug,
        contents: versions.map((version) => ({
          // `isLocale` above already narrowed this; the filter cannot express it.
          locale: version.locale as Locale,
          content: {
            title: version.title ?? source.slug,
            body: body(version),
          },
          publishedAt: publishedOn(version),
        })),
      })
    }

    const newest = numbered.at(-1)
    if (versioned && newest !== undefined) {
      series.push({ slug: source.slug, currentSlug: versionSlug(source.slug, newest[0]) })
    }
  }

  return { documents: built, series }
}

export interface BuiltNews {
  publishedAt: string | null
  contents: { locale: Locale, content: ArticleContent }[]
}

/**
 * Every item comes across published: v1 has no way to hold an unpublished one,
 * so there is nothing in the input that says otherwise.
 */
export function buildNews(items: CmsNews[]): BuiltNews[] {
  return items.map((item) => ({
    publishedAt: item.publishedAt === null ? null : item.publishedAt.slice(0, 10),
    contents: item.translations.filter((t) => isLocale(t.locale)).map((t) => ({
      locale: t.locale as Locale,
      content: {
        title: t.title,
        body: rewriteLinks(htmlToMarkdown(t.content)),
      },
    })),
  }))
}

export interface BuiltAlert {
  content: AlertContent
  active: boolean
}

/**
 * The banner is one announcement in two languages rather than a row per
 * language, so the translations collapse into a pair. A missing side stays
 * empty and the reader sees the other one.
 */
export function buildAlerts(alerts: CmsAlert[]): BuiltAlert[] {
  return alerts.map((alert) => {
    const text = { ja: "", en: "" }
    for (const translation of alert.translations) {
      if (isLocale(translation.locale)) {
        text[translation.locale] = rewriteLinks(htmlToMarkdown(translation.content))
      }
    }
    return { content: { body: text }, active: alert.enabled === true }
  })
}
