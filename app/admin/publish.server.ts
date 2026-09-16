/**
 * Publishing a draft, and taking a version back.
 *
 * One transaction does the lot: the gate is checked, the draft is folded into a
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
 * draft would be the same content in two places with nothing to say which is
 * the real one; continuing means copying a version into a new draft.
 *
 * Publishing writes the draft as it stands and merges nothing. A draft carries
 * a share link, and the preview a data provider approved has to be what goes
 * out; taking somebody else's work in is an edit, made before publishing.
 */

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import { emptyDatasetContent } from "~/content/empty"
import type {
  DatasetContent,
  PublishedDataset,
  ResearchContent,
  VersionContent,
} from "~/content/types"
import { describedBy, draftContentOf } from "~/content/version"
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

import { diffDatasetInput } from "./dataset-diff"
import { datasetContentInput } from "./dataset-form"
import { diffDraftInput } from "./diff"
import { consumeDraft, draftFromVersion, type DraftAt } from "./drafts.server"
import { researchContentInput } from "./form"
import {
  countFindings,
  publishGate,
  type GateBlock,
  type GateDataset,
  type GateFinding,
  type PublishGate,
} from "./gate"
import { isPortalIssuedId } from "./labels"

export interface PublishRequest {
  at: DraftAt
  /**
   * The number this version will carry. One that a version holds now replaces
   * that version; the next unused one starts a new version.
   */
  number: number
  /** The day the version says it went out. */
  releaseDate: string
  /** The administrator has seen the listed findings and passed them. */
  acknowledged: boolean
  /**
   * The names in the private bucket, read before the transaction opened. The
   * gate only lists these, so a name that moved in the meantime costs nothing —
   * and reading the store while holding the draft's row would hold a lock
   * across a call to something outside the portal.
   */
  privateFiles: ReadonlySet<string>
}

export type PublishOutcome
  = | { status: "published", versionNumber: number, replaced: boolean }
    | { status: "blocked", blocks: GateBlock[] }
    | { status: "unacknowledged", findings: GateFinding[] }
    | { status: "conflict" }
    | { status: "gone" }
    /** A number no version holds, that nothing issued, and that is not next. */
    | { status: "number-unavailable" }

export type WithdrawOutcome
  = | { status: "withdrawn", draftId: string }
    | { status: "gone" }

interface DraftRow {
  id: string
  researchId: string
  content: ResearchContent
  copiedFromNumber: number | null
  revision: number
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
 * Everything the gate and the writes need, read before anything is written so
 * that a refusal costs nothing and the draft's own rows can still be seen.
 *
 * **The draft row is locked while it is read.** A publish writes a good deal
 * before it consumes the draft, and returning "somebody else got here first"
 * after those writes would commit them; holding the row means the revision read
 * here is still the revision at the end, so the check can happen before
 * anything is written. It also serialises two publishes of the same draft.
 */
interface Ground {
  draft: DraftRow
  humLabel: string | null
  datasets: Map<string, DatasetRow>
  entries: Map<string, DatasetContent>
  /** Newest number first. */
  versions: VersionRow[]
  upstreamHumLabelOf: Map<string, string>
}

async function readGround(
  tx: Transaction,
  draftId: string,
  lock: boolean,
): Promise<Ground | null> {
  const held = tx
    .select({
      id: researchDraft.id,
      researchId: researchDraft.researchId,
      content: researchDraft.content,
      copiedFromNumber: researchDraft.copiedFromNumber,
      revision: researchDraft.revision,
    })
    .from(researchDraft)
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  const [draft] = await (lock ? held.for("update") : held)
  if (draft === undefined) return null

  // **One at a time.** A transaction is a single connection, so asking for the
  // five at once wins no time and asks the driver to start a query on a client
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

  return {
    draft,
    humLabel: humLabels[0]?.label ?? null,
    datasets: new Map(datasetRows.map((row) => [row.id, row])),
    entries: new Map(entryRows.map((row) => [row.datasetId, row.content])),
    versions: versionRows,
    upstreamHumLabelOf: new Map(upstreamRows.map((row) => [row.accession, row.humLabel])),
  }
}

/**
 * What each listed dataset would end up with. `null` content is a dataset the
 * version lists and nobody has described — the gate lists it, and passing means
 * publishing it empty rather than leaving the version listing nothing.
 */
function gateDatasets(ground: Ground): GateDataset[] {
  return ground.draft.content.datasetIds.flatMap((datasetId) => {
    const row = ground.datasets.get(datasetId)
    if (row === undefined) return []
    return [{
      datasetId,
      label: row.label,
      content: ground.entries.get(datasetId) ?? null,
    }]
  })
}

/** The next number is one past the highest a version holds. */
function nextNumber(versions: readonly VersionRow[]): number {
  return versions.reduce((highest, version) => Math.max(highest, version.number), 0) + 1
}

/**
 * The numbers this draft is allowed to publish under: the ones versions hold
 * now, the next unused one, and the one this draft was copied from.
 *
 * **The third is what lets a withdrawn version come back under its own
 * number.** Withdrawing deletes the row, so nothing else remembers that the
 * number was ever issued — the draft that came out of it does. Anything beyond
 * these would put a version under a number that nothing ever carried, which is
 * a hole a reader cannot tell from a withdrawal.
 */
function availableNumbers(ground: Ground): Set<number> {
  const numbers = new Set(ground.versions.map((version) => version.number))
  numbers.add(nextNumber(ground.versions))
  if (ground.draft.copiedFromNumber !== null) numbers.add(ground.draft.copiedFromNumber)
  return numbers
}

/**
 * The draft, folded into what a version holds: the body with the description of
 * every dataset it lists written in beside it.
 *
 * This is the one place the two shapes meet. Everything upstream of it edits
 * rows, everything downstream reads one value.
 */
function versionContentOf(
  draft: ResearchContent,
  datasets: readonly GateDataset[],
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
 * The gate is run here and again inside the publish. Running it twice is the
 * point: what the screen shows is advice, and what a publish is allowed to do
 * is decided where the writes happen, under the lock.
 */
export interface PublishPreview {
  researchId: string
  humLabel: string | null
  /** What a save would have to match; the form carries it back. */
  revision: number
  /** The number a new version would take. */
  nextNumber: number
  /**
   * The other numbers this draft may take, newest first. `releaseDate` is set
   * when a version holds the number now, which is what taking it replaces.
   */
  choices: { number: number, releaseDate: string | null }[]
  /** Which choice the screen offers first: where this draft was copied from. */
  suggestedNumber: number | null
  gate: PublishGate
  /** Fields of the research that differ from what this publish stands in front of. */
  researchFields: number | null
  datasetChanges: DatasetChange[]
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
    const ground = await readGround(tx, draftId, false)
    if (ground === null) return null

    const datasets = gateDatasets(ground)
    const previous = standingInFrontOf(ground, ground.draft.copiedFromNumber)

    const gate = publishGate({
      humLabel: ground.humLabel,
      content: ground.draft.content,
      datasets,
      previousDatasetIds: previous === undefined ? [] : datasetIdsOf(previous),
      upstream: ground.upstreamHumLabelOf,
      privateFiles,
    })

    const listedIds = datasets.map((row) => row.datasetId)
    const before = new Set(previous === undefined ? [] : datasetIdsOf(previous))
    const next = nextNumber(ground.versions)

    return {
      researchId: ground.draft.researchId,
      humLabel: ground.humLabel,
      revision: ground.draft.revision,
      nextNumber: next,
      choices: [...availableNumbers(ground)]
        .filter((number) => number !== next)
        .sort((a, b) => b - a)
        .map((number) => ({
          number,
          releaseDate: ground.versions.find((held) => held.number === number)?.releaseDate ?? null,
        })),
      suggestedNumber: ground.draft.copiedFromNumber,
      gate,
      researchFields: previous === undefined
        ? null
        : researchFieldsChanged(previous.content, ground.draft.content),
      datasetChanges: changesOf(previous, datasets),
      listingAdded: listedIds.filter((id) => !before.has(id)),
      listingRemoved: [...before].filter((id) => !listedIds.includes(id)),
      datasetLabels: [...ground.datasets.values()].map((row) => ({
        datasetId: row.id,
        label: row.label,
      })),
    }
  })
}

/**
 * The version a publish under this number would stand in front of: the one
 * holding the number, or the newest when the number is free. What "changed"
 * means on the confirmation screen is measured against it.
 */
function standingInFrontOf(ground: Ground, number: number | null): VersionRow | undefined {
  const held = number === null
    ? undefined
    : ground.versions.find((version) => version.number === number)
  return held ?? ground.versions[0]
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
  datasets: readonly GateDataset[],
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
    const ground = await readGround(tx, request.at.draftId, true)
    if (ground === null) return { status: "gone" }
    // Checked here rather than left to the delete at the end: everything below
    // writes, and a refusal has to come before the first of them.
    if (ground.draft.revision !== request.at.revision) return { status: "conflict" }
    if (!availableNumbers(ground).has(request.number)) return { status: "number-unavailable" }

    const replacing = ground.versions.find((held) => held.number === request.number)
    const datasets = gateDatasets(ground)
    const previous = standingInFrontOf(ground, request.number)
    const gate = publishGate({
      humLabel: ground.humLabel,
      content: ground.draft.content,
      datasets,
      previousDatasetIds: previous === undefined ? [] : datasetIdsOf(previous),
      upstream: ground.upstreamHumLabelOf,
      privateFiles: request.privateFiles,
    })
    if (gate.blocks.length > 0) return { status: "blocked", blocks: gate.blocks }
    if (gate.findings.length > 0 && !request.acknowledged) {
      return { status: "unacknowledged", findings: gate.findings }
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

    // The old row leaves before the new one arrives: the number is unique
    // within a research, so the two cannot hold it at once.
    if (replacing !== undefined) {
      await tx.delete(researchVersion).where(eq(researchVersion.id, replacing.id))
    }

    const content = versionContentOf(ground.draft.content, datasets, request.releaseDate)
    const [row] = await tx
      .insert(researchVersion)
      .values({
        researchId: ground.draft.researchId,
        number: request.number,
        content,
        releaseDate: request.releaseDate,
      })
      .returning({ id: researchVersion.id })
    if (row === undefined) throw new Error("the version insert returned no row")

    await recordEvent(tx, {
      actor,
      action: replacing === undefined ? "publish-version" : "replace-version",
      subjectType: "research-version",
      subjectId: row.id,
      detail: {
        researchId: ground.draft.researchId,
        draftId: request.at.draftId,
        versionNumber: request.number,
        datasetCount: listedIds.length,
      },
    })

    await recordDatasetChanges(tx, replacing, content.datasets, {
      actor,
      versionNumber: request.number,
    })

    if (gate.findings.length > 0) {
      await recordEvent(tx, {
        actor,
        action: "pass-publish-gate",
        subjectType: "research-version",
        subjectId: row.id,
        detail: { passed: countFindings(gate.findings) },
      })
    }

    await rebuildSearchDocs(tx, { researchIds: [ground.draft.researchId] })
    return {
      status: "published",
      versionNumber: request.number,
      replaced: replacing !== undefined,
    }
  })
}

/**
 * One event per dataset this publish describes differently from the version it
 * replaces.
 *
 * **Recorded against the dataset rather than read out of the version's own
 * event**, because the identity outlives the versions: "when did this
 * description last move, and by what" is a question about the dataset, and
 * answering it from the versions would mean diffing every one of them.
 */
async function recordDatasetChanges(
  tx: Transaction,
  replacing: VersionRow | undefined,
  datasets: readonly PublishedDataset[],
  into: { actor: EventActor, versionNumber: number },
): Promise<void> {
  const before = describedBy(replacing?.content)
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
 * The day an NHA dataset carries, for one that has not been given one.
 *
 * **Only the portal can answer for an NHA ID** — no archive holds it — and
 * writing it here rather than leaving the field empty is what makes the date a
 * value somebody can then correct: an admin who disagrees edits it, and every
 * later publish leaves it alone because it is no longer missing.
 *
 * **The date is written once, by the version that first releases the dataset.**
 * A description carried into v4 by the draft it was copied into already has its
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
 * somewhere it can be edited, which is what a draft is. The number travels with
 * it, so the draft can be published back under it
 * (`availableNumbers`).
 */
export async function withdrawVersion(
  db: Database,
  versionId: string,
  actor: EventActor,
): Promise<WithdrawOutcome> {
  return db.transaction(async (tx): Promise<WithdrawOutcome> => {
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
