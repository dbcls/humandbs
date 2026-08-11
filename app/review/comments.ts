/**
 * What a comment is on screen, and what makes one acceptable.
 *
 * Threads belong to a draft and hang off a place in it, so every screen that
 * shows them does the same two things: pick the ones about the subject it is
 * drawing, and group them by path. That is here rather than in each screen.
 *
 * A comment carries a name and nothing else about who wrote it. Signing in
 * replaces the self-declared name with the account's, and that is the whole
 * difference — an acknowledgement from a signed-in reader means a person, one
 * from an anonymous reader means whoever held the link.
 */

import type { CommentAnchor } from "~/content/types"

import { isSameSubject, subjectOf, type AnchorSubject } from "./anchors"

export const NAME_LIMIT = 80

export const BODY_LIMIT = 4000

export interface CommentView {
  id: string
  authorName: string
  /** Written while signed in with a DDBJ account. */
  bySignedIn: boolean
  body: string
  createdAt: string
}

export interface ThreadView {
  id: string
  anchor: CommentAnchor
  resolved: boolean
  /** The administrator who resolved it, when the account is still known. */
  resolvedBy: string | null
  /** When it was resolved, as an ISO instant. Null while it is open. */
  resolvedAt: string | null
  comments: CommentView[]
  createdAt: string
}

export type CommentProblem = "name-required" | "body-required" | "too-long"

/**
 * A comment nobody can be asked about is not a comment, so a name is required
 * of a reader who has not signed in. The limits are there to keep a form from
 * becoming a way to write into the database at length.
 */
export function checkComment(fields: { name: string, body: string }): CommentProblem | null {
  if (fields.name.trim() === "") return "name-required"
  if (fields.body.trim() === "") return "body-required"
  if (fields.name.length > NAME_LIMIT || fields.body.length > BODY_LIMIT) return "too-long"
  return null
}

export function threadsOfSubject(
  threads: readonly ThreadView[],
  subject: AnchorSubject,
): ThreadView[] {
  return threads.filter((thread) => isSameSubject(subjectOf(thread.anchor), subject))
}

/**
 * The threads about any of several subjects, for a screen that draws more than
 * one of them. A preview narrows to this before the threads leave the loader:
 * what the page does not draw is not sent, or the hydration payload would carry
 * the text of comments on datasets this version does not list.
 */
export function threadsOfSubjects(
  threads: readonly ThreadView[],
  subjects: readonly AnchorSubject[],
): ThreadView[] {
  return threads.filter((thread) =>
    subjects.some((subject) => isSameSubject(subjectOf(thread.anchor), subject)))
}

/** The threads of one subject, by the path each is attached to. */
export function threadsByPath(
  threads: readonly ThreadView[],
  subject: AnchorSubject,
): Record<string, ThreadView[]> {
  const held: Record<string, ThreadView[]> = {}
  for (const thread of threadsOfSubject(threads, subject)) {
    const path = thread.anchor.path
    held[path] = [...held[path] ?? [], thread]
  }
  return held
}

export function unresolvedCount(threads: readonly ThreadView[]): number {
  return threads.filter((thread) => !thread.resolved).length
}

/** Newest activity first, with anything unresolved above anything resolved. */
export function byAttention(threads: readonly ThreadView[]): ThreadView[] {
  return [...threads].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    return lastActivity(b).localeCompare(lastActivity(a))
  })
}

function lastActivity(thread: ThreadView): string {
  return thread.comments[thread.comments.length - 1]?.createdAt ?? thread.createdAt
}
