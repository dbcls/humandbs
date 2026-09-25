/**
 * Reading what the management screens show.
 *
 * The public side starts from `search_doc` because its job is to decide "is
 * this published"; here the answer is the opposite — **everything is in scope,
 * published or not** — so these read the identity tables directly. Nothing in
 * this file is reachable without `view-unpublished`.
 *
 * The listing is assembled in memory rather than filtered in SQL. The two
 * content-derived filters (some value is unsettled, some pair is untranslated)
 * come from walking the content, and the derivation is the same function the
 * rest of the portal uses; expressing it a second time as a JSON predicate would
 * be two definitions of one rule. At the size of the real data — a few hundred
 * research, a few megabytes of content — reading it all is cheaper than keeping
 * the two in step. The other three come from the `label_pin` table and the upstream
 * cache, and are assembled the same way for the same reason.
 */

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm"

import type {
  DatasetContent,
  ResearchContent,
  TranslatedText,
} from "~/content/types"
import type { Executor } from "~/db/client.server"
import { descriptionOf, draftContentOf } from "~/content/version"
import {
  contentKey,
  dataset,
  draftDatasetEntry,
  labelPin,
  research,
  researchDraft,
  researchVersion,
  searchDoc,
  vocabularyTerm,
} from "~/db/schema"
import { icd10Code } from "~/icd10/codes"

import { changedDatasetFromPublished } from "./changes"
import { draftDatasets } from "./datasets"
import { isPortalIssuedId } from "./labels"
import type { AdminDatasetRef, AdminResearchRow, AdminStatus } from "./listing"

function latest(dates: readonly Date[]): string {
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString()
}

function statusOf(published: number): AdminStatus {
  return published > 0 ? "published" : "unpublished"
}

/** Every research, with what the listing needs to show and to filter on. */
export async function adminResearchIndex(db: Executor): Promise<AdminResearchRow[]> {
  const [
    researches,
    humLabels,
    datasetLabels,
    versions,
    snapshots,
    drafts,
    publishedDatasets,
  ] = await Promise.all([
    db.select({ id: research.id, createdAt: research.createdAt }).from(research),
    db
      .select({ researchId: labelPin.researchId, label: labelPin.label })
      .from(labelPin)
      .where(and(eq(labelPin.kind, "hum"), eq(labelPin.isPrimary, true))),
    db
      .select({ researchId: dataset.researchId, datasetId: dataset.id, label: labelPin.label })
      .from(labelPin)
      .innerJoin(dataset, eq(dataset.id, labelPin.datasetId))
      .where(and(eq(labelPin.kind, "dataset"), eq(labelPin.isPrimary, true))),
    db
      .select({
        researchId: researchVersion.researchId,
        releaseDate: researchVersion.releaseDate,
        updatedAt: researchVersion.updatedAt,
      })
      .from(researchVersion),
    db
      .selectDistinctOn([researchVersion.researchId], {
        researchId: researchVersion.researchId,
        content: researchVersion.content,
      })
      .from(researchVersion)
      .orderBy(researchVersion.researchId, desc(researchVersion.number)),
    db
      .select({
        researchId: researchDraft.researchId,
        content: researchDraft.content,
        updatedAt: researchDraft.updatedAt,
      })
      .from(researchDraft),
    // A dataset with a search row is one a reader can open: that is the one
    // question the public side decides from this table.
    db
      .select({ datasetId: searchDoc.targetId })
      .from(searchDoc)
      .where(eq(searchDoc.targetType, "dataset")),
  ])

  const humLabelOf = new Map(humLabels.flatMap((row) =>
    row.researchId === null ? [] : [[row.researchId, row.label] as const]))
  const publishedContentOf = new Map(
    snapshots.map((row) => [row.researchId, draftContentOf(row.content)]),
  )

  const grouped = new Map(researches.map((row) => [row.id, {
    published: 0,
    publishedOn: null as string | null,
    pinned: [] as AdminDatasetRef[],
    drafts: [] as ResearchContent[],
    dates: [row.createdAt],
  }]))
  for (const row of versions) {
    const held = grouped.get(row.researchId)
    if (held === undefined) continue
    held.published += 1
    // The listing shows when this research was last out, which is the newest
    // release date among the versions it still has — withdrawing one takes its
    // row away, so a version that is here is a version that is out.
    if (held.publishedOn === null || row.releaseDate > held.publishedOn) {
      held.publishedOn = row.releaseDate
    }
    held.dates.push(row.updatedAt)
  }
  for (const row of drafts) {
    const held = grouped.get(row.researchId)
    if (held === undefined) continue
    held.drafts.push(row.content)
    held.dates.push(row.updatedAt)
  }
  const publishedIds = new Set(publishedDatasets.map((row) => row.datasetId))
  for (const row of datasetLabels) {
    grouped.get(row.researchId)?.pinned.push({
      label: row.label,
      published: publishedIds.has(row.datasetId),
    })
  }

  return researches.map((row): AdminResearchRow => {
    const held = grouped.get(row.id)
    const publishedCount = held?.published ?? 0
    const draftContents = held?.drafts ?? []
    const publishedContent = publishedContentOf.get(row.id) ?? null
    // The row names the research the way a reader meets it: by its latest
    // version that is out. A draft is the vessel of the next one, and is often
    // empty while it waits, so its title is not what the research is called.
    // Only a research that has never been out is named by its draft.
    const shown = publishedContent ?? draftContents[0] ?? null
    const humLabel = humLabelOf.get(row.id) ?? null
    const pinned = (held?.pinned ?? []).toSorted((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0)

    return {
      researchId: row.id,
      humLabel,
      title: shown?.title ?? EMPTY_TITLE,
      providerNames: (shown?.dataProviders ?? []).map((provider) => provider.name),
      datasets: pinned,
      status: statusOf(publishedCount),
      publishedVersions: publishedCount,
      draftCount: draftContents.length,
      updatedAt: latest(held?.dates ?? [row.createdAt]),
      publishedOn: held?.publishedOn ?? null,
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
  /** The `label_pin` row behind the label, which is what unpinning names. */
  pinId: string | null
  published: boolean
  /**
   * Whether the portal issued the id, read off its spelling. Only these may
   * have a file selection: an archive's dataset is distributed by the
   * archive.
   */
  portalIssued: boolean
  /** The draft that made it, until a publish adopts it. Null once it is out. */
  originDraftId: string | null
}

/**
 * The datasets belonging to a research, whether published or not. A dataset
 * belongs to exactly one research, and the next version of that research
 * has all of them (`admin/datasets.ts`).
 */
export async function researchDatasets(
  db: Executor,
  researchId: string,
): Promise<ResearchDatasetRow[]> {
  const rows = await db
    .select({
      id: dataset.id,
      originDraftId: dataset.originDraftId,
      label: labelPin.label,
      pinId: labelPin.id,
      // Having a published row is what being published means; a dataset no
      // version lists any more has none (`search.ts`).
      published: sql<boolean>`${searchDoc.id} IS NOT NULL`,
    })
    .from(dataset)
    .leftJoin(labelPin, and(
      eq(labelPin.datasetId, dataset.id),
      eq(labelPin.kind, "dataset"),
      eq(labelPin.isPrimary, true),
    ))
    .leftJoin(searchDoc, and(
      eq(searchDoc.targetType, "dataset"),
      eq(searchDoc.targetId, dataset.id),
    ))
    .where(eq(dataset.researchId, researchId))
    .orderBy(sql`${labelPin.label} NULLS LAST`, dataset.id)
  return rows.map((row) => ({ ...row, portalIssued: isPortalIssuedId(row.label) }))
}

export interface AdminVersionRow {
  id: string
  number: number
  releaseDate: string
  /** When the row was written, which for a version is when it was published. */
  updatedAt: string
  /**
   * The draft this version is being updated in, while it is. It is the update's
   * vessel and not a draft of its own, so it is kept here and not among the
   * drafts.
   */
  updating: AdminDraftRow | null
}

export interface AdminDraftRow {
  id: string
  revision: number
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
        updatedAt: researchVersion.updatedAt,
      })
      .from(researchVersion)
      .where(eq(researchVersion.researchId, researchId))
      .orderBy(desc(researchVersion.number)),
    db
      .select({
        id: researchDraft.id,
        revision: researchDraft.revision,
        replacesVersionId: researchDraft.replacesVersionId,
        createdAt: researchDraft.createdAt,
        updatedAt: researchDraft.updatedAt,
      })
      .from(researchDraft)
      .where(eq(researchDraft.researchId, researchId))
      .orderBy(asc(researchDraft.createdAt)),
    researchDatasets(db, researchId),
  ])

  const rows = drafts.map((row) => ({
    id: row.id,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updates: row.replacesVersionId,
  }))
  return {
    researchId,
    labels,
    versions: versions.map((row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
      updating: rows.find((draft) => draft.updates === row.id) ?? null,
    })),
    drafts: rows.filter((row) => row.updates === null),
    datasets,
  }
}

export interface DraftRecord {
  id: string
  researchId: string
  revision: number
  content: ResearchContent
  /**
   * The version this draft is the update of, when it is one. Every screen of
   * the draft measures against that version rather than the newest, and identifies
   * the draft after it.
   */
  updating: { versionId: string, number: number } | null
}

export async function readDraft(db: Executor, draftId: string): Promise<DraftRecord | null> {
  const [row] = await db
    .select({
      id: researchDraft.id,
      researchId: researchDraft.researchId,
      revision: researchDraft.revision,
      content: researchDraft.content,
      versionId: researchDraft.replacesVersionId,
      number: researchVersion.number,
    })
    .from(researchDraft)
    .leftJoin(researchVersion, eq(researchVersion.id, researchDraft.replacesVersionId))
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  if (row === undefined) return null
  const { versionId, number, ...draft } = row
  return {
    ...draft,
    updating: versionId === null || number === null ? null : { versionId, number },
  }
}

/**
 * The version a draft is shown against, for the screen that reports what differs.
 *
 * **Two shapes rather than three.** A draft has no ancestor, so there is
 * nothing to divide "what they changed" from "what I changed" with — the
 * comparison lists the differences and leaves the choosing to the reader.
 * Asking for no number gets the newest version, which is the default the editor
 * opens with.
 */
export async function comparableVersion(
  db: Executor,
  researchId: string,
  number: number | null,
): Promise<{ number: number, content: ResearchContent } | null> {
  const [row] = await db
    .select({ number: researchVersion.number, content: researchVersion.content })
    .from(researchVersion)
    .where(number === null
      ? eq(researchVersion.researchId, researchId)
      : and(eq(researchVersion.researchId, researchId), eq(researchVersion.number, number)))
    .orderBy(desc(researchVersion.number))
    .limit(1)
  return row === undefined ? null : { number: row.number, content: draftContentOf(row.content) }
}

export interface DatasetEntryRecord {
  revision: number
  content: DatasetContent
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
    })
    .from(draftDatasetEntry)
    .where(and(
      eq(draftDatasetEntry.draftId, draftId),
      eq(draftDatasetEntry.datasetId, datasetId),
    ))
    .limit(1)
  return row ?? null
}

/**
 * How the newest version describes a dataset, which is what the editor compares
 * against. Null means no version lists it — the draft introduced it, or every
 * version that had it has been withdrawn.
 */
export async function readPublishedDataset(
  db: Executor,
  researchId: string,
  datasetId: string,
  /** The version to read it in: the one a draft updates. Null reads the newest. */
  versionId: string | null,
): Promise<{ number: number, content: DatasetContent } | null> {
  const [row] = await db
    .select({ number: researchVersion.number, content: researchVersion.content })
    .from(researchVersion)
    .where(versionId === null
      ? eq(researchVersion.researchId, researchId)
      : and(eq(researchVersion.researchId, researchId), eq(researchVersion.id, versionId)))
    .orderBy(desc(researchVersion.number))
    .limit(1)
  if (row === undefined) return null
  const found = row.content.datasets.find((one) => one.datasetId === datasetId)
  return found === undefined ? null : { number: row.number, content: descriptionOf(found) }
}

/**
 * The identities this draft publishes, in the order it publishes them
 * (`admin/datasets.ts`). **What a draft's content holds is the order alone**,
 * so everything that needs "which datasets is this draft about" — the steps, the
 * preview, the places a comment may be left — reads it here rather than reading the
 * order and taking it for the set.
 */
export async function draftDatasetIds(
  db: Executor,
  draftId: string,
  researchId: string,
  order: readonly string[],
): Promise<string[]> {
  return draftDatasets(await ownedDatasets(db, researchId), draftId, order).map((row) => row.id)
}

/**
 * The research's datasets, as little of them as the order is worked out from.
 * The rows come in a settled order, because what the draft has not named yet
 * is shown in the order it arrives (`admin/datasets.ts`).
 */
export async function ownedDatasets(
  db: Executor,
  researchId: string,
): Promise<{ id: string, originDraftId: string | null }[]> {
  return db
    .select({ id: dataset.id, originDraftId: dataset.originDraftId })
    .from(dataset)
    .where(eq(dataset.researchId, researchId))
    .orderBy(dataset.id)
}

export interface DraftDatasetRow extends ResearchDatasetRow {
  /** This draft made it, and no publish has adopted it yet. */
  isOwn: boolean
}

/**
 * What this draft publishes, in the order it goes out in (`admin/datasets.ts`).
 */
export async function draftDatasetRows(
  db: Executor,
  draftId: string,
  researchId: string,
  order: readonly string[],
): Promise<DraftDatasetRow[]> {
  const rows = await researchDatasets(db, researchId)
  return draftDatasets(rows, draftId, order).map((row) => ({
    ...row,
    isOwn: row.originDraftId === draftId,
  }))
}

/**
 * The datasets whose description this draft has changed — measured against
 * the version the published-version indicators compare with, the one the draft updates or
 * else the newest.
 *
 * **Holding an entry is not having changed it.** A draft copied from a version
 * holds an entry for every dataset that version lists, word for word, so an
 * entry means only that the draft could be written. What the version does not
 * list — a dataset the draft made — has nothing to be compared with, and there
 * the entry is the writing.
 */
export async function changedDatasets(
  db: Executor,
  draftId: string,
  researchId: string,
  /** The version the draft updates. Null compares with the newest. */
  versionId: string | null,
): Promise<Set<string>> {
  const [entries, [version]] = await Promise.all([
    db
      .select({ datasetId: draftDatasetEntry.datasetId, content: draftDatasetEntry.content })
      .from(draftDatasetEntry)
      .where(eq(draftDatasetEntry.draftId, draftId)),
    db
      .select({ content: researchVersion.content })
      .from(researchVersion)
      .where(versionId === null
        ? eq(researchVersion.researchId, researchId)
        : and(eq(researchVersion.researchId, researchId), eq(researchVersion.id, versionId)))
      .orderBy(desc(researchVersion.number))
      .limit(1),
  ])
  const published = new Map((version?.content.datasets ?? []).map((row) => [row.datasetId, descriptionOf(row)]))
  return new Set(entries
    .filter((entry) => {
      const before = published.get(entry.datasetId)
      return before === undefined || changedDatasetFromPublished(before, entry.content).length > 0
    })
    .map((entry) => entry.datasetId))
}

export interface EditableKey {
  id: string
  code: string
  scope: "dataset" | "experiment"
  valueType: "text" | "single" | "accession" | "vocabulary" | "number" | "disease"
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
}

/** The catalog and every term of it. Server side only (see below). */
export interface CatalogWithTerms extends EditableCatalog {
  terms: EditableTerm[]
}

/** How many candidates one search of a vocabulary returns. */
export const TERM_CANDIDATES = 20

const TERM_COLUMNS = {
  id: vocabularyTerm.id,
  setId: vocabularyTerm.setId,
  code: vocabularyTerm.code,
  labelJa: vocabularyTerm.labelJa,
  labelEn: vocabularyTerm.labelEn,
  position: vocabularyTerm.position,
}

/**
 * The catalog as the editor needs it: with the type of every key, which the
 * public projection has no use for. **The type decides which input control a
 * value gets**, so a screen without it could only guess.
 *
 * **It has no terms.** A vocabulary holds anything from three values to
 * several hundred, and sending all of them so that a box can filter them in the
 * browser makes the size of the page follow the size of the catalog. The values
 * a document already refers to are resolved by identity (`termsByIds`) and the rest
 * are searched for (`findTerms`).
 */
export async function loadEditableCatalog(db: Executor): Promise<EditableCatalog> {
  const keys = await db
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
    .orderBy(contentKey.position, contentKey.code)
  return { keys }
}

/**
 * The catalog with every term.
 *
 * **Only what runs on the server may request this.** Matching what an archive
 * spells against the vocabulary needs the whole of it, and nothing of it
 * reaches a page.
 */
export async function loadCatalogWithTerms(db: Executor): Promise<CatalogWithTerms> {
  const [catalog, terms] = await Promise.all([
    loadEditableCatalog(db),
    db
      .select(TERM_COLUMNS)
      .from(vocabularyTerm)
      .orderBy(vocabularyTerm.position, vocabularyTerm.labelEn),
  ])
  return { ...catalog, terms }
}

/** The terms these identities name. */
export async function termsByIds(
  db: Executor,
  ids: readonly string[],
): Promise<EditableTerm[]> {
  if (ids.length === 0) return []
  return db
    .select(TERM_COLUMNS)
    .from(vocabularyTerm)
    .where(inArray(vocabularyTerm.id, [...new Set(ids)]))
}

/**
 * The candidates for what was typed into a vocabulary's box: by code or by
 * either label, capped — and for an empty field, the vocabulary from its first
 * code, so the box opens on something the moment it is entered.
 */
export async function findTerms(
  db: Executor,
  setId: string,
  needle: string,
): Promise<EditableTerm[]> {
  const find = needle.trim()
  // **An empty field opens on the vocabulary's first terms**, in code order: a
  // vocabulary of a handful is then shown whole the moment its box is entered,
  // and a large one shows where it starts, with the box prompting to type.
  const like = `%${find}%`
  return db
    .select(TERM_COLUMNS)
    .from(vocabularyTerm)
    .where(find === ""
      ? eq(vocabularyTerm.setId, setId)
      : and(
          eq(vocabularyTerm.setId, setId),
          or(
            sql`${vocabularyTerm.code} ILIKE ${like}`,
            sql`${vocabularyTerm.labelEn} ILIKE ${like}`,
            sql`coalesce(${vocabularyTerm.labelJa}, '') ILIKE ${like}`,
          ),
        ))
    .orderBy(vocabularyTerm.code)
    .limit(TERM_CANDIDATES)
}

/**
 * The candidates for what was typed into a disease's box.
 *
 * A code is normalised before it is looked for — the box is written with and
 * without the point, in either case — and **the tail is dropped until the
 * vocabulary has it**. What the articles and the application forms write is
 * partly ICD-10-CM, which WHO's classification cannot spell: `K75.81` is NASH
 * and `K758` is what stands for it, so typing the longer code offers the
 * shorter one rather than nothing.
 *
 * Anything not shaped like a code is a word, and words are looked for as they
 * are typed.
 */
export async function findDiseaseTerms(
  db: Executor,
  setId: string,
  needle: string,
): Promise<EditableTerm[]> {
  const code = icd10Code(needle.trim())
  if (code === null) return findTerms(db, setId, needle)
  for (let length = code.length; length >= 3; length -= 1) {
    const found = await findTerms(db, setId, code.slice(0, length))
    if (found.length > 0) return found
  }
  return []
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
