import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { RichText } from "~/content/types"
import type { FieldView } from "~/public/view.server"

import { pageWindow, TermLabel, Value } from "./page"

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
