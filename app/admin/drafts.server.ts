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
 * being the insert that won. Presence is the one write with no revision at all:
 * it is not content, nobody reads it for correctness, and a lost update costs
 * one heartbeat.
 *
 * A conflict is told apart from a draft that is simply gone, because the two
 * mean different things to whoever asked: one is somebody else's edit to look
 * at, the other is a page that no longer exists.
 */

import { randomBytes, randomUUID } from "node:crypto"

import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import { emptyResearchContent } from "~/content/empty"
import type {
  DatasetContent,
  DraftSnapshot,
  ResearchContent,
  UndoReason,
} from "~/content/types"
import type { Database, Executor, Transaction } from "~/db/client.server"
import {
  contentSnapshot,
  dataset,
  datasetContent,
  draftDatasetEntry,
  draftPresence,
  draftUndo,
  research,
  researchDraft,
  researchVersion,
} from "~/db/schema"

import { pinLabelsIn, type PinRequest } from "./labels.server"

const SHARE_TOKEN_BYTES = 32

/** The eleventh push drops the oldest. */
export const UNDO_DEPTH = 10

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
    /** Published, or belonging to another draft: not this draft's to destroy. */
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
function newShareToken(): string {
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

/** The whole of a draft as it stands, which is what one undo entry holds. */
type DraftState = Omit<DraftSnapshot, "reason">

async function currentDraft(tx: Transaction, draftId: string): Promise<DraftState | null> {
  const [draft] = await tx
    .select({ note: researchDraft.note, content: researchDraft.content })
    .from(researchDraft)
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  if (draft === undefined) return null

  const entries = await tx
    .select({ datasetId: draftDatasetEntry.datasetId, content: draftDatasetEntry.content })
    .from(draftDatasetEntry)
    .where(eq(draftDatasetEntry.draftId, draftId))
    .orderBy(draftDatasetEntry.datasetId)

  return { note: draft.note, content: draft.content, datasetEntries: entries }
}

/**
 * One more snapshot on the stack, and the oldest off the end of it.
 *
 * Snapshots are rows rather than one JSON value so that a save appends instead
 * of rewriting the whole stack. The depth is bounded rather than the age,
 * because drafts stay open for months and a stalled one must not accumulate.
 */
async function pushUndo(
  tx: Transaction,
  draftId: string,
  snapshot: DraftSnapshot,
): Promise<void> {
  await tx.insert(draftUndo).values({ draftId, snapshot })

  const kept = await tx
    .select({ id: draftUndo.id })
    .from(draftUndo)
    .where(eq(draftUndo.draftId, draftId))
    .orderBy(desc(draftUndo.createdAt), desc(draftUndo.id))
    .limit(UNDO_DEPTH)

  await tx
    .delete(draftUndo)
    .where(and(
      eq(draftUndo.draftId, draftId),
      notInArray(draftUndo.id, kept.map((row) => row.id)),
    ))
}

function snapshot(reason: UndoReason, state: DraftState): DraftSnapshot {
  return { reason, ...state }
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
 * its datasets in the same breath (docs/editing.md の「上流からの下書き」).
 *
 * **The labels are pinned as the identities are made.** A draft holding two
 * hundred datasets that are told apart only by an internal identity is a draft
 * nobody can work in, and the ledger's uniqueness is what decides whether this
 * research may be started at all — a hum label somebody else holds means the
 * research already exists.
 */
export async function createResearchFromUpstream(
  db: Database,
  seed: { humLabel: string | null, content: ResearchContent, datasets: SeededDataset[] },
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

    await writeSeededDatasets(tx, created.id, draft.id, datasets)
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
    const before = await currentDraft(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const datasets = seed.datasets.map((entry) => ({ ...entry, id: randomUUID() }))
    const rows = await tx
      .update(researchDraft)
      .set({
        content: {
          ...before.content,
          datasetIds: [...before.content.datasetIds, ...datasets.map((entry) => entry.id)],
        },
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })
    if (rows[0] === undefined) return { status: "conflict" }

    await writeSeededDatasets(tx, seed.researchId, at.draftId, datasets)
    const pinned = await pinLabelsIn(tx, pinRequests(null, seed.researchId, datasets), actor)
    if (pinned.status === "taken") throw new LabelTaken(pinned.label)

    return { status: "added", datasetIds: datasets.map((entry) => entry.id) }
  }))
}

/**
 * The identity and the description of each seeded dataset.
 *
 * They belong to the draft until it is published, like any dataset made inside
 * one, and their entries carry no base: there is no published description for a
 * three-way diff to have started from.
 */
async function writeSeededDatasets(
  tx: Transaction,
  researchId: string,
  draftId: string,
  datasets: readonly { id: string, content: DatasetContent }[],
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
      baseContent: null,
    })),
  )
}

/**
 * A new draft of an existing research, starting from its latest published
 * version. The snapshot it came from is remembered rather than the version
 * number, because a fix replaces a snapshot without changing the number and a
 * draft taken before that fix still has to be seen as stale.
 *
 * A research with nothing published yet starts from empty content and no
 * parent.
 */
export async function createDraft(db: Database, researchId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ snapshotId: contentSnapshot.id, content: contentSnapshot.content })
      .from(researchVersion)
      .innerJoin(contentSnapshot, eq(contentSnapshot.id, researchVersion.snapshotId))
      .where(and(
        eq(researchVersion.researchId, researchId),
        eq(researchVersion.published, true),
      ))
      .orderBy(desc(researchVersion.number))
      .limit(1)

    const draft = one(await tx
      .insert(researchDraft)
      .values({
        researchId,
        content: latest?.content ?? emptyResearchContent(),
        parentSnapshotId: latest?.snapshotId ?? null,
        shareToken: newShareToken(),
      })
      .returning({ id: researchDraft.id }))
    return draft.id
  })
}

/**
 * Writing the editor's work back. The revision moves by one, which is what the
 * next save will be checked against.
 *
 * The state as it stood goes onto the undo stack first; a save the revision
 * refuses puts the refused form there instead, because that form exists nowhere
 * else once the screen is closed.
 */
export async function saveDraftContent(
  db: Database,
  at: DraftAt,
  fields: { note: string, content: ResearchContent },
): Promise<SaveOutcome> {
  return db.transaction(async (tx) => {
    const before = await currentDraft(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const rows = await tx
      .update(researchDraft)
      .set({
        content: fields.content,
        note: fields.note,
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })

    const row = rows[0]
    if (row === undefined) {
      await pushUndo(tx, at.draftId, snapshot("rejected", {
        note: fields.note,
        content: fields.content,
        datasetEntries: before.datasetEntries,
      }))
      return { status: "conflict" }
    }

    await pushUndo(tx, at.draftId, snapshot("before-save", before))
    return { status: "saved", revision: row.revision }
  })
}

/**
 * Writing one dataset back. The unit is the entry rather than the draft: a
 * dataset is its own identity, and a research with two hundred of them is not
 * one screenful.
 *
 * The first save is the one that creates the entry, and it carries the
 * published description alongside as `baseContent` — the three-way diff at
 * publish time needs to know what was there when editing began, and after the
 * first save nothing can recover it. An entry the draft itself introduced has
 * no published description, so it has no base.
 */
export async function saveDatasetEntry(
  db: Database,
  at: DatasetEntryAt,
  content: DatasetContent,
): Promise<SaveOutcome> {
  return db.transaction(async (tx) => {
    const before = await currentDraft(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const revision = at.revision
    if (revision === null) {
      const [published] = await tx
        .select({ content: datasetContent.content })
        .from(datasetContent)
        .where(eq(datasetContent.datasetId, at.datasetId))
        .limit(1)

      const inserted = await tx
        .insert(draftDatasetEntry)
        .values({
          draftId: at.draftId,
          datasetId: at.datasetId,
          content,
          baseContent: published?.content ?? null,
        })
        .onConflictDoNothing()
        .returning({ revision: draftDatasetEntry.revision })

      const created = inserted[0]
      if (created === undefined) {
        await pushUndo(tx, at.draftId, rejectedDataset(before, at.datasetId, content))
        return { status: "conflict" }
      }
      await pushUndo(tx, at.draftId, snapshot("before-save", before))
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
    if (row !== undefined) {
      await pushUndo(tx, at.draftId, snapshot("before-save", before))
      return { status: "saved", revision: row.revision }
    }

    // The entry is gone in two different ways: somebody deleted the dataset, or
    // somebody saved it first. Only the second is worth showing a diff for.
    const [still] = await tx
      .select({ id: dataset.id })
      .from(dataset)
      .where(eq(dataset.id, at.datasetId))
      .limit(1)
    if (still === undefined) return { status: "gone" }

    await pushUndo(tx, at.draftId, rejectedDataset(before, at.datasetId, content))
    return { status: "conflict" }
  })
}

/** The draft as the author meant it: their dataset over what the draft holds. */
function rejectedDataset(
  before: DraftState,
  datasetId: string,
  content: DatasetContent,
): DraftSnapshot {
  const others = before.datasetEntries.filter((entry) => entry.datasetId !== datasetId)
  return snapshot("rejected", {
    ...before,
    datasetEntries: [...others, { datasetId, content }]
      .sort((a, b) => a.datasetId.localeCompare(b.datasetId)),
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
    const before = await currentDraft(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const datasetId = randomUUID()
    const rows = await tx
      .update(researchDraft)
      .set({
        content: { ...before.content, datasetIds: [...before.content.datasetIds, datasetId] },
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

/**
 * Destroying a dataset this draft introduced, when it turns out to have been a
 * mistake. **Only this draft's own, still unpublished datasets**: one that has
 * ever been published is referenced by the versions that listed it, and taking
 * it off the current version is a different operation with a different meaning.
 *
 * Its entry, and any pin, go with it by cascade.
 */
export async function deleteDraftDataset(
  db: Database,
  at: DraftAt,
  datasetId: string,
): Promise<DeleteDatasetOutcome> {
  return db.transaction(async (tx) => {
    const before = await currentDraft(tx, at.draftId)
    if (before === null) return { status: "gone" }

    const [target] = await tx
      .select({ id: dataset.id })
      .from(dataset)
      .leftJoin(datasetContent, eq(datasetContent.datasetId, dataset.id))
      .where(and(
        eq(dataset.id, datasetId),
        eq(dataset.originDraftId, at.draftId),
        isNull(datasetContent.datasetId),
      ))
      .limit(1)
    if (target === undefined) return { status: "refused" }

    const rows = await tx
      .update(researchDraft)
      .set({
        content: {
          ...before.content,
          datasetIds: before.content.datasetIds.filter((id) => id !== datasetId),
        },
        revision: sql`${researchDraft.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ revision: researchDraft.revision })
    if (rows[0] === undefined) return { status: "conflict" }

    await tx.delete(dataset).where(eq(dataset.id, datasetId))
    return { status: "deleted" }
  })
}

/**
 * Saying that somebody still has this draft open.
 *
 * The only write here that carries no revision, because presence is not
 * content: nobody is made read-only by it, correctness comes from the checks
 * above, and a row that is lost or overwritten costs one heartbeat. Rows are
 * left to expire rather than deleted when a screen closes — a browser that is
 * closed sends nothing reliable.
 */
export async function touchPresence(
  db: Executor,
  presence: {
    draftId: string
    sessionId: string
    actorSub: string
    displayName: string
  },
): Promise<void> {
  await db
    .insert(draftPresence)
    .values({ ...presence, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({
      target: [draftPresence.draftId, draftPresence.sessionId],
      set: {
        actorSub: presence.actorSub,
        displayName: presence.displayName,
        lastSeenAt: sql`now()`,
      },
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
 * entries, the undo stack, the presence rows, the comments, the share link, and
 * any dataset identity the draft introduced and nothing has adopted, all by
 * cascade. A draft is not history, so there is nowhere for any of it to go.
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
