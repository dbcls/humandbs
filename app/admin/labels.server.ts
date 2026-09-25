/**
 * Attaching an outward-facing label to an identity, and taking it off.
 *
 * Both systems of label go through here because they follow one rule: unique
 * across primary and secondary alike, reusable once unpinned, and free to be
 * attached before anything is published. **The NHA id is the exception to
 * reuse**: the portal issues it, never twice, and it is not typed
 * (`issueNhaId`). A hum number starts life as free text
 * typed into an upstream system with a history of typos, so correcting a pin is
 * an everyday operation rather than an exception.
 *
 * **A pin is what publishing insists on, so it has to exist before a publish.**
 * The `label_pin` table is written when the label is attached, not when the version goes
 * out; a dataset a draft introduced holds its pin the same way it holds its
 * identity, and both go if the draft is discarded.
 *
 * Making a label primary demotes the one that was — the old one keeps resolving,
 * which is the point of holding more than one. Unpinning does not reserve
 * anything: the `label_pin` table reports which labels are in use and nothing more.
 *
 * **Renumbering a research moves its prefix.** The public key has the hum
 * label, so the files a reader can already fetch would otherwise stay at the
 * retired address and disappear from the new one. The prefix is listed before the
 * transaction opens — holding the `label_pin` table's rows while talking to the store
 * would be paying for it with a lock — and the move is queued inside it, so the
 * new primary and the move commit together or not at all.
 *
 * **A hum label whose prefix holds anything is not unpinned.** The `label_pin` table is how a
 * switch finds the copies it has to move, so a prefix whose label left it is out
 * of every switch's reach: its files would keep responding at the old address,
 * and appear in the listing of whichever research is given the number next.
 * Renumbering is pinning the new label as primary; the old one can go once the
 * move has emptied its prefix.
 *
 * Visibility follows from the search rows, so every change here derives them
 * again for the research it touched. A dataset whose id was taken away has no
 * label to be found by and drops out of the listings of the versions that have
 * it, without any version's snapshot being rewritten — what a version listed is
 * a fact about that version, and what is visible now is a different question.
 */

import { and, eq, inArray, sql } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import type { Database, Executor, Transaction } from "~/db/client.server"
import { dataset, event, labelPin } from "~/db/schema"
import {
  listingsOf,
  prefixMoveOf,
  pendingSwitches,
  publicPrefixHoldsFiles,
  requestSwitch,
  type SwitchRequest,
} from "~/files/jobs.server"
import { wakeFileRunner } from "~/files/runner.server"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { isNhaId, NHA_ID_PATTERN, nhaId, nhaNumber } from "./labels"
import { lockResearch } from "./locks.server"

export interface PinRequest {
  kind: "hum" | "dataset"
  label: string
  /** The identity the label names; a hum label takes the research, an id the dataset. */
  subjectId: string
  isPrimary: boolean
}

export type PinOutcome
  = | { status: "pinned" }
    /** The label already identifies something. Uniqueness spans primary and secondary. */
    | { status: "taken" }
    /** The label is spelled as an NHA id, which only `issueNhaId` gives out. */
    | { status: "reserved" }
    | { status: "gone" }

export type IssueOutcome
  = | { status: "issued", label: string }
    /** The dataset already has a primary id; issuing is for one that has none. */
    | { status: "held" }
    | { status: "gone" }

export type UnpinOutcome
  = | { status: "unpinned" }
    /** A hum label whose public prefix still holds files, or whose research has a switch unfinished. */
    | { status: "holds-files" }
    | { status: "gone" }

export type PromoteOutcome
  = | { status: "promoted" }
    | { status: "gone" }

function subjectColumns(request: PinRequest) {
  return request.kind === "hum"
    ? { researchId: request.subjectId, datasetId: null }
    : { researchId: null, datasetId: request.subjectId }
}

/**
 * The `label_pin` row and the record that it was made, which are one act. Both ways
 * of pinning go through here so that what an event has is decided once —
 * the trail is append-only, and a detail that two writers spell differently
 * cannot be corrected afterwards.
 */
async function writePin(
  tx: Transaction,
  request: PinRequest,
  label: string,
  actor: EventActor,
): Promise<void> {
  await tx.insert(labelPin).values({
    kind: request.kind,
    label,
    ...subjectColumns(request),
    isPrimary: request.isPrimary,
  })
  await recordEvent(tx, {
    actor,
    action: "pin-label",
    subjectType: "label",
    subjectId: label,
    detail: { kind: request.kind, subject: request.subjectId, isPrimary: request.isPrimary },
  })
}

export async function pinLabel(
  db: Database,
  request: PinRequest,
  actor: EventActor,
): Promise<PinOutcome> {
  const label = request.label.trim()
  if (label === "") return { status: "gone" }
  // Typed by hand, the next number could be skipped or taken early; the only
  // way an NHA id comes into being is being issued.
  if (isNhaId(label)) return { status: "reserved" }

  // Only a hum label addresses a prefix, and only a new primary moves it.
  const planned = request.kind === "hum" && request.isPrimary
    ? await plannedMove(db, request.subjectId)
    : null

  const done = await db.transaction(async (tx) => {
    const researchId = await researchOf(tx, request)
    if (researchId === null || !await lockResearch(tx, researchId, "key share")) {
      return { outcome: { status: "gone" } as PinOutcome, moved: false }
    }

    const [held] = await tx
      .select({ id: labelPin.id })
      .from(labelPin)
      .where(and(eq(labelPin.kind, request.kind), eq(labelPin.label, label)))
      .limit(1)
    if (held !== undefined) return { outcome: { status: "taken" } as PinOutcome, moved: false }

    const demoted = request.isPrimary ? await demote(tx, request) : null

    await writePin(tx, request, label, actor)
    const moved = request.kind === "hum" && demoted !== null
      && await queueMove(tx, researchId, demoted, planned)
    await rebuildSearchDocs(tx, { researchIds: [researchId] })
    return { outcome: { status: "pinned" } as PinOutcome, moved }
  })

  if (done.moved) wakeFileRunner()
  return done.outcome
}

interface PlannedMove {
  from: string
  moves: SwitchRequest[]
}

/** The prefix a research's hum label moves away from, listed before anything is locked. */
async function plannedMove(db: Database, researchId: string): Promise<PlannedMove | null> {
  const { primary } = await listingsOf(db, researchId)
  return primary === null ? null : { from: primary, moves: await prefixMoveOf(researchId, primary) }
}

/**
 * Queue the move away from the label that was just demoted, in the transaction
 * that demoted it. The listing made beforehand is used when it was of that
 * label; another pin landing in between is rare enough to list again here.
 */
async function queueMove(
  tx: Transaction,
  researchId: string,
  demoted: string,
  planned: PlannedMove | null,
): Promise<boolean> {
  const moves = planned?.from === demoted ? planned.moves : await prefixMoveOf(researchId, demoted)
  await requestSwitch(tx, moves)
  return moves.length > 0
}

/**
 * The NHA id the next issue will give — the one after the highest the `label_pin` table
 * or the trail holds. **Reading it reserves nothing**: a screen shows it before
 * anything is pinned, and the issue itself reads it again under its lock, so
 * what a screen showed can be overtaken by an issue made in between.
 */
export async function nextNhaId(db: Executor): Promise<string> {
  const shape = `^${NHA_ID_PATTERN}$`
  const [recorded, pinned] = await Promise.all([
    db
      .select({ label: sql<string | null>`max(${event.subjectId})` })
      .from(event)
      .where(and(
        eq(event.action, "pin-label"),
        eq(event.subjectType, "label"),
        sql`${event.subjectId} ~ ${shape}`,
      )),
    db
      .select({ label: sql<string | null>`max(${labelPin.label})` })
      .from(labelPin)
      .where(and(eq(labelPin.kind, "dataset"), sql`${labelPin.label} ~ ${shape}`)),
  ])
  // Six digits padded with zeros sort as their numbers do.
  const highest = [recorded[0]?.label, pinned[0]?.label]
    .map((label) => label == null ? 0 : nhaNumber(label) ?? 0)
    .reduce((a, b) => Math.max(a, b), 0)
  return nhaId(highest + 1)
}

/**
 * Giving a dataset with no id the next NHA id, as its primary.
 *
 * **A number once given out is never given out again**, even after it is
 * unpinned or its draft is discarded: a link somebody copied would otherwise
 * come to name another dataset without anything indicating so. The `label_pin` table forgets
 * what is unpinned, so the next number is read from the trail as well — every
 * pin is recorded there and nothing is ever taken out of it. The `label_pin` table is
 * read too, for an id that reached it without being recorded one by one.
 *
 * Two issues at the same moment would read the same highest number, so they
 * queue on a transaction-scoped lock and the second reads what the first wrote.
 */
export async function issueNhaId(
  db: Database,
  datasetId: string,
  actor: EventActor,
): Promise<IssueOutcome> {
  return db.transaction(async (tx): Promise<IssueOutcome> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('issue-nha-id'))`)

    const researchId = await researchOfDataset(tx, datasetId)
    if (researchId === null || !await lockResearch(tx, researchId, "key share")) return { status: "gone" }
    const [held] = await tx
      .select({ id: labelPin.id })
      .from(labelPin)
      .where(and(eq(labelPin.datasetId, datasetId), eq(labelPin.isPrimary, true)))
      .limit(1)
    if (held !== undefined) return { status: "held" }

    const label = await nextNhaId(tx)

    await writePin(tx, { kind: "dataset", label, subjectId: datasetId, isPrimary: true }, label, actor)
    await rebuildSearchDocs(tx, { researchIds: [researchId] })
    return { status: "issued", label }
  })
}

export type PinManyOutcome
  = | { status: "pinned" }
    | { status: "taken", label: string }

/**
 * Attaching several labels at once, inside a transaction somebody else opened.
 *
 * Seeding a draft from an approved application pins a hum label and one
 * accession per dataset, and a research can arrive with two hundred of them
 * — so the `label_pin` table is checked once for the whole set rather than once per label.
 *
 * **Nothing here demotes and nothing derives the search rows.** The identities
 * being labelled were made a moment ago and hold no earlier label, and nothing
 * unpublished appears in a search row, so there is neither an old primary to
 * keep resolving nor a listing to change.
 */
export async function pinLabelsIn(
  tx: Transaction,
  requests: readonly PinRequest[],
  actor: EventActor,
): Promise<PinManyOutcome> {
  if (requests.length === 0) return { status: "pinned" }

  const held = await tx
    .select({ kind: labelPin.kind, label: labelPin.label })
    .from(labelPin)
    .where(inArray(labelPin.label, requests.map((request) => request.label)))
  for (const request of requests) {
    if (held.some((row) => row.kind === request.kind && row.label === request.label)) {
      return { status: "taken", label: request.label }
    }
  }

  for (const request of requests) {
    await writePin(tx, request, request.label, actor)
  }
  return { status: "pinned" }
}

/**
 * Making a label the primary one. The one that was primary becomes secondary,
 * so it keeps resolving — moving a label is not taking it away. A hum label
 * moving is what moves the research's public prefix, the same as pinning a new
 * primary does.
 *
 * Already primary, nothing is written: there is no move to record.
 */
export async function promotePin(
  db: Database,
  pinId: string,
  actor: EventActor,
): Promise<PromoteOutcome> {
  const seen = await readPin(db, pinId)
  const planned = seen?.kind === "hum" && !seen.isPrimary && seen.researchId !== null
    ? await plannedMove(db, seen.researchId)
    : null

  const done = await db.transaction(async (tx) => {
    if (!await lockResearchOfPin(tx, pinId)) return null
    const pin = await readPin(tx, pinId)
    if (pin === null) return null
    const subjectId = pin.researchId ?? pin.datasetId
    if (subjectId === null) return null
    const researchId = pin.researchId ?? await researchOfDataset(tx, pin.datasetId)
    if (pin.isPrimary) return { moved: false }

    const request: PinRequest = { kind: pin.kind, label: pin.label, subjectId, isPrimary: true }
    const demoted = await demote(tx, request)
    await tx.update(labelPin).set({ isPrimary: true }).where(eq(labelPin.id, pinId))
    await recordEvent(tx, {
      actor,
      action: "pin-label",
      subjectType: "label",
      subjectId: pin.label,
      detail: { kind: pin.kind, subject: subjectId, isPrimary: true, promoted: true },
    })
    const moved = pin.kind === "hum" && demoted !== null && pin.researchId !== null
      && await queueMove(tx, pin.researchId, demoted, planned)
    if (researchId !== null) await rebuildSearchDocs(tx, { researchIds: [researchId] })
    return { moved }
  })

  if (done === null) return { status: "gone" }
  if (done.moved) wakeFileRunner()
  return { status: "promoted" }
}

async function readPin(executor: Executor, pinId: string) {
  const [pin] = await executor
    .select({
      kind: labelPin.kind,
      label: labelPin.label,
      researchId: labelPin.researchId,
      datasetId: labelPin.datasetId,
      isPrimary: labelPin.isPrimary,
    })
    .from(labelPin)
    .where(eq(labelPin.id, pinId))
    .limit(1)
  return pin ?? null
}

/**
 * Taking a label off. **A hum label is kept while its public prefix holds files**
 * or a file of the research is still switching — see the head of this module.
 */
export async function unpinLabel(
  db: Database,
  pinId: string,
  actor: EventActor,
): Promise<UnpinOutcome> {
  // The store is asked before the `label_pin` table is locked; a switch queued meanwhile
  // is caught below, under the lock.
  const seen = await readPin(db, pinId)
  if (seen?.kind === "hum" && await publicPrefixHoldsFiles(seen.label)) return { status: "holds-files" }

  return db.transaction(async (tx): Promise<UnpinOutcome> => {
    if (!await lockResearchOfPin(tx, pinId)) return { status: "gone" }
    const [pin] = await tx
      .select({
        kind: labelPin.kind,
        label: labelPin.label,
        researchId: labelPin.researchId,
        datasetId: labelPin.datasetId,
      })
      .from(labelPin)
      .where(eq(labelPin.id, pinId))
      .limit(1)
      .for("update")
    if (pin === undefined) return { status: "gone" }
    if (pin.kind === "hum" && pin.researchId !== null) {
      // A switch still running may yet put a file into this prefix, or be about
      // to find its copy there.
      const switching = await pendingSwitches(tx, pin.researchId)
      if (switching.some((row) => !row.failed)) return { status: "holds-files" }
    }

    const researchId = pin.researchId ?? await researchOfDataset(tx, pin.datasetId)
    await tx.delete(labelPin).where(eq(labelPin.id, pinId))
    await recordEvent(tx, {
      actor,
      action: "unpin-label",
      subjectType: "label",
      subjectId: pin.label,
      detail: { kind: pin.kind, subject: pin.researchId ?? pin.datasetId },
    })
    if (researchId !== null) await rebuildSearchDocs(tx, { researchIds: [researchId] })
    return { status: "unpinned" }
  })
}

/**
 * Locks the research a pin belongs to, before the pin itself (`locks.server.ts`).
 * False when the pin or its research is not there.
 */
async function lockResearchOfPin(tx: Transaction, pinId: string): Promise<boolean> {
  const pin = await readPin(tx, pinId)
  if (pin === null) return false
  const researchId = pin.researchId ?? await researchOfDataset(tx, pin.datasetId)
  return researchId !== null && await lockResearch(tx, researchId, "key share")
}

/** The research whose search rows a change to this pin moves. */
async function researchOf(tx: Transaction, request: PinRequest): Promise<string | null> {
  if (request.kind === "hum") return request.subjectId
  return researchOfDataset(tx, request.subjectId)
}

async function researchOfDataset(
  tx: Transaction,
  datasetId: string | null,
): Promise<string | null> {
  if (datasetId === null) return null
  const [row] = await tx
    .select({ researchId: dataset.researchId })
    .from(dataset)
    .where(eq(dataset.id, datasetId))
    .limit(1)
  return row?.researchId ?? null
}

/**
 * The label that was primary becomes secondary, so it keeps resolving. It is
 * returned because a hum label is also the name of the public prefix, and the
 * files under it have to follow the new one.
 */
async function demote(tx: Transaction, request: PinRequest): Promise<string | null> {
  const subject = request.kind === "hum"
    ? eq(labelPin.researchId, request.subjectId)
    : eq(labelPin.datasetId, request.subjectId)
  const rows = await tx
    .update(labelPin)
    .set({ isPrimary: false })
    .where(and(eq(labelPin.kind, request.kind), subject, eq(labelPin.isPrimary, true)))
    .returning({ label: labelPin.label })
  return rows[0]?.label ?? null
}
