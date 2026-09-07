import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type {
  FacetCategoryView,
  FacetRangeView,
  FacetValueView,
  FacetView,
} from "~/public/facets.server"

import { EDGE_SHADE } from "./base"
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
    clearHref: null,
    range: null,
    ...over,
  }
}

/** As many values as a facet has when the box that narrows them is warranted. */
function many(count: number): FacetValueView[] {
  return Array.from({ length: count }, (_, at) => value(`C${String(at).padStart(2, "0")}`, `疾患 ${String(at)}`))
}

/** A value as the panel draws one, with the address it narrows to. */
function value(code: string, label: string): FacetValueView {
  return { code, label, maker: null, count: 3, selected: false, href: "/research?q=narrowed" }
}

const DISEASES = facet({
  code: "disease",
  label: "疾患",
  kind: "disease",
  values: [value("C34", "気管支及び肺の悪性新生物＜腫瘍＞")],
})

/** The same shape over a vocabulary whose codes are this site's own slugs. */
const ASSAYS = facet({
  code: "assay",
  label: "実験方法",
  values: [value("wgs", "WGS")],
})

/** The same facet holding more values than stand in the box at once. */
const MANY_DISEASES = facet({
  code: "disease",
  label: "疾患",
  kind: "disease",
  values: many(20),
})

/** One with a condition of its own in force, which is a reason to be open. */
const NARROWED = facet({
  code: "assay",
  label: "実験方法",
  values: [value("wgs", "WGS")],
  clearHref: "/research",
})

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

  it("writes the ICD10 code beside a disease, ahead of the heading", () => {
    const html = render([{ code: "subjects", label: "対象者", facets: [DISEASES] }])

    // The code is a key the reader can carry away — it is on the dataset page
    // and in the API — and it comes first so that the codes make a column.
    expect(html).toContain("<code")
    expect(html).toContain("C34")
    expect(html.indexOf("C34")).toBeLessThan(html.indexOf("気管支及び肺の悪性新生物＜腫瘍＞"))
  })

  it("leaves the code off every other facet, whose codes are slugs of this site's own", () => {
    const html = render([{ code: "methods", label: "手法", facets: [ASSAYS] }])

    expect(html).toContain("WGS")
    expect(html).not.toContain("<code")
  })

  /*
    **A range has no button.** Both ends ask for themselves — a date the moment
    it has one, a number on the way out of the field — so all a button would add
    is a second way to do what has already happened. **The cost is that a range
    needs script**, which the values of a facet do not: those are all on the page
    whether anything runs or not.
  */
  it("puts no button on a range, since both ends ask for themselves", () => {
    const html = render([{ code: null, label: null, facets: [DATES] }])

    expect(html).not.toContain("<button")
    expect(html).toContain("type=\"date\"")
  })

  it("names the facet the range writes into, so the form says which one it is", () => {
    expect(render([{ code: null, label: null, facets: [DATES] }]))
      .toContain("name=\"rangeKey\" value=\"date_published\"")
  })
})

describe("the values of a facet", () => {
  /**
   * The widest facet carries 389 values. Cutting the list and offering a way to
   * the rest costs either an address that says something other than the
   * conditions in force, or a reader without script who cannot reach past the
   * cut; scrolling costs neither.
   */
  it("are all drawn, however many there are", () => {
    const html = render([{ code: null, label: null, facets: [MANY_DISEASES] }])

    expect((html.match(/<li>/g) ?? []).length).toBe(20)
    expect(html).toContain("疾患 19")
  })

  it("stand in a box with a ceiling, so a long one scrolls where it is", () => {
    expect(render([{ code: null, label: null, facets: [MANY_DISEASES] }]))
      .toContain("max-h-72")
  })

  /**
   * The box narrows what is already on the page, so it takes no name and its
   * words never reach the address — it changes what the reader is looking at,
   * not what the search returned.
   */
  it("get a box to narrow them once they no longer stand in the ceiling", () => {
    const html = render([{ code: null, label: null, facets: [MANY_DISEASES] }])

    expect(html).toContain("type=\"search\"")
    expect(html).not.toContain("name=\"find\"")
  })

  it("get no box while every one of them is in view", () => {
    expect(render([{ code: null, label: null, facets: [DISEASES] }]))
      .not.toContain("type=\"search\"")
  })

  /**
   * A scrollbar does not say the list goes on — where the reader has it set to
   * appear only while scrolling, it claims no space at all. **And the shading
   * is drawn before anything measures it**, or the one thing saying so would
   * be the thing that needs script to appear.
   */
  it("shade the far edge of a list that goes on past its box", () => {
    expect(render([{ code: null, label: null, facets: [MANY_DISEASES] }]))
      .toContain(EDGE_SHADE.bottom)
  })

  it("shade nothing while the whole list is in view", () => {
    expect(render([{ code: null, label: null, facets: [DISEASES] }]))
      .not.toContain(EDGE_SHADE.bottom)
  })
})

describe("which facets a panel opens", () => {
  /** A condition in force that cannot be seen is a listing that lies. */
  it("opens the ones holding a condition of their own", () => {
    expect(render([{ code: "methods", label: "手法", facets: [NARROWED] }]))
      .toContain("<details open")
  })

  /**
   * Opening the first group as well cost 800px of scroll before the reader
   * reached the dimension they came for, and what stood there — dates and the
   * access type — is not what a reader who has chosen nothing reaches for.
   */
  it("opens none of the rest, wherever in the panel they stand", () => {
    const html = render([
      { code: null, label: null, facets: [DISEASES] },
      { code: "methods", label: "手法", facets: [ASSAYS] },
    ])

    expect(html).not.toContain("<details open")
  })
})

describe("a facet the result carries no value for", () => {
  const empty = render([{
    code: null,
    label: null,
    facets: [facet({ code: "platform", label: "プラットフォーム" })],
  }])

  /*
    What a folded box says is that the listing can be narrowed by that
    dimension, which is true whether or not this result happens to carry any
    value for it. Dropping the boxes takes the pane apart in front of the reader
    who narrowed one step too far — and at nothing found, took the whole pane.
  */
  it("keeps its box, so the pane still says what the listing narrows by", () => {
    expect(empty).toContain("プラットフォーム")
    expect(empty).toContain("<details")
  })

  it("opens on the reason it is empty rather than on nothing", () => {
    expect(empty).toContain("絞り込める値がありません")
  })

  it("draws no list and no box to narrow one", () => {
    expect(empty).not.toContain("<ul")
    expect(empty).not.toContain("値をさがす")
  })
})
