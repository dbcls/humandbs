/**
 * Where a comment is attached, spelled the way every other place is spelled.
 *
 * An anchor is a subject and a path: the subject is the research content or one
 * of its datasets, and the path is the vocabulary the editing form and the
 * conflict diff already use (`app/admin/paths.ts`). One vocabulary for all three
 * is what lets a comment written on the preview appear beside the field in the
 * editor without anything having to be translated between them.
 *
 * **A posted anchor is checked against the content it claims to be about.** The
 * path has to lead somewhere in that content, so a link holder cannot leave a
 * comment on a place that does not exist, and cannot address a dataset that is
 * not the draft's.
 *
 * **Two anchors name no place** (`CommentAnchor`): the draft as a whole, which a
 * share link may write to, and the administrators' memo, which it may not.
 */

import { readAt } from "~/admin/paths"
import type { CommentAnchor } from "~/content/types"

export type AnchorSubject
  = | { kind: "research" }
    | { kind: "dataset", datasetId: string }

/** An anchor that names a place inside the content, rather than the draft. */
export type FieldAnchor = Exclude<CommentAnchor, { kind: "draft" } | { kind: "memo" }>

export const RESEARCH: AnchorSubject = { kind: "research" }

/** The draft as a whole: what is said about the research rather than about a field. */
export const DRAFT_ANCHOR: CommentAnchor = { kind: "draft" }

/**
 * The administrators' memo. **It names no place and reaches no reader**: a
 * share link neither shows it nor accepts a line of it.
 */
export const MEMO_ANCHOR: CommentAnchor = { kind: "memo" }

export function isFieldAnchor(anchor: CommentAnchor): anchor is FieldAnchor {
  return anchor.kind === "research-field" || anchor.kind === "dataset-field"
}

/** A path is names joined by dots; identities and catalog keys are names too. */
const PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/

const PATH_LIMIT = 200

export function isAnchorPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= PATH_LIMIT && PATH.test(value)
}

export function anchorOf(subject: AnchorSubject, path: string): FieldAnchor {
  return subject.kind === "research"
    ? { kind: "research-field", path }
    : { kind: "dataset-field", datasetId: subject.datasetId, path }
}

export function subjectOf(anchor: FieldAnchor): AnchorSubject {
  return anchor.kind === "research-field" ? RESEARCH : { kind: "dataset", datasetId: anchor.datasetId }
}

/** One string for one place, for grouping and for looking a place up. */
export function anchorKey(anchor: CommentAnchor): string {
  if (anchor.kind === "draft" || anchor.kind === "memo") return anchor.kind
  return anchor.kind === "research-field"
    ? `research:${anchor.path}`
    : `dataset:${anchor.datasetId}:${anchor.path}`
}

export function isSameSubject(a: AnchorSubject, b: AnchorSubject): boolean {
  if (a.kind === "research" || b.kind === "research") return a.kind === b.kind
  return a.datasetId === b.datasetId
}

/** Whether the path leads somewhere in the content the anchor is about. */
export function pathExists(content: unknown, path: string): boolean {
  return readAt(content, path.split(".")).found
}
