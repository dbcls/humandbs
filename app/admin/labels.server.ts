/**
 * Attaching an outward-facing label to an identity, and taking it off.
 *
 * Both systems of label go through here because they follow one rule: unique
 * across primary and secondary alike, reusable once unpinned, and free to be
 * attached before anything is published. A hum number starts life as free text
 * typed into an upstream system with a history of typos, so correcting a pin is
 * an everyday operation rather than an exception.
 *
 * **A pin is what publishing insists on, so it has to exist before a publish.**
 * The ledger is written when the label is attached, not when the version goes
 * out; a dataset a draft introduced holds its pin the same way it holds its
 * identity, and both go if the draft is discarded.
 *
 * Making a label primary demotes the one that was — the old one keeps resolving,
 * which is the point of holding more than one. Unpinning does not reserve
 * anything: the ledger says which labels are in use and nothing more.
 *
 * **Renumbering a research moves its box.** The public key carries the hum
 * label, so the files a reader can already fetch would otherwise stay at the
 * retired address and disappear from the new one. The move is queued after the
 * pin is committed: it is a rename inside one bucket rather than a copy of the
 * bytes, and holding the ledger's rows while talking to the store would be
 * paying for that with a lock.
 *
 * Visibility follows from the search rows, so every change here derives them
 * again for the research it touched. A dataset whose id was taken away has no
 * label to be found by and drops out of the listings of the versions that carry
 * it, without any version's snapshot being rewritten — what a version listed is
 * a fact about that version, and what is visible now is a different question.
 */

import { and, eq, inArray } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import type { Database, Transaction } from "~/db/client.server"
import { dataset, labelPin } from "~/db/schema"
import { requestBoxMove } from "~/files/jobs.server"
import { wakeFileRunner } from "~/files/runner.server"
import { rebuildSearchDocs } from "~/search/rebuild.server"

export interface PinRequest {
  kind: "hum" | "dataset"
  label: string
  /** The identity the label names; a hum label takes the research, an id the dataset. */
  subjectId: string
  isPrimary: boolean
}

export type PinOutcome
  = | { status: "pinned" }
    /** The label already names something. Uniqueness spans primary and secondary. */
    | { status: "taken" }
    | { status: "gone" }

export type UnpinOutcome
  = | { status: "unpinned" }
    | { status: "gone" }

function subjectColumns(request: PinRequest) {
  return request.kind === "hum"
    ? { researchId: request.subjectId, datasetId: null }
    : { researchId: null, datasetId: request.subjectId }
}

export async function pinLabel(
  db: Database,
  request: PinRequest,
  actor: EventActor,
): Promise<PinOutcome> {
  const label = request.label.trim()
  if (label === "") return { status: "gone" }

  const done = await db.transaction(async (tx) => {
    const researchId = await researchOf(tx, request)
    if (researchId === null) return { outcome: { status: "gone" } as PinOutcome }

    const [held] = await tx
      .select({ id: labelPin.id })
      .from(labelPin)
      .where(and(eq(labelPin.kind, request.kind), eq(labelPin.label, label)))
      .limit(1)
    if (held !== undefined) return { outcome: { status: "taken" } as PinOutcome }

    const columns = subjectColumns(request)
    const demoted = request.isPrimary ? await demote(tx, request) : null

    await tx.insert(labelPin).values({
      kind: request.kind,
      label,
      ...columns,
      isPrimary: request.isPrimary,
    })
    await recordEvent(tx, {
      actor,
      action: "pin-label",
      subjectType: "label",
      subjectId: label,
      detail: { kind: request.kind, subject: request.subjectId, isPrimary: request.isPrimary },
    })
    await rebuildSearchDocs(tx, { researchIds: [researchId] })
    return {
      outcome: { status: "pinned" } as PinOutcome,
      // Only a hum label addresses a box, and only a new primary moves it.
      movedFrom: request.kind === "hum" ? demoted : null,
      researchId,
    }
  })

  if (done.movedFrom != null) {
    await requestBoxMove(db, done.researchId, done.movedFrom)
    wakeFileRunner()
  }
  return done.outcome
}

export type PinManyOutcome
  = | { status: "pinned" }
    | { status: "taken", label: string }

/**
 * Attaching several labels at once, inside a transaction somebody else opened.
 *
 * Seeding a draft from an approved application pins a hum label and one
 * accession per dataset, and a research can arrive carrying two hundred of them
 * — so the ledger is checked once for the whole set rather than once per label
 * (docs/editing.md の「上流からの下書き」).
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
    await tx.insert(labelPin).values({
      kind: request.kind,
      label: request.label,
      ...subjectColumns(request),
      isPrimary: request.isPrimary,
    })
    await recordEvent(tx, {
      actor,
      action: "pin-label",
      subjectType: "label",
      subjectId: request.label,
      detail: { kind: request.kind, subject: request.subjectId, isPrimary: request.isPrimary },
    })
  }
  return { status: "pinned" }
}

export async function unpinLabel(
  db: Database,
  pinId: string,
  actor: EventActor,
): Promise<UnpinOutcome> {
  return db.transaction(async (tx): Promise<UnpinOutcome> => {
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
    if (pin === undefined) return { status: "gone" }

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
 * returned because a hum label is also the name of the public box, and the
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
