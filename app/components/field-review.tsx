/**
 * What the review layer hangs beside a field on an editing screen.
 *
 * The two indicators answer the two questions somebody editing a draft has about a
 * field they did not write: has this moved since the version that is out there,
 * and has anybody said anything about it. They are the same two indicators the
 * preview shows, drawn from the same components — what differs is that here the
 * old value is a form value and the reader may resolve.
 */

import type { ShownLine } from "~/admin/changes"
import type { AnchoredValue } from "~/public/view.server"
import type { CommentView } from "~/review/comments"

import { CommentSpot, type CommentContext } from "./comments"
import { PreviousLines, PreviousIndicator } from "./previous"

export interface FieldReviewData {
  context: CommentContext
  comments: Record<string, CommentView[]>
  /** Paths where the draft shows something other than the published version. */
  changed: string[]
  previous: Record<string, ShownLine[]>
  /** What the form holds now at a path, for the draft's side of the comparison. */
  current: (at: string) => ShownLine[] | null
  /** What is being compared against, as the screen words it. */
  heading: string
  termLabel?: (id: string) => string
}

/**
 * A place's review, beside its name (`page.tsx` の `Annotate`): the comment
 * button, and after it the indicator indicating the published version reads otherwise.
 */
export function FieldReview({ review, at, fieldLabel, drawn }: {
  review: FieldReviewData
  at: string
  /** The field's own name, for the panels' headings (`comments.tsx` の `CommentSpot`). */
  fieldLabel?: string
  /**
   * The page beside the form as it was last drawn. **A table of elements is
   * compared as the page draws it** (`previous.tsx` の `RowsCompare`) — the
   * form holds its elements as records, which say nothing a row of the table
   * does not — so where the drawing has one, its two sides are read from there.
   */
  drawn?: {
    changed: string[]
    previous: Record<string, AnchoredValue>
    current: Record<string, AnchoredValue>
  } | null
}) {
  const table = drawn?.previous[at]?.kind === "rows" ? drawn : null
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-top">
      <CommentSpot context={review.context} at={at} comments={review.comments[at] ?? []} fieldLabel={fieldLabel} />
      {table !== null && table.changed.includes(at) && (
        <PreviousIndicator
          locale={review.context.locale}
          value={table.previous[at]}
          current={table.current[at]}
          heading={review.heading}
          fieldLabel={fieldLabel}
        />
      )}
      {table === null && review.changed.includes(at) && (
        <PreviousLines
          locale={review.context.locale}
          lines={review.previous[at] ?? null}
          current={review.current(at)}
          heading={review.heading}
          fieldLabel={fieldLabel}
          termLabel={review.termLabel}
        />
      )}
    </span>
  )
}
