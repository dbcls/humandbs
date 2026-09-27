/**
 * The Slack message: what data providers did in the review, and what was
 * published, since the last message.
 *
 * **Counts and names, never what was written.** A comment is reported as
 * having been left, by whom, on which draft — not its text and not its place.
 * Knowing that one has come is what the message is for, and the text stays in
 * the portal rather than in a service outside it.
 *
 * Japanese only: the channel is read by the office.
 */

import { draftNameShown } from "~/admin/draft-name"
import type { EventActionCode, EventSubjectKind } from "~/admin/events"
import { firstSentence } from "~/components/review"
import type { AcknowledgementKind } from "~/content/types"
import { LOCALES, type Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

/** The operations of the event log the message reports. */
export const NOTIFIED_ACTIONS = ["publish-version", "replace-version", "publish-site-content"] as const satisfies readonly EventActionCode[]

export type NotifiedAction = (typeof NOTIFIED_ACTIONS)[number]

/** One comment written through a share link by somebody who is not an administrator. */
export interface CommentRecord {
  draftId: string
  researchId: string
  humLabel: string | null
  draftName: string
  authorName: string
  /** Written while signed in. One who was not is shown with `(anonymous)`, as on the review screen. */
  signedIn: boolean
}

/** One press of a review button by somebody who is not an administrator. */
export interface PressRecord {
  draftId: string
  researchId: string
  humLabel: string | null
  draftName: string
  kind: AcknowledgementKind
}

/** A draft and what happened in its review, in the order the draft was first seen. */
export interface ReviewActivity {
  draftId: string
  researchId: string
  humLabel: string | null
  draftName: string
  comments: number
  /** Everybody who wrote, once each, in the order they first wrote. */
  commenters: string[]
  presses: Record<AcknowledgementKind, number>
}

/** One record of the event log the message reports. */
export interface PublishedRow {
  action: NotifiedAction
  kind: EventSubjectKind
  subjectId: string
  /** What the event log on the management front page calls it; null when that has no name for it. */
  name: string | null
  actor: string
  /** The language an article or an announcement was published in; null for what is published in both at once. */
  locale: Locale | null
  /** The public page, without the language prefix; null when it cannot be told. */
  path: string | null
}

/** What was published, a line each: the records of one subject by one person, whichever languages they cover. */
export interface PublishRecord {
  action: NotifiedAction
  kind: EventSubjectKind
  name: string | null
  actor: string
  path: string | null
  /** The languages published, in the site's order; empty for what has no language of its own. */
  locales: Locale[]
}

/** More than this many lines under one heading are summed up as a count, so that a backlog stays one readable message. */
export const LINES_PER_HEADING = 30

/**
 * More than this many people on a draft's line are summed up as a count. **The
 * names are typed by whoever holds the link**, as many as they like, and a
 * message Slack refuses for its length is not sent at all — nor is anything
 * after it, which waits behind it.
 */
export const COMMENTERS_PER_LINE = 10

const WORDS = {
  review: "レビュー",
  publish: "公開",
  comments: (count: number) => `コメント ${count} 件`,
  pressed: (button: string, count: number) => `「${button}」${count} 回`,
  more: (count: number) => `ほか ${count} 件`,
  morePeople: (count: number) => `ほか ${count} 人`,
}

/**
 * The comments and presses gathered by draft. A draft appears once, where it
 * first appears in either list; the counts are how many rows each has.
 */
export function reviewActivities(comments: readonly CommentRecord[], presses: readonly PressRecord[]): ReviewActivity[] {
  const anonymous = messagesFor("ja").comment.anonymous
  const byDraft = new Map<string, ReviewActivity>()
  const seen = new Map<string, Set<string>>()
  const activityOf = (row: CommentRecord | PressRecord): ReviewActivity => {
    const known = byDraft.get(row.draftId)
    if (known !== undefined) return known
    const created: ReviewActivity = {
      draftId: row.draftId,
      researchId: row.researchId,
      humLabel: row.humLabel,
      draftName: row.draftName,
      comments: 0,
      commenters: [],
      presses: { commented: 0, approved: 0 },
    }
    byDraft.set(row.draftId, created)
    return created
  }
  for (const row of comments) {
    const activity = activityOf(row)
    activity.comments += 1
    const shown = row.signedIn ? row.authorName : `${row.authorName} (${anonymous})`
    const names = seen.get(row.draftId) ?? new Set<string>()
    seen.set(row.draftId, names)
    if (!names.has(shown)) {
      names.add(shown)
      activity.commenters.push(shown)
    }
  }
  for (const row of presses) {
    activityOf(row).presses[row.kind] += 1
  }
  return [...byDraft.values()]
}

/**
 * The records gathered by subject. An article and an announcement are
 * published a language at a time, and publishing the Japanese and then the
 * English is one piece of news, so it is one line.
 */
export function publishRecords(rows: readonly PublishedRow[]): PublishRecord[] {
  const byKey = new Map<string, PublishRecord>()
  for (const row of rows) {
    const key = JSON.stringify([row.action, row.kind, row.subjectId, row.actor])
    const known = byKey.get(key)
    if (known === undefined) {
      byKey.set(key, {
        action: row.action,
        kind: row.kind,
        name: row.name,
        actor: row.actor,
        path: row.path,
        locales: row.locale === null ? [] : [row.locale],
      })
    } else if (row.locale !== null && !known.locales.includes(row.locale)) {
      known.locales = LOCALES.filter((locale) => locale === row.locale || known.locales.includes(locale))
    }
  }
  return [...byKey.values()]
}

/**
 * Slack reads `&`, `<` and `>` as markup — `<!channel>` notifies everybody —
 * so every word somebody typed is escaped before it goes in.
 */
export function escapeSlack(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function link(url: string, text: string): string {
  return `<${url}|${escapeSlack(text)}>`
}

/** `hum0006 / v7 予定`: the research, then the draft, as the draft's screens are titled. */
function draftTitle(activity: ReviewActivity): string {
  const research = activity.humLabel ?? messagesFor("ja").admin.editor.placeUnpinnedResearch
  return `${research} / ${draftNameShown(activity.draftName, "ja")}`
}

/** A button by its first sentence, as the review screen names the table of who pressed it. */
function buttonName(kind: AcknowledgementKind): string {
  const words = messagesFor("ja").preview
  return firstSentence(kind === "commented" ? words.commented : words.approved)
}

function reviewLine(activity: ReviewActivity, origin: string): string {
  const url = `${origin}/admin/research/${activity.researchId}/draft/${activity.draftId}/review`
  const parts: string[] = []
  if (activity.comments > 0) {
    const named = activity.commenters.slice(0, COMMENTERS_PER_LINE)
    const rest = activity.commenters.length - named.length
    const people = rest > 0 ? [...named, WORDS.morePeople(rest)] : named
    parts.push(`${WORDS.comments(activity.comments)} (${escapeSlack(people.join("、"))})`)
  }
  for (const kind of ["commented", "approved"] as const) {
    const count = activity.presses[kind]
    if (count > 0) parts.push(WORDS.pressed(buttonName(kind), count))
  }
  return `• ${link(url, draftTitle(activity))}: ${parts.join("、")}`
}

/**
 * The public page is linked: from the name, or — for what is published a
 * language at a time — from each language published, since the page is there
 * only in those.
 */
function publishLine(record: PublishRecord, origin: string): string {
  const events = messagesFor("ja").admin.events
  const name = record.name ?? events.gone
  const { path } = record
  const linked = path === null || record.locales.length > 0 ? escapeSlack(name) : link(`${origin}${path}`, name)
  const subject = record.kind === "research-version" ? linked : `${events.kinds[record.kind]}「${linked}」`
  const languages = path === null
    ? []
    : record.locales.map((locale) => link(`${origin}${href(locale, path)}`, locale))
  const pages = languages.length === 0 ? "" : ` ${languages.join(" / ")}`
  return `• ${events.actions[record.action]}: ${subject}${pages} (${escapeSlack(record.actor)})`
}

function section(heading: string, lines: string[]): string[] {
  if (lines.length === 0) return []
  const shown = lines.length > LINES_PER_HEADING ? lines.slice(0, LINES_PER_HEADING - 1) : lines
  const rest = lines.length - shown.length
  return [`*${heading}*`, ...shown, ...(rest > 0 ? [`• ${WORDS.more(rest)}`] : [])]
}

/**
 * The text of one message, or null when nothing happened — no message is sent
 * for a quiet interval. `origin` is the site's own, which the links open.
 */
export function slackText(
  input: { reviews: readonly ReviewActivity[], publishes: readonly PublishRecord[] },
  origin: string,
): string | null {
  const lines = [
    ...section(WORDS.review, input.reviews.map((activity) => reviewLine(activity, origin))),
    ...section(WORDS.publish, input.publishes.map((record) => publishLine(record, origin))),
  ]
  return lines.length === 0 ? null : lines.join("\n")
}
