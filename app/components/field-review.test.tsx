import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { CommentView } from "~/review/comments"

import { FieldReview, type FieldReviewData } from "./field-review"

function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

const AT = "summary.aims"

const ASKED: CommentView = {
  id: "a-1",
  anchor: { kind: "research-field", path: AT },
  authorName: "隅田川 花子",
  bySignedIn: true,
  byAdmin: true,
  body: "論文の値を確かめてください。",
  resolved: false,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

function review(comments: readonly CommentView[]): FieldReviewData {
  return {
    context: {
      locale: "ja",
      action: "/admin/research/r1/draft/d1/comments",
      subject: { kind: "research" },
      canResolve: true,
      signedInName: "隅田川 花子",
    },
    comments: { [AT]: [...comments] },
    changed: [],
    previous: {},
    current: () => null,
    heading: "",
  }
}

describe("the review of a place in the page pane of an editing screen", () => {
  it("shows the request to check the place after the indicators, as the preview does", () => {
    const html = render(<FieldReview review={review([ASKED])} at={AT} />)
    expect(html).toContain("ご確認ください")
    expect(html).toContain("論文の値を確かめてください。")
    expect(html).toMatch(/<span class="[^"]*\border-last\b[^"]*\bbasis-full\b/)
  })

  it("shows no request for a resolved comment or a provider's comment", () => {
    for (const comments of [[{ ...ASKED, resolved: true }], [{ ...ASKED, byAdmin: false }]]) {
      const html = render(<FieldReview review={review(comments)} at={AT} />)
      expect(html).not.toContain("ご確認ください")
      expect(html).not.toContain("論文の値を確かめてください。")
    }
  })
})
