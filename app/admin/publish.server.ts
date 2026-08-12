/**
 * Publishing a draft, and taking a version back.
 *
 * One transaction does the lot: the gate is checked, the descriptions are
 * written, the version is pinned, the trail is written, the draft is consumed
 * and the search rows are derived again. **There is no moment at which
 * something is published but not yet findable** — the rows the public side
 * reads are built here, so "not propagated yet" is not a state that exists.
 *
 * The draft is consumed rather than kept. A version that also survived as a
 * draft would be the same content in two places with nothing to say which is
 * the real one; continuing means taking a new draft from the version that was
 * just published.
 *
 * **What a publish writes over, it keeps.** A dataset has no versions, so the
 * description it replaces would otherwise be recoverable from nowhere — the
 * undo stack goes with the draft. The old value is written to the trail beside
 * the event that replaced it.
 *
 * Publishing writes the draft as it stands and merges nothing, even where
 * somebody else has published over the same dataset in the meantime. A draft
 * carries a share link, and the preview a data provider approved has to be what
 * goes out; the gate lists what would be written over so the author can take it
 * into the draft first.
 */

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import { emptyDatasetContent } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import type { Database, Transaction } from "~/db/client.server"
import {
  contentSnapshot,
  dataset,
  datasetContent,
  draftDatasetEntry,
  humAccession,
  labelPin,
  replacedDatasetContent,
  researchDraft,
  researchVersion,
} from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { diffDatasetInput } from "./dataset-diff"
import { datasetContentInput } from "./dataset-form"
import { diffDraftInput } from "./diff"
import { consumeDraft, type DraftAt } from "./drafts.server"
import { researchContentInput } from "./form"
import {
  countFindings,
  publishGate,
  type GateBlock,
  type GateDataset,
  type GateFinding,
  type PublishGate,
} from "./gate"
import { threeWayDataset, type ThreeWay } from "./merge"

export type PublishMode
  /** A new version. Its number is decided here, which is why drafts leave no gaps. */
  = | { kind: "version", releaseDate: string }
    /** The same number, a different snapshot behind it. */
    | { kind: "fix" }

export interface PublishRequest {
  at: DraftAt
  mode: PublishMode
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
  = | { status: "published", versionNumber: number }
    | { status: "blocked", blocks: GateBlock[] }
    | { status: "unacknowledged", findings: GateFinding[] }
    | { status: "conflict" }
    | { status: "gone" }
    /** A fix replaces the version the draft came from, and this one came from none. */
    | { status: "no-parent" }

export type VisibilityOutcome
  = | { status: "changed" }
    /** Already the way it was asked to be, so nothing was written or recorded. */
    | { status: "unchanged" }
    | { status: "gone" }

interface DraftRow {
  id: string
  researchId: string
  content: ResearchContent
  parentSnapshotId: string | null
  revision: number
}

interface VersionRow {
  id: string
  number: number
  published: boolean
  snapshotId: string
  content: ResearchContent
  datasetIds: string[]
}

interface DatasetRow {
  id: string
  label: string | null
  published: DatasetContent | null
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
  entries: Map<string, { content: DatasetContent, baseContent: DatasetContent | null }>
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
      parentSnapshotId: researchDraft.parentSnapshotId,
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
      published: datasetContent.content,
    })
    .from(dataset)
    .leftJoin(labelPin, and(
      eq(labelPin.datasetId, dataset.id),
      eq(labelPin.kind, "dataset"),
      eq(labelPin.isPrimary, true),
    ))
    .leftJoin(datasetContent, eq(datasetContent.datasetId, dataset.id))
    .where(eq(dataset.researchId, draft.researchId))
  const entryRows = await tx
    .select({
      datasetId: draftDatasetEntry.datasetId,
      content: draftDatasetEntry.content,
      baseContent: draftDatasetEntry.baseContent,
    })
    .from(draftDatasetEntry)
    .where(eq(draftDatasetEntry.draftId, draftId))
  const versionRows = await tx
    .select({
      id: researchVersion.id,
      number: researchVersion.number,
      published: researchVersion.published,
      snapshotId: researchVersion.snapshotId,
      content: contentSnapshot.content,
    })
    .from(researchVersion)
    .innerJoin(contentSnapshot, eq(contentSnapshot.id, researchVersion.snapshotId))
    .where(eq(researchVersion.researchId, draft.researchId))
    .orderBy(desc(researchVersion.number))
  const upstreamRows = await tx
    .select({ accession: humAccession.accession, humLabel: humAccession.humLabel })
    .from(humAccession)

  return {
    draft,
    humLabel: humLabels[0]?.label ?? null,
    datasets: new Map(datasetRows.map((row) => [row.id, {
      id: row.id,
      label: row.label,
      published: row.published,
      originDraftId: row.originDraftId,
    }])),
    entries: new Map(entryRows.map((row) => [row.datasetId, {
      content: row.content,
      baseContent: row.baseContent,
    }])),
    versions: versionRows.map((row) => ({
      id: row.id,
      number: row.number,
      published: row.published,
      snapshotId: row.snapshotId,
      content: row.content,
      datasetIds: row.content.datasetIds,
    })),
    upstreamHumLabelOf: new Map(upstreamRows.map((row) => [row.accession, row.humLabel])),
  }
}

/**
 * What each listed dataset would end up with. `null` content is a dataset the
 * version lists and nobody has described — the gate lists it, and passing means
 * publishing it empty rather than leaving the version pointing at nothing.
 */
function gateDatasets(ground: Ground): GateDataset[] {
  return ground.draft.content.datasetIds.flatMap((datasetId) => {
    const row = ground.datasets.get(datasetId)
    if (row === undefined) return []
    const entry = ground.entries.get(datasetId)
    return [{
      datasetId,
      label: row.label,
      content: entry?.content ?? row.published,
      upstream: upstreamEdit(entry, row.published),
    }]
  })
}

/**
 * Whether the published description moved while the draft was holding its own
 * copy. Without a base there is nothing to compare against — the draft made the
 * dataset, or made its entry before anything was published.
 */
function upstreamEdit(
  entry: { content: DatasetContent, baseContent: DatasetContent | null } | undefined,
  published: DatasetContent | null,
): ThreeWay | null {
  if (entry?.baseContent === undefined || entry.baseContent === null) return null
  if (published === null) return null
  return threeWayDataset(
    datasetContentInput(entry.baseContent),
    datasetContentInput(published),
    datasetContentInput(entry.content),
  )
}

/** The next number is one past the highest ever issued, withdrawn ones included. */
function nextNumber(versions: readonly VersionRow[]): number {
  return versions.reduce((highest, version) => Math.max(highest, version.number), 0) + 1
}

/**
 * Which of the two things a publish is, resolved before anything is written. A
 * fix replaces the version the draft was taken from, so a draft with no parent
 * — a research with nothing published yet — has nothing it could be a fix to.
 */
type Plan
  = | { kind: "cut", releaseDate: string }
    | { kind: "replace", version: VersionRow }

function planOf(mode: PublishMode, ground: Ground): Plan | null {
  if (mode.kind === "version") return { kind: "cut", releaseDate: mode.releaseDate }
  const version = ground.versions.find((held) => held.snapshotId === ground.draft.parentSnapshotId)
  return version === undefined ? null : { kind: "replace", version }
}

export interface DatasetChange {
  datasetId: string
  /** How many fields of its description this publish would rewrite. */
  fields: number
  /** How many published versions carry that description once a version is cut. */
  affects: number
  /**
   * The same count for a fix, which replaces a version's listing instead of
   * adding one. Null when this draft has no version it could be a fix to.
   */
  affectsIfFix: number | null
  /** It has never been published, so nothing is being written over. */
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
  /** The version a fix would replace. Null means there is nothing to fix. */
  fixes: { versionId: string, number: number } | null
  /** What this draft was taken from is no longer what is published. */
  stale: { number: number } | null
  gate: PublishGate
  /** Fields of the research that differ from the latest published version. */
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
    const fixes = ground.versions.find((held) => held.snapshotId === ground.draft.parentSnapshotId)
    // What this publish would stand in front of, read as a new version — the
    // choice between the two is made on the screen, and a fix only differs when
    // it is a fix to something other than the latest.
    const previous = ground.versions.find((held) => held.published)

    const gate = publishGate({
      humLabel: ground.humLabel,
      content: ground.draft.content,
      datasets,
      previousDatasetIds: previous?.datasetIds ?? [],
      upstream: ground.upstreamHumLabelOf,
      privateFiles,
    })

    const listedIds = datasets.map((row) => row.datasetId)
    const before = new Set(previous?.datasetIds ?? [])
    const affects = affectedVersionsOf(ground, null, listedIds)
    const affectsIfFix = fixes === undefined
      ? null
      : affectedVersionsOf(ground, fixes.id, listedIds)

    return {
      researchId: ground.draft.researchId,
      humLabel: ground.humLabel,
      revision: ground.draft.revision,
      nextNumber: nextNumber(ground.versions),
      fixes: fixes === undefined ? null : { versionId: fixes.id, number: fixes.number },
      stale: staleAgainst(ground, fixes, previous),
      gate,
      researchFields: previous === undefined
        ? null
        : researchFieldsChanged(previous.content, ground.draft.content),
      datasetChanges: changesOf(ground, datasets, affects, affectsIfFix),
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
 * Whether what this draft was taken from is still what is out there. Both a fix
 * to that version and a newer version published beside it mean the draft is
 * working from an older picture than the one it will replace.
 */
function staleAgainst(
  ground: Ground,
  fixes: VersionRow | undefined,
  latestPublished: VersionRow | undefined,
): { number: number } | null {
  if (ground.draft.parentSnapshotId === null) return null
  if (fixes === undefined) return { number: latestPublished?.number ?? 0 }
  return latestPublished === undefined || latestPublished.id === fixes.id
    ? null
    : { number: latestPublished.number }
}

/**
 * How much of the research itself this publish moves. The listing is left out
 * of the count because it is reported on its own line — what went on and what
 * came off is more use than "one field changed".
 */
function researchFieldsChanged(previous: ResearchContent, mine: ResearchContent): number {
  return diffDraftInput(
    { note: "", content: researchContentInput(previous) },
    { note: "", content: researchContentInput(mine) },
  ).filter((path) => path !== "datasetIds").length
}

function changesOf(
  ground: Ground,
  datasets: readonly GateDataset[],
  affects: (datasetId: string) => number,
  affectsIfFix: ((datasetId: string) => number) | null,
): DatasetChange[] {
  return datasets.flatMap((row) => {
    const published = ground.datasets.get(row.datasetId)?.published ?? null
    const next = row.content ?? emptyDatasetContent()
    const fields = published === null
      ? 0
      : diffDatasetInput(datasetContentInput(published), datasetContentInput(next)).length
    if (published !== null && fields === 0) return []
    return [{
      datasetId: row.datasetId,
      fields,
      affects: affects(row.datasetId),
      affectsIfFix: affectsIfFix === null ? null : affectsIfFix(row.datasetId),
      isNew: published === null,
    }]
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

    const plan = planOf(request.mode, ground)
    if (plan === null) return { status: "no-parent" }

    const datasets = gateDatasets(ground)
    // What is standing where this publish is about to stand: the version a fix
    // replaces, or the latest published one a new version follows.
    const previous = plan.kind === "replace"
      ? plan.version
      : ground.versions.find((version) => version.published)
    const gate = publishGate({
      humLabel: ground.humLabel,
      content: ground.draft.content,
      datasets,
      previousDatasetIds: previous?.datasetIds ?? [],
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

    const [snapshot] = await tx
      .insert(contentSnapshot)
      .values({ researchId: ground.draft.researchId, content: ground.draft.content })
      .returning({ id: contentSnapshot.id })
    if (snapshot === undefined) throw new Error("the snapshot insert returned no row")

    const version = plan.kind === "cut"
      ? await cutVersion(tx, ground, snapshot.id, plan.releaseDate)
      : await replaceSnapshot(tx, plan.version, snapshot.id)

    const eventId = await recordEvent(tx, {
      actor,
      action: plan.kind === "cut" ? "publish-version" : "publish-fix",
      subjectType: "research-version",
      subjectId: version.id,
      detail: {
        researchId: ground.draft.researchId,
        draftId: request.at.draftId,
        versionNumber: version.number,
        datasetCount: listedIds.length,
      },
    })

    await writeDatasets(tx, ground, datasets, {
      actor,
      eventId,
      versionNumber: version.number,
      affectedVersionsOf: affectedVersionsOf(ground, version.id, listedIds),
    })

    if (gate.findings.length > 0) {
      await recordEvent(tx, {
        actor,
        action: "pass-publish-gate",
        subjectType: "research-version",
        subjectId: version.id,
        detail: { passed: countFindings(gate.findings) },
      })
    }

    await rebuildSearchDocs(tx, { researchIds: [ground.draft.researchId] })
    return { status: "published", versionNumber: version.number }
  })
}

async function cutVersion(
  tx: Transaction,
  ground: Ground,
  snapshotId: string,
  releaseDate: string,
): Promise<{ id: string, number: number }> {
  const number = nextNumber(ground.versions)
  const [row] = await tx
    .insert(researchVersion)
    .values({ researchId: ground.draft.researchId, number, snapshotId, releaseDate, published: true })
    .returning({ id: researchVersion.id })
  if (row === undefined) throw new Error("the version insert returned no row")
  return { id: row.id, number }
}

/**
 * A fix keeps the number and the release date and points the version at a new
 * snapshot. The one it pointed at before stays in the table and stops being
 * reachable, which is what "not externally referenceable" means here.
 */
async function replaceSnapshot(
  tx: Transaction,
  fixing: VersionRow,
  snapshotId: string,
): Promise<{ id: string, number: number }> {
  await tx
    .update(researchVersion)
    .set({ snapshotId, updatedAt: sql`now()` })
    .where(eq(researchVersion.id, fixing.id))
  return { id: fixing.id, number: fixing.number }
}

/**
 * How many published versions each dataset's description reaches once this
 * publish is in. A fix to a dataset is felt by every one of them, which is what
 * the confirmation screen has to say out loud.
 */
function affectedVersionsOf(
  ground: Ground,
  excluding: string | null,
  listedIds: readonly string[],
): (datasetId: string) => number {
  const listings = ground.versions
    .filter((held) => held.published && held.id !== excluding)
    .map((held) => held.datasetIds)
  return (datasetId) =>
    listings.filter((ids) => ids.includes(datasetId)).length
    + (listedIds.includes(datasetId) ? 1 : 0)
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
 * The descriptions this publish leaves behind. Only the ones that actually
 * change are written and recorded — a publish that touched nothing about a
 * dataset says nothing about it.
 */
async function writeDatasets(
  tx: Transaction,
  ground: Ground,
  datasets: readonly GateDataset[],
  into: {
    actor: EventActor
    eventId: string
    versionNumber: number
    affectedVersionsOf: (datasetId: string) => number
  },
): Promise<void> {
  for (const row of datasets) {
    const published = ground.datasets.get(row.datasetId)?.published ?? null
    const next = row.content ?? emptyDatasetContent()
    if (published !== null && unchanged(published, next)) continue

    if (published !== null) {
      await tx.insert(replacedDatasetContent).values({
        datasetId: row.datasetId,
        content: published,
        eventId: into.eventId,
      })
    }
    await tx
      .insert(datasetContent)
      .values({ datasetId: row.datasetId, content: next })
      .onConflictDoUpdate({
        target: datasetContent.datasetId,
        set: { content: next },
      })
    await recordEvent(tx, {
      actor: into.actor,
      action: "publish-fix",
      subjectType: "dataset",
      subjectId: row.datasetId,
      detail: {
        versionNumber: into.versionNumber,
        affectedVersions: into.affectedVersionsOf(row.datasetId),
        replaced: published !== null,
      },
    })
  }
}

/**
 * Taking a version out of sight, and putting it back. Both are the same switch
 * on the same pin, which is why neither needs a state of its own — and why the
 * search rows, derived again here, are the only place visibility is decided.
 */
export function withdrawVersion(
  db: Database,
  versionId: string,
  actor: EventActor,
): Promise<VisibilityOutcome> {
  return setVisibility(db, versionId, false, actor)
}

export function republishVersion(
  db: Database,
  versionId: string,
  actor: EventActor,
): Promise<VisibilityOutcome> {
  return setVisibility(db, versionId, true, actor)
}

async function setVisibility(
  db: Database,
  versionId: string,
  published: boolean,
  actor: EventActor,
): Promise<VisibilityOutcome> {
  return db.transaction(async (tx): Promise<VisibilityOutcome> => {
    const rows = await tx
      .update(researchVersion)
      .set({ published, updatedAt: sql`now()` })
      .where(and(eq(researchVersion.id, versionId), eq(researchVersion.published, !published)))
      .returning({ researchId: researchVersion.researchId, number: researchVersion.number })

    const row = rows[0]
    if (row === undefined) {
      const [found] = await tx
        .select({ id: researchVersion.id })
        .from(researchVersion)
        .where(eq(researchVersion.id, versionId))
        .limit(1)
      return { status: found === undefined ? "gone" : "unchanged" }
    }

    await recordEvent(tx, {
      actor,
      action: published ? "republish-version" : "withdraw-version",
      subjectType: "research-version",
      subjectId: versionId,
      detail: { researchId: row.researchId, versionNumber: row.number },
    })
    await rebuildSearchDocs(tx, { researchIds: [row.researchId] })
    return { status: "changed" }
  })
}
