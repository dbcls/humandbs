import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { AppliedConditions, PageSizeChooser, Pagination, RefinableList, SearchForm, SortChooser } from "./search"

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

describe("the conditions in force", () => {
  it("shows nothing at all when there are none", () => {
    expect(render(<AppliedConditions conditions={[]} clearHref={null} locale="ja" />)).toBe("")
  })

  it("gives each one an address that removes it", () => {
    const html = render(
      <AppliedConditions
        conditions={[{ field: "研究題目", value: "ゲノム", code: null, href: "/research?q=%E8%A7%A3%E6%9E%90" }]}
        clearHref="/research"
        locale="ja"
      />,
    )
    expect(html).toContain("研究題目")
    expect(html).toContain("ゲノム")
    expect(html).toContain("href=\"/research?q=%E8%A7%A3%E6%9E%90\"")
  })

  it("draws the field and the value apart, so a column of them lines up", () => {
    const html = render(
      <AppliedConditions
        conditions={[{ field: "研究題目", value: "ゲノム", code: null, href: "/research" }]}
        clearHref="/research"
        locale="ja"
      />,
    )
    // The two run together in the name the remove link is read out by, which is
    // one sentence and belongs that way; what is drawn is the pair of segments.
    const drawn = html.replace(/<span class="sr-only">.*?<\/span>/g, "")
    expect(drawn).toContain("研究題目")
    expect(drawn).toContain("ゲノム")
    expect(drawn).not.toContain("研究題目: ゲノム")
  })

  it("writes the ICD10 code on a disease condition, ahead of the heading", () => {
    const html = render(
      <AppliedConditions
        conditions={[{
          field: "疾患",
          value: "気管支及び肺の悪性新生物",
          code: "C34",
          href: "/research",
        }]}
        clearHref="/research"
        locale="ja"
      />,
    )

    // The same value the panel draws, drawn the same way round: a reader
    // looking for what they chose reads down a column of codes.
    expect(html).toContain("<code")
    expect(html.indexOf("C34")).toBeLessThan(html.indexOf("気管支及び肺の悪性新生物"))
  })

  it("leaves the code off a condition whose code is a slug of this site's own", () => {
    const html = render(
      <AppliedConditions
        conditions={[{ field: "実験方法", value: "WGS", code: null, href: "/research" }]}
        clearHref="/research"
        locale="ja"
      />,
    )

    expect(html).toContain("WGS")
    expect(html).not.toContain("<code")
  })

  it("offers the way to lift all of them only when it has one", () => {
    const conditions = [{ field: null, value: "title:ゲノム OR a", code: null, href: "/research" }]
    expect(render(<AppliedConditions conditions={conditions} clearHref="/research" locale="ja" />))
      .toContain("すべて解除")
    expect(render(<AppliedConditions conditions={conditions} clearHref={null} locale="ja" />))
      .not.toContain("すべて解除")
  })
})

describe("paging", () => {
  it("draws the count but no numbers when everything fits on one page", () => {
    const html = render(
      <Pagination
        locale="ja"
        target="research"
        query=""
        sort="id"
        order={null}
        page={1}
        pageCount={1}
        rows={null}
        total={200}
        from={21}
        to={40}
      />,
    )
    // 件数はページが 1 つでも答えになる。番号は「どこへ行けるか」なので出ない。
    expect(html).toContain("21–40 / 200 件")
    expect(html).not.toContain("<nav")
  })

  it("keeps the query and the ordering on every page it links to", () => {
    const html = render(
      <Pagination
        locale="ja"
        target="research"
        query="cancer"
        sort="dateModified"
        order={null}
        page={2}
        pageCount={9}
        rows={null}
        total={200}
        from={21}
        to={40}
      />,
    )
    expect(html).toContain("q=cancer&amp;sort=dateModified&amp;page=3")
    // The first page is the bare address: one search has one address.
    expect(html).toContain("\"/research?q=cancer&amp;sort=dateModified\"")
  })

  it("always offers the first and the last page, however far apart they are", () => {
    const html = render(
      <Pagination
        locale="ja"
        target="dataset"
        query=""
        sort="id"
        order={null}
        page={20}
        pageCount={50}
        rows={null}
        total={200}
        from={21}
        to={40}
      />,
    )
    expect(html).toContain(">1</a>")
    expect(html).toContain(">50</a>")
  })
})

/*
  The ordering and the size are chosen from a control that says what is chosen
  now, rather than from a row of every alternative. What that has to hold on to
  is that the current one is readable without opening anything, and that the
  name a screen reader announces says what the value is an answer to.
*/
describe("the controls over a listing", () => {
  it("names what is chosen now, so the row can be read without opening it", () => {
    const html = render(
      <SortChooser
        locale="ja"
        target="research"
        query=""
        sort="datePublished"
        order="desc"
        rows={null}
      />,
    )
    expect(html).toContain("aria-label=\"並び替え: 公開日\"")
    // Drawn in the control itself, not only among the alternatives.
    expect(html.indexOf("公開日")).toBeLessThan(html.indexOf("<div"))
  })

  it("says what the value answers, and contains the word it draws", () => {
    const html = render(
      <PageSizeChooser locale="ja" target="research" query="" sort="id" order={null} size={50} />,
    )
    // WCAG 2.5.3: the name has to hold the visible label, so that saying what
    // is on the control is a way of operating it.
    expect(html).toContain("aria-label=\"表示件数: 50\"")
  })
})

describe("how many rows a page holds", () => {
  it("writes the size it is not, and leaves the default out of the address", () => {
    const html = render(
      <PageSizeChooser locale="ja" target="research" query="" sort="id" order={null} size={20} />,
    )
    expect(html).toContain("\"/research?sort=id&amp;size=50\"")
    expect(html).toContain("\"/research?sort=id&amp;size=100\"")
    // 20 is the default, so its address is the listing's own.
    expect(html).toContain("\"/research?sort=id\"")
    expect(html).not.toContain("size=20")
  })

  it("goes back to the first page, because the row being read moves", () => {
    const html = render(
      <PageSizeChooser locale="ja" target="research" query="cancer" sort="id" order={null} size={100} />,
    )
    expect(html).not.toContain("page=")
  })

  it("marks the size in force and leaves the others plain", () => {
    const html = render(
      <PageSizeChooser locale="ja" target="dataset" query="" sort="id" order={null} size={50} />,
    )
    expect(html).toContain("aria-current=\"true\"")
    expect(html.match(/aria-current/g)).toHaveLength(1)
  })

  /*
    The size is a condition on the listing like the query and the ordering, so
    every link that stays in the listing has to carry it. Dropping it anywhere
    is a listing that resets itself when the reader turns a page.
  */
  it("survives turning a page", () => {
    const html = render(
      <Pagination
        locale="ja"
        target="research"
        query="cancer"
        sort="id"
        order={null}
        page={2}
        pageCount={9}
        rows={100}
        total={200}
        from={21}
        to={40}
      />,
    )
    expect(html).toContain("size=100")
    expect(html).not.toContain("\"/research?q=cancer&amp;sort=id\"")
  })

  it("survives changing the ordering", () => {
    const html = render(
      <SortChooser
        locale="ja"
        target="research"
        query=""
        sort="id"
        order="asc"
        rows={50}
      />,
    )
    expect(html).toContain("sort=datePublished&amp;size=50")
    // The default ordering names itself by not being written down, which leaves
    // the link to it carrying the size and nothing else.
    expect(html).toContain("\"/research?size=50\"")
  })

  it("is carried by the box, so searching again keeps it", () => {
    const html = render(
      <SearchForm locale="ja" target="research" keyword="" query="" rows={50} />,
    )
    expect(html).toContain("name=\"size\"")
    expect(html).toContain("value=\"50\"")
  })
})

/*
  The direction is a condition on the listing exactly as the size is, so the
  same links have to carry it. What it must not do is outlive the key it
  belongs to: the box starts a new search, and a new search is read the way its
  key is read.
*/
describe("which way the ordering runs", () => {
  it("offers the other end, and writes it because it is not the key's own", () => {
    const html = render(
      <SortChooser
        locale="ja"
        target="research"
        query=""
        sort="dateModified"
        order="desc"
        rows={null}
      />,
    )
    expect(html).toContain("\"/research?order=asc\"")
    expect(html).toContain("昇順にする")
  })

  it("leaves the key's own direction out of the address, so one listing has one address", () => {
    const html = render(
      <SortChooser
        locale="ja"
        target="research"
        query=""
        sort="dateModified"
        order="asc"
        rows={null}
      />,
    )
    expect(html).toContain("降順にする")
    expect(html).not.toContain("order=desc")
  })

  /*
    Every key has two ends worth asking for, so the welded half is always there
    — the ordering that had only one (relevance) is no longer among them
    (`app/search/sort.ts`).
  */
  it("is offered for every key, and every key is offered whatever was asked", () => {
    const html = render(
      <SortChooser locale="ja" target="research" query="cancer" sort="id" order="asc" rows={null} />,
    )
    expect(html).toContain("降順にする")
    for (const name of ["更新日", "公開日", "ID"]) expect(html).toContain(name)
  })

  /*
    The same rule the size is written under: an address holds what differs from
    the default, so a reader who asked for nothing is browsing at `/research`
    and every link on the page says the ordering only when somebody chose one.
  */
  it("writes the ordering it is not, and leaves the default out of the address", () => {
    const html = render(
      <SortChooser locale="ja" target="research" query="" sort="id" order="asc" rows={null} />,
    )
    expect(html).toContain("\"/research?sort=datePublished\"")
    expect(html).not.toContain("sort=dateModified")
  })

  it("survives turning a page", () => {
    const html = render(
      <Pagination
        locale="ja"
        target="research"
        query="cancer"
        sort="dateModified"
        order="asc"
        page={2}
        pageCount={9}
        rows={null}
        total={200}
        from={21}
        to={40}
      />,
    )
    expect(html).toContain("order=asc")
  })

  it("survives changing how many rows a page holds", () => {
    const html = render(
      <PageSizeChooser
        locale="ja"
        target="research"
        query=""
        sort="dateModified"
        order="asc"
        size={20}
      />,
    )
    expect(html).toContain("order=asc&amp;size=50")
  })
})

describe("a listing waiting for the answer to replace it", () => {
  const of = (busy: boolean) => render(
    <RefinableList
      open
      busy={busy}
      heading={<h2>絞り込み</h2>}
      closed={null}
      refine={<p>条件</p>}
      refineHasMore={false}
      tools={<p>並び替え</p>}
      panel={<p>facet</p>}
    >
      <p>hum0001</p>
    </RefinableList>,
  )

  /*
    The answer on screen is still the answer to the search behind it, and a
    block that empties itself moves everything under it twice for one
    refinement. What it does instead is say that it is not the new one yet.
  */
  it("keeps what is on screen readable while the next answer is on its way", () => {
    const html = of(true)
    expect(html).toContain("hum0001")
    expect(html).toContain("facet")
  })

  it("goes pale and says so, and the pointer says which way to read it", () => {
    const html = of(true)
    expect(html).toContain("aria-busy=\"true\"")
    expect(html).toContain("opacity-60")
    expect(html).toContain("cursor-progress")
  })

  it("carries none of that while it is showing an answer", () => {
    const html = of(false)
    expect(html).toContain("aria-busy=\"false\"")
    expect(html).not.toContain("opacity-60")
    expect(html).not.toContain("cursor-progress")
  })

  /* Both states carry it, so a state that outlives the delay by 40ms fades
     rather than blinking. */
  it("fades in and out of it", () => {
    expect(of(true)).toContain("transition-opacity")
    expect(of(false)).toContain("transition-opacity")
  })
})
