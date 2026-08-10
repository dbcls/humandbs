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
import type { ThreadView } from "~/review/comments"

import { CommentSpot, type CommentContext } from "./comments"
import { PreviousLines } from "./previous"

export interface FieldReviewData {
  context: CommentContext
  threads: Record<string, ThreadView[]>
  /** Paths where the draft says something other than the published version. */
  changed: string[]
  previous: Record<string, ShownLine[]>
  /** What is being compared against, as the screen words it. */
  heading: string
  termLabel?: (id: string) => string
}

export function FieldReview({ review, at }: { review: FieldReviewData, at: string }) {
  return (
    <>
      {review.changed.includes(at) && (
        <PreviousLines
          locale={review.context.locale}
          lines={review.previous[at] ?? null}
          heading={review.heading}
          termLabel={review.termLabel}
        />
      )}
      <CommentSpot context={review.context} at={at} threads={review.threads[at] ?? []} />
    </>
  )
}
