/**
 * Moving a file between the buckets.
 *
 * **A row is not an instruction but a destination.** It says which bucket the
 * file is meant to be in, so a second opinion overwrites the first instead of
 * queueing behind it — otherwise every intermediate opinion would be carried
 * out as a copy of the actual bytes, and the largest file is 146 GiB. The unique
 * constraint on `(research, file name)` is what makes that true rather than
 * merely intended.
 *
 * **Running one reconciles rather than acts.** It looks at where the file
 * actually is and moves it only if that is not where it belongs, so running the
 * same job twice does nothing the second time, and a process that died between
 * the copy and the delete is repaired by the next attempt. Nothing is lost if
 * the table is: every file stays either public or private, and the log says who
 * asked for what.
 *
 * Renumbering a research is not a third kind of work. The public key carries
 * the hum label, so moving the box is asking for every file in it to be public
 * again — and the label it is moving away from is still in the ledger as a
 * secondary pin, which is how the copy that has to move is found.
 */

import { and, asc, eq, inArray, lt, sql } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import type { Database, Executor } from "~/db/client.server"
import { filePublishJob, labelPin } from "~/db/schema"

import {
  privatePrefix,
  PRIVATE_BUCKET,
  publicPrefix,
  PUBLIC_BUCKET,
  type PendingSwitch,
  type SwitchAction,
} from "./box"
import { copyObject, deleteObject, listPrefix, objectExists, type ObjectRef } from "./store.server"

/** An attempt that started this long ago is taken to have died with its process. */
const STALE_AFTER_MS = 30 * 60 * 1000

/** How many times a failure is retried before it waits for somebody to look. */
const MAX_ATTEMPTS = 5

export interface SwitchRequest {
  researchId: string
  fileName: string
  action: SwitchAction
}

/**
 * Record where these files belong. **The insert is an upsert**, so asking again
 * for a file already queued replaces the destination rather than adding a second
 * row.
 *
 * A row being worked on keeps its `running` state: the process holding it is
 * mid-copy, and marking it waiting again would let a second process start the
 * same copy. It becomes waiting when that process finishes and finds the
 * destination is no longer the one it set out for.
 *
 * It takes an executor because a bulk switch is one transaction with the events
 * that record it.
 */
export async function requestSwitch(
  executor: Executor,
  requests: readonly SwitchRequest[],
): Promise<void> {
  if (requests.length === 0) return
  await executor
    .insert(filePublishJob)
    .values(requests.map((request) => ({
      researchId: request.researchId,
      fileName: request.fileName,
      action: request.action,
    })))
    .onConflictDoUpdate({
      target: [filePublishJob.researchId, filePublishJob.fileName],
      set: {
        action: sql`excluded.action`,
        state: sql`case when ${filePublishJob.state} = 'running'
          then 'running'::file_publish_job_state
          else 'pending'::file_publish_job_state end`,
        attempts: 0,
        lastError: null,
        updatedAt: new Date(),
      },
    })
}

/**
 * Switch files and write the trail in one transaction. The switch itself
 * happens later — what is committed here is the destination and the record of
 * who chose it.
 */
export async function switchFiles(
  db: Database,
  requests: readonly SwitchRequest[],
  actor: EventActor,
): Promise<void> {
  if (requests.length === 0) return
  await db.transaction(async (tx) => {
    await requestSwitch(tx, requests)
    for (const request of requests) {
      await recordEvent(tx, {
        actor,
        action: request.action === "publish" ? "publish-file" : "unpublish-file",
        subjectType: "file",
        subjectId: request.fileName,
        detail: { research: request.researchId },
      })
    }
  })
}

/**
 * Every file in the old box has to become public again under the new label.
 * Nothing crosses buckets, so each of these finishes as a rename inside the
 * public bucket rather than as a copy of the bytes.
 */
export async function requestBoxMove(
  executor: Executor,
  researchId: string,
  fromHumLabel: string,
): Promise<void> {
  const nodes = await listPrefix(PUBLIC_BUCKET, publicPrefix(fromHumLabel))
  await requestSwitch(
    executor,
    nodes.map((node) => ({ researchId, fileName: node.name, action: "publish" as const })),
  )
}

export async function pendingSwitches(
  executor: Executor,
  researchId: string,
): Promise<PendingSwitch[]> {
  const rows = await executor
    .select({
      fileName: filePublishJob.fileName,
      action: filePublishJob.action,
      state: filePublishJob.state,
      lastError: filePublishJob.lastError,
    })
    .from(filePublishJob)
    .where(eq(filePublishJob.researchId, researchId))
  return rows.map((row) => ({
    fileName: row.fileName,
    action: row.action,
    failed: row.state === "failed",
    lastError: row.lastError,
  }))
}

/** The names sitting in the private bucket, which is what the gate checks against. */
export async function privateNames(researchId: string): Promise<Set<string>> {
  const nodes = await listPrefix(PRIVATE_BUCKET, privatePrefix(researchId))
  return new Set(nodes.map((node) => node.name))
}

/**
 * Forget the destinations recorded for files that are no longer there. Deleting
 * a file makes any answer about where it belongs meaningless.
 */
export async function forgetSwitches(
  executor: Executor,
  researchId: string,
  fileNames: readonly string[],
): Promise<void> {
  if (fileNames.length === 0) return
  await executor
    .delete(filePublishJob)
    .where(and(
      eq(filePublishJob.researchId, researchId),
      inArray(filePublishJob.fileName, [...fileNames]),
    ))
}

export interface FileJob {
  id: string
  action: SwitchAction
  researchId: string
  fileName: string
  attempts: number
}

/**
 * Take one waiting job. `SKIP LOCKED` is what lets more than one process run
 * the loop without either of them starting the same copy.
 */
export async function claimJob(db: Database): Promise<FileJob | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: filePublishJob.id,
        action: filePublishJob.action,
        researchId: filePublishJob.researchId,
        fileName: filePublishJob.fileName,
        attempts: filePublishJob.attempts,
      })
      .from(filePublishJob)
      .where(eq(filePublishJob.state, "pending"))
      .orderBy(asc(filePublishJob.createdAt))
      .limit(1)
      .for("update", { skipLocked: true })
    if (row === undefined) return null

    await tx
      .update(filePublishJob)
      .set({ state: "running", attempts: row.attempts + 1, updatedAt: new Date() })
      .where(eq(filePublishJob.id, row.id))
    return row
  })
}

/**
 * Put the row back the way a finished job leaves it.
 *
 * **The delete is conditional on the destination not having changed.** If
 * somebody asked for the opposite while the copy was running, the row now holds
 * their answer, and deleting it would throw that away; leaving it waiting sends
 * the file back the other way instead.
 */
export async function settleJob(db: Database, job: FileJob): Promise<void> {
  await db
    .delete(filePublishJob)
    .where(and(eq(filePublishJob.id, job.id), eq(filePublishJob.action, job.action)))
  await db
    .update(filePublishJob)
    .set({ state: "pending", attempts: 0, updatedAt: new Date() })
    .where(and(eq(filePublishJob.id, job.id), eq(filePublishJob.state, "running")))
}

async function fail(db: Database, job: FileJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await db
    .update(filePublishJob)
    .set({
      // A job out of attempts waits to be looked at. The screen shows it as
      // failed, and asking for the switch again clears the count.
      state: job.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(filePublishJob.id, job.id))
}

interface Boxes {
  /** Where a public copy belongs. Null when no hum label is pinned yet. */
  primary: string | null
  /** Labels this research held before, which is where a copy may still be. */
  others: string[]
}

export async function boxesOf(executor: Executor, researchId: string): Promise<Boxes> {
  const rows = await executor
    .select({ label: labelPin.label, isPrimary: labelPin.isPrimary })
    .from(labelPin)
    .where(and(eq(labelPin.kind, "hum"), eq(labelPin.researchId, researchId)))
  return {
    primary: rows.find((row) => row.isPrimary)?.label ?? null,
    others: rows.filter((row) => !row.isPrimary).map((row) => row.label),
  }
}

function sameRef(a: ObjectRef, b: ObjectRef): boolean {
  return a.bucket === b.bucket && a.key === b.key
}

/**
 * Move the file to where the job says it belongs, and take away every copy that
 * is somewhere else.
 *
 * The order is copy then delete, never the other way round: a process that dies
 * in between leaves the file readable twice, which is untidy but not a loss,
 * whereas the other order loses it.
 */
export async function reconcile(db: Database, job: FileJob): Promise<void> {
  const boxes = await boxesOf(db, job.researchId)
  const privateRef: ObjectRef = {
    bucket: PRIVATE_BUCKET,
    key: privatePrefix(job.researchId) + job.fileName,
  }
  const publicRefs = [...(boxes.primary === null ? [] : [boxes.primary]), ...boxes.others]
    .map((label): ObjectRef => ({
      bucket: PUBLIC_BUCKET,
      key: publicPrefix(label) + job.fileName,
    }))

  let destination: ObjectRef
  if (job.action === "unpublish") {
    destination = privateRef
  } else if (boxes.primary === null) {
    // The gate keeps a version from publishing without a hum label, but a file
    // can be switched on its own, and then there is no address to put it at.
    throw new Error("no hum label is pinned, so the research has no public box")
  } else {
    destination = { bucket: PUBLIC_BUCKET, key: publicPrefix(boxes.primary) + job.fileName }
  }

  const elsewhere = [privateRef, ...publicRefs].filter((ref) => !sameRef(ref, destination))

  if (!await objectExists(destination)) {
    const source = await firstPresent(elsewhere)
    // Nowhere to be found: the file was deleted, or a previous attempt already
    // finished the move. Either way there is nothing left to do.
    if (source === null) return
    await copyObject(source, destination)
  }

  // A delete against a key that is not there is not an error, so no check is
  // worth the round trip.
  for (const ref of elsewhere) await deleteObject(ref)
}

async function firstPresent(refs: readonly ObjectRef[]): Promise<ObjectRef | null> {
  for (const ref of refs) {
    if (await objectExists(ref)) return ref
  }
  return null
}

/**
 * Attempts abandoned by a process that stopped. They are made to wait again
 * rather than failed: reconciling is safe to repeat, so running one a second
 * time costs only the run.
 */
export async function recoverAbandoned(db: Database): Promise<number> {
  const rows = await db
    .update(filePublishJob)
    .set({ state: "pending", updatedAt: new Date() })
    .where(and(
      eq(filePublishJob.state, "running"),
      lt(filePublishJob.updatedAt, new Date(Date.now() - STALE_AFTER_MS)),
    ))
    .returning({ id: filePublishJob.id })
  return rows.length
}

/**
 * Run one waiting job. False means there was none.
 *
 * The three steps are separate functions rather than one because the middle of
 * them is where a second opinion can arrive: claiming, reconciling and settling
 * have to be drivable one at a time to say what happens when it does.
 */
export async function runOneJob(db: Database): Promise<boolean> {
  const job = await claimJob(db)
  if (job === null) return false
  try {
    await reconcile(db, job)
    await settleJob(db, job)
  } catch (error) {
    await fail(db, job, error)
  }
  return true
}
