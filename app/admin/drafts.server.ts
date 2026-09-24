/**
 * Every write to a draft.
 *
 * **This module is the only place a draft is written**, and that is the whole
 * of how concurrent editing is kept honest. Each function that changes a row
 * that already exists takes the revision it is changing, puts it in the WHERE
 * clause, and reports a conflict when no row matched. A trigger could not
 * enforce this — an update that forgot the predicate would still bump the
 * revision and look correct — so the only place the rule can live is the shape
 * of the calls, which is why they are all here and all take the same argument.
 *
 * There are two revisions because there are two kinds of mutable row under a
 * draft: the draft's own content, and the entry that holds one dataset the
 * draft has touched. **An experiment is inside a dataset's content**, so
 * editing one is checked against that dataset's entry — it has no revision of
 * its own to be checked against.
 *
 * The functions that create a row take no revision because there is nothing to
 * check against; the first save of a dataset entry finds its conflict by not
 * being the insert that won.
 *
 * A conflict is told apart from a draft that is simply gone, because the two
 * mean different things to whoever asked: one is somebody else's edit to look
 * at, the other is a page that no longer exists.
 */

import { randomBytes, randomUUID } from "node:crypto"

import { and, eq, sql, type SQL } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import { emptyResearchContent } from "~/content/empty"
import { datasetWithTermMerged } from "~/content/terms"
import { messagesFor } from "~/i18n/messages"
import type {
  CommentAnchor,
  DatasetContent,
  ResearchContent,
  VersionContent,
} from "~/content/types"
import { descriptionOf, draftContentOf } from "~/content/version"
import type { Database, Executor, Transaction } from "~/db/client.server"
import {
  comment,
  dataset,
  draftDatasetEntry,
  labelPin,
  research,
  researchDraft,
  researchVersion,
} from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { draftDatasets } from "./datasets"
import type { DroppedValue } from "./templates"
import { pinLabelsIn, type PinRequest } from "./labels.server"

const SHARE_TOKEN_BYTES = 32

/** Which draft, and which version of it the caller was looking at. */
export interface DraftAt {
  draftId: string
  revision: number
}

/**
 * Which dataset entry, and which version of it the caller was looking at.
 * **Null means the draft had not touched this dataset when the screen opened**,
 * which is what tells the first save apart from every later one.
 */
export interface DatasetEntryAt {
  draftId: string
  datasetId: string
  revision: number | null
}

export type SaveOutcome
  = | { status: "saved", revision: number }
    | { status: "conflict" }
    | { status: "gone" }

export type DiscardOutcome
  = | { status: "discarded" }
    | { status: "conflict" }
    | { status: "gone" }

export type CreateDatasetOutcome
  = | { status: "created", datasetId: string }
    | { status: "conflict" }
    | { status: "gone" }

export type DeleteDatasetOutcome
  = | { status: "deleted" }
    | { status: "conflict" }
    | { status: "gone" }
    /** Not this research's, or belonging to another draft. */
    | { status: "refused" }

function one<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error("the insert returned no row")
  return row
}

/**
 * The token a share link carries. It is minted with the draft because the
 * column is part of the draft rather than of a table of links: turning sharing
 * off and on again has to give back the same address.
 */
export function newShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url")
}

async function draftExists(executor: Executor, draftId: string): Promise<boolean> {
  const rows = await executor
    .select({ id: researchDraft.id })
    .from(researchDraft)
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  return rows.length > 0
}

/** What a draft holds now, for the writes that add to it before they save it. */
async function currentContent(tx: Transaction, draftId: string): Promise<ResearchContent | null> {
  const [draft] = await tx
    .select({ content: researchDraft.content })
    .from(researchDraft)
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  return draft?.content ?? null
}

/**
 * A research that does not exist yet, and the draft it is written in. The two
 * are made together because a research with no version and no draft has nothing
 * anybody could open.
 *
 * No hum label is pinned: a research is started before a number has been
 * issued, and publishing is what insists on one.
 */
export async function createResearchWithDraft(
  db: Database,
): Promise<{ researchId: string, draftId: string }> {
  return db.transaction(async (tx) => {
    const created = one(await tx.insert(research).values({}).returning({ id: research.id }))
    const draft = one(await tx
      .insert(researchDraft)
      .values({
        researchId: created.id,
        content: emptyResearchContent(),
        shareToken: newShareToken(),
      })
      .returning({ id: researchDraft.id }))
    return { researchId: created.id, draftId: draft.id }
  })
}

/** A dataset a seeded draft brings with it: its accession and its description. */
export interface SeededDataset {
  /** The accession, pinned as the dataset's primary id as it is created. */
  label: string
  content: DatasetContent
  /**
   * What upstream stated that the catalog has no word for. **Each is left as a
   * comment on the field it would have gone in**, written by whoever made the
   * dataset — the field is made unsettled, and the comment is what says what to
   * settle it on, where the curator is when they do.
   */
  dropped?: readonly DroppedValue[]
}

export type SeedOutcome
  = | { status: "created", researchId: string, draftId: string }
    /** A label the seed would pin already names something else. */
    | { status: "taken", label: string }

export type AddDatasetsOutcome
  = | { status: "added", datasetIds: string[] }
    | { status: "conflict" }
    | { status: "gone" }
    | { status: "taken", label: string }

/** Thrown to undo the transaction, because returning from one commits it. */
class LabelTaken extends Error {
  constructor(readonly label: string) {
    super(`the label ${label} already names something`)
  }
}

async function taken<T>(run: () => Promise<T>): Promise<T | { status: "taken", label: string }> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof LabelTaken) return { status: "taken", label: error.label }
    throw error
  }
}

function pinRequests(
  humLabel: string | null,
  researchId: string,
  datasets: readonly { id: string, label: string }[],
): PinRequest[] {
  const hum: PinRequest[] = humLabel === null
    ? []
    : [{ kind: "hum", label: humLabel, subjectId: researchId, isPrimary: true }]
  return [
    ...hum,
    ...datasets.map((entry): PinRequest => ({
      kind: "dataset",
      label: entry.label,
      subjectId: entry.id,
      isPrimary: true,
    })),
  ]
}

/**
 * A research written from what an upstream system already says about it, with
 * its datasets in the same breath.
 *
 * **The labels are pinned as the identities are made.** A draft holding two
 * hundred datasets that are told apart only by an internal identity is a draft
 * nobody can work in, and the ledger's uniqueness is what decides whether this
 * research may be started at all — a hum label somebody else holds means the
 * research already exists.
 */
export async function createResearchFromUpstream(
  db: Database,
  seed: {
    humLabel: string | null
    content: ResearchContent
    datasets: SeededDataset[]
  },
  actor: EventActor,
): Promise<SeedOutcome> {
  return taken(() => db.transaction(async (tx): Promise<SeedOutcome> => {
    const created = one(await tx.insert(research).values({}).returning({ id: research.id }))
    const datasets = seed.datasets.map((entry) => ({ ...entry, id: randomUUID() }))

    const draft = one(await tx
      .insert(researchDraft)
      .values({
        researchId: created.id,
        content: { ...seed.content, datasetIds: datasets.map((entry) => entry.id) },
        shareToken: newShareToken(),
      })
      .returning({ id: researchDraft.id }))

    await writeSeededDatasets(tx, created.id, draft.id, datasets, actor)
    const pinned = await pinLabelsIn(tx, pinRequests(seed.humLabel, created.id, datasets), actor)
    if (pinned.status === "taken") throw new LabelTaken(pinned.label)

    return { status: "created", researchId: created.id, draftId: draft.id }
  }))
}

/**
 * More datasets for a draft that is already open, written from upstream.
 *
 * Adding one changes which datasets the version lists, so the draft's revision
 * is checked exactly as it is when one is created by hand.
 */
export async function addDatasetsFromUpstream(
  db: Database,
  at: DraftAt,
  seed: { researchId: string, datasets: SeededDataset[] },
  actor: EventActor,
): Promise<AddDatasetsOutcome> {
  return taken(() => db.transaction(async (tx): Promise<AddDatasetsOutcome> => {
    const before = await currentContent(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const datasets = seed.datasets.map((entry) => ({ ...entry, id: randomUUID() }))
    const rows = await tx
      .update(researchDraft)
      .set({
        content: {
          ...before,
          datasetIds: [...before.datasetIds, ...datasets.map((entry) => entry.id)],
        },
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })
    if (rows[0] === undefined) return { status: "conflict" }

    await writeSeededDatasets(tx, seed.researchId, at.draftId, datasets, actor)
    const pinned = await pinLabelsIn(tx, pinRequests(null, seed.researchId, datasets), actor)
    if (pinned.status === "taken") throw new LabelTaken(pinned.label)

    return { status: "added", datasetIds: datasets.map((entry) => entry.id) }
  }))
}

/**
 * Taking an application into a draft that already exists.
 *
 * **One transaction, because the curator confirmed one thing.** The content and
 * the datasets come from the same branch and were decided on the same screen;
 * writing them separately would leave a draft holding one half of an approval
 * if the second write lost the race.
 *
 * **The content arrives already decided.** What the application said and what
 * the draft said were put side by side on the screen and the curator wrote the
 * answer, so nothing is merged here. The dataset ids are the exception: they
 * are the draft's own, and the new ones are appended rather than replacing
 * what is there.
 */
export async function applyUpstreamToDraft(
  db: Database,
  at: DraftAt,
  seed: {
    researchId: string
    content: ResearchContent
    datasets: SeededDataset[]
  },
  actor: EventActor,
): Promise<AddDatasetsOutcome> {
  return taken(() => db.transaction(async (tx): Promise<AddDatasetsOutcome> => {
    const before = await currentContent(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const datasets = seed.datasets.map((entry) => ({ ...entry, id: randomUUID() }))
    const rows = await tx
      .update(researchDraft)
      .set({
        content: {
          ...seed.content,
          datasetIds: [...before.datasetIds, ...datasets.map((entry) => entry.id)],
        },
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })
    if (rows[0] === undefined) return { status: "conflict" }

    await writeSeededDatasets(tx, seed.researchId, at.draftId, datasets, actor)
    const pinned = await pinLabelsIn(tx, pinRequests(null, seed.researchId, datasets), actor)
    if (pinned.status === "taken") throw new LabelTaken(pinned.label)

    return { status: "added", datasetIds: datasets.map((entry) => entry.id) }
  }))
}

/**
 * The identity and the description of each seeded dataset.
 *
 * They belong to the draft until it is published, like any dataset made inside
 * one.
 */
async function writeSeededDatasets(
  tx: Transaction,
  researchId: string,
  draftId: string,
  datasets: readonly { id: string, content: DatasetContent, dropped?: readonly DroppedValue[] }[],
  actor: EventActor,
): Promise<void> {
  if (datasets.length === 0) return
  await tx.insert(dataset).values(
    datasets.map((entry) => ({ id: entry.id, researchId, originDraftId: draftId })),
  )
  await tx.insert(draftDatasetEntry).values(
    datasets.map((entry) => ({
      draftId,
      datasetId: entry.id,
      content: entry.content,
    })),
  )
  const said = datasets.flatMap((entry) => droppedComments(entry.id, entry.dropped ?? []))
  if (said.length > 0) {
    await tx.insert(comment).values(said.map((one) => ({
      draftId,
      anchor: one.anchor,
      authorSub: actor.sub,
      authorName: actor.name,
      body: one.body,
    })))
  }
}

/**
 * One comment per field, naming every value upstream stated there that the
 * catalog has no word for. A value with no field to stand on — its key is not
 * in the catalog — has nowhere to be said.
 */
export function droppedComments(
  datasetId: string,
  dropped: readonly DroppedValue[],
): { anchor: CommentAnchor, body: string }[] {
  const byField = new Map<string, string[]>()
  for (const value of dropped) {
    if (value.at === null) continue
    const values = byField.get(value.at) ?? []
    if (!values.includes(value.value)) values.push(value.value)
    byField.set(value.at, values)
  }
  const t = messagesFor("ja").admin.templates
  return [...byField].map(([path, values]) => ({
    anchor: { kind: "dataset-field", datasetId, path },
    body: t.droppedComment(values.map((value) => `「${value}」`).join("")),
  }))
}

/**
 * An empty draft of an existing research. Nothing is copied into it: what it
 * comes to hold is taken in afterwards — from a version, an application or an
 * accession — or typed.
 */
export async function createEmptyDraft(db: Database, researchId: string): Promise<string> {
  const draft = one(await db
    .insert(researchDraft)
    .values({
      researchId,
      content: emptyResearchContent(),
      shareToken: newShareToken(),
    })
    .returning({ id: researchDraft.id }))
  return draft.id
}

/**
 * A new draft holding what a version holds. **A draft and nothing more**: it
 * does not remember which version it came from, and which number it will be
 * published under is asked when it is published. Pressed twice, it makes two.
 *
 * Null for a number no version of the research holds.
 */
export async function draftCopiedFrom(
  db: Database,
  researchId: string,
  number: number,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select({ content: researchVersion.content })
      .from(researchVersion)
      .where(and(eq(researchVersion.researchId, researchId), eq(researchVersion.number, number)))
      .limit(1)
    if (version === undefined) return null
    return draftFromVersion(tx, { researchId, content: version.content })
  })
}

export type UpdatingOutcome
  = | { status: "opened", draftId: string }
    | { status: "gone" }

/**
 * The draft a version is updated in: the one already open for it, or a new one
 * holding what the version holds.
 *
 * **The version is not touched.** It stays out while the draft is written, and
 * publishing the draft is what puts it in the version's place, under the same
 * number. **One per version**, which the row lock is for: two presses find the
 * same draft rather than racing the unique constraint. Gone for a version the
 * research does not hold.
 */
export async function draftUpdating(
  db: Database,
  researchId: string,
  versionId: string,
): Promise<UpdatingOutcome> {
  return db.transaction(async (tx): Promise<UpdatingOutcome> => {
    const [version] = await tx
      .select({ researchId: researchVersion.researchId, content: researchVersion.content })
      .from(researchVersion)
      .where(and(eq(researchVersion.id, versionId), eq(researchVersion.researchId, researchId)))
      .limit(1)
      .for("update")
    if (version === undefined) return { status: "gone" }

    const [open] = await tx
      .select({ id: researchDraft.id })
      .from(researchDraft)
      .where(eq(researchDraft.replacesVersionId, versionId))
      .limit(1)
    if (open !== undefined) return { status: "opened", draftId: open.id }

    return { status: "opened", draftId: await draftFromVersion(tx, version, versionId) }
  })
}

/**
 * A draft holding what a version holds, unfolded: the body in the draft's own
 * row, each description in one of its own.
 *
 * **The copy is made once and in full**, rather than filled in as datasets are
 * touched. A draft that reached back to the version it came from would break
 * the moment that version was withdrawn — and nothing about the version is
 * kept: the draft does not know which one it came from.
 *
 * This is also what withdrawing does with the row it takes out of the table.
 */
export async function draftFromVersion(
  tx: Transaction,
  version: { researchId: string, content: VersionContent },
  /** The version this draft is the update of, when it is one (`draftUpdating`). */
  updates: string | null = null,
): Promise<string> {
  const draft = one(await tx
    .insert(researchDraft)
    .values({
      researchId: version.researchId,
      content: draftContentOf(version.content),
      replacesVersionId: updates,
      shareToken: newShareToken(),
    })
    .returning({ id: researchDraft.id }))

  if (version.content.datasets.length > 0) {
    await tx.insert(draftDatasetEntry).values(version.content.datasets.map((row) => ({
      draftId: draft.id,
      datasetId: row.datasetId,
      content: descriptionOf(row),
    })))
  }
  return draft.id
}

/**
 * Writing the editor's work back. The revision moves by one, which is what the
 * next save will be checked against.
 */
export async function saveDraftContent(
  db: Database,
  at: DraftAt,
  fields: { content: ResearchContent },
): Promise<SaveOutcome> {
  return db.transaction(async (tx) => {
    if (!await draftExists(tx, at.draftId)) return { status: "gone" }

    const rows = await tx
      .update(researchDraft)
      .set({
        content: fields.content,
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })

    const row = rows[0]
    if (row === undefined) return { status: "conflict" }

    return { status: "saved", revision: row.revision }
  })
}

/**
 * Writing one dataset back. The unit is the entry rather than the draft: a
 * dataset is its own identity, and a research with two hundred of them is not
 * one screenful.
 *
 * A draft that was copied from a version already holds an entry for every
 * dataset that version listed, so the null revision — "there is no entry yet" —
 * belongs to datasets added since.
 */
export async function saveDatasetEntry(
  db: Database,
  at: DatasetEntryAt,
  content: DatasetContent,
): Promise<SaveOutcome> {
  return db.transaction(async (tx) => {
    if (!await draftExists(tx, at.draftId)) return { status: "gone" }

    const revision = at.revision
    if (revision === null) {
      const inserted = await tx
        .insert(draftDatasetEntry)
        .values({
          draftId: at.draftId,
          datasetId: at.datasetId,
          content,
        })
        .onConflictDoNothing()
        .returning({ revision: draftDatasetEntry.revision })

      const created = inserted[0]
      if (created === undefined) return { status: "conflict" }
      return { status: "saved", revision: created.revision }
    }

    const rows = await tx
      .update(draftDatasetEntry)
      .set({
        content,
        revision: sql`${draftDatasetEntry.revision} + 1`,
      })
      .where(and(
        eq(draftDatasetEntry.draftId, at.draftId),
        eq(draftDatasetEntry.datasetId, at.datasetId),
        eq(draftDatasetEntry.revision, revision),
      ))
      .returning({ revision: draftDatasetEntry.revision })

    const row = rows[0]
    if (row !== undefined) return { status: "saved", revision: row.revision }

    // The entry is gone in two different ways: somebody deleted the dataset, or
    // somebody saved it first. Only the second is worth showing a diff for.
    const [still] = await tx
      .select({ id: dataset.id })
      .from(dataset)
      .where(eq(dataset.id, at.datasetId))
      .limit(1)
    if (still === undefined) return { status: "gone" }

    return { status: "conflict" }
  })
}

/**
 * A dataset this draft is adding. It belongs to the draft until the draft is
 * published, which is what `originDraftId` records, and it is listed by the
 * version straight away — a dataset created and then left off the list is a
 * dataset nobody would find again.
 *
 * Listing it changes the draft's content, so the revision is checked. The
 * identity is minted before the check so that a refused create leaves nothing
 * behind: the update either happens or the transaction did nothing at all.
 */
export async function createDatasetInDraft(
  db: Database,
  at: DraftAt,
  researchId: string,
): Promise<CreateDatasetOutcome> {
  return db.transaction(async (tx) => {
    const before = await currentContent(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const datasetId = randomUUID()
    const rows = await tx
      .update(researchDraft)
      .set({
        content: { ...before, datasetIds: [...before.datasetIds, datasetId] },
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })
    if (rows[0] === undefined) return { status: "conflict" }

    await tx.insert(dataset).values({ id: datasetId, researchId, originDraftId: at.draftId })
    return { status: "created", datasetId }
  })
}

/** What the listing screen does to which datasets the version lists. */
/** One step of the order: a dataset, and whether it goes up (-1) or down (1). */
export interface ListingChange {
  datasetId: string
  by: -1 | 1
}

export type ListingOutcome
  = | { status: "changed" }
    | { status: "conflict" }
    | { status: "gone" }

/**
 * The order the datasets go out in, changed by one step.
 *
 * **The order is all a draft decides about datasets** — which of them the
 * version carries is the research's answer, not the draft's. The order is
 * research content, so it moves the draft's revision like a save does; it is
 * changed here rather than by the editor's save because the datasets are
 * decided on their own screen.
 *
 * A step that changes nothing (moving the first row up) still moves the
 * revision: the draft was written to, and the next save is checked against
 * that.
 */
export async function changeListing(
  db: Database,
  at: DraftAt,
  researchId: string,
  change: ListingChange,
): Promise<ListingOutcome> {
  return db.transaction(async (tx) => {
    const before = await currentContent(tx, at.draftId)
    if (before === null) return { status: "gone" }

    // **The step is taken on the order the screen shows**, which is every
    // dataset this draft publishes — not on what the content happens to name
    // already. A draft that has never been ordered names none of them, and a
    // move inside an empty list would be a press that does nothing. What is
    // written back is that whole order, so the content catches up with the
    // research on the first move.
    const owned = await tx
      .select({ id: dataset.id, originDraftId: dataset.originDraftId })
      .from(dataset)
      .where(eq(dataset.researchId, researchId))
      .orderBy(dataset.id)
    const shown = draftDatasets(owned, at.draftId, before.datasetIds).map((row) => row.id)

    const rows = await tx
      .update(researchDraft)
      .set({
        content: { ...before, datasetIds: listingAfter(shown, change) },
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })
    if (rows[0] === undefined) return { status: "conflict" }
    return { status: "changed" }
  })
}

/** The order after one change. Pure, so that the screen and the server agree. */
export function listingAfter(listed: readonly string[], change: ListingChange): string[] {
  const at = listed.indexOf(change.datasetId)
  const to = at + change.by
  if (at === -1 || to < 0 || to >= listed.length) return [...listed]
  const next = [...listed]
  const [moved] = next.splice(at, 1)
  if (moved !== undefined) next.splice(to, 0, moved)
  return next
}

/**
 * Taking a dataset out of its research.
 *
 * **A dataset belongs to the research, so this is the one way it goes**:
 * there is no taking it off a version, because a version does not choose.
 * A published one can go too, and it goes at once — the published row goes
 * with it, so the pages, the listings and the search stop showing it without
 * waiting for the next publish. The versions that described it keep their
 * description; what they lose is the dataset to lead to.
 *
 * **What another draft made is not this draft's to destroy.** It has never
 * been out, and it belongs to the draft that made it.
 *
 * The entries and the pins go by cascade, which is what frees the accession to
 * be pinned again. The trail keeps the row's name, because nothing else will.
 *
 * **The research's search rows are derived again, not only the dataset's
 * dropped.** The research's row carries the text and the facet values of its
 * datasets, so it would otherwise still be found by what only this one said.
 *
 * **The comments on it go too, in every draft.** A comment's place is JSON
 * that no cascade reaches, and one left behind would point at nothing a screen
 * draws while being counted as unresolved. Comments go with what they are
 * about, the way they go with a discarded draft.
 */
export async function deleteResearchDataset(
  db: Database,
  at: DraftAt,
  researchId: string,
  datasetId: string,
  actor: EventActor,
): Promise<DeleteDatasetOutcome> {
  return db.transaction(async (tx) => {
    const before = await currentContent(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const [target] = await tx
      .select({ id: dataset.id, originDraftId: dataset.originDraftId, label: labelPin.label })
      .from(dataset)
      .leftJoin(labelPin, and(
        eq(labelPin.datasetId, dataset.id),
        eq(labelPin.kind, "dataset"),
        eq(labelPin.isPrimary, true),
      ))
      .where(and(eq(dataset.id, datasetId), eq(dataset.researchId, researchId)))
      .limit(1)
    if (target === undefined) return { status: "refused" }
    if (target.originDraftId !== null && target.originDraftId !== at.draftId) {
      return { status: "refused" }
    }

    const rows = await tx
      .update(researchDraft)
      .set({
        content: {
          ...before,
          datasetIds: before.datasetIds.filter((id) => id !== datasetId),
        },
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })
    if (rows[0] === undefined) return { status: "conflict" }

    await tx.delete(dataset).where(eq(dataset.id, datasetId))
    await tx
      .delete(comment)
      .where(and(
        sql`${comment.anchor}->>'kind' = 'dataset-field'`,
        sql`${comment.anchor}->>'datasetId' = ${datasetId}`,
      ))
    // Nothing in the search rows points at a dataset by foreign key
    // (`schema/search.ts`). With the pin gone the dataset has no label, and the
    // derivation leaves out a dataset without one.
    await rebuildSearchDocs(tx, { researchIds: [researchId] })
    await recordEvent(tx, {
      actor,
      action: "delete-dataset",
      subjectType: "dataset",
      subjectId: datasetId,
      detail: { researchId, label: target.label },
    })
    return { status: "deleted" }
  })
}

export type ShareOutcome
  = | { status: "set" }
    | { status: "gone" }

/**
 * Turning sharing on or off, and saying when it lapses.
 *
 * **These take no revision.** Sharing is not content: nothing about it can be
 * lost by two administrators disagreeing except the setting one of them made a
 * moment ago, and the last press winning is the right answer. Checking it
 * against the content revision would mean flipping a switch here made every
 * open editor's next save fail with a conflict over fields nobody touched.
 */
export async function setDraftSharing(
  db: Executor,
  draftId: string,
  sharing: { enabled: boolean, expiresAt: Date | null },
): Promise<ShareOutcome> {
  const rows = await db
    .update(researchDraft)
    .set({ shareEnabled: sharing.enabled, shareExpiresAt: sharing.expiresAt })
    .where(eq(researchDraft.id, draftId))
    .returning({ id: researchDraft.id })
  return rows[0] === undefined ? { status: "gone" } : { status: "set" }
}

/**
 * A new token, which kills the address that was handed out. This is the only
 * way to do that: private can be undone, and an expiry can be extended, so
 * neither of them answers "this link must stop working".
 */
export async function reissueShareToken(db: Executor, draftId: string): Promise<ShareOutcome> {
  const rows = await db
    .update(researchDraft)
    .set({ shareToken: newShareToken() })
    .where(eq(researchDraft.id, draftId))
    .returning({ id: researchDraft.id })
  return rows[0] === undefined ? { status: "gone" } : { status: "set" }
}

export type ConsumeOutcome
  = | { status: "consumed", researchId: string }
    | { status: "conflict" }
    | { status: "gone" }

/**
 * Taking the draft away, with everything that hung off it — the changed dataset
 * entries, the comments, the share link, and any dataset
 * identity the draft introduced and nothing has adopted, all by cascade. A draft is not history, so there is nowhere for any of it to go.
 *
 * **Both discarding and publishing end here**, which is why it takes a
 * transaction rather than opening one: publishing has a good deal to write
 * first, and the whole of it has to fall together if the revision has moved.
 * A publish adopts what it is publishing by clearing `originDraftId` before
 * calling this; a dataset the draft made and left off the version is not
 * adopted, and goes with the draft.
 *
 * The revision is checked here for the same reason it is checked on a save:
 * neither operation can be undone, and a draft somebody has edited since the
 * screen was opened is worth stopping at.
 */
export async function consumeDraft(
  db: Transaction,
  at: DraftAt,
): Promise<ConsumeOutcome> {
  const rows = await db
    .delete(researchDraft)
    .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
    .returning({ researchId: researchDraft.researchId })

  const row = rows[0]
  if (row !== undefined) return { status: "consumed", researchId: row.researchId }
  return { status: await draftExists(db, at.draftId) ? "conflict" : "gone" }
}

/** Throwing a draft away, leaving only the record that it was thrown away. */
export async function discardDraft(
  db: Database,
  at: DraftAt,
  actor: EventActor,
): Promise<DiscardOutcome> {
  return db.transaction(async (tx) => {
    const outcome = await consumeDraft(tx, at)
    if (outcome.status !== "consumed") return outcome

    await recordEvent(tx, {
      actor,
      action: "discard-draft",
      subjectType: "draft",
      subjectId: at.draftId,
      detail: { researchId: outcome.researchId },
    })
    return { status: "discarded" }
  })
}

/**
 * Folding one vocabulary value into another, wherever a draft's description
 * points at it.
 *
 * **This is the one write here that takes no revision, and the reason is that
 * it is aimed the other way round.** Every other function changes the row
 * somebody said they were holding, so it checks what they read against what is
 * there — *refuse me if this changed under me*. A merge is aimed at a
 * vocabulary value; whoever runs it is looking at the catalog screen and holds
 * no draft at all, so there is nothing of theirs to check. It moves the
 * revision of every row it touches on instead — *I changed this, so refuse
 * whoever was reading it*. The two are the same rule from opposite ends, and
 * between them no save can put a description back the way it was read.
 *
 * Without the bump, an editor holding one of these rows would save the
 * description they read, the folded term would come back in that row alone, and
 * nothing would say so — the row would point at a term the vocabulary no longer
 * has.
 *
 * The condition is handed over rather than built here — which rows point at a
 * term is the catalog's question, and this module's job is that they are
 * written the one way drafts are written (`drafts.test.ts`).
 */
export async function mergeTermInDrafts(
  db: Executor,
  pointing: SQL,
  from: string,
  into: string,
): Promise<void> {
  // Held until the merge commits. A save that was writing a row when this read
  // it is waited for, and the row is read as that save left it; a save after
  // this is refused by the revision moved here.
  const entries = await db
    .select({
      id: draftDatasetEntry.id,
      content: draftDatasetEntry.content,
    })
    .from(draftDatasetEntry)
    .where(pointing)
    .for("update")

  for (const entry of entries) {
    await db
      .update(draftDatasetEntry)
      .set({
        content: datasetWithTermMerged(entry.content, from, into),
        revision: sql`${draftDatasetEntry.revision} + 1`,
      })
      .where(eq(draftDatasetEntry.id, entry.id))
  }
}
