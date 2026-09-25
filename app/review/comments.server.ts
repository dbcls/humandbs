/**
 * Reading and writing what has been said about a draft.
 *
 * Every write names the draft as well as the row it changes, so a comment of
 * one draft cannot be resolved through the address of another — the share link
 * is the only credential most of these callers have, and it is a credential for
 * one draft.
 *
 * Nothing here is versioned or checked against a revision. A comment is not
 * content: it is added, never edited, and the only thing that changes about it
 * is whether somebody has decided it is dealt with. **Resolving is that
 * decision and it is always a person's** — editing the value a comment is about
 * does not close it, because looking at the comment afterwards is the point.
 */

import { and, asc, eq, ne, sql } from "drizzle-orm"

import type { AcknowledgementKind, CommentAnchor, ResearchContent } from "~/content/types"
import type { Executor } from "~/db/client.server"
import { adminUser, comment, researchDraft, reviewAcknowledgement } from "~/db/schema"

import { anchorOf, DRAFT_ANCHOR, MEMO_ANCHOR, type AnchorSubject } from "./anchors"
import type { CommentView } from "./comments"
import { anchorExists } from "./queries.server"

export interface CommentAuthor {
  /** The Keycloak subject, when the writer was signed in. */
  sub: string | null
  name: string
}

/** Everything said about one draft, oldest first — the order each place reads in. */
export async function readComments(db: Executor, draftId: string): Promise<CommentView[]> {
  const rows = await db
    .select({
      id: comment.id,
      anchor: comment.anchor,
      authorSub: comment.authorSub,
      authorName: comment.authorName,
      body: comment.body,
      resolved: comment.resolved,
      resolvedBy: adminUser.displayName,
      resolvedAt: comment.resolvedAt,
      createdAt: comment.createdAt,
    })
    .from(comment)
    .leftJoin(adminUser, eq(adminUser.keycloakSub, comment.resolvedBySub))
    .where(eq(comment.draftId, draftId))
    .orderBy(asc(comment.createdAt), asc(comment.id))

  return rows.map((row) => ({
    id: row.id,
    anchor: row.anchor,
    authorName: row.authorName,
    bySignedIn: row.authorSub !== null,
    body: row.body,
    resolved: row.resolved,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

export type PostOutcome
  = | { status: "posted", commentId: string }
    /** The draft is not there any more, or the comment is not this draft's. */
    | { status: "gone" }
    | { status: "no-such-place" }

async function write(
  db: Executor,
  input: { draftId: string, anchor: CommentAnchor, author: CommentAuthor, body: string },
): Promise<PostOutcome> {
  const [draft] = await db
    .select({ id: researchDraft.id })
    .from(researchDraft)
    .where(eq(researchDraft.id, input.draftId))
    .limit(1)
  if (draft === undefined) return { status: "gone" }

  const [row] = await db
    .insert(comment)
    .values({
      draftId: input.draftId,
      anchor: input.anchor,
      authorSub: input.author.sub,
      authorName: input.author.name,
      body: input.body.trim(),
    })
    .returning({ id: comment.id })
  return row === undefined ? { status: "gone" } : { status: "posted", commentId: row.id }
}

/**
 * A comment about a place in a draft.
 *
 * **The anchor is checked here and not in the callers**, because there are two
 * of them — the share link and the management screen — and a comment hung off a
 * place the draft does not have is one no screen will ever draw. What the two
 * disagree about is only which datasets are in range, and that is what
 * `about.datasetIds` has (`anchorExists`).
 */
export async function postComment(
  db: Executor,
  input: {
    about: { draftId: string, content: ResearchContent, datasetIds: readonly string[] }
    subject: AnchorSubject
    path: string
    author: CommentAuthor
    body: string
  },
): Promise<PostOutcome> {
  if (!(await anchorExists(db, input.about, input.subject, input.path))) {
    return { status: "no-such-place" }
  }
  return write(db, {
    draftId: input.about.draftId,
    anchor: anchorOf(input.subject, input.path),
    author: input.author,
    body: input.body,
  })
}

/**
 * A comment about the draft as a whole, or a line of the memo.
 *
 * **Nothing is checked against the content**, because neither names a place in
 * it. What is checked is that the draft is still there. Which of the two may be
 * written from a share link is the caller's to refuse (`preview.server.ts`).
 */
export async function postAboutDraft(
  db: Executor,
  input: { draftId: string, kind: "draft" | "memo", author: CommentAuthor, body: string },
): Promise<PostOutcome> {
  return write(db, {
    draftId: input.draftId,
    anchor: input.kind === "draft" ? DRAFT_ANCHOR : MEMO_ANCHOR,
    author: input.author,
    body: input.body,
  })
}

/**
 * Marking a comment dealt with, or putting it back. Reopening exists because
 * resolving is a click and a click can be a mistake; neither direction removes
 * anything, so the record of what was asked stays whole. **A line of the memo
 * is never resolved** — it is a note, not a question.
 */
export async function setCommentResolved(
  db: Executor,
  input: { draftId: string, commentId: string, resolved: boolean, actorSub: string },
): Promise<PostOutcome> {
  const [row] = await db
    .update(comment)
    .set({
      resolved: input.resolved,
      resolvedAt: input.resolved ? new Date() : null,
      resolvedBySub: input.resolved ? input.actorSub : null,
    })
    .where(and(
      eq(comment.id, input.commentId),
      eq(comment.draftId, input.draftId),
      ne(sql`${comment.anchor}->>'kind'`, "memo"),
    ))
    .returning({ id: comment.id })
  return row === undefined ? { status: "gone" } : { status: "posted", commentId: row.id }
}

/**
 * Taking a comment away. **There is no way to press it back**, and there is
 * no soft state to keep — what was asked and answered is not history, and a
 * draft's comments do not outlive the draft either.
 */
export async function deleteComment(
  db: Executor,
  input: { draftId: string, commentId: string },
): Promise<{ status: "deleted" } | { status: "gone" }> {
  const [row] = await db
    .delete(comment)
    .where(and(eq(comment.id, input.commentId), eq(comment.draftId, input.draftId)))
    .returning({ id: comment.id })
  return row === undefined ? { status: "gone" } : { status: "deleted" }
}

/**
 * One reader's presses of one indicator, as the review screen lists them: a reader
 * presses again on each round, so a row is a person rather than a press.
 */
export interface AcknowledgementView {
  kind: AcknowledgementKind
  /** The name they pressed it under most recently. */
  name: string
  bySignedIn: boolean
  /** When they last pressed it. */
  createdAt: string
  /** How many times they have pressed it. */
  count: number
}

/**
 * "I have finished commenting" or "there is nothing to fix". **Every press is
 * kept**, signed in or not — a reader presses again on each round of the
 * review, and the count is read.
 */
export async function acknowledgeDraft(
  db: Executor,
  input: { draftId: string, kind: AcknowledgementKind, actor: CommentAuthor },
): Promise<void> {
  await db
    .insert(reviewAcknowledgement)
    .values({ draftId: input.draftId, kind: input.kind, actorSub: input.actor.sub, actorName: input.actor.name })
}

/**
 * Each reader's presses of each indicator, gathered into one row, the most recently
 * pressed first.
 *
 * **Who a reader is**: a signed-in one is their account, whatever name it
 * kept at the time — the row goes by the latest; one who did not sign in is
 * the name they typed, which is all there is to know them by.
 */
export async function readAcknowledgements(
  db: Executor,
  draftId: string,
): Promise<AcknowledgementView[]> {
  const rows = await db
    .select({
      kind: reviewAcknowledgement.kind,
      actorSub: reviewAcknowledgement.actorSub,
      actorName: reviewAcknowledgement.actorName,
      createdAt: reviewAcknowledgement.createdAt,
    })
    .from(reviewAcknowledgement)
    .where(eq(reviewAcknowledgement.draftId, draftId))
    // The id breaks ties: presses in one transaction share a clock reading,
    // and the ids are drawn in the order the presses were made.
    .orderBy(asc(reviewAcknowledgement.createdAt), asc(reviewAcknowledgement.id))

  const people = new Map<string, { view: AcknowledgementView, last: number }>()
  rows.forEach((row, at) => {
    const who = row.actorSub === null ? `name:${row.actorName}` : `sub:${row.actorSub}`
    const key = `${row.kind} ${who}`
    const held = people.get(key)
    people.set(key, {
      view: {
        kind: row.kind,
        name: row.actorName,
        bySignedIn: row.actorSub !== null,
        createdAt: row.createdAt.toISOString(),
        count: (held?.view.count ?? 0) + 1,
      },
      last: at,
    })
  })
  return [...people.values()].toSorted((a, b) => b.last - a.last).map((one) => one.view)
}
