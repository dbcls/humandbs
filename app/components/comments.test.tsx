import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { CommentAnchor } from "~/content/types"
import type { CommentView } from "~/review/comments"

import { CommentSpot, DraftNote, type CommentContext, WholeNote } from "./comments"

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
const PANEL_BODY_TEXT = "気づいたことを書いてください"

describe("the mark beside a field's comments", () => {
  it("names itself plainly when the caller has no field name to give", () => {
    const html = render(<CommentSpot context={CONTEXT} at={AT} comments={[]} />)
    expect(html).toContain("title=\"コメント\"")
    expect(html).not.toContain("のコメント")
  })

  it("names the field once the caller gives one", () => {
    const html = render(<CommentSpot context={CONTEXT} at={AT} comments={[]} fieldLabel="目的" />)
    expect(html).toContain("title=\"目的 のコメント\"")
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
