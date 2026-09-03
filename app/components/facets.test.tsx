import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { FacetCategoryView, FacetRangeView, FacetView } from "~/public/facets.server"

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

/** The windows a date facet offers, with one of them in force or none. */
function windows(lit: "all" | "5y" | null): FacetRangeView["presets"] {
  return [
    { label: "すべて", href: "/research", current: lit === "all" },
    { label: "1 年", href: "/research?q=one", current: false },
    { label: "5 年", href: "/research?q=five", current: lit === "5y" },
    { label: "10 年", href: "/research?q=ten", current: false },
  ]
}

/** Narrowed by hand, so the condition is nobody's window. */
const DATES = facet({
  code: "date_published",
  label: "公開日",
  kind: "date",
  range: { from: "2020-01-01", to: "", unit: null, presets: windows(null) },
})

/** The same facet narrowed by pressing one. */
const WINDOWED = facet({
  code: "date_published",
  label: "公開日",
  kind: "date",
  range: { from: "2021-09-03", to: "", unit: null, presets: windows("5y") },
})

const VOLUME = facet({
  code: "total-data-volume",
  label: "総データ量",
  kind: "number",
  range: { from: "", to: "", unit: "GB", presets: [] },
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

  it("offers a date its windows, and lights the one in force", () => {
    const html = render([{ code: null, label: null, facets: [WINDOWED] }])

    for (const label of ["すべて", "1 年", "5 年", "10 年"]) expect(html).toContain(label)
    // Exactly one, or a reader cannot tell which condition they are under.
    expect(html.match(/aria-current/g)).toHaveLength(1)
    expect(html).toContain("href=\"/research?q=five\"")
  })

  it("lights none of them when the condition is nobody's window", () => {
    expect(render([{ code: null, label: null, facets: [DATES] }])).not.toContain("aria-current")
  })

  it("offers a number no windows, having none everybody means the same by", () => {
    const html = render([{ code: "data", label: "データ", facets: [VOLUME] }])

    expect(html).not.toContain("すべて")
    expect(html).toContain("GB")
  })

  it("names each end of a date, and lets a number's dash say it instead", () => {
    // `年/月/日` and a picker do not fit beside a second copy of themselves in
    // the pane, so the dates stack and each one is named.
    const dates = render([{ code: null, label: null, facets: [DATES] }])
    expect(dates).toContain("開始日")
    expect(dates).toContain("終了日")

    const volume = render([{ code: "data", label: "データ", facets: [VOLUME] }])
    expect(volume).not.toContain("開始日")
    expect(volume).toContain("–")
  })

  it("says nothing about the span the result covers", () => {
    // A second kind of number in the pane reads as one of the value counts.
    expect(render([
      { code: null, label: null, facets: [DATES] },
      { code: "data", label: "データ", facets: [VOLUME] },
    ])).not.toContain("〜")
  })

  it("names the facet the range writes into, so the form says which one it is", () => {
    expect(render([{ code: null, label: null, facets: [DATES] }]))
      .toContain("name=\"rangeKey\" value=\"date_published\"")
  })
})
