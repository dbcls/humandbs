import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { RichText } from "~/content/types"
import type { FieldView } from "~/public/view.server"

import { AnnotationLayer, HeaderBarSection, DatasetIds, Fact, Facts, IdWithIcon, KeyValue, AnnotatedCell, pageWindow, Paging, Pairs, Section, Table, Td, TermLabel, Value } from "./page"

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
      .toBe("<a href=\"/nbdc-policy\" class=\"visitable underline\">NBDC policy</a>")
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

  it("shows a settled 'no such value' rather than an empty space, as N/A with the words in full on pointing at it", () => {
    expect(render({ state: "not-applicable" })).toBe("<abbr title=\"該当なし\" class=\"font-mono text-ink-muted\">N/A</abbr>")
    expect(renderToStaticMarkup(<Value field={{ state: "not-applicable" }} locale="en" />))
      .toBe("<abbr title=\"Not applicable\" class=\"font-mono text-ink-muted\">N/A</abbr>")
  })

  it("asks for an unsettled value with a large red badge: dashed, tinted, a question glyph", () => {
    const html = render({ state: "unsettled" })
    expect(html).toContain("ご教示ください")
    expect(html).toMatch(/class="[^"]*\bborder-dashed\b[^"]*\btext-sm\b[^"]*\bborder-danger text-danger bg-danger-surface\b/)
    expect(html).toContain("<svg")
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
   * reads out are the text. Without the space they read `IlluminaMiSeq`.
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
  **The header row a table opens with is one line.** The floors below it are measured
  from the values, so a column whose name is longer than its values had nothing
  holding it open — and the name wrapped only in the language where it was
  longer, leaving one table with a header row half again as tall as the same table
  next door.
*/
describe("the header row a table opens with", () => {
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
    An indicator is 36px against a line of 22.4px, so the room a word needs would make
    the header row half as tall again. It has no word, so there is nothing to hold
    on one line — and holding one would push a fixed-width column open.
  */
  it("adds nothing to a header that is a control rather than a word", () => {
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

  it("draws an empty body where the caller passes nothing, which is most tables", () => {
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

describe("how wide a cell goes before what it holds falls to the next line", () => {
  const of = (nowrap?: boolean) => renderToStaticMarkup(
    <Table headers={["ID"]}>
      <tr><Td nowrap={nowrap}>hum0001</Td></tr>
    </Table>,
  )

  /* One long sentence would otherwise take the whole table. */
  it("holds a cell that can wrap to the ceiling", () => {
    expect(of()).toMatch(/<td[^>]*max-w-88/)
  })

  /*
    A cell that cannot wrap holds an identifier with nowhere to fall, and a table
    cell does not clip — the glyphs run past the edge and sit on the column
    beside it. Measured at 66px over, on a slug 402px wide in a cell given 336px.
  */
  it("gives a cell that cannot wrap no ceiling to overflow", () => {
    expect(of(true)).not.toMatch(/<td[^>]*max-w-88/)
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
  it("sits at the top unless the caller specifies otherwise", () => {
    expect(of()).toMatch(/<td[^>]*align-top/)
    expect(of()).not.toMatch(/<td[^>]*align-middle/)
  })

  /*
    Where no row can run to two lines the tallest thing in it is a control
    (36px against 22.4px), and top alignment lifts each cell by a different
    amount — measured on the cart at 16.4 / 17.2 / 18.0px against a middle of
    18.0. Nothing is aligned to anything, which reads as "not quite centred".
  */
  it("centres them where the caller specifies that every row is one line", () => {
    expect(of("middle")).toMatch(/<td[^>]*align-middle/)
    expect(of("middle")).not.toMatch(/<td[^>]*align-top/)
  })

  /*
    **The choice is about the cells, not the header row.** A column name does not wrap,
    so the header row is one line whatever the rows under it do — and the same
    1px the cells had was there between the words (17.0) and
    the icon that sets the row's height (18.0).
  */
  /*
    A control flush with the top of a top-set row stood 5px above the first line
    of the words beside it (measured: 12.0 against 17.2 on the import screen's
    table of applications); a middle-set row has no first line to meet.
  */
  it("lowers a control onto the first line in a row set to the top, and only there", () => {
    const control = (align?: "top" | "middle") => renderToStaticMarkup(
      <Table headers={["", ""]} align={align}>
        <tr>
          <Td>hum0001</Td>
          <Td holds="control"><button type="button">取り込み</button></Td>
        </tr>
      </Table>,
    )
    expect(control()).toMatch(/<td[^>]*pt-1\.25[^>]*><button/)
    expect(control("middle")).not.toContain("pt-1.25")
    expect(of()).not.toContain("pt-1.25")
  })

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
  it("ページ送りが要らないときも、行は同じ高さを保つ", () => {
    expect(paging(1)).toMatch(/<div class="[^"]*min-h-tap/)
    expect(paging(3)).toMatch(/<div class="[^"]*min-h-tap/)
  })
})

describe("横に流れる表で残る列", () => {
  /*
    公開の一覧はマークを先頭に 2 列残し、admin の研究一覧は名前の列を 1 つ残す。
    固定の指定が幅まで決めると、名前がマークの 60px に押し込まれる。
  */
  it("固定は幅を決めない。マークの幅はマークのセルで決まる", () => {
    const named = renderToStaticMarkup(
      <Table headers={["研究 ID"]} stuck={1}>
        <tr><Td stuck={0} nowrap>hum0001</Td></tr>
      </Table>,
    )
    expect(named).toMatch(/<td[^>]*sticky left-0/)
    expect(named).not.toMatch(/<td[^>]*w-15/)
    expect(named).not.toMatch(/<th[^>]*w-15/)
  })

  /* 2 列目の `left` はマークの幅を書き出したものなので、1 列目がマークでないと合わない。 */
  it("マークを先頭に 2 列残すときは、マークが幅を取り 2 列目がその分ずれる", () => {
    const marked = renderToStaticMarkup(
      <Table headers={["", "研究 ID"]} stuck={2}>
        <tr>
          <Td stuck={0} holds="icon">x</Td>
          <Td stuck={1} nowrap>hum0001</Td>
        </tr>
      </Table>,
    )
    expect(marked).toMatch(/<td[^>]*w-15[^>]*sticky left-0|<td[^>]*sticky left-0[^>]*w-15/)
    expect(marked).toMatch(/<td[^>]*sticky left-15/)
  })
})

describe("where a field's annotations are shown", () => {
  const annotate = (at: string, name?: string) => <i data-annotation="">{`annotation:${at}:${name ?? ""}`}</i>
  const draw = (element: React.ReactNode) => renderToStaticMarkup(<AnnotationLayer annotate={annotate}>{element}</AnnotationLayer>)

  it("a section's annotations are shown in its heading, and nothing of them under the value", () => {
    const html = draw(<Section title="研究題目" at="title"><p>値</p></Section>)
    expect(html).toMatch(/<h2[^>]*>研究題目[\s\S]*?annotation:title[\s\S]*?<\/h2>/)
    expect(html.match(/annotation:title/g)).toHaveLength(1)
  })

  it("a pair's annotations are shown with its name (dt), and the value (dd) holds only the value", () => {
    const html = draw(<dl><KeyValue title="研究代表者" at="dataProviders.p.name">松原</KeyValue></dl>)
    expect(html).toMatch(/<dt[^>]*>研究代表者[\s\S]*?annotation:dataProviders\.p\.name[\s\S]*?<\/dt>/)
    expect(html.slice(html.indexOf("<dd"))).not.toContain("annotation:")
  })

  /** A field just added has nothing written; its place is still a line to light and to press. */
  it("an empty place is still a line tall, so the caret in its box lights something", () => {
    const html = draw(<dl><KeyValue title="細胞株" at="experiments.e.values.k">{null}</KeyValue></dl>)
    expect(html).toMatch(/<div data-field-path="experiments\.e\.values\.k" class="[^"]*\bmin-h-\[1lh\]/)
  })

  it("a cell's annotations are shown at the value's right on its row, once", () => {
    const html = draw(<AnnotatedCell at="grants.g.title" name="研究課題名">課題名</AnnotatedCell>)
    expect(html.indexOf("annotation:grants.g.title")).toBeGreaterThan(html.indexOf("課題名"))
    expect(html).toContain("flex items-start")
    expect(html.match(/annotation:grants/g)).toHaveLength(1)
  })

  it("hands each annotation the name the page gives the place — the heading, the pair's name, the column's", () => {
    expect(draw(<Section title="研究題目" at="title"><p>値</p></Section>)).toContain("annotation:title:研究題目")
    expect(draw(<dl><KeyValue title="研究代表者" at="p.name">松原</KeyValue></dl>)).toContain("annotation:p.name:研究代表者")
    expect(draw(<AnnotatedCell at="grants.g.title" name="研究課題名">課題名</AnnotatedCell>)).toContain("annotation:grants.g.title:研究課題名")
  })

  it("draws none of it on a page without a layer", () => {
    const html = renderToStaticMarkup(<dl><KeyValue title="研究代表者" at="dataProviders.p.name">松原</KeyValue></dl>)
    expect(html).not.toContain("annotation:")
  })
})

describe("段組みの列に流すラベルと値", () => {
  function pair(split?: boolean): string {
    return renderToStaticMarkup(<Pairs><KeyValue title="研究方法" split={split}>長い</KeyValue></Pairs>)
  }

  it("既定では値を段組みの列の境で切らない", () => {
    expect(pair()).toContain("break-inside-avoid")
    expect(pair()).not.toContain("break-after-avoid")
  })

  it("split なら値は次の列へ続いてよいが、ラベルの直後では切らない", () => {
    const html = pair(true)
    expect(html).not.toContain("break-inside-avoid")
    expect(/<dt class="[^"]*break-after-avoid/.test(html)).toBe(true)
  })

  it("split でもラベルと値の順は変わらない", () => {
    expect(pair(true).indexOf("研究方法")).toBeLessThan(pair(true).indexOf("長い"))
  })
})

function routed(element: ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />).replaceAll(" data-discover=\"true\"", "")
}

describe("a table's column of things to press (Table actions)", () => {
  it("is named for a reader who hears the row, last, and not shown", () => {
    const html = routed(
      <Table headers={["名前"]} actions>
        <tr>
          <Td>a</Td>
          <Td>b</Td>
        </tr>
      </Table>,
    )
    const heads = [...html.matchAll(/<th [^>]*>([^]*?)<\/th>/g)].map((match) => match[1])
    expect(heads).toEqual(["名前", "<span class=\"sr-only\">操作</span>"])
  })

  it("takes a public table's own word, and draws no column when there is none", () => {
    expect(routed(<Table headers={["ID"]} actions="カートから外す">{[]}</Table>)).toContain("<span class=\"sr-only\">カートから外す</span>")
    expect(routed(<Table headers={["ID"]} actions={false}>{[]}</Table>).match(/<th /g)).toHaveLength(1)
  })

  it("spans the sentence of an empty table over every column, the column of actions too", () => {
    const html = routed(<Table headers={["名前", "日"]} actions whenEmpty="ありません。">{[]}</Table>)
    expect(html).toContain("colSpan=\"3\"")
  })
})

describe("an identifier with its indicator (IdWithIcon)", () => {
  it("chooses the indicator by what the identifier names, muted and before it", () => {
    expect(routed(<IdWithIcon kind="research" to="/research/hum0001">hum0001</IdWithIcon>)).toMatch(/^<svg[^>]*class="[^"]*mr-1 text-ink-muted[^"]*"[^]*<path[^]*<a class="visitable" href="\/research\/hum0001">hum0001<\/a>$/)
    const dataset = routed(<IdWithIcon kind="dataset">JGAD000001</IdWithIcon>)
    expect(dataset).toMatch(/JGAD000001$/)
    expect(dataset).not.toContain("<a ")
  })

  it("opens a new tab with the site's words for it when asked, keeping the pair on one line", () => {
    const html = routed(<IdWithIcon kind="dataset" to="/dataset/JGAD000001" newTab locale="ja">JGAD000001</IdWithIcon>)
    expect(html).toContain("text-nowrap")
    expect(html).toContain("target=\"_blank\"")
    expect(html).toContain("(新しいタブで開きます)")
  })
})

describe("a cell of dataset IDs (DatasetIds)", () => {
  it("truncates to three and adds another research's ID after its dataset", () => {
    const items = ["JGAD1", "JGAD2", "JGAD3", "JGAD4", "JGAD5"].map((label) => ({ label, to: null }))
    const html = routed(<DatasetIds locale="ja" items={[...items, { label: "JGAD9", to: "/d/JGAD9", research: { label: "hum0009", to: "/r/hum0009" } }]} />)
    expect(html).toContain("JGAD3")
    expect(html).not.toContain("JGAD4<")
    const cited = routed(<DatasetIds locale="ja" items={[{ label: "JGAD9", to: "/d/JGAD9", research: { label: "hum0009", to: "/r/hum0009" } }]} />)
    expect(cited).toContain("<a class=\"visitable\" href=\"/d/JGAD9\">JGAD9</a> (<a class=\"visitable\" href=\"/r/hum0009\">hum0009</a>)")
  })
})

describe("a short list of facts (Facts)", () => {
  it("is a dl of names and values, the names muted", () => {
    const html = renderToStaticMarkup(<Facts><Fact name="共有">共有中</Fact></Facts>)
    expect(html).toMatch(/^<dl[^>]*><div class="contents"><dt class="text-ink-muted">共有<\/dt><dd[^>]*>共有中<\/dd><\/div><\/dl>$/)
  })
})

describe("a box named on a header bar (HeaderBarSection)", () => {
  it("clips the header bar with the box and identifies it at the level it is given", () => {
    const html = renderToStaticMarkup(<HeaderBarSection as="li" level={2} title="v1" aside="2026-01-01">本文</HeaderBarSection>)
    expect(html).toMatch(/^<li class="overflow-hidden rounded border border-line">/)
    expect(html).toContain("<h2 class=\"flex flex-wrap items-center gap-2 font-semibold\">v1</h2>")
    expect(html).toContain("2026-01-01")
  })
})
