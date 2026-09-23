/**
 * What the review layer hangs beside a field on an editing screen.
 *
 * The two marks answer the two questions somebody editing a draft has about a
 * field they did not write: has this moved since the version that is out there,
 * and has anybody said anything about it. They are the same two marks the
 * preview shows, drawn from the same components — what differs is that here the
 * old value is a form value and the reader may resolve.
 */

import type { ShownLine } from "~/admin/changes"
import type { CommentView } from "~/review/comments"

import { CommentSpot, type CommentContext } from "./comments"
import type { AnnotationPart } from "./page"
import { PreviousLines } from "./previous"

export interface FieldReviewData {
  context: CommentContext
  comments: Record<string, CommentView[]>
  /** Paths where the draft says something other than the published version. */
  changed: string[]
  previous: Record<string, ShownLine[]>
  /** What is being compared against, as the screen words it. */
  heading: string
  termLabel?: (id: string) => string
}

/**
 * The two parts of a place's review, each where the page stands it
 * (`page.tsx` の `AnnotationPart`): the comment mark with the name, and the
 * published version's lines under the value.
 */
export function FieldReview({ review, at, part, fieldLabel }: {
  review: FieldReviewData
  at: string
  part: AnnotationPart
  /** The field's own name, for the comment panel's heading (`comments.tsx` の `CommentSpot`). */
  fieldLabel?: string
}) {
  if (part === "name") {
    return <CommentSpot context={review.context} at={at} comments={review.comments[at] ?? []} fieldLabel={fieldLabel} />
  }
  if (!review.changed.includes(at)) return null
  return (
    <PreviousLines
      locale={review.context.locale}
      lines={review.previous[at] ?? null}
      heading={review.heading}
      termLabel={review.termLabel}
    />
  )
}
