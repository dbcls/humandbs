/**
 * Publishing a draft, and taking a version back.
 *
 * One transaction does the lot: the publish check runs, the draft is merged into a
 * single version row, the trail is written, the draft is consumed and the
 * search rows are derived again. **There is no moment at which something is
 * published but not yet findable** — the rows the public side reads are built
 * here, so "not propagated yet" is not a state that exists.
 *
 * **A version row is never rewritten.** Publishing always inserts; taking a
 * number that is already in use deletes the row holding it in the same
 * transaction. A reader sees either the old version or the new one and never a
 * row changing underneath them, which leaves the screen free to call it
 * "updating v2".
 *
 * The draft is consumed rather than kept. A version that also survived as a
 * draft would be the same content in two places with nothing to report which is
 * the real one; continuing means copying a version into a new draft.
 *
 * Publishing writes the draft as it is and merges nothing. A draft has
 * a share link, and the preview a data provider approved has to be what goes
 * out; taking somebody else's work in is an edit, made before publishing.
 */

import { and, asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import { emptyDatasetContent } from "~/content/empty"
import type {
  DatasetContent,
  PublishedDataset,
  ResearchContent,
  VersionContent,
} from "~/content/types"
import { describedBy, descriptionOf, draftContentOf } from "~/content/version"
import type { Database, Transaction } from "~/db/client.server"
import {
  dataset,
  draftDatasetEntry,
  humAccession,
  labelPin,
  researchDraft,
  researchVersion,
} from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { orderChanged } from "./changes"
import { diffDatasetInput } from "./dataset-diff"
import { datasetContentInput } from "./dataset-form"
import { draftDatasets } from "./datasets"
import { diffDraftInput } from "./diff"
import { consumeDraft, draftFromVersion, type DraftAt } from "./drafts.server"
import { researchContentInput } from "./form"
import { lockResearch } from "./locks.server"
import {
  countFindings,
  checkPublish,
  type PublishBlock,
  type PublishCheckDataset,
  type PublishFinding,
  type PublishCheck,
} from "./publish-check"
import { isPortalIssuedId } from "./labels"

export interface PublishRequest {
  at: DraftAt
  /**
   * The number this version will have: any whole number no version holds.
   * **Null for an update**, which has the number of the version it updates
   * and takes no other — the draft reports which version that is.
   */
  number: number | null
  /** The day the version reports it went out. */
  releaseDate: string
  /** The administrator has seen the listed findings and passed them. */
  acknowledged: boolean
  /**
   * The names in the private bucket, read before the transaction opened. The
   * publish check only lists these, so a name that moved in the meantime costs nothing —
   * and reading the store while holding the draft's row would hold a lock
   * across a call to something outside the portal.
   */
  privateFiles: ReadonlySet<string>
}

export type PublishOutcome
  = | { status: "published", versionNumber: number }
    | { status: "blocked", blocks: PublishBlock[] }
    | { status: "unacknowledged", findings: PublishFinding[] }
    | { status: "conflict" }
    | { status: "gone" }
    /** A number a version holds, or none at all for a draft that is not an update. */
    | { status: "number-unavailable" }

export type WithdrawOutcome
  = | { status: "withdrawn", draftId: string }
    /** The version is being updated, so it stays out: the update is stopped first. */
    | { status: "updating" }
    | { status: "gone" }

interface DraftRow {
  id: string
  researchId: string
  content: ResearchContent
  revision: number
  replacesVersionId: string | null
}

interface VersionRow {
  id: string
  number: number
  /** The day it went out. Replacing it offers this back, so it is read here. */
  releaseDate: string
  content: VersionContent
}

interface DatasetRow {
  id: string
  label: string | null
  originDraftId: string | null
}

/**
 * Everything the publish check and the writes need, read before anything is written so
 * that a refusal costs nothing and the draft's own rows can still be seen.
 *
 * **The draft row is locked while it is read.** A publish writes a good deal
 * before it consumes the draft, and returning "somebody else got here first"
 * after those writes would commit them; holding the row means the revision read
 * here is still the revision at the end, so the check can happen before
 * anything is written. It also serialises two publishes of the same draft.
 *
 * **So is the research row, and the labels the publish check reads.** Two drafts of one
 * research are two rows, so the draft's lock does not keep them apart: holding
 * the research makes the second publish read the versions after the first has
 * committed, and a number the first took is refused as unavailable rather than
 * failing on the unique index. The labels are held shared: taking one away
 * waits for the publish to finish, and one taken away just before is not seen
 * here — the publish check never passes a dataset whose id is on its way out.
 */
interface PublishSnapshot {
  draft: DraftRow
  humLabel: string | null
  datasets: Map<string, DatasetRow>
  entries: Map<string, DatasetContent>
  /** Newest number first. */
  versions: VersionRow[]
  /**
   * The version this draft is the update of, held with the draft while it is
   * locked. Null for a draft of its own.
   */
  updating: VersionRow | null
  upstreamHumLabelOf: Map<string, string>
}

async function readPublishSnapshot(
  tx: Transaction,
  draftId: string,
  lock: boolean,
): Promise<PublishSnapshot | null> {
  const held = () => tx
    .select({
      id: researchDraft.id,
      researchId: researchDraft.researchId,
      content: researchDraft.content,
      revision: researchDraft.revision,
      replacesVersionId: researchDraft.replacesVersionId,
    })
    .from(researchDraft)
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  const [seen] = await held()
  if (seen === undefined) return null
  if (!lock) return readSnapshotOf(tx, seen, false)

  // The research before the draft (`locks.server.ts`). `no key update` rather
  // than `update`: the rows that point at the research acquire a key-share lock
  // on it, and nothing here changes its key.
  if (!await lockResearch(tx, seen.researchId, "no key update")) return null
  const [draft] = await held().for("update")
  if (draft === undefined) return null

  // The datasets before their labels: deleting a dataset deletes its label with
  // it, so it has to wait here rather than hold the dataset while waiting for a
  // label this publish holds.
  await tx
    .select({ id: dataset.id })
    .from(dataset)
    .where(eq(dataset.researchId, draft.researchId))
    .orderBy(asc(dataset.id))
    .for("key share")
  await tx
    .select({ id: labelPin.id })
    .from(labelPin)
    .where(or(
      eq(labelPin.researchId, draft.researchId),
      inArray(
        labelPin.datasetId,
        tx.select({ id: dataset.id }).from(dataset).where(eq(dataset.researchId, draft.researchId)),
      ),
    ))
    .orderBy(asc(labelPin.id))
    .for("share")
  return readSnapshotOf(tx, draft, true)
}

async function readSnapshotOf(
  tx: Transaction,
  draft: DraftRow,
  lock: boolean,
): Promise<PublishSnapshot> {
  const draftId = draft.id

  // **One at a time.** A transaction is a single connection, so requesting the
  // five at once wins no time and requests the driver to start a query on a client
  // that is already running one.
  const humLabels = await tx
    .select({ label: labelPin.label })
    .from(labelPin)
    .where(and(
      eq(labelPin.kind, "hum"),
      eq(labelPin.isPrimary, true),
      eq(labelPin.researchId, draft.researchId),
    ))
    .limit(1)
  const datasetRows = await tx
    .select({
      id: dataset.id,
      originDraftId: dataset.originDraftId,
      label: labelPin.label,
    })
    .from(dataset)
    .leftJoin(labelPin, and(
      eq(labelPin.datasetId, dataset.id),
      eq(labelPin.kind, "dataset"),
      eq(labelPin.isPrimary, true),
    ))
    .where(eq(dataset.researchId, draft.researchId))
  const entryRows = await tx
    .select({
      datasetId: draftDatasetEntry.datasetId,
      content: draftDatasetEntry.content,
    })
    .from(draftDatasetEntry)
    .where(eq(draftDatasetEntry.draftId, draftId))
  const versionRows = await tx
    .select({
      id: researchVersion.id,
      number: researchVersion.number,
      releaseDate: researchVersion.releaseDate,
      content: researchVersion.content,
    })
    .from(researchVersion)
    .where(eq(researchVersion.researchId, draft.researchId))
    .orderBy(desc(researchVersion.number))
  const upstreamRows = await tx
    .select({ accession: humAccession.accession, humLabel: humAccession.humLabel })
    .from(humAccession)

  // The version being updated is held along with the draft, so that nothing
  // can take it out between here and its row going (`withdrawVersion`).
  const updating = versionRows.find((row) => row.id === draft.replacesVersionId) ?? null
  if (lock && updating !== null) {
    await tx
      .select({ id: researchVersion.id })
      .from(researchVersion)
      .where(eq(researchVersion.id, updating.id))
      .for("update")
  }

  return {
    draft,
    humLabel: humLabels[0]?.label ?? null,
    datasets: new Map(datasetRows.map((row) => [row.id, row])),
    entries: new Map(entryRows.map((row) => [row.datasetId, row.content])),
    versions: versionRows,
    updating,
    upstreamHumLabelOf: new Map(upstreamRows.map((row) => [row.accession, row.humLabel])),
  }
}

/**
 * What each dataset of this research would end up with, in the order the draft
 * puts them in (`admin/datasets.ts`). **The draft does not choose which of them
 * go** — they belong to the research — so this is every one of them but those
 * another draft made. `null` content is a dataset nobody has described: the
 * publish check reports it, and passing means publishing it empty rather than leaving a
 * dataset the listing names and the reader cannot open.
 */
function publishCheckDatasets(snapshot: PublishSnapshot): PublishCheckDataset[] {
  // A stable order for whatever the draft has not named: the map comes from a
  // query, and the order a query gives back is not one to lean on.
  const rows = [...snapshot.datasets.values()].sort((one, other) => one.id.localeCompare(other.id))
  // **What the draft has not written is what is published**, read where the
  // editing screen reads it: the version this draft updates, else the newest
  // that lists the dataset. Taken for empty instead, a draft that wrote nothing
  // would put every published dataset out with nothing in it.
  const sources = snapshot.updating === null ? snapshot.versions : [snapshot.updating, ...snapshot.versions]
  const published = (datasetId: string): DatasetContent | null => {
    for (const version of sources) {
      const found = describedBy(version.content).get(datasetId)
      if (found !== undefined) return descriptionOf(found)
    }
    return null
  }
  return draftDatasets(rows, snapshot.draft.id, snapshot.draft.content.datasetIds).map((row) => ({
    datasetId: row.id,
    label: row.label,
    content: snapshot.entries.get(row.id) ?? published(row.id),
  }))
}

/** The next number is one past the highest a version holds. */
function nextNumber(versions: readonly VersionRow[]): number {
  return versions.reduce((highest, version) => Math.max(highest, version.number), 0) + 1
}

/**
 * Whether a draft of its own may be published under this number: any whole
 * number from one that no version holds now. **A held number is never taken
 * over this way** — the one road under a held number is the update, and only
 * the draft opened for that version travels it. A number nothing ever
 * kept is allowed; the sequence is not promised to be unbroken.
 */
function isFreeNumber(snapshot: PublishSnapshot, number: number): boolean {
  return Number.isInteger(number)
    && number >= 1
    && !snapshot.versions.some((version) => version.number === number)
}

/**
 * The draft, merged into what a version holds: the body with the description of
 * every dataset it lists written in beside it.
 *
 * This is the one place the two shapes meet. Everything upstream of it edits
 * rows, everything downstream reads one value.
 */
function versionContentOf(
  draft: ResearchContent,
  datasets: readonly PublishCheckDataset[],
  releaseDate: string,
): VersionContent {
  const { datasetIds, ...body } = draft
  void datasetIds
  return {
    ...body,
    datasets: datasets.map((row) => ({
      datasetId: row.datasetId,
      ...withReleaseDate(row.label, row.content ?? emptyDatasetContent(), releaseDate),
    })),
  }
}

function datasetIdsOf(version: VersionRow): string[] {
  return version.content.datasets.map((row) => row.datasetId)
}

export interface DatasetChange {
  datasetId: string
  /** How many fields of its description this publish would rewrite. */
  fields: number
  /** The version this one stands in front of does not list it. */
  isNew: boolean
}

/**
 * Everything the confirmation screen shows, without writing anything.
 *
 * The publish check is run here and again inside the publish. Running it twice is the
 * point: what the screen shows is advice, and what a publish is allowed to do
 * is decided where the writes happen, under the lock.
 */
export interface PublishPreview {
  researchId: string
  humLabel: string | null
  /** What a save would have to match; the form passes it back. */
  revision: number
  /** The number offered first: one past the highest a version holds. */
  nextNumber: number
  /** The numbers versions hold now, newest first — the ones that cannot be taken. */
  heldNumbers: number[]
  /**
   * The version this draft updates, when it is an update: the number it will
   * have, and the day that version went out, offered back as the release date.
   */
  updating: { number: number, releaseDate: string } | null
  publishCheck: PublishCheck
  /** Fields of the research that differ from what this publish stands in front of. */
  researchFields: number | null
  datasetChanges: DatasetChange[]
  /**
   * The datasets both versions list are shown in another order. The public page
   * lists them in the version's order, so this is a change on its own.
   */
  reordered: boolean
  listingAdded: string[]
  listingRemoved: string[]
  /** Every dataset of the research, so the screen can name what it lists. */
  datasetLabels: { datasetId: string, label: string | null }[]
}

export async function publishPreview(
  db: Database,
  draftId: string,
  privateFiles: ReadonlySet<string>,
): Promise<PublishPreview | null> {
  return db.transaction(async (tx): Promise<PublishPreview | null> => {
    const snapshot = await readPublishSnapshot(tx, draftId, false)
    if (snapshot === null) return null

    const datasets = publishCheckDatasets(snapshot)
    const previous = snapshot.updating ?? snapshot.versions[0]
    const publishCheck = publishCheckOf(snapshot, privateFiles)

    const listedIds = datasets.map((row) => row.datasetId)
    const before = new Set(previous === undefined ? [] : datasetIdsOf(previous))
    const next = nextNumber(snapshot.versions)

    return {
      researchId: snapshot.draft.researchId,
      humLabel: snapshot.humLabel,
      revision: snapshot.draft.revision,
      nextNumber: next,
      heldNumbers: snapshot.versions.map((version) => version.number),
      updating: snapshot.updating === null
        ? null
        : { number: snapshot.updating.number, releaseDate: snapshot.updating.releaseDate },
      publishCheck,
      researchFields: previous === undefined
        ? null
        : researchFieldsChanged(previous.content, snapshot.draft.content),
      datasetChanges: changesOf(previous, datasets),
      reordered: previous !== undefined && orderChanged(datasetIdsOf(previous), listedIds),
      listingAdded: listedIds.filter((id) => !before.has(id)),
      listingRemoved: [...before].filter((id) => !listedIds.includes(id)),
      datasetLabels: [...snapshot.datasets.values()].map((row) => ({
        datasetId: row.id,
        label: row.label,
      })),
    }
  })
}

/**
 * The publish check as it stands for a draft, read without a lock and without writing.
 *
 * **Every screen of the draft reports the publish check's status**, not only the
 * confirmation: the step indicator counts what would stop a publish and what
 * would have to be confirmed. It is advice, the same as the confirmation
 * screen's — what a publish is allowed to do is decided under the lock.
 */
export async function draftPublishCheck(
  db: Database,
  draftId: string,
  privateFiles: ReadonlySet<string>,
): Promise<PublishCheck | null> {
  return db.transaction(async (tx): Promise<PublishCheck | null> => {
    const snapshot = await readPublishSnapshot(tx, draftId, false)
    return snapshot === null ? null : publishCheckOf(snapshot, privateFiles)
  })
}

/** The publish check's question, put from what was read. */
function publishCheckOf(snapshot: PublishSnapshot, privateFiles: ReadonlySet<string>): PublishCheck {
  return checkPublish({
    humLabel: snapshot.humLabel,
    content: snapshot.draft.content,
    datasets: publishCheckDatasets(snapshot),
    upstream: snapshot.upstreamHumLabelOf,
    privateFiles,
  })
}

/**
 * How much of the research itself this publish moves. The listing is left out
 * of the count because it is reported on its own line — what went on and what
 * came off is more use than "one field changed".
 */
function researchFieldsChanged(previous: VersionContent, mine: ResearchContent): number {
  return diffDraftInput(
    { content: researchContentInput(draftContentOf(previous)) },
    { content: researchContentInput(mine) },
  ).filter((path) => path !== "datasetIds").length
}

function changesOf(
  previous: VersionRow | undefined,
  datasets: readonly PublishCheckDataset[],
): DatasetChange[] {
  const before = describedBy(previous?.content)
  return datasets.flatMap((row) => {
    const published = before.get(row.datasetId)
    const next = row.content ?? emptyDatasetContent()
    const fields = published === undefined
      ? 0
      : diffDatasetInput(datasetContentInput(published), datasetContentInput(next)).length
    if (published !== undefined && fields === 0) return []
    return [{ datasetId: row.datasetId, fields, isNew: published === undefined }]
  })
}

export async function publishDraft(
  db: Database,
  request: PublishRequest,
  actor: EventActor,
): Promise<PublishOutcome> {
  return db.transaction(async (tx): Promise<PublishOutcome> => {
    const snapshot = await readPublishSnapshot(tx, request.at.draftId, true)
    if (snapshot === null) return { status: "gone" }
    // Checked here rather than left to the delete at the end: everything below
    // writes, and a refusal has to come before the first of them.
    if (snapshot.draft.revision !== request.at.revision) return { status: "conflict" }
    // An update has the number of the version it stands in for and is
    // offered no other; a draft of its own takes any free one.
    const updating = snapshot.updating
    const number = updating === null ? request.number : updating.number
    if (number === null || (updating === null && !isFreeNumber(snapshot, number))) {
      return { status: "number-unavailable" }
    }

    // What "changed" means is measured against the version this publish
    // stands in front of: the one it updates, or else the newest out.
    const datasets = publishCheckDatasets(snapshot)
    const previous = updating ?? snapshot.versions[0]
    const publishCheck = checkPublish({
      humLabel: snapshot.humLabel,
      content: snapshot.draft.content,
      datasets,
      upstream: snapshot.upstreamHumLabelOf,
      privateFiles: request.privateFiles,
    })
    if (publishCheck.blocks.length > 0) return { status: "blocked", blocks: publishCheck.blocks }
    if (publishCheck.findings.length > 0 && !request.acknowledged) {
      return { status: "unacknowledged", findings: publishCheck.findings }
    }

    // Adopting comes before consuming: a dataset the draft introduced is still
    // the draft's until it is published, and the cascade would take it.
    const listedIds = datasets.map((row) => row.datasetId)
    if (listedIds.length > 0) {
      await tx
        .update(dataset)
        .set({ originDraftId: null })
        .where(and(inArray(dataset.id, listedIds), isNotNull(dataset.originDraftId)))
    }

    // The row is locked and its revision was checked above, so this cannot
    // refuse. If it ever does, the lock is not doing what it is here for and
    // the transaction is better off undone than half applied.
    const consumed = await consumeDraft(tx, request.at)
    if (consumed.status !== "consumed") {
      throw new Error("the locked draft changed under a publish")
    }

    // An update takes the version's place: its row goes in the same
    // transaction as the new one appears under the number, so no reader finds
    // the number empty and no row changes under one. The draft is already
    // consumed, so nothing hangs off the row that goes.
    if (updating !== null) {
      await tx.delete(researchVersion).where(eq(researchVersion.id, updating.id))
    }

    const content = versionContentOf(snapshot.draft.content, datasets, request.releaseDate)
    const [row] = await tx
      .insert(researchVersion)
      .values({
        researchId: snapshot.draft.researchId,
        number,
        content,
        releaseDate: request.releaseDate,
      })
      .returning({ id: researchVersion.id })
    if (row === undefined) throw new Error("the version insert returned no row")

    await recordEvent(tx, {
      actor,
      action: updating === null ? "publish-version" : "replace-version",
      subjectType: "research-version",
      subjectId: row.id,
      detail: {
        researchId: snapshot.draft.researchId,
        draftId: request.at.draftId,
        versionNumber: number,
        datasetCount: listedIds.length,
      },
    })

    await recordDatasetChanges(tx, previous, content.datasets, {
      actor,
      versionNumber: number,
    })

    if (publishCheck.findings.length > 0) {
      await recordEvent(tx, {
        actor,
        action: "pass-publish-check",
        subjectType: "research-version",
        subjectId: row.id,
        detail: { passed: countFindings(publishCheck.findings) },
      })
    }

    await rebuildSearchDocs(tx, { researchIds: [snapshot.draft.researchId] })
    return { status: "published", versionNumber: number }
  })
}

/**
 * One event per dataset this publish describes differently from the newest
 * version before it.
 *
 * **Recorded against the dataset rather than read out of the version's own
 * event**, because the identity outlives the versions: "when did this
 * description last move, and by what" is a question about the dataset, and
 * responding to it from the versions would mean diffing every one of them.
 */
async function recordDatasetChanges(
  tx: Transaction,
  previous: VersionRow | undefined,
  datasets: readonly PublishedDataset[],
  into: { actor: EventActor, versionNumber: number },
): Promise<void> {
  const before = describedBy(previous?.content)
  for (const row of datasets) {
    const published = before.get(row.datasetId)
    if (published !== undefined && unchanged(published, row)) continue
    await recordEvent(tx, {
      actor: into.actor,
      action: "publish-dataset",
      subjectType: "dataset",
      subjectId: row.datasetId,
      detail: {
        versionNumber: into.versionNumber,
        replaced: published !== undefined,
      },
    })
  }
}

/**
 * Whether two descriptions say the same thing. Compared by meaning rather than
 * by their JSON, so that a value stored before and a value the form produced
 * are not called different for holding their keys in another order.
 */
function unchanged(published: DatasetContent, next: DatasetContent): boolean {
  return diffDatasetInput(datasetContentInput(published), datasetContentInput(next)).length === 0
}

/**
 * The day an NHA dataset has, for one that has not been given one.
 *
 * **Only the portal can answer for an NHA ID** — no archive holds it — and
 * writing it here rather than leaving the field empty is what makes the date a
 * value somebody can then correct: an admin who disagrees edits it, and every
 * later publish leaves it alone because it is no longer missing.
 *
 * **The date is written once, by the version that first releases the dataset.**
 * A description passed into v4 by the draft it was copied into already has its
 * day, so v4 does not stamp its own over it.
 */
function withReleaseDate(
  label: string | null,
  content: DatasetContent,
  releaseDate: string,
): DatasetContent {
  if (content.releaseDate !== null || !isPortalIssuedId(label)) return content
  return { ...content, releaseDate }
}

/**
 * Taking a version back: the row becomes a draft and the number comes free.
 *
 * **The row is deleted rather than flagged.** Being in the table is what
 * published means, so there is no state to set — and the content has to land
 * somewhere it can be edited, which is what a draft is. The number is freed,
 * so the draft can be published back under it (`isFreeNumber`).
 *
 * **A version being updated is refused.** The draft it is updated in is its
 * vessel and would go with it, and what withdrawing leaves is a draft of its
 * own — two of them, if both stayed. The update is stopped first.
 */
export async function withdrawVersion(
  db: Database,
  versionId: string,
  actor: EventActor,
): Promise<WithdrawOutcome> {
  return db.transaction(async (tx): Promise<WithdrawOutcome> => {
    // The research before the version (`locks.server.ts`): the draft written
    // below references it, and deleting the research would wait on this version.
    const [seen] = await tx
      .select({ researchId: researchVersion.researchId })
      .from(researchVersion)
      .where(eq(researchVersion.id, versionId))
      .limit(1)
    if (seen === undefined || !await lockResearch(tx, seen.researchId, "key share")) {
      return { status: "gone" }
    }
    const [version] = await tx
      .select({
        id: researchVersion.id,
        researchId: researchVersion.researchId,
        number: researchVersion.number,
        content: researchVersion.content,
      })
      .from(researchVersion)
      .where(eq(researchVersion.id, versionId))
      .limit(1)
      .for("update")
    if (version === undefined) return { status: "gone" }

    const [open] = await tx
      .select({ id: researchDraft.id })
      .from(researchDraft)
      .where(eq(researchDraft.replacesVersionId, versionId))
      .limit(1)
    if (open !== undefined) return { status: "updating" }

    await tx.delete(researchVersion).where(eq(researchVersion.id, versionId))
    const draftId = await draftFromVersion(tx, version)

    await recordEvent(tx, {
      actor,
      action: "withdraw-version",
      subjectType: "research-version",
      subjectId: versionId,
      detail: {
        researchId: version.researchId,
        versionNumber: version.number,
        draftId,
      },
    })
    await rebuildSearchDocs(tx, { researchIds: [version.researchId] })
    return { status: "withdrawn", draftId }
  })
}
