import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { ConditionChips, Pagination, SearchForm } from "./search"

/** Rendered at a given address, since the links are built relative to none. */
function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/research"]} />)
}

describe("the search box", () => {
  it("is a GET form, so a search works with no JavaScript running", () => {
    const html = render(
      <SearchForm locale="ja" target="research" keyword="糖尿病" query="title:ゲノム" />,
    )
    expect(html).toContain("method=\"get\"")
    expect(html).toContain("action=\"/research\"")
    expect(html).toContain("name=\"k\"")
    expect(html).toContain("value=\"糖尿病\"")
  })

  it("carries the conditions it cannot show, so submitting does not drop them", () => {
    const html = render(
      <SearchForm locale="ja" target="research" keyword="糖尿病" query="title:ゲノム" />,
    )
    expect(html).toContain("type=\"hidden\" name=\"q\" value=\"title:ゲノム\"")
  })

  it("submits to the other language's address when that is the page being read", () => {
    const html = render(<SearchForm locale="en" target="dataset" keyword="" query="" />)
    expect(html).toContain("action=\"/en/dataset\"")
  })
})

describe("the conditions beside the box", () => {
  it("shows nothing at all when there are none", () => {
    expect(render(<ConditionChips conditions={[]} locale="ja" />)).toBe("")
  })

  it("gives each one an address that removes it", () => {
    const html = render(
      <ConditionChips
        conditions={[{ label: "研究題目: ゲノム", href: "/research?q=%E8%A7%A3%E6%9E%90" }]}
        locale="ja"
      />,
    )
    expect(html).toContain("研究題目: ゲノム")
    expect(html).toContain("href=\"/research?q=%E8%A7%A3%E6%9E%90\"")
  })
})

describe("paging", () => {
  it("is not drawn when everything fits on one page", () => {
    const html = render(
      <Pagination locale="ja" target="research" query="" sort="id" page={1} pageCount={1} />,
    )
    expect(html).toBe("")
  })

  it("keeps the query and the ordering on every page it links to", () => {
    const html = render(
      <Pagination locale="ja" target="research" query="cancer" sort="dateModified" page={2} pageCount={9} />,
    )
    expect(html).toContain("q=cancer&amp;sort=dateModified&amp;page=3")
    // The first page is the bare address: one search has one address.
    expect(html).toContain("\"/research?q=cancer&amp;sort=dateModified\"")
  })

  it("always offers the first and the last page, however far apart they are", () => {
    const html = render(
      <Pagination locale="ja" target="dataset" query="" sort="id" page={20} pageCount={50} />,
    )
    expect(html).toContain(">1</a>")
    expect(html).toContain(">50</a>")
  })
})
