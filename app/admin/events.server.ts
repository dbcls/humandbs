/**
 * Reading the audit trail for the management front page.
 *
 * **Narrowed, counted and cut into pages in the database**, not in memory as
 * the announcements are: the trail only grows, a publish writes several rows,
 * and the front page is the screen every administrator opens first.
 *
 * **A subject is named the way it is called now**, looked up through the ID
 * assignment table, and by what the record wrote only where the thing is gone.
 * The record keeps identities, not names, because a label can be reassigned;
 * a log that showed only uuids would be unreadable.
 */

import { and, count, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm"

import { dayFromInput } from "~/dates"
import type { Executor } from "~/db/client.server"
import { adminUser, alert, dataset, event, labelPin, news, newsContent, research } from "~/db/schema"
import { pageRange } from "~/paging"
import { readListingSize, rowsPerPage } from "~/search/page-size"

import {
  alertExcerpt,
  EVENT_ACTIONS,
  type EventActionCode,
  type EventActorOption,
  type EventFilter,
  type EventListing,
  type EventRow,
  type EventSubjectKind,
  isEventAction,
} from "./events"
import { readPage } from "./pages.server"

export function eventFilterOf(params: URLSearchParams): EventFilter {
  return {
    actions: params.getAll("action").filter(isEventAction),
    actors: params.getAll("actor").filter((sub) => sub !== ""),
    from: dayFromInput(params.get("from") ?? ""),
    to: dayFromInput(params.get("to") ?? ""),
  }
}

/** The day in Japan a record was written on, which is the day the filter's ends mean. */
const occurredOn = sql`(${event.occurredAt} at time zone 'Asia/Tokyo')::date`

/**
 * The conditions in force, with one of them lifted: each axis is counted over
 * what the others leave, so that a second value of an axis is still reachable
 * after the first is ticked (`admin/listing.ts` の `axisCounts`).
 */
function conditions(filter: EventFilter, lifted: "action" | "actor" | null = null): SQL | undefined {
  return and(
    lifted !== "action" && filter.actions.length > 0 ? inArray(event.action, [...filter.actions]) : undefined,
    lifted !== "actor" && filter.actors.length > 0 ? inArray(event.actorSub, [...filter.actors]) : undefined,
    filter.from === null ? undefined : sql`${occurredOn} >= ${filter.from}::date`,
    filter.to === null ? undefined : sql`${occurredOn} <= ${filter.to}::date`,
  )
}

export async function eventListing(db: Executor, params: URLSearchParams): Promise<EventListing> {
  const filter = eventFilterOf(params)
  const size = readListingSize(params.get("size"))

  const [[totalRow], actionCounts, actorRows] = await Promise.all([
    db.select({ total: count() }).from(event).where(conditions(filter)),
    db.select({ action: event.action, total: count() })
      .from(event)
      .where(conditions(filter, "action"))
      .groupBy(event.action),
    db.select({
      sub: event.actorSub,
      // The name they were last recorded under: a rename shows the new one.
      name: sql<string>`(array_agg(${event.actorName} order by ${event.occurredAt} desc))[1]`,
      total: count(),
    })
      .from(event)
      .where(conditions(filter, "actor"))
      .groupBy(event.actorSub),
  ])

  const total = totalRow?.total ?? 0
  const perPage = rowsPerPage(size, total)
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(readPage(params.get("page")), pageCount)

  const records = await db
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
    .where(conditions(filter))
    .orderBy(desc(event.occurredAt), desc(event.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  const counts = Object.fromEntries(EVENT_ACTIONS.map((action) => [action, 0])) as Record<EventActionCode, number>
  for (const row of actionCounts) {
    if (isEventAction(row.action)) counts[row.action] = row.total
  }

  // Everybody who has done something the other conditions leave, and anybody
  // chosen who has not: a condition in force has to stay reachable to be lifted.
  const actorOptions: EventActorOption[] = actorRows
    .map((row) => ({ sub: row.sub, name: row.name, count: row.total }))
  for (const sub of filter.actors) {
    if (!actorOptions.some((one) => one.sub === sub)) actorOptions.push({ sub, name: sub, count: 0 })
  }
  actorOptions.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return {
    ...filter,
    rows: await namedRows(db, records),
    counts,
    actorOptions,
    size,
    total,
    page,
    pageCount,
    ...pageRange(page, perPage, total),
  }
}

export interface EventRecord {
  id: string
  occurredAt: Date
  actorName: string
  action: string
  subjectType: string
  subjectId: string
  detail: Record<string, unknown>
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

/** The research a record names in its detail, under whichever key the operation wrote it. */
function researchOf(record: EventRecord): string | null {
  if (record.subjectType === "research") return record.subjectId
  if (record.subjectType === "label" && record.detail.kind === "hum") return text(record.detail.subject)
  return text(record.detail.researchId) ?? text(record.detail.research)
}

function datasetOf(record: EventRecord): string | null {
  if (record.subjectType === "dataset") return record.subjectId
  if (record.subjectType === "label" && record.detail.kind === "dataset") return text(record.detail.subject)
  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Records as the front page lists them: each subject named the way it is
 * called now. The Slack notification names what it reports the same way.
 */
export async function namedRows(db: Executor, records: readonly EventRecord[]): Promise<EventRow[]> {
  const datasetIds = [...new Set(records.flatMap((record) => datasetOf(record) ?? []))].filter((id) => UUID.test(id))
  const datasets = datasetIds.length === 0
    ? []
    : await db
        .select({ id: dataset.id, researchId: dataset.researchId, label: labelPin.label })
        .from(dataset)
        .leftJoin(labelPin, and(eq(labelPin.datasetId, dataset.id), eq(labelPin.isPrimary, true)))
        .where(inArray(dataset.id, datasetIds))
  const datasetById = new Map(datasets.map((row) => [row.id, row]))

  const researchIds = [...new Set([
    ...records.flatMap((record) => researchOf(record) ?? []),
    ...datasets.map((row) => row.researchId),
  ])].filter((id) => UUID.test(id))
  const pins = researchIds.length === 0
    ? []
    : await db
        .select({ researchId: labelPin.researchId, label: labelPin.label })
        .from(labelPin)
        .where(and(inArray(labelPin.researchId, researchIds), eq(labelPin.isPrimary, true), isNotNull(labelPin.researchId)))
  const humLabelOf = new Map(pins.map((pin) => [pin.researchId, pin.label]))
  // A research with no hum label yet still has its page; one that was deleted has neither.
  const researchesThere = new Set(researchIds.length === 0
    ? []
    : (await db.select({ id: research.id }).from(research).where(inArray(research.id, researchIds))).map((row) => row.id))

  const [contentNames, adminNames] = await Promise.all([siteContentNames(db, records), currentAdminNames(db, records)])

  return records.flatMap((record): EventRow[] => {
    if (!isEventAction(record.action)) return []
    const datasetId = datasetOf(record)
    const inDataset = datasetId === null ? undefined : datasetById.get(datasetId)
    const researchId = researchOf(record) ?? inDataset?.researchId ?? null
    const research = researchId === null ? null : humLabelOf.get(researchId) ?? null
    return [{
      id: record.id,
      occurredAt: record.occurredAt.toISOString(),
      actor: record.actorName,
      action: record.action,
      subject: {
        kind: record.subjectType as EventSubjectKind,
        name: subjectName(record, {
          research,
          dataset: inDataset?.label ?? null,
          content: contentNames.get(record.subjectId),
          admin: adminNames.get(record.subjectId) ?? null,
        }),
        researchId: researchId !== null && researchesThere.has(researchId) ? researchId : null,
      },
    }]
  })
}

/**
 * An announcement is called by its title and an alert by the start of its
 * text, Japanese first — neither has any other name. The map holds every one
 * still there, with `""` for one that has nothing written yet; one deleted since
 * is absent, and is named by what its record wrote, if anything.
 */
async function siteContentNames(db: Executor, records: readonly EventRecord[]): Promise<Map<string, string>> {
  const idsOf = (type: string) => [...new Set(records
    .filter((record) => record.subjectType === type && UUID.test(record.subjectId))
    .map((record) => record.subjectId))]
  const newsIds = idsOf("news")
  const alertIds = idsOf("alert")
  const [items, titles, alerts] = await Promise.all([
    newsIds.length === 0 ? [] : db.select({ id: news.id }).from(news).where(inArray(news.id, newsIds)),
    newsIds.length === 0
      ? []
      : db.select({ id: newsContent.newsId, locale: newsContent.locale, title: sql<string>`${newsContent.content}->>'title'` })
          .from(newsContent)
          .where(inArray(newsContent.newsId, newsIds)),
    alertIds.length === 0
      ? []
      : db.select({ id: alert.id, content: alert.content }).from(alert).where(inArray(alert.id, alertIds)),
  ])
  const names = new Map<string, string>(items.map((item) => [item.id, ""]))
  for (const row of [...titles].sort((a, b) => (a.locale === "ja" ? 0 : 1) - (b.locale === "ja" ? 0 : 1))) {
    if (names.get(row.id) === "" && row.title.trim() !== "") names.set(row.id, row.title.trim())
  }
  for (const row of alerts) names.set(row.id, alertExcerpt(row.content.body))
  return names
}

/** The names administrators go by now; one taken away since is named by the record. */
async function currentAdminNames(db: Executor, records: readonly EventRecord[]): Promise<Map<string, string>> {
  const subs = [...new Set(records.filter((record) => record.subjectType === "admin").map((record) => record.subjectId))]
  if (subs.length === 0) return new Map()
  const rows = await db
    .select({ sub: adminUser.keycloakSub, name: adminUser.displayName })
    .from(adminUser)
    .where(inArray(adminUser.keycloakSub, subs))
  return new Map(rows.map((row) => [row.sub, row.name]))
}

function subjectName(
  record: EventRecord,
  now: { research: string | null, dataset: string | null, content: string | undefined, admin: string | null },
): string | null {
  const { detail } = record
  switch (record.subjectType) {
    case "research": {
      const written = Array.isArray(detail.humLabels) ? text(detail.humLabels[0]) : null
      return now.research ?? written ?? record.subjectId
    }
    case "research-version": {
      const number = typeof detail.versionNumber === "number" ? ` v${String(detail.versionNumber)}` : ""
      return `${now.research ?? record.subjectId}${number}`
    }
    case "dataset":
      return now.dataset ?? text(detail.label) ?? record.subjectId
    case "draft":
      return now.research ?? record.subjectId
    case "document":
      return text(detail.slug) ?? record.subjectId
    case "news":
      return now.content ?? text(detail.title)
    case "alert":
      return now.content ?? text(detail.text)
    case "admin":
      return now.admin ?? text(detail.displayName) ?? record.subjectId
    // A label and a file are named by what the record holds: the label itself,
    // and the file's name.
    default:
      return record.subjectId
  }
}
