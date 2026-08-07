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
 * The two that create a row take no revision because there is nothing to check
 * against: an insert has no earlier version of itself to disagree with. Once a
 * draft exists, nothing else may touch it from outside this file.
 *
 * A conflict is told apart from a draft that is simply gone, because the two
 * mean different things to whoever asked: one is somebody else's edit to look
 * at, the other is a page that no longer exists.
 */

import { randomBytes } from "node:crypto"

import { and, desc, eq, sql } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import { emptyResearchContent } from "~/content/empty"
import type { ResearchContent } from "~/content/types"
import type { Database, Executor } from "~/db/client.server"
import { contentSnapshot, research, researchDraft, researchVersion } from "~/db/schema"

const SHARE_TOKEN_BYTES = 32

/** Which draft, and which version of it the caller was looking at. */
export interface DraftAt {
  draftId: string
  revision: number
}

export type SaveOutcome
  = | { status: "saved", revision: number }
    | { status: "conflict" }
    | { status: "gone" }

export type DiscardOutcome
  = | { status: "discarded" }
    | { status: "conflict" }
    | { status: "gone" }

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
 */
export async function saveDraftContent(
  db: Executor,
  at: DraftAt,
  fields: { note: string, content: ResearchContent },
): Promise<SaveOutcome> {
  const rows = await db
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
  if (row !== undefined) return { status: "saved", revision: row.revision }
  return { status: await draftExists(db, at.draftId) ? "conflict" : "gone" }
}

/**
 * Throwing a draft away, with everything that hung off it — the changed dataset
 * entries, the undo stack, the comments, the share link, and any dataset
 * identity the draft itself introduced, all by cascade. A draft is not history,
 * so there is nowhere for any of it to go.
 *
 * The revision is checked here too. Discarding cannot be undone, so a draft
 * somebody has edited since the screen was opened is worth stopping at.
 */
export async function discardDraft(
  db: Database,
  at: DraftAt,
  actor: EventActor,
): Promise<DiscardOutcome> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(researchDraft)
      .where(and(eq(researchDraft.id, at.draftId), eq(researchDraft.revision, at.revision)))
      .returning({ researchId: researchDraft.researchId })

    const row = rows[0]
    if (row === undefined) {
      return { status: await draftExists(tx, at.draftId) ? "conflict" : "gone" }
    }

    await recordEvent(tx, {
      actor,
      action: "discard-draft",
      subjectType: "draft",
      subjectId: at.draftId,
      detail: { researchId: row.researchId },
    })
    return { status: "discarded" }
  })
}
