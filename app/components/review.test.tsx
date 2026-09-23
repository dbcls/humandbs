import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { ReviewPageView } from "~/review/review.server"

import { ReviewScreen } from "./review"

const RESEARCH_ID = "00000000-0000-0000-0000-000000000001"
const DRAFT_ID = "00000000-0000-0000-0000-000000000002"

function view(over: Partial<ReviewPageView> = {}): ReviewPageView {
  return {
    locale: "ja",
    researchId: RESEARCH_ID,
    draftId: DRAFT_ID,
    humLabel: "hum0001",
    signedInName: "curator",
    share: { url: "https://example.invalid/preview/tok", enabled: false, open: false, expired: false, expiresOn: null },
    comments: [],
    unresolved: 0,
    acknowledgements: [],
    updating: null,
    steps: { datasets: 0, shared: false, unresolved: 0, blocks: 0, findings: 0 },
    ...over,
  }
}

function render(page: ReviewPageView): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => <ReviewScreen view={page} /> }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/x/draft/y/review"]} />)
}

describe("the head", () => {
  it("names the screen \"レビューと共有\", the identifier beside it, and the way back to the research", () => {
    const html = render(view())
    expect(html).toContain("レビューと共有")
    expect(html).toContain("hum0001")
    expect(html).toContain(`href="/admin/research/${RESEARCH_ID}"`)
    expect(html).toContain("研究の編集へ")
    // Not to the draft — this screen's parent is the research, the same as
    // every other face of a draft (`docs/admin-ui.md` の「画面の名乗り」).
    expect(html).not.toContain(`href="/admin/research/${RESEARCH_ID}/draft/${DRAFT_ID}"`)
  })

  it("carries no strip of steps of its own", () => {
    expect(render(view())).not.toContain("aria-label=\"下書きの段\"")
  })
})
