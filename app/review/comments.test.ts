import { describe, expect, it } from "vitest"

import { RESEARCH } from "./anchors"
import {
  BODY_LIMIT,
  NAME_LIMIT,
  byAttention,
  checkComment,
  threadsByPath,
  unresolvedCount,
  type ThreadView,
} from "./comments"

const DATASET = { kind: "dataset" as const, datasetId: "d1" }

function thread(overrides: Partial<ThreadView> & { id: string }): ThreadView {
  return {
    anchor: { kind: "research-field", path: "title" },
    resolved: false,
    resolvedBy: null,
    comments: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }
}

function said(at: string): ThreadView["comments"] {
  return [{ id: `c-${at}`, authorName: "provider", bySignedIn: false, body: "…", createdAt: at }]
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

describe("the threads a screen shows", () => {
  const threads = [
    thread({ id: "t1", anchor: { kind: "research-field", path: "title" } }),
    thread({ id: "t2", anchor: { kind: "research-field", path: "title" } }),
    thread({ id: "t3", anchor: { kind: "research-field", path: "summary.aims" } }),
    thread({ id: "t4", anchor: { kind: "dataset-field", datasetId: "d1", path: "values.k1" } }),
    thread({ id: "t5", anchor: { kind: "dataset-field", datasetId: "d2", path: "values.k1" } }),
  ]

  it("are the ones about the subject it is drawing, grouped by the place they hang on", () => {
    expect(threadsByPath(threads, RESEARCH)).toEqual({
      "title": [threads[0], threads[1]],
      "summary.aims": [threads[2]],
    })
    expect(threadsByPath(threads, DATASET)).toEqual({ "values.k1": [threads[3]] })
  })

  it("counts as open only the ones nobody has closed", () => {
    expect(unresolvedCount(threads)).toBe(5)
    expect(unresolvedCount([
      thread({ id: "t6", resolved: true }),
      thread({ id: "t7" }),
    ])).toBe(1)
  })
})

describe("the order a list of threads is read in", () => {
  it("puts what is still open above what is settled, most recently spoken first", () => {
    const rows = [
      thread({ id: "old-open", comments: said("2026-08-01T00:00:00.000Z") }),
      thread({ id: "resolved", resolved: true, comments: said("2026-08-09T00:00:00.000Z") }),
      thread({ id: "new-open", comments: said("2026-08-05T00:00:00.000Z") }),
    ]
    expect(byAttention(rows).map((row) => row.id)).toEqual(["new-open", "old-open", "resolved"])
  })
})
