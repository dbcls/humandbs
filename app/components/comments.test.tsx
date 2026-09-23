import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { CommentAnchor } from "~/content/types"
import type { CommentView } from "~/review/comments"

import {
  actingOn,
  CommentRow,
  CommentSpot,
  CommentTimeline,
  type CommentContext,
  DraftNote,
  groupedByPlace,
  OpenComments,
  postingInFlight,
  WholeNote,
} from "./comments"

function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

const CONTEXT: CommentContext = {
  locale: "ja",
  action: "/admin/research/r1/draft/d1/comments",
  subject: { kind: "research" },
  canResolve: true,
  signedInName: "隅田川 花子",
}

const AT = "summary.aims"
const FIELD_ANCHOR: CommentAnchor = { kind: "research-field", path: AT }

function comment(anchor: CommentAnchor, resolved = false): CommentView {
  return {
    id: crypto.randomUUID(),
    anchor,
    authorName: "山田太郎",
    bySignedIn: false,
    body: "気づいたこと",
    resolved,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

/** The text only the opened panel's body carries — absent from the closed trigger. */
const PANEL_BODY_TEXT = "コメントを書く"

describe("the mark beside a field's comments", () => {
  it("names itself plainly when the caller has no field name to give", () => {
    const html = render(<CommentSpot context={CONTEXT} at={AT} comments={[]} />)
    expect(html).toContain("title=\"コメント\"")
    expect(html).not.toContain("へのコメント")
  })

  it("names the field once the caller gives one", () => {
    const html = render(<CommentSpot context={CONTEXT} at={AT} comments={[]} fieldLabel="目的" />)
    expect(html).toContain("title=\"目的 へのコメント\"")
  })

  it("shows no count while nothing has been said", () => {
    const html = render(<CommentSpot context={CONTEXT} at={AT} comments={[]} />)
    expect(html).not.toMatch(/\d+\s*件/)
  })

  it("shows the count without colour while everything about it is resolved", () => {
    const html = render(
      <CommentSpot context={CONTEXT} at={AT} comments={[comment(FIELD_ANCHOR, true)]} />,
    )
    expect(html).toContain("1 件")
    expect(html).not.toContain("text-accent")
  })

  it("colours the count once anything about it is unresolved", () => {
    const html = render(
      <CommentSpot context={CONTEXT} at={AT} comments={[comment(FIELD_ANCHOR, false)]} />,
    )
    expect(html).toContain("text-accent")
  })

  it("draws the panel's own contents only once it is opened", () => {
    const html = render(
      <CommentSpot context={CONTEXT} at={AT} comments={[comment(FIELD_ANCHOR)]} fieldLabel="目的" />,
    )
    expect(html).not.toContain(PANEL_BODY_TEXT)
  })
})

describe("the entry for the draft's memo", () => {
  it("names itself and carries no count while empty", () => {
    const html = render(<DraftNote context={CONTEXT} comments={[]} />)
    expect(html).toContain("メモ")
    expect(html).not.toMatch(/>\d+</)
  })

  it("carries a count once there is a line, never coloured — a memo answers no question", () => {
    const html = render(
      <DraftNote context={CONTEXT} comments={[comment({ kind: "memo" })]} />,
    )
    expect(html).toMatch(/>1</)
    expect(html).not.toContain("text-accent")
  })
})

describe("the entry for comments on the draft as a whole", () => {
  it("names itself and carries no count while empty", () => {
    const html = render(<WholeNote context={CONTEXT} comments={[]} />)
    expect(html).toContain("全体へのコメント")
    expect(html).not.toMatch(/>\d+</)
  })

  it("colours the count once one of them is unresolved", () => {
    const html = render(
      <WholeNote context={CONTEXT} comments={[comment({ kind: "draft" }, false)]} />,
    )
    expect(html).toMatch(/>1</)
    expect(html).toContain("text-accent")
  })

  it("does not colour the count once all of them are resolved", () => {
    const html = render(
      <WholeNote context={CONTEXT} comments={[comment({ kind: "draft" }, true)]} />,
    )
    expect(html).not.toContain("text-accent")
  })
})

/**
 * The panel's own rows are drawn only once it is open, which static markup
 * never is — so what is read here is the entry: its name and its count.
 */
describe("the entry for the open comments", () => {
  it("names itself and counts what is unresolved, coloured", () => {
    const html = render(
      <OpenComments
        context={CONTEXT}
        comments={[
          comment({ kind: "research-field", path: "title" }, false),
          comment({ kind: "dataset-field", datasetId: "d1", path: "experiments" }, false),
          comment({ kind: "draft" }, false),
        ]}
        nameOf={() => "研究題目"}
      />,
    )
    expect(html).toContain("未解決のコメント")
    expect(html).toMatch(/>3</)
    expect(html).toContain("text-accent")
  })

  it("leaves resolved questions and memo lines out of the count, and carries none while nothing is open", () => {
    const html = render(
      <OpenComments
        context={CONTEXT}
        comments={[comment({ kind: "draft" }, true), comment({ kind: "memo" })]}
        nameOf={() => "研究題目"}
      />,
    )
    expect(html).toContain("未解決のコメント")
    expect(html).not.toMatch(/>\d+</)
  })
})

describe("the open comments, gathered under their places", () => {
  const named = (anchor: CommentAnchor): string => {
    if (anchor.kind === "research-field") return `研究:${anchor.path}`
    if (anchor.kind === "dataset-field") return `データセット:${anchor.datasetId}`
    return "全体"
  }

  it("makes one group per place, and a dataset is one place however many fields", () => {
    const groups = groupedByPlace([
      comment({ kind: "dataset-field", datasetId: "d1", path: "values.k1" }, false),
      comment({ kind: "research-field", path: "title" }, false),
      comment({ kind: "dataset-field", datasetId: "d1", path: "values.k2" }, false),
    ], named)

    expect(groups.map((group) => group.name))
      .toEqual(["データセット:d1", "研究:title"])
    expect(groups[0]?.comments).toHaveLength(2)
  })

  it("keeps the order the places were first spoken about", () => {
    const groups = groupedByPlace([
      comment({ kind: "draft" }, false),
      comment({ kind: "research-field", path: "summary.aims" }, false),
      comment({ kind: "draft" }, false),
    ], named)

    expect(groups.map((group) => group.name)).toEqual(["全体", "研究:summary.aims"])
    expect(groups.map((group) => group.comments.length)).toEqual([2, 1])
  })

  it("keeps two fields of the research apart", () => {
    const groups = groupedByPlace([
      comment({ kind: "research-field", path: "title" }, false),
      comment({ kind: "research-field", path: "summary.aims" }, false),
    ], named)

    expect(groups).toHaveLength(2)
  })
})

/** A reader of the share link: signed out, and offered nothing to press on a row. */
const READER: CommentContext = { ...CONTEXT, canResolve: false, signedInName: null }

describe("one comment in the panel", () => {
  it("marks the author as a person, and a typed name as anonymous", () => {
    const html = render(<CommentRow context={CONTEXT} comment={comment(FIELD_ANCHOR)} />)
    expect(html).toContain("山田太郎")
    expect(html).toContain("(anonymous)")
  })

  it("does not call an author who signed in anonymous", () => {
    const signed = { ...comment(FIELD_ANCHOR), authorName: "隅田川 花子", bySignedIn: true }
    const html = render(<CommentRow context={CONTEXT} comment={signed} />)
    expect(html).toContain("隅田川 花子")
    expect(html).not.toContain("anonymous")
  })

  it("says an open question is open, and offers an administrator resolving and deleting", () => {
    const html = render(<CommentRow context={CONTEXT} comment={comment(FIELD_ANCHOR)} />)
    expect(html).toContain("未解決")
    expect(html).toMatch(/解決<\/button>/)
    expect(html).toMatch(/削除<\/button>/)
    expect(html).not.toContain("未解決に戻す")
  })

  it("offers to reopen what is resolved, rather than to resolve it again", () => {
    const html = render(<CommentRow context={CONTEXT} comment={comment(FIELD_ANCHOR, true)} />)
    expect(html).toContain("解決済み")
    expect(html).toContain("未解決に戻す")
  })

  it("offers a reader of the share link nothing to press", () => {
    const html = render(<CommentRow context={READER} comment={comment(FIELD_ANCHOR)} />)
    expect(html).toContain("未解決")
    expect(html).not.toContain("<button")
  })

  it("lets a line of the memo be deleted but never resolved", () => {
    const html = render(<CommentRow context={CONTEXT} comment={comment({ kind: "memo" })} />)
    expect(html).not.toContain("解決")
    expect(html).toMatch(/削除<\/button>/)
  })
})

describe("the box for the next comment", () => {
  it("names sending as a noun in the management area, and as a verb on the share link", () => {
    const admin = render(<CommentTimeline context={CONTEXT} comments={[]} at={AT} placeholder={PANEL_BODY_TEXT} />)
    expect(admin).toMatch(/投稿<\/button>/)
    expect(admin).not.toContain("投稿する")

    const reader = render(<CommentTimeline context={READER} comments={[]} at={AT} placeholder={PANEL_BODY_TEXT} />)
    expect(reader).toContain("投稿する")
  })

  it("says what goes in the box, and asks a signed-out reader for a name", () => {
    const html = render(<CommentTimeline context={READER} comments={[]} at={AT} placeholder={PANEL_BODY_TEXT} />)
    expect(html).toContain(`placeholder="${PANEL_BODY_TEXT}"`)
    expect(html).toContain("name=\"name\"")
  })

  it("draws nothing to press without an edge", () => {
    const html = render(<CommentTimeline context={CONTEXT} comments={[comment(FIELD_ANCHOR)]} at={AT} placeholder={PANEL_BODY_TEXT} />)
    expect(html).not.toContain("bg-transparent")
  })
})

describe("the mark's size", () => {
  it("is drawn at the height of a line, and widens only what a finger has to find", () => {
    const html = render(<CommentSpot context={CONTEXT} at={AT} comments={[]} />)
    expect(html).not.toContain("min-h-tap")
    expect(html).toContain("after:absolute")
  })
})

/**
 * The one fetcher a panel shares carries posting, resolving and deleting, so
 * each control has to tell its own work from the others' by what was sent.
 */
describe("what the shared fetcher is carrying", () => {
  function carrying(state: "idle" | "submitting" | "loading", fields: Record<string, string> | null) {
    const formData = fields === null ? undefined : new FormData()
    for (const [name, value] of Object.entries(fields ?? {})) formData?.set(name, value)
    return { state, formData }
  }

  it("is nothing while idle, whatever was sent last", () => {
    expect(postingInFlight(carrying("idle", { intent: "comment" }))).toBe(false)
    expect(actingOn(carrying("idle", { intent: "resolve", commentId: "c1" }), "c1")).toBe(false)
  })

  it("is a posting only while a comment is being sent, through both the request and the reload", () => {
    expect(postingInFlight(carrying("submitting", { intent: "comment", body: "x" }))).toBe(true)
    expect(postingInFlight(carrying("loading", { intent: "comment", body: "x" }))).toBe(true)
    expect(postingInFlight(carrying("submitting", { intent: "resolve", commentId: "c1" }))).toBe(false)
    expect(postingInFlight(carrying("submitting", { intent: "delete", commentId: "c1" }))).toBe(false)
    expect(postingInFlight(carrying("submitting", null))).toBe(false)
  })

  it("is a row's own work only for the comment named, and never for a posting", () => {
    expect(actingOn(carrying("submitting", { intent: "resolve", commentId: "c1" }), "c1")).toBe(true)
    expect(actingOn(carrying("loading", { intent: "reopen", commentId: "c1" }), "c1")).toBe(true)
    expect(actingOn(carrying("submitting", { intent: "delete", commentId: "c1" }), "c1")).toBe(true)
    expect(actingOn(carrying("submitting", { intent: "resolve", commentId: "c1" }), "c2")).toBe(false)
    expect(actingOn(carrying("submitting", { intent: "comment", commentId: "c1" }), "c1")).toBe(false)
    expect(actingOn(carrying("submitting", null), "c1")).toBe(false)
  })
})
