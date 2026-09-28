/**
 * The audit trail as the management front page lists it.
 *
 * The actions are listed here rather than read from the schema's enum because
 * this module is drawn in the browser; `events.test.ts` holds the two lists to
 * one another.
 */

import type { ListingSize } from "~/search/page-size"

/** In the order the filter shows them: publishing, then taking away, then the rest. */
export const EVENT_ACTIONS = [
  "publish-version",
  "replace-version",
  "publish-dataset",
  "pass-publish-check",
  "withdraw-version",
  "delete-research",
  "delete-dataset",
  "discard-draft",
  "pin-label",
  "unpin-label",
  "publish-file",
  "unpublish-file",
  "delete-file",
  "edit-file-label",
  "list-file-on-research-page",
  "unlist-file-on-research-page",
  "publish-site-content",
  "unpublish-site-content",
  "grant-admin",
  "revoke-admin",
] as const

export type EventActionCode = (typeof EVENT_ACTIONS)[number]

export function isEventAction(value: string): value is EventActionCode {
  return (EVENT_ACTIONS as readonly string[]).includes(value)
}

export const EVENT_SUBJECT_KINDS = [
  "research",
  "research-version",
  "dataset",
  "draft",
  "label",
  "file",
  "document",
  "news",
  "alert",
  "admin",
] as const

export type EventSubjectKind = (typeof EVENT_SUBJECT_KINDS)[number]

export interface EventRow {
  id: string
  /** ISO 8601. */
  occurredAt: string
  actor: string
  action: EventActionCode
  subject: {
    kind: EventSubjectKind
    /**
     * What the subject is called now, or what the record wrote when it is gone;
     * null when it is gone and the record wrote no name.
     */
    name: string | null
    /** The research it belongs to, where that research is still there to be opened. */
    researchId: string | null
  }
}

/** How much of an alert's text stands for it: enough to tell two apart, not the notice itself. */
const ALERT_NAME_LENGTH = 40

/**
 * What an alert is called, having no name of its own: the start of its text,
 * Japanese first. Written into the record when the alert changes, so that one
 * deleted since can still be named.
 */
export function alertExcerpt(body: { ja: string, en: string }): string {
  const line = (body.ja.trim() || body.en.trim()).split("\n")[0]?.trim() ?? ""
  return line.length > ALERT_NAME_LENGTH ? `${line.slice(0, ALERT_NAME_LENGTH)}…` : line
}

export interface EventFilter {
  actions: readonly EventActionCode[]
  /** Keycloak subjects. */
  actors: readonly string[]
  from: string | null
  to: string | null
}

export interface EventActorOption {
  sub: string
  /** The name the latest of their records was written under. */
  name: string
  count: number
}

export interface EventListing extends EventFilter {
  rows: EventRow[]
  counts: Record<EventActionCode, number>
  actorOptions: EventActorOption[]
  size: ListingSize
  total: number
  page: number
  pageCount: number
  rangeFrom: number
  rangeTo: number
}

/**
 * The front page's address with the log's conditions written into it. **Only
 * the log's**: the rest of the page has nothing in its address, so the bare
 * `/admin` is the unfiltered log.
 */
export function eventsQuery(query: EventFilter & { size: ListingSize | null, page: number }): string {
  const search = new URLSearchParams()
  for (const action of query.actions) search.append("action", action)
  for (const actor of query.actors) search.append("actor", actor)
  if (query.from !== null) search.set("from", query.from)
  if (query.to !== null) search.set("to", query.to)
  if (query.size !== null) search.set("size", String(query.size))
  if (query.page > 1) search.set("page", String(query.page))
  const written = search.toString()
  return written === "" ? "" : `?${written}`
}
