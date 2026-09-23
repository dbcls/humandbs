import { describe, expect, it } from "vitest"

import { RESEARCH } from "./anchors"
import {
  BODY_LIMIT,
  NAME_LIMIT,
  byAttention,
  checkComment,
  commentsByPath,
  commentsForPage,
  memoComments,
  unresolvedCount,
  wholeComments,
  type CommentView,
} from "./comments"

const DATASET = { kind: "dataset" as const, datasetId: "d1" }

function said(overrides: Partial<CommentView> & { id: string }): CommentView {
  return {
    anchor: { kind: "research-field", path: "title" },
    authorName: "provider",
    bySignedIn: false,
    body: "…",
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("what makes a comment acceptable", () => {
  it("insists on a name, because a comment nobody can be asked about is not one", () => {
    expect(checkComment({ name: "  ", body: "text" })).toBe("name-required")
    expect(checkComment({ name: "provider", body: "  " })).toBe("body-required")
    expect(checkComment({ name: "provider", body: "text" })).toBe(null)
  })

  it("refuses a name or a body past the limit rather than storing it", () => {
    expect(checkComment({ name: "n".repeat(NAME_LIMIT), body: "text" })).toBe(null)
    expect(checkComment({ name: "n".repeat(NAME_LIMIT + 1), body: "text" })).toBe("too-long")
    expect(checkComment({ name: "n", body: "b".repeat(BODY_LIMIT + 1) })).toBe("too-long")
  })
})

describe("the comments a screen shows", () => {
  const comments = [
    said({ id: "c1", anchor: { kind: "research-field", path: "title" } }),
    said({ id: "c2", anchor: { kind: "research-field", path: "title" } }),
    said({ id: "c3", anchor: { kind: "research-field", path: "summary.aims" } }),
    said({ id: "c4", anchor: { kind: "dataset-field", datasetId: "d1", path: "values.k1" } }),
    said({ id: "c5", anchor: { kind: "dataset-field", datasetId: "d2", path: "values.k1" } }),
    said({ id: "whole", anchor: { kind: "draft" } }),
    said({ id: "memo", anchor: { kind: "memo" } }),
  ]

  it("are the ones about the subject it is drawing, grouped by the place they hang on, in the order said", () => {
    expect(commentsByPath(comments, RESEARCH)).toEqual({
      "title": [comments[0], comments[1]],
      "summary.aims": [comments[2]],
    })
    expect(commentsByPath(comments, DATASET)).toEqual({ "values.k1": [comments[3]] })
  })

  it("keeps the whole and the memo apart from every subject, and from each other", () => {
    expect(wholeComments(comments).map((one) => one.id)).toEqual(["whole"])
    expect(memoComments(comments).map((one) => one.id)).toEqual(["memo"])
    expect(wholeComments(comments.slice(0, 5))).toEqual([])
  })

  it("hands a share link the whole and the drawn subjects, and never the memo", () => {
    expect(commentsForPage(comments, [RESEARCH, DATASET]).map((one) => one.id))
      .toEqual(["c1", "c2", "c3", "c4", "whole"])
    expect(commentsForPage(comments, [DATASET]).map((one) => one.id)).toEqual(["c4", "whole"])
  })

  it("counts as open only what nobody has closed, and never a line of the memo", () => {
    expect(unresolvedCount(comments)).toBe(6)
    expect(unresolvedCount([
      said({ id: "c6", resolved: true }),
      said({ id: "c7" }),
      said({ id: "memo", anchor: { kind: "memo" } }),
    ])).toBe(1)
  })
})

describe("the order a list across places is read in", () => {
  it("puts what is still open above what is settled, most recently said first", () => {
    const rows = [
      said({ id: "old-open", createdAt: "2026-08-01T00:00:00.000Z" }),
      said({ id: "resolved", resolved: true, createdAt: "2026-08-09T00:00:00.000Z" }),
      said({ id: "new-open", createdAt: "2026-08-05T00:00:00.000Z" }),
    ]
    expect(byAttention(rows).map((row) => row.id)).toEqual(["new-open", "old-open", "resolved"])
  })
})
