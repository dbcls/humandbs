/**
 * Reading and writing what has been said about a draft.
 *
 * Every write names the draft as well as the row it changes, so a thread of one
 * draft cannot be replied to or resolved through the address of another — the
 * share link is the only credential most of these callers have, and it is a
 * credential for one draft.
 *
 * Nothing here is versioned or checked against a revision. A comment is not
 * content: it is added, never edited, and the only thing that changes about a
 * thread is whether somebody has decided it is dealt with. **Resolving is that
 * decision and it is always a person's** — editing the value a comment is about
 * does not close it, because looking at the comment afterwards is the point.
 */

import { and, asc, eq } from "drizzle-orm"

import type { CommentAnchor, ResearchContent } from "~/content/types"
import type { Executor } from "~/db/client.server"
import { adminUser, comment, commentThread, reviewAcknowledgement } from "~/db/schema"

import { anchorOf, type AnchorSubject } from "./anchors"
import type { CommentView, ThreadView } from "./comments"
import { anchorExists } from "./queries.server"

export interface CommentAuthor {
  /** The Keycloak subject, when the writer was signed in. */
  sub: string | null
  name: string
}

export async function readThreads(db: Executor, draftId: string): Promise<ThreadView[]> {
  const [threads, comments] = await Promise.all([
    db
      .select({
        id: commentThread.id,
        anchor: commentThread.anchor,
        resolved: commentThread.resolved,
        resolvedBy: adminUser.displayName,
        resolvedAt: commentThread.resolvedAt,
        createdAt: commentThread.createdAt,
      })
      .from(commentThread)
      .leftJoin(adminUser, eq(adminUser.keycloakSub, commentThread.resolvedBySub))
      .where(eq(commentThread.draftId, draftId))
      .orderBy(asc(commentThread.createdAt)),
    db
      .select({
        id: comment.id,
        threadId: comment.threadId,
        authorSub: comment.authorSub,
        authorName: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt,
      })
      .from(comment)
      .innerJoin(commentThread, eq(commentThread.id, comment.threadId))
      .where(eq(commentThread.draftId, draftId))
      .orderBy(asc(comment.createdAt)),
  ])

  const held = new Map<string, CommentView[]>()
  for (const row of comments) {
    held.set(row.threadId, [...held.get(row.threadId) ?? [], {
      id: row.id,
      authorName: row.authorName,
      bySignedIn: row.authorSub !== null,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    }])
  }

  return threads.map((thread) => ({
    id: thread.id,
    anchor: thread.anchor,
    resolved: thread.resolved,
    resolvedBy: thread.resolvedBy,
    resolvedAt: thread.resolvedAt?.toISOString() ?? null,
    comments: held.get(thread.id) ?? [],
    createdAt: thread.createdAt.toISOString(),
  }))
}

export type ThreadOutcome
  = | { status: "posted", threadId: string }
    /** The thread is not this draft's, or is not there any more. */
    | { status: "gone" }

/** A new thread and its first comment: an empty thread is not a thing to make. */
export async function startThread(
  db: Executor,
  input: { draftId: string, anchor: CommentAnchor, author: CommentAuthor, body: string },
): Promise<ThreadOutcome> {
  const [thread] = await db
    .insert(commentThread)
    .values({ draftId: input.draftId, anchor: input.anchor })
    .returning({ id: commentThread.id })
  if (thread === undefined) return { status: "gone" }

  await db.insert(comment).values({
    threadId: thread.id,
    authorSub: input.author.sub,
    authorName: input.author.name,
    body: input.body,
  })
  return { status: "posted", threadId: thread.id }
}

export async function replyToThread(
  db: Executor,
  input: { draftId: string, threadId: string, author: CommentAuthor, body: string },
): Promise<ThreadOutcome> {
  const [thread] = await db
    .select({ id: commentThread.id })
    .from(commentThread)
    .where(and(eq(commentThread.id, input.threadId), eq(commentThread.draftId, input.draftId)))
    .limit(1)
  if (thread === undefined) return { status: "gone" }

  await db.insert(comment).values({
    threadId: thread.id,
    authorSub: input.author.sub,
    authorName: input.author.name,
    body: input.body,
  })
  return { status: "posted", threadId: thread.id }
}

export type PostOutcome = ThreadOutcome | { status: "no-such-place" }

/**
 * Starting a thread about a place in a draft.
 *
 * **The anchor is checked here and not in the callers**, because there are two
 * of them — the share link and the management screen — and a thread hung off a
 * place the draft does not have is a thread no screen will ever draw. What the
 * two disagree about is only which datasets are in range, and that is what
 * `about.datasetIds` carries (`anchorExists`).
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
  return startThread(db, {
    draftId: input.about.draftId,
    anchor: anchorOf(input.subject, input.path),
    author: input.author,
    body: input.body.trim(),
  })
}

/**
 * Marking a thread dealt with, or putting it back. Reopening exists because
 * resolving is a click and a click can be a mistake; neither direction removes
 * anything, so the record of what was asked stays whole.
 */
export async function setThreadResolved(
  db: Executor,
  input: { draftId: string, threadId: string, resolved: boolean, actorSub: string },
): Promise<ThreadOutcome> {
  const [row] = await db
    .update(commentThread)
    .set({
      resolved: input.resolved,
      resolvedAt: input.resolved ? new Date() : null,
      resolvedBySub: input.resolved ? input.actorSub : null,
    })
    .where(and(eq(commentThread.id, input.threadId), eq(commentThread.draftId, input.draftId)))
    .returning({ id: commentThread.id })
  return row === undefined ? { status: "gone" } : { status: "posted", threadId: row.id }
}

export interface AcknowledgementView {
  name: string
  bySignedIn: boolean
  createdAt: string
}

/**
 * "I have looked at this." A signed-in reader has one, kept up to date; an
 * anonymous one leaves a note each time, since there is nothing to recognise
 * them by and pretending otherwise would merge two people who share a link.
 */
export async function acknowledgeDraft(
  db: Executor,
  input: { draftId: string, actor: CommentAuthor },
): Promise<void> {
  if (input.actor.sub === null) {
    await db
      .insert(reviewAcknowledgement)
      .values({ draftId: input.draftId, actorSub: null, actorName: input.actor.name })
    return
  }

  await db
    .insert(reviewAcknowledgement)
    .values({
      draftId: input.draftId,
      actorSub: input.actor.sub,
      actorName: input.actor.name,
    })
    .onConflictDoUpdate({
      target: [reviewAcknowledgement.draftId, reviewAcknowledgement.actorSub],
      set: { actorName: input.actor.name, createdAt: new Date() },
    })
}

export async function readAcknowledgements(
  db: Executor,
  draftId: string,
): Promise<AcknowledgementView[]> {
  const rows = await db
    .select({
      actorSub: reviewAcknowledgement.actorSub,
      actorName: reviewAcknowledgement.actorName,
      createdAt: reviewAcknowledgement.createdAt,
    })
    .from(reviewAcknowledgement)
    .where(eq(reviewAcknowledgement.draftId, draftId))
    .orderBy(asc(reviewAcknowledgement.createdAt))

  return rows.map((row) => ({
    name: row.actorName,
    bySignedIn: row.actorSub !== null,
    createdAt: row.createdAt.toISOString(),
  }))
}
