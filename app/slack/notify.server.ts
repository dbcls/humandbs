/**
 * Sending the Slack message: reading what has happened since the last one,
 * and moving the point read up to once Slack has accepted it.
 *
 * **Apart from the operations.** Nothing that writes a comment or publishes
 * waits for Slack or knows it exists; the message is made afterwards from the
 * rows those operations wrote. An operation succeeds while Slack is down, and
 * what Slack refused goes out with the next message.
 */

import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm"

import type { EventSubjectKind } from "~/admin/events"
import { namedRows } from "~/admin/events.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { lastBoundaryInJst } from "~/dates"
import type { Database, Executor } from "~/db/client.server"
import { adminUser, comment, event, labelPin, researchDraft, reviewAcknowledgement, slackNotification } from "~/db/schema"
import { isLocale } from "~/i18n/locale"
import { newsItemPath, researchVersionPath } from "~/public/urls"

import {
  NOTIFIED_ACTIONS,
  publishRecords,
  reviewActivities,
  slackText,
  type NotifiedAction,
  type PublishedRow,
  type PublishRecord,
  type ReviewActivity,
} from "./message"

/**
 * How old a row has to be before it is read. A row's time is when its
 * transaction began, so a transaction still open when a message covered that
 * time would commit a row no message ever reads. None of the operations that
 * write these rows stays open this long.
 */
export const SETTLE_MS = 60 * 1000

export type SendToSlack = (text: string) => Promise<void>

export type NotifyOutcome
  = | "sent"
  /** Nothing happened in the interval, so no message was sent. */
    | "quiet"
  /** No webhook is configured. The interval is read past and never sent. */
    | "unsent"
    | "not-due"
  /** Another process holds the row. */
    | "busy"

/**
 * One message, if one is due: once the clock has passed a boundary of the
 * interval and the rows up to it have settled, what happened up to that
 * boundary. **Messages fall on the clock** — every hour on the hour for sixty
 * minutes (`lastBoundaryInJst`), the interval dividing a day
 * (`config.server.ts`). The first call only records the time: what happened before there
 * was anywhere to send it is not sent.
 *
 * Slack is called with the row locked, and a failure to send rolls the
 * transaction back, so the point read up to moves only past what Slack has
 * accepted.
 */
export async function notifySlack(
  db: Database,
  input: { now: Date, intervalMinutes: number, origin: string, send: SendToSlack | null },
): Promise<NotifyOutcome> {
  const settled = new Date(input.now.getTime() - SETTLE_MS)
  const upTo = lastBoundaryInJst(settled, input.intervalMinutes)
  return db.transaction(async (tx) => {
    await tx.insert(slackNotification).values({ readUntil: settled }).onConflictDoNothing()
    const [claimed] = await tx
      .select({ readUntil: slackNotification.readUntil })
      .from(slackNotification)
      .for("update", { skipLocked: true })
    if (claimed === undefined) return "busy"
    if (upTo.getTime() <= claimed.readUntil.getTime()) return "not-due"

    let outcome: NotifyOutcome = "unsent"
    if (input.send !== null) {
      // Read through the pool rather than the transaction, which holds one
      // connection and cannot run the reads side by side.
      const text = slackText(await activitySince(db, claimed.readUntil, upTo), input.origin)
      if (text === null) {
        outcome = "quiet"
      } else {
        await input.send(text)
        outcome = "sent"
      }
    }
    await tx.update(slackNotification).set({ readUntil: upTo })
    return outcome
  })
}

/**
 * Posts to an Incoming Webhook. The URL is the credential, so it goes into no
 * error message.
 */
export async function postToSlack(webhookUrl: string, text: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Slack did not accept the message: ${String(response.status)}`)
}

/**
 * Written by a data provider: not by somebody who is an administrator when the
 * message is made, and not by the portal itself — the data migration writes
 * its notes as comments under the reserved actor, and a rerun of it would
 * otherwise report every one of them.
 */
function byProvider(sub: AnyColumn): SQL | undefined {
  return or(
    isNull(sub),
    and(
      ne(sub, BOOTSTRAP_ACTOR.sub),
      sql`not exists (select 1 from ${adminUser} where ${adminUser.keycloakSub} = ${sub})`,
    ),
  )
}

function isNotified(action: string): action is NotifiedAction {
  return (NOTIFIED_ACTIONS as readonly string[]).includes(action)
}

/** What the message reports from the interval after `from` up to and including `to`. */
export async function activitySince(
  db: Executor,
  from: Date,
  to: Date,
): Promise<{ reviews: ReviewActivity[], publishes: PublishRecord[] }> {
  const [comments, presses, records] = await Promise.all([
    db
      .select({
        draftId: comment.draftId,
        researchId: researchDraft.researchId,
        draftName: researchDraft.name,
        authorName: comment.authorName,
        authorSub: comment.authorSub,
      })
      .from(comment)
      .innerJoin(researchDraft, eq(researchDraft.id, comment.draftId))
      .where(and(gt(comment.createdAt, from), lte(comment.createdAt, to), byProvider(comment.authorSub)))
      .orderBy(asc(comment.createdAt), asc(comment.id)),
    db
      .select({
        draftId: reviewAcknowledgement.draftId,
        researchId: researchDraft.researchId,
        draftName: researchDraft.name,
        kind: reviewAcknowledgement.kind,
      })
      .from(reviewAcknowledgement)
      .innerJoin(researchDraft, eq(researchDraft.id, reviewAcknowledgement.draftId))
      .where(and(
        gt(reviewAcknowledgement.createdAt, from),
        lte(reviewAcknowledgement.createdAt, to),
        byProvider(reviewAcknowledgement.actorSub),
      ))
      .orderBy(asc(reviewAcknowledgement.createdAt), asc(reviewAcknowledgement.id)),
    db
      .select({
        id: event.id,
        occurredAt: event.occurredAt,
        actorName: event.actorName,
        action: event.action,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        detail: event.detail,
      })
      .from(event)
      .where(and(inArray(event.action, [...NOTIFIED_ACTIONS]), gt(event.occurredAt, from), lte(event.occurredAt, to)))
      .orderBy(asc(event.occurredAt), asc(event.id)),
  ])

  const named = await namedRows(db, records)
  const researchIds = [...new Set([
    ...[...comments, ...presses].map((row) => row.researchId),
    ...named.flatMap((row) => row.subject.researchId ?? []),
  ])]
  const pins = researchIds.length === 0
    ? []
    : await db
        .select({ researchId: labelPin.researchId, label: labelPin.label })
        .from(labelPin)
        .where(and(inArray(labelPin.researchId, researchIds), eq(labelPin.isPrimary, true), isNotNull(labelPin.researchId)))
  const humLabelOf = new Map(pins.map((pin) => [pin.researchId, pin.label]))
  const withLabel = <Row extends { researchId: string }>(row: Row) => ({ ...row, humLabel: humLabelOf.get(row.researchId) ?? null })

  const recordOf = new Map(records.map((record) => [record.id, record]))
  const published = named.flatMap((row): PublishedRow[] => {
    const record = recordOf.get(row.id)
    if (record === undefined || !isNotified(row.action)) return []
    const humLabel = row.subject.researchId === null ? undefined : humLabelOf.get(row.subject.researchId)
    return [{
      action: row.action,
      kind: row.subject.kind,
      subjectId: record.subjectId,
      name: row.subject.name,
      actor: row.actor,
      locale: isLocale(record.detail.locale) ? record.detail.locale : null,
      path: publicPathOf(row.subject.kind, record.subjectId, record.detail, humLabel),
    }]
  })

  return {
    reviews: reviewActivities(
      comments.map((row) => ({ ...withLabel(row), signedIn: row.authorSub !== null })),
      presses.map(withLabel),
    ),
    publishes: publishRecords(published),
  }
}

/**
 * The public page of what was published, without the language prefix. An
 * alert has no page of its own and is shown above every page, so it is the
 * top page. Null when the record does not tell: a version whose research has
 * no hum label now, or a record written without the value.
 */
function publicPathOf(
  kind: EventSubjectKind,
  subjectId: string,
  detail: Record<string, unknown>,
  humLabel: string | undefined,
): string | null {
  switch (kind) {
    case "research-version":
      return humLabel !== undefined && typeof detail.versionNumber === "number"
        ? researchVersionPath(humLabel, detail.versionNumber)
        : null
    case "document":
      return typeof detail.slug === "string" && detail.slug !== "" ? `/${detail.slug}` : null
    case "news":
      return newsItemPath(subjectId)
    case "alert":
      return "/"
    default:
      return null
  }
}
