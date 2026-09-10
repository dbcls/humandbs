import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { RichText } from "~/content/types"
import type { FieldView } from "~/public/view.server"

import { pageWindow, Paging, Table, Td, TermLabel, Value } from "./page"

function render(field: FieldView): string {
  return renderToStaticMarkup(<Value field={field} locale="ja" />)
}

function prose(text: RichText): string {
  return render({ state: "rich", text, untranslated: false })
}

describe("a rendered value", () => {
  it("breaks the line between lines and nowhere else", () => {
    expect(prose([[{ text: "1.73m" }, { text: "²" }], [{ text: "next" }]]))
      .toBe("1.73m²<br/>next")
  })

  it("links a span whose destination the page may follow, and underlines it", () => {
    expect(prose([[{ text: "NBDC policy", href: "/nbdc-policy" }]]))
      .toBe("<a href=\"/nbdc-policy\" class=\"underline\">NBDC policy</a>")
  })

  it("keeps the text of a span whose destination it may not, and drops the link", () => {
    expect(prose([[{ text: "click", href: "javascript:alert(1)" }]])).toBe("click")
    expect(prose([[{ text: "click", href: "//example.com/" }]])).toBe("click")
  })

  it("writes text as text, so markup in a value cannot become markup", () => {
    const html = prose([[{ text: "<script>alert(1)</script>" }]])
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("renders nothing for prose nobody has written", () => {
    expect(prose([])).toBe("")
    expect(render({ state: "plain", text: "", untranslated: false })).toBe("")
  })

  it("shows a settled 'no such value' rather than an empty space", () => {
    expect(render({ state: "not-applicable" })).toContain("該当なし")
  })
})

/**
 * The worst number of presses from one page to any other, following only the
 * links that are drawn — which is the whole point of the scale and the one
 * thing a reader feels.
 */
function pressesFrom(from: number, pageCount: number, most?: number): number {
  const presses = new Map([[from, 0]])
  const queue = [from]
  // The queue grows while it is walked, which is what makes this a search over
  // the links rather than a look at the first page's worth of them.
  for (const at of queue) {
    for (const to of pageWindow(at, pageCount, most)) {
      if (presses.has(to)) continue
      presses.set(to, (presses.get(at) ?? 0) + 1)
      queue.push(to)
    }
  }
  // A page that cannot be reached at all is the failure this is looking for.
  if (presses.size < pageCount) return Infinity
  return Math.max(...presses.values())
}

/** The same over every starting page, for a listing small enough to walk. */
function pressesAtWorst(pageCount: number, most?: number): number {
  let worst = 0
  for (let from = 1; from <= pageCount; from++) {
    worst = Math.max(worst, pressesFrom(from, pageCount, most))
  }
  return worst
}

describe("the pages a listing offers", () => {
  it("steps away from the current page by doubling", () => {
    // The sequence AtCoder draws at page 39 of 1,283, which is where the shape
    // comes from: 1, 2, 3 either side and then 7, 15, 31, 63 … to both ends.
    expect(pageWindow(39, 1283).join(" ")).toBe(
      "1 8 24 32 36 37 38 39 40 41 42 46 54 70 102 166 294 550 1062 1283",
    )
  })

  it("puts every page within a few presses of every other", () => {
    // A window of the nearest two pages needs 9 presses over the same 34 and
    // 13 over the same 50; the listing is not worth reading if reaching the
    // middle of it means pressing "next" until you arrive.
    expect(pressesAtWorst(34)).toBeLessThanOrEqual(3)
    expect(pressesAtWorst(50)).toBeLessThanOrEqual(3)
  })

  it("still does at a size this site will never reach", () => {
    // 1,283 pages, where a window of the nearest two needs 321 presses. Walking
    // from every one of them is too slow to run beside a thousand other tests,
    // so the starts are spread across the listing rather than sampled near one
    // end, which is where a scale like this would fail if it failed.
    for (let from = 1; from <= 1283; from += 61) {
      expect(pressesFrom(from, 1283)).toBeLessThanOrEqual(6)
    }
    expect(pressesFrom(1283, 1283)).toBeLessThanOrEqual(6)
  })

  it("still reaches everywhere when the room is short", () => {
    expect(pressesAtWorst(50, 9)).toBeLessThanOrEqual(4)
    expect(pageWindow(25, 50, 9).length).toBeLessThanOrEqual(9)
  })

  it("gives up the nearest pages first, and never the two ends", () => {
    const roomy = pageWindow(25, 50)
    const tight = pageWindow(25, 50, 9)
    expect(tight.length).toBeLessThan(roomy.length)
    for (const kept of [1, 25, 50]) expect(tight).toContain(kept)
    // The doubling steps survive: they are what bounds the presses.
    for (const step of [7, 15, 31]) {
      expect(tight).toContain(25 - step > 1 ? 25 - step : 1)
      expect(tight).toContain(25 + step < 50 ? 25 + step : 50)
    }
  })

  it("offers each page once, in order, and none that does not exist", () => {
    for (const pageCount of [1, 2, 3, 7, 34, 50, 999]) {
      for (const page of [1, 2, Math.ceil(pageCount / 2), pageCount]) {
        if (page > pageCount) continue
        const offered = pageWindow(page, pageCount)
        expect(offered).toStrictEqual([...new Set(offered)].sort((a, b) => a - b))
        expect(offered.every((n) => n >= 1 && n <= pageCount)).toBe(true)
        expect(offered).toContain(page)
        expect(offered).toContain(1)
        expect(offered).toContain(pageCount)
      }
    }
  })

  it("offers nothing that does not exist when asked from outside the listing", () => {
    // `?page=999` over three pages: the reader is nowhere, and the links say
    // where the listing actually is rather than repeating the number back.
    expect(pageWindow(999, 3)).toStrictEqual([1, 2, 3])
    expect(pageWindow(0, 3)).toStrictEqual([1, 2, 3])
    expect(pageWindow(2, 1)).toStrictEqual([1])
    expect(pageWindow(1, 0)).toStrictEqual([])
  })
})

function termLabel(label: string, maker: string | null): string {
  return renderToStaticMarkup(<TermLabel term={{ label, maker }} />)
}

describe("a vocabulary value naming a product", () => {
  it("sets the maker apart from the rest", () => {
    const html = termLabel("Illumina NovaSeq 6000", "Illumina")
    expect(html).toContain("text-brand")
    expect(html).toContain("Illumina")
    expect(html).toContain("NovaSeq 6000")
  })

  /**
   * The gap is drawn, but what is copied out of a cell and what a screen reader
   * says are the text. Without the space they read `IlluminaMiSeq`.
   */
  it("keeps a space between the two, not only the room for one", () => {
    expect(termLabel("Illumina MiSeq", "Illumina")).toContain("Illumina</span> MiSeq")
  })

  it("draws a value with no maker whole", () => {
    expect(termLabel("TaqMan SNP Genotyping Assays", null))
      .toBe("TaqMan SNP Genotyping Assays")
  })

  it("keeps a multi-word maker together", () => {
    const html = termLabel("10x Genomics Xenium", "10x Genomics")
    expect(html).toContain(">10x Genomics</span>")
    expect(html).toContain("Xenium")
  })
})

/*
  **The band a table opens with is one line.** The floors below it are measured
  from the values, so a column whose name is longer than its values had nothing
  holding it open — and the name wrapped only in the language where it was
  longer, leaving one table with a band half again as tall as the same table
  next door.
*/
describe("the band a table opens with", () => {
  function header(headers: ReactNode[]): string {
    const Stub = createRoutesStub([{
      path: "/*",
      Component: () => <Table headers={headers}><tr><Td>row</Td></tr></Table>,
    }])
    const html = renderToStaticMarkup(<Stub initialEntries={["/research"]} />)
    return html.slice(html.indexOf("<thead"), html.indexOf("</thead>"))
  }

  it("keeps a name on one line, so the column is at least as wide as it", () => {
    expect(header(["Date published"])).toContain("whitespace-nowrap")
  })

  /*
    A mark is 36px against a line of 22.4px, so the room a word needs would make
    the band half as tall again. It carries no word, so there is nothing to hold
    on one line — and holding one would push a fixed-width column open.
  */
  it("asks nothing for a header that is a control rather than a word", () => {
    const html = header([<span key="cart" className="sr-only">カート</span>])
    expect(html).not.toContain("whitespace-nowrap")
    expect(html).toContain("w-15")
  })

  it("holds each name of a row of them, not only the first", () => {
    const html = header(["Date published", "Date modified"])
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2)
  })
})

describe("a table with no rows", () => {
  const of = (whenEmpty?: string) => renderToStaticMarkup(
    <Table headers={["研究 ID", "研究題目"]} whenEmpty={whenEmpty}>{[]}</Table>,
  )

  /*
    Swapping the table for a box of prose loses the column names, which are what
    say what was being looked for, and moves everything below it — a reader who
    narrowed one step too far has to work out where they now are before they can
    take that step back.
  */
  it("keeps its columns and puts the line where the rows would be", () => {
    const html = of("見つかりませんでした")
    expect(html).toContain("研究 ID")
    expect(html).toContain("研究題目")
    expect(html).toContain("見つかりませんでした")
  })

  it("spans every column, so the table stops travelling sideways while empty", () => {
    expect(of("なし")).toMatch(/colspan="2"/i)
  })

  it("draws an empty body where the caller says nothing, which is most tables", () => {
    expect(of()).not.toMatch(/colspan/i)
  })

  it("leaves the rows alone when it has any", () => {
    const html = renderToStaticMarkup(
      <Table headers={["研究 ID"]} whenEmpty="なし"><tr><Td>hum0001</Td></tr></Table>,
    )
    expect(html).toContain("hum0001")
    expect(html).not.toContain("なし")
  })
})

describe("where a cell sits in a row taller than it is", () => {
  const of = (align?: "top" | "middle") => renderToStaticMarkup(
    <Table headers={["ID"]} align={align}>
      <tr><Td>hum0001</Td></tr>
    </Table>,
  )

  /*
    A listing's rows are not one line — a title runs to three and its datasets to
    four — and the reader takes a row by reading across its first line. A date
    centred against a four-line cell sits beside nothing.
  */
  it("sits at the top unless the caller says otherwise", () => {
    expect(of()).toMatch(/<td[^>]*align-top/)
    expect(of()).not.toMatch(/<td[^>]*align-middle/)
  })

  /*
    Where no row can run to two lines the tallest thing in it is a control
    (36px against 22.4px), and top alignment lifts each cell by a different
    amount — measured on the cart at 16.4 / 17.2 / 18.0px against a middle of
    18.0. Nothing is aligned to anything, which reads as "not quite centred".
  */
  it("centres them where the caller says every row is one line", () => {
    expect(of("middle")).toMatch(/<td[^>]*align-middle/)
    expect(of("middle")).not.toMatch(/<td[^>]*align-top/)
  })

  /*
    **The choice is about the cells, not the band.** A column name does not wrap
    (`docs/ui.md` の「幅」), so the header row is one line whatever the rows under
    it do — and the same 1px the cells had was there between the words (17.0) and
    the mark that sets the row's height (18.0).
  */
  it("centres the header whichever way the cells go", () => {
    expect(of()).toMatch(/<th[^>]*align-middle/)
    expect(of("middle")).toMatch(/<th[^>]*align-middle/)
  })
})

describe("どれだけ出ていて、残りへどう行くか", () => {
  function paging(pageCount: number): string {
    const Stub = createRoutesStub([{
      path: "/*",
      Component: () => (
        <Paging
          locale="ja"
          total={19}
          from={1}
          to={19}
          page={1}
          pageCount={pageCount}
          at={(to) => `?page=${to}`}
        />
      ),
    }])
    return renderToStaticMarkup(<Stub initialEntries={["/admin/research"]} />)
  }

  it("1 ページに収まる一覧にはページ送りを描かない", () => {
    expect(paging(1)).not.toContain("<nav")
    expect(paging(3)).toContain("<nav")
  })

  /*
    描かないぶん行が縮むと、絞り込んで結果が 1 ページに収まった瞬間に表とその下の
    全部が上へ動く。実測で行は 36 → 22.4px、表の頭は 204 → 199px 動いていた。
  */
  it("ページ送りが要らないときも、行は同じ高さを名乗る", () => {
    expect(paging(1)).toMatch(/<div class="[^"]*min-h-tap/)
    expect(paging(3)).toMatch(/<div class="[^"]*min-h-tap/)
  })
})

describe("横に流れる表で残る列", () => {
  /*
    公開の一覧は印を先頭に 2 列残し、admin の研究一覧は名前の列を 1 つ残す。
    固定の指定が幅まで決めると、名前が印の 60px に押し込まれる。
  */
  it("固定は幅を決めない。印の幅は印のセルが持つ", () => {
    const named = renderToStaticMarkup(
      <Table headers={["研究 ID"]} stuck={1}>
        <tr><Td stuck={0} nowrap>hum0001</Td></tr>
      </Table>,
    )
    expect(named).toMatch(/<td[^>]*sticky left-0/)
    expect(named).not.toMatch(/<td[^>]*w-15/)
    expect(named).not.toMatch(/<th[^>]*w-15/)
  })

  /* 2 列目の `left` は印の幅を書き出したものなので、1 列目が印でないと合わない。 */
  it("印を先頭に 2 列残すときは、印が幅を名乗り 2 列目がその分ずれる", () => {
    const marked = renderToStaticMarkup(
      <Table headers={["", "研究 ID"]} stuck={2}>
        <tr>
          <Td stuck={0} narrow>x</Td>
          <Td stuck={1} nowrap>hum0001</Td>
        </tr>
      </Table>,
    )
    expect(marked).toMatch(/<td[^>]*w-15[^>]*sticky left-0|<td[^>]*sticky left-0[^>]*w-15/)
    expect(marked).toMatch(/<td[^>]*sticky left-15/)
  })
})
