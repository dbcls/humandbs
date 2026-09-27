/**
 * When a research and its drafts were written on the old site.
 *
 * The old site kept each version of a research as a page and a release note
 * page, in each language, and a draft as the pages of a version above the
 * latest published one. A research was first written when its first page was;
 * a draft was first written when its first page was and last edited when one of
 * its pages last was. The site stored the times in UTC.
 */

import { versionArticleOf, type PageArticle } from "./research-pages"

export interface DatedArticle extends PageArticle {
  /** `2023-11-06 08:12:47.000000`, in UTC. */
  created: string
  /** As `created`; the site wrote `0000-00-00 00:00:00` for a page never edited. */
  modified: string
}

export interface Written {
  created: Date
  updated: Date
}

export interface OldDates {
  /** When the research's first page was written, on either site. */
  researchCreated: (humId: string) => Date | null
  /** When the pages of the research's versions above `latestPublished` were first written and last edited. */
  draftWritten: (humId: string, latestPublished: number) => Written | null
}

/** A time the site stored, or null for its zero time and anything unreadable. */
export function siteTime(value: string): Date | null {
  const found = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/.exec(value)
  if (found === null || found[1]?.startsWith("0000")) return null
  const time = new Date(`${found[1]}T${found[2]}Z`)
  return Number.isNaN(time.getTime()) ? null : time
}

export function oldDates(articles: Iterable<DatedArticle>): OldDates {
  const pages = new Map<string, { version: number, created: Date, updated: Date }[]>()
  for (const article of articles) {
    const of = versionArticleOf(article)
    const created = siteTime(article.created)
    if (of === null || created === null) continue
    const modified = siteTime(article.modified)
    const updated = modified === null || modified < created ? created : modified
    pages.set(of.humId, [...(pages.get(of.humId) ?? []), { version: of.version, created, updated }])
  }
  const earliest = (times: Date[]) => new Date(Math.min(...times.map((time) => time.getTime())))
  const latest = (times: Date[]) => new Date(Math.max(...times.map((time) => time.getTime())))
  return {
    researchCreated: (humId) => {
      const held = pages.get(humId) ?? []
      return held.length === 0 ? null : earliest(held.map((one) => one.created))
    },
    draftWritten: (humId, latestPublished) => {
      const held = (pages.get(humId) ?? []).filter((one) => one.version > latestPublished)
      if (held.length === 0) return null
      return { created: earliest(held.map((one) => one.created)), updated: latest(held.map((one) => one.updated)) }
    },
  }
}
