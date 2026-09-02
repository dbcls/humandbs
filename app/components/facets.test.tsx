import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { FacetCategoryView, FacetView } from "~/public/facets.server"

import { FacetPanel } from "./facets"

/** Rendered at a given address, since the links are built relative to none. */
function render(categories: FacetCategoryView[]): string {
  const element = (
    <FacetPanel
      locale="ja"
      target="research"
      query=""
      sort={null}
      panel={{ categories, target: "research" }}
    />
  )
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/research"]} />)
}

function facet(over: Partial<FacetView> & Pick<FacetView, "code" | "label">): FacetView {
  return {
    kind: "vocabulary",
    values: [],
    moreHref: null,
    expanded: false,
    closeHref: null,
    clearHref: null,
    find: "",
    range: null,
    codeEntry: null,
    ...over,
  }
}

const DATES = facet({
  code: "date_published",
  label: "公開日",
  kind: "date",
  range: { from: "2020-01-01", to: "", min: "2013-07-01", max: "2026-07-30", unit: null, clearHref: "/research" },
})

const VOLUME = facet({
  code: "total-data-volume",
  label: "総データ量",
  kind: "number",
  range: { from: "", to: "", min: "0.00000095", max: "266,240", unit: "GB", clearHref: null },
})

describe("the refinement panel", () => {
  it("draws a category with no label without a heading", () => {
    const html = render([{ code: "basic-info", label: null, facets: [DATES] }])

    expect(html).not.toContain("<h3")
    expect(html).toContain("公開日")
  })

  it("still heads a category that has a label", () => {
    const html = render([{ code: "subjects", label: "対象者", facets: [VOLUME] }])

    expect(html).toContain("<h3")
    expect(html).toContain("対象者")
  })

  it("gives a date the browser's date control and a number a decimal one", () => {
    const html = render([
      { code: null, label: null, facets: [DATES] },
      { code: "data", label: "データ", facets: [VOLUME] },
    ])

    // Both ends of each, and neither kind borrowing the other's control.
    expect(html.match(/type="date"/g)).toHaveLength(2)
    expect(html.match(/inputMode="decimal"/g)).toHaveLength(2)
    expect(html).toContain("value=\"2020-01-01\"")
  })

  it("writes the span as it was given, rather than as a program would", () => {
    // The bound is written on the server, where the unit it is held in is known
    // (`facets.server.ts` の `writtenBound`).
    expect(render([{ code: "data", label: "データ", facets: [VOLUME] }]))
      .toContain("0.00000095〜266,240")
  })

  it("names the facet the range writes into, so the form says which one it is", () => {
    expect(render([{ code: null, label: null, facets: [DATES] }]))
      .toContain("name=\"rangeKey\" value=\"date_published\"")
  })
})
