/**
 * What a comment is on screen, and what makes one acceptable.
 *
 * Comments belong to a draft and hang off a place in it — a field, a value
 * slot, the draft as a whole, or the administrators' memo — so every screen
 * that shows them does the same two things: pick the ones about what it is
 * drawing, and group them by place. That is here rather than in each screen.
 *
 * **There are no threads.** The comments at one place stand in the order they
 * were written, and whoever has more to say writes the next one there; each is
 * resolved on its own. A reply nested under a comment would put two
 * conversations at one place and ask which to write in, and at a place the
 * size of a field that question has no answer.
 *
 * A comment carries a name and nothing else about who wrote it. Signing in
 * replaces the self-declared name with the account's, and that is the whole
 * difference — a mark from a signed-in reader means a person, one from an
 * anonymous reader means whoever held the link.
 */

import type { CommentAnchor } from "~/content/types"

import { isFieldAnchor, isSameSubject, subjectOf, type AnchorSubject } from "./anchors"

export const NAME_LIMIT = 80

export const BODY_LIMIT = 4000

export interface CommentView {
  id: string
  anchor: CommentAnchor
  authorName: string
  /** Written while signed in with a DDBJ account. */
  bySignedIn: boolean
  body: string
  /** Dealt with, by an administrator's hand. A line of the memo never is. */
  resolved: boolean
  /** The administrator who resolved it, when the account is still known. */
  resolvedBy: string | null
  /** When it was resolved, as an ISO instant. Null while it is open. */
  resolvedAt: string | null
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

export function commentsOfSubject(
  comments: readonly CommentView[],
  subject: AnchorSubject,
): CommentView[] {
  return comments.filter(({ anchor }) =>
    isFieldAnchor(anchor) && isSameSubject(subjectOf(anchor), subject))
}

/** What was said about the draft as a whole, which a share link shows and accepts. */
export function wholeComments(comments: readonly CommentView[]): CommentView[] {
  return comments.filter((one) => one.anchor.kind === "draft")
}

/**
 * The administrators' memo.
 *
 * **It belongs to no subject and reaches no reader**, so nothing that draws a
 * research, a dataset or a preview picks it up: the one screen that wants it
 * asks for it by name.
 */
export function memoComments(comments: readonly CommentView[]): CommentView[] {
  return comments.filter((one) => one.anchor.kind === "memo")
}

/**
 * What a share link is shown: the comments on the draft as a whole, and those
 * about the subjects the page draws. A preview narrows to this before the
 * comments leave the loader — what the page does not draw is not sent, or the
 * hydration payload would carry the text of comments on datasets this version
 * does not list, and the memo with them.
 */
export function commentsForPage(
  comments: readonly CommentView[],
  subjects: readonly AnchorSubject[],
): CommentView[] {
  return comments.filter(({ anchor }) =>
    anchor.kind === "draft"
    || (isFieldAnchor(anchor) && subjects.some((subject) => isSameSubject(subjectOf(anchor), subject))))
}

/** The comments of one subject, by the path each is attached to, oldest first. */
export function commentsByPath(
  comments: readonly CommentView[],
  subject: AnchorSubject,
): Record<string, CommentView[]> {
  const held: Record<string, CommentView[]> = {}
  for (const one of commentsOfSubject(comments, subject)) {
    if (!isFieldAnchor(one.anchor)) continue
    const path = one.anchor.path
    held[path] = [...held[path] ?? [], one]
  }
  return held
}

/** How many are still waiting for an answer. The memo is not a question, so it is never counted. */
export function unresolvedCount(comments: readonly CommentView[]): number {
  return comments.filter((one) => one.anchor.kind !== "memo" && !one.resolved).length
}

/** For a list across places: anything open above anything settled, newest first. */
export function byAttention(comments: readonly CommentView[]): CommentView[] {
  return [...comments].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    return b.createdAt.localeCompare(a.createdAt)
  })
}
