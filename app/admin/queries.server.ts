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

import type {
  DatasetContent,
  DraftSnapshot,
  ResearchContent,
  TranslatedText,
  UndoReason,
} from "~/content/types"
import type { Executor } from "~/db/client.server"
import {
  contentKey,
  contentSnapshot,
  dataset,
  datasetContent,
  draftDatasetEntry,
  draftPresence,
  draftUndo,
  labelPin,
  research,
  researchDraft,
  researchVersion,
  vocabularyTerm,
} from "~/db/schema"

import { contentFlags, type ContentFlags } from "./flags"
import type { AdminResearchRow, AdminStatus } from "./listing"
import { PRESENCE_WINDOW_SECONDS } from "./presence"

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
  /** The ledger row behind the label, which is what unpinning names. */
  pinId: string | null
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
      pinId: labelPin.id,
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
  labels: { id: string, label: string, isPrimary: boolean }[]
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
      .select({ id: labelPin.id, label: labelPin.label, isPrimary: labelPin.isPrimary })
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
  parentSnapshotId: string | null
}

export async function readDraft(db: Executor, draftId: string): Promise<DraftRecord | null> {
  const [row] = await db
    .select({
      id: researchDraft.id,
      researchId: researchDraft.researchId,
      revision: researchDraft.revision,
      note: researchDraft.note,
      content: researchDraft.content,
      parentSnapshotId: researchDraft.parentSnapshotId,
    })
    .from(researchDraft)
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  return row ?? null
}

/**
 * What the draft started from and what is published now, when the two have come
 * apart. Null means nothing moved — either the draft was written from nothing,
 * or the version it came from is still the one that is out there.
 */
export async function upstreamResearch(
  db: Executor,
  researchId: string,
  parentSnapshotId: string | null,
): Promise<{ base: ResearchContent, theirs: ResearchContent } | null> {
  if (parentSnapshotId === null) return null

  const [base] = await db
    .select({ content: contentSnapshot.content })
    .from(contentSnapshot)
    .where(eq(contentSnapshot.id, parentSnapshotId))
    .limit(1)
  if (base === undefined) return null

  const [latest] = await db
    .select({ snapshotId: researchVersion.snapshotId, content: contentSnapshot.content })
    .from(researchVersion)
    .innerJoin(contentSnapshot, eq(contentSnapshot.id, researchVersion.snapshotId))
    .where(and(eq(researchVersion.researchId, researchId), eq(researchVersion.published, true)))
    .orderBy(desc(researchVersion.number))
    .limit(1)
  if (latest === undefined || latest.snapshotId === parentSnapshotId) return null

  return { base: base.content, theirs: latest.content }
}

export interface DatasetEntryRecord {
  revision: number
  content: DatasetContent
  /** The published description when editing began; null for a dataset the draft made. */
  baseContent: DatasetContent | null
}

/**
 * What this draft has written for one dataset, if it has written anything.
 * **Null is not an empty entry** — it is the copy-on-write state of never
 * having been touched, and it is what makes the first save an insert.
 */
export async function readDatasetEntry(
  db: Executor,
  draftId: string,
  datasetId: string,
): Promise<DatasetEntryRecord | null> {
  const [row] = await db
    .select({
      revision: draftDatasetEntry.revision,
      content: draftDatasetEntry.content,
      baseContent: draftDatasetEntry.baseContent,
    })
    .from(draftDatasetEntry)
    .where(and(
      eq(draftDatasetEntry.draftId, draftId),
      eq(draftDatasetEntry.datasetId, datasetId),
    ))
    .limit(1)
  return row ?? null
}

/** The published description of a dataset, which is what a draft starts from. */
export async function readPublishedDataset(
  db: Executor,
  datasetId: string,
): Promise<DatasetContent | null> {
  const [row] = await db
    .select({ content: datasetContent.content })
    .from(datasetContent)
    .where(eq(datasetContent.datasetId, datasetId))
    .limit(1)
  return row?.content ?? null
}

export interface DraftDatasetRow extends ResearchDatasetRow {
  /** Listed by the version this draft is writing. */
  listed: boolean
  /** This draft has written something for it. */
  edited: boolean
  /** This draft introduced it, so this draft may destroy it. */
  isOwn: boolean
}

/**
 * Every dataset of the research, as this draft sees it. The marks are separate
 * facts and none of them implies another: a dataset can be published and not
 * listed, listed and never touched, or introduced here and already edited.
 */
export async function draftDatasetRows(
  db: Executor,
  draftId: string,
  researchId: string,
  listedIds: readonly string[],
): Promise<DraftDatasetRow[]> {
  const [rows, entries, own] = await Promise.all([
    researchDatasets(db, researchId),
    db
      .select({ datasetId: draftDatasetEntry.datasetId })
      .from(draftDatasetEntry)
      .where(eq(draftDatasetEntry.draftId, draftId)),
    db
      .select({ id: dataset.id })
      .from(dataset)
      .where(eq(dataset.originDraftId, draftId)),
  ])

  const edited = new Set(entries.map((row) => row.datasetId))
  const introduced = new Set(own.map((row) => row.id))
  const listed = new Set(listedIds)

  return rows.map((row) => ({
    ...row,
    listed: listed.has(row.id),
    edited: edited.has(row.id),
    isOwn: introduced.has(row.id),
  }))
}

export interface UndoEntryRow {
  id: string
  reason: UndoReason
  createdAt: string
}

/** The stack, newest first. The snapshots themselves are fetched one at a time. */
export async function readUndoStack(db: Executor, draftId: string): Promise<UndoEntryRow[]> {
  const rows = await db
    .select({
      id: draftUndo.id,
      snapshot: draftUndo.snapshot,
      createdAt: draftUndo.createdAt,
    })
    .from(draftUndo)
    .where(eq(draftUndo.draftId, draftId))
    .orderBy(desc(draftUndo.createdAt), desc(draftUndo.id))

  return rows.map((row) => ({
    id: row.id,
    reason: row.snapshot.reason,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function readUndoSnapshot(
  db: Executor,
  draftId: string,
  undoId: string,
): Promise<DraftSnapshot | null> {
  const [row] = await db
    .select({ snapshot: draftUndo.snapshot })
    .from(draftUndo)
    .where(and(eq(draftUndo.id, undoId), eq(draftUndo.draftId, draftId)))
    .limit(1)
  return row?.snapshot ?? null
}

export interface PresenceRow {
  sessionId: string
  displayName: string
}

/**
 * Who has this draft open. Expiry is a predicate on the read, so a sweep that
 * never runs cannot make somebody appear to still be editing.
 */
export async function activePresence(db: Executor, draftId: string): Promise<PresenceRow[]> {
  return db
    .select({ sessionId: draftPresence.sessionId, displayName: draftPresence.displayName })
    .from(draftPresence)
    .where(and(
      eq(draftPresence.draftId, draftId),
      sql`${draftPresence.lastSeenAt} > now() - make_interval(secs => ${PRESENCE_WINDOW_SECONDS})`,
    ))
    .orderBy(draftPresence.displayName, draftPresence.sessionId)
}

export interface EditableKey {
  id: string
  code: string
  scope: "dataset" | "experiment"
  valueType: "text" | "single" | "accession" | "vocabulary" | "number"
  labelJa: string
  labelEn: string
  position: number
  vocabularySetId: string | null
  multiple: boolean
  /** Set for a number: the unit it is stored in, and the ones input offers. */
  canonicalUnit: string | null
  inputUnits: string[] | null
}

export interface EditableTerm {
  id: string
  setId: string
  /** Shown beside the label in the picker: a code is what ICD10 is searched by. */
  code: string
  labelJa: string | null
  labelEn: string
  position: number
}

export interface EditableCatalog {
  keys: EditableKey[]
  terms: EditableTerm[]
}

/**
 * The catalog as the editor needs it: with the type of every key, which the
 * public projection has no use for. **The type decides which input control a
 * value gets**, so a screen without it could only guess.
 */
export async function loadEditableCatalog(db: Executor): Promise<EditableCatalog> {
  const [keys, terms] = await Promise.all([
    db
      .select({
        id: contentKey.id,
        code: contentKey.code,
        scope: contentKey.scope,
        valueType: contentKey.valueType,
        labelJa: contentKey.labelJa,
        labelEn: contentKey.labelEn,
        position: contentKey.position,
        vocabularySetId: contentKey.vocabularySetId,
        multiple: contentKey.multiple,
        canonicalUnit: contentKey.canonicalUnit,
        inputUnits: contentKey.inputUnits,
      })
      .from(contentKey)
      .orderBy(contentKey.position, contentKey.code),
    db
      .select({
        id: vocabularyTerm.id,
        setId: vocabularyTerm.setId,
        code: vocabularyTerm.code,
        labelJa: vocabularyTerm.labelJa,
        labelEn: vocabularyTerm.labelEn,
        position: vocabularyTerm.position,
      })
      .from(vocabularyTerm)
      .where(eq(vocabularyTerm.active, true))
      .orderBy(vocabularyTerm.position, vocabularyTerm.labelEn),
  ])
  return { keys, terms }
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
