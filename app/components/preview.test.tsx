import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { CommentContext } from "./comments"
import { Marks } from "./preview"

function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/preview/token"]} />)
}

const CONTEXT: CommentContext = {
  locale: "ja",
  action: "/preview/token",
  subject: { kind: "research" },
  canResolve: false,
  signedInName: null,
}

/** Nothing has changed against the published version, so `PreviousMark` stays silent. */
const VIEW = { changed: [], previous: {} }

describe("the marks a preview draws beside a value", () => {
  it("opens the same comment panel a field-review mark opens, named plainly with no field name to give", () => {
    const html = render(
      <Marks context={CONTEXT} at="summary.aims" view={VIEW} comments={[]} heading="" />,
    )
    expect(html).toContain("title=\"コメント\"")
  })

  it("names the panel after the field once the caller has one to give", () => {
    const html = render(
      <Marks
        context={CONTEXT}
        at="summary.aims"
        view={VIEW}
        comments={[]}
        heading=""
        fieldLabel="研究の目的"
      />,
    )
    expect(html).toContain("title=\"研究の目的 のコメント\"")
  })
})
