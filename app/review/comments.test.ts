import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { RESEARCH } from "./anchors"
import {
  BODY_LIMIT,
  NAME_LIMIT,
  checkComment,
  checkName,
  checkRequests,
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
    byAdmin: false,
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

describe("what makes a reader's name acceptable on its own", () => {
  it("insists on one, and holds it to the limit a comment's name has", () => {
    expect(checkName(" \t")).toBe("name-required")
    expect(checkName("provider")).toBe(null)
    expect(checkName("n".repeat(NAME_LIMIT))).toBe(null)
    expect(checkName("n".repeat(NAME_LIMIT + 1))).toBe("too-long")
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

  it("groups a place named like something every object inherits, and holds nothing for such a place with no comments", () => {
    const inherited = fc.constantFrom(...Object.getOwnPropertyNames(Object.prototype))
    fc.assert(fc.property(inherited, inherited, (said1, asked) => {
      const one = said({ id: "odd", anchor: { kind: "research-field", path: said1 } })
      const byPath = commentsByPath([one], RESEARCH)
      expect(byPath[said1]).toEqual([one])
      if (asked !== said1) expect(byPath[asked]).toBeUndefined()
    }))
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

describe("what the office still asks a provider to check", () => {
  it("is an administrator's open comment on a field, of the research or of a dataset, in the order written", () => {
    const comments = [
      said({ id: "provider", anchor: { kind: "research-field", path: "title" } }),
      said({ id: "research", anchor: { kind: "research-field", path: "title" }, byAdmin: true, bySignedIn: true }),
      said({ id: "resolved", byAdmin: true, bySignedIn: true, resolved: true }),
      said({ id: "whole", anchor: { kind: "draft" }, byAdmin: true, bySignedIn: true }),
      said({ id: "memo", anchor: { kind: "memo" }, byAdmin: true, bySignedIn: true }),
      said({ id: "dataset", anchor: { kind: "dataset-field", datasetId: "d1", path: "experiments.e.values.k" }, byAdmin: true, bySignedIn: true }),
    ]
    expect(checkRequests(comments).map((one) => one.id)).toStrictEqual(["research", "dataset"])
  })
})
