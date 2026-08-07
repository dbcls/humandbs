/**
 * Reading what the management screens show.
 *
 * The public side starts from `search_doc` because its job is to answer "is
 * this published"; here the answer is the opposite — **everything is in scope,
 * published or not** — so these read the identity tables directly. Nothing in
 * this file is reachable without `view-unpublished`.
 *
 * The listing is assembled in memory rather than filtered in SQL. Two of the
 * three things it filters on (some value is unsettled, some pair is
 * untranslated) are derived by walking the content, and the derivation is the
 * same function the rest of the portal uses; expressing it a second time as a
 * JSON predicate would be two definitions of one rule. At the size of the real
 * data — a few hundred research, a few megabytes of content — reading it all is
 * cheaper than keeping the two in step.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm"

import type { ResearchContent, TranslatedText } from "~/content/types"
import type { Executor } from "~/db/client.server"
import {
  contentSnapshot,
  dataset,
  datasetContent,
  labelPin,
  research,
  researchDraft,
  researchVersion,
} from "~/db/schema"

import { contentFlags, type ContentFlags } from "./flags"
import type { AdminResearchRow, AdminStatus } from "./listing"

function latest(dates: readonly Date[]): string {
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString()
}

function statusOf(versions: number, published: number): AdminStatus {
  if (published > 0) return "published"
  return versions > 0 ? "withdrawn" : "unpublished"
}

/**
 * The flags of the content somebody would be working on. A research with drafts
 * is judged by them — that is where the work is — and one with none by its
 * latest published version.
 */
function flagsOf(drafts: readonly ResearchContent[], published: ResearchContent | null): ContentFlags {
  const contents = drafts.length > 0 ? drafts : published === null ? [] : [published]
  const each = contents.map(contentFlags)
  return {
    unsettled: each.some((flags) => flags.unsettled),
    untranslated: each.some((flags) => flags.untranslated),
  }
}

/** Every research, with what the listing needs to show and to filter on. */
export async function adminResearchIndex(db: Executor): Promise<AdminResearchRow[]> {
  const [researches, humLabels, datasetLabels, versions, snapshots, drafts] = await Promise.all([
    db.select({ id: research.id, updatedAt: research.updatedAt }).from(research),
    db
      .select({ researchId: labelPin.researchId, label: labelPin.label })
      .from(labelPin)
      .where(and(eq(labelPin.kind, "hum"), eq(labelPin.isPrimary, true))),
    db
      .select({ researchId: dataset.researchId, label: labelPin.label })
      .from(labelPin)
      .innerJoin(dataset, eq(dataset.id, labelPin.datasetId))
      .where(and(eq(labelPin.kind, "dataset"), eq(labelPin.isPrimary, true))),
    db
      .select({
        researchId: researchVersion.researchId,
        published: researchVersion.published,
        updatedAt: researchVersion.updatedAt,
      })
      .from(researchVersion),
    db
      .selectDistinctOn([researchVersion.researchId], {
        researchId: researchVersion.researchId,
        content: contentSnapshot.content,
      })
      .from(researchVersion)
      .innerJoin(contentSnapshot, eq(contentSnapshot.id, researchVersion.snapshotId))
      .where(eq(researchVersion.published, true))
      .orderBy(researchVersion.researchId, desc(researchVersion.number)),
    db
      .select({
        researchId: researchDraft.researchId,
        content: researchDraft.content,
        updatedAt: researchDraft.updatedAt,
      })
      .from(researchDraft),
  ])

  const humLabelOf = new Map(humLabels.flatMap((row) =>
    row.researchId === null ? [] : [[row.researchId, row.label] as const]))
  const publishedContentOf = new Map(snapshots.map((row) => [row.researchId, row.content]))

  const grouped = new Map(researches.map((row) => [row.id, {
    versions: 0,
    published: 0,
    datasetLabels: [] as string[],
    drafts: [] as ResearchContent[],
    dates: [row.updatedAt],
  }]))
  for (const row of versions) {
    const held = grouped.get(row.researchId)
    if (held === undefined) continue
    held.versions += 1
    if (row.published) held.published += 1
    held.dates.push(row.updatedAt)
  }
  for (const row of drafts) {
    const held = grouped.get(row.researchId)
    if (held === undefined) continue
    held.drafts.push(row.content)
    held.dates.push(row.updatedAt)
  }
  for (const row of datasetLabels) {
    grouped.get(row.researchId)?.datasetLabels.push(row.label)
  }

  return researches.map((row): AdminResearchRow => {
    const held = grouped.get(row.id)
    const versionCount = held?.versions ?? 0
    const publishedCount = held?.published ?? 0
    const draftContents = held?.drafts ?? []
    const publishedContent = publishedContentOf.get(row.id) ?? null
    const working = draftContents[0] ?? publishedContent
    const humLabel = humLabelOf.get(row.id) ?? null

    return {
      researchId: row.id,
      humLabel,
      title: working?.title ?? EMPTY_TITLE,
      providerNames: (working?.dataProviders ?? []).map((provider) => provider.name),
      datasetLabels: (held?.datasetLabels ?? []).toSorted(),
      status: statusOf(versionCount, publishedCount),
      publishedVersions: publishedCount,
      draftCount: draftContents.length,
      flags: { noHumLabel: humLabel === null, ...flagsOf(draftContents, publishedContent) },
      updatedAt: latest(held?.dates ?? [row.updatedAt]),
    }
  })
}

const EMPTY_TITLE: TranslatedText = {
  ja: { state: "value", value: "" },
  en: { state: "value", value: "" },
}

export interface ResearchDatasetRow {
  id: string
  label: string | null
  published: boolean
}

/**
 * The datasets belonging to a research, whether published or not. The editor
 * offers these to be listed by a version; nothing else may be listed, since a
 * dataset belongs to exactly one research.
 */
export async function researchDatasets(
  db: Executor,
  researchId: string,
): Promise<ResearchDatasetRow[]> {
  const rows = await db
    .select({
      id: dataset.id,
      label: labelPin.label,
      published: sql<boolean>`${datasetContent.datasetId} IS NOT NULL`,
    })
    .from(dataset)
    .leftJoin(labelPin, and(
      eq(labelPin.datasetId, dataset.id),
      eq(labelPin.kind, "dataset"),
      eq(labelPin.isPrimary, true),
    ))
    .leftJoin(datasetContent, eq(datasetContent.datasetId, dataset.id))
    .where(eq(dataset.researchId, researchId))
    .orderBy(sql`${labelPin.label} NULLS LAST`, dataset.id)
  return rows
}

export interface AdminVersionRow {
  id: string
  number: number
  releaseDate: string
  published: boolean
  snapshotId: string
}

export interface AdminDraftRow {
  id: string
  revision: number
  note: string
  /** The published version the draft was taken from, if that snapshot is still one. */
  parentVersionNumber: number | null
  flags: ContentFlags
  createdAt: string
  updatedAt: string
}

export interface AdminResearchView {
  researchId: string
  labels: { label: string, isPrimary: boolean }[]
  versions: AdminVersionRow[]
  drafts: AdminDraftRow[]
  datasets: ResearchDatasetRow[]
}

export async function adminResearch(
  db: Executor,
  researchId: string,
): Promise<AdminResearchView | null> {
  const [found] = await db
    .select({ id: research.id })
    .from(research)
    .where(eq(research.id, researchId))
    .limit(1)
  if (found === undefined) return null

  const [labels, versions, drafts, datasets] = await Promise.all([
    db
      .select({ label: labelPin.label, isPrimary: labelPin.isPrimary })
      .from(labelPin)
      .where(and(eq(labelPin.kind, "hum"), eq(labelPin.researchId, researchId)))
      .orderBy(desc(labelPin.isPrimary), labelPin.label),
    db
      .select({
        id: researchVersion.id,
        number: researchVersion.number,
        releaseDate: researchVersion.releaseDate,
        published: researchVersion.published,
        snapshotId: researchVersion.snapshotId,
      })
      .from(researchVersion)
      .where(eq(researchVersion.researchId, researchId))
      .orderBy(desc(researchVersion.number)),
    db
      .select({
        id: researchDraft.id,
        revision: researchDraft.revision,
        note: researchDraft.note,
        content: researchDraft.content,
        parentSnapshotId: researchDraft.parentSnapshotId,
        createdAt: researchDraft.createdAt,
        updatedAt: researchDraft.updatedAt,
      })
      .from(researchDraft)
      .where(eq(researchDraft.researchId, researchId))
      .orderBy(asc(researchDraft.createdAt)),
    researchDatasets(db, researchId),
  ])

  const versionOfSnapshot = new Map(versions.map((row) => [row.snapshotId, row.number]))

  return {
    researchId,
    labels,
    versions,
    drafts: drafts.map((row) => ({
      id: row.id,
      revision: row.revision,
      note: row.note,
      parentVersionNumber: row.parentSnapshotId === null
        ? null
        : versionOfSnapshot.get(row.parentSnapshotId) ?? null,
      flags: contentFlags(row.content),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    datasets,
  }
}

export interface DraftRecord {
  id: string
  researchId: string
  revision: number
  note: string
  content: ResearchContent
}

export async function readDraft(db: Executor, draftId: string): Promise<DraftRecord | null> {
  const [row] = await db
    .select({
      id: researchDraft.id,
      researchId: researchDraft.researchId,
      revision: researchDraft.revision,
      note: researchDraft.note,
      content: researchDraft.content,
    })
    .from(researchDraft)
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  return row ?? null
}

export async function humLabelOf(db: Executor, researchId: string): Promise<string | null> {
  const [row] = await db
    .select({ label: labelPin.label })
    .from(labelPin)
    .where(and(
      eq(labelPin.kind, "hum"),
      eq(labelPin.isPrimary, true),
      eq(labelPin.researchId, researchId),
    ))
    .limit(1)
  return row?.label ?? null
}
