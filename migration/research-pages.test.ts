import type { Element } from "hast"
import { describe, expect, it } from "vitest"

import { parseFragment } from "./richtext-html"
import { alike, asV1Stored, researchPages, sameWords, tableRows, type PageArticle } from "./research-pages"

const DATA_ID_TABLE = (rows: string) => `<table><thead><tr><th>データID</th><th>内容</th><th>制限</th><th>公開日</th></tr></thead><tbody>${rows}</tbody></table>`
const DATA_ID_TABLE_EN = (rows: string) => `<table><thead><tr><th>Dataset ID</th><th>Type of Data</th><th>Criteria</th><th>Release Date</th></tr></thead><tbody>${rows}</tbody></table>`
const row = (id: string, type: string) => `<tr><td>${id}</td><td>${type}</td><td>制限公開（Type I）</td><td>2020/01/01</td></tr>`
const page = (title: string, introtext: string, over: Partial<PageArticle> = {}): PageArticle => ({ title, catid: 10, state: 1, introtext, ...over })

const textOf = (cell: Element | null): string => {
  if (cell === null) return "(none)"
  const walk = (node: Element["children"][number]): string =>
    node.type === "text" ? node.value : node.type === "element" ? node.children.map(walk).join("") : ""
  return cell.children.map(walk).join("")
}

describe("sameWords", () => {
  it("drops what v1 changed about the writing: widths, spaces, quote marks, dashes and the list separator", () => {
    expect(sameWords("NGS（Exome、RNA-seq）")).toBe(sameWords("NGS (Exome, RNA-seq)"))
    expect(sameWords("腎がん（ICD10：C64）：7症例")).toBe(sameWords("腎がん (ICD10: C64) : 7症例"))
    expect(sameWords("5’ and 3’ single-cell RNA–seq")).toBe(sameWords("5' and 3' single-cell RNA-seq"))
    expect(sameWords("凍結検体\u3000腫瘍組織")).toBe(sameWords("凍結検体 腫瘍組織"))
  })

  it("leaves out the markup v1's text kept from the page", () => {
    expect(sameWords("COVID-19ワクチン接種者 (健常人) : 14名<br />&nbsp;&nbsp;ワクチン&amp;PBMC&#12354;"))
      .toBe(sameWords("COVID-19ワクチン接種者（健常人）：14名 ワクチン&PBMCあ"))
  })

  it("keeps letter case and every other character, so a reworded value is not the same words", () => {
    expect(sameWords("SMART-Seq v4")).not.toBe(sameWords("SMART-seq v4"))
    expect(sameWords("NGS（WGBS）")).not.toBe(sameWords("NGS（PBAT-seq）"))
    expect(sameWords("1,666症例")).not.toBe(sameWords("1666症例"))
  })
})

describe("asV1Stored", () => {
  it("writes a cell the way v1 stored it: half-width brackets without spaces, a spaced colon, one line", () => {
    expect(asV1Stored("NGS（Exome）")).toBe("NGS(Exome)")
    expect(asV1Stored("NGS（WGS）：Sequence raw data")).toBe("NGS(WGS): Sequence raw data")
    expect(asV1Stored("アストロサイトーマ\nNGS（Exome）")).toBe("アストロサイトーマ NGS(Exome)")
    expect(asV1Stored("HLA-DQB1*06:02")).toBe("HLA-DQB1*06: 02")
  })

  it("leaves an address as it is", () => {
    expect(asV1Stored(" https://example.org/a:b ")).toBe("https://example.org/a:b")
  })
})

describe("tableRows", () => {
  const rowsOf = (html: string) => {
    const [table] = parseFragment(html).children
    if (table?.type !== "element") throw new Error("expected a table")
    return tableRows(table).map((cells) => cells.map((cell) => textOf(cell)))
  }

  it("repeats a cell spanning rows in each row it spans", () => {
    expect(rowsOf("<table><tr><td rowspan=\"2\">JGAS000001</td><td>NGS</td></tr><tr><td>SNP-chip</td></tr></table>"))
      .toEqual([["JGAS000001", "NGS"], ["JGAS000001", "SNP-chip"]])
  })

  it("keeps the columns right when the spanning cell is not the first", () => {
    expect(rowsOf("<table><tr><td>a</td><td rowspan=\"2\">b</td><td>c</td></tr><tr><td>d</td><td>e</td></tr></table>"))
      .toEqual([["a", "b", "c"], ["d", "b", "e"]])
  })

  it("does not take the rows of a table nested in a cell", () => {
    expect(rowsOf("<table><tr><td><table><tr><td>inner</td></tr></table></td><td>x</td></tr></table>"))
      .toEqual([["inner", "x"]])
  })
})

describe("researchPages", () => {
  it("finds the type-of-data cell with the words v1 stored, on the research's page", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", DATA_ID_TABLE(row("JGAS000001", "NGS（Exome、RNA-seq）")))] }])

    expect(textOf(pages.typeOfData("hum0001", "ja", "NGS(Exome, RNA-seq)", { version: 1, site: "prod" }))).toBe("NGS（Exome、RNA-seq）")
  })

  it("finds nothing on another research's page, in the other language, or for other words", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", DATA_ID_TABLE(row("JGAS000001", "NGS（Exome）")))] }])
    const preferred = { version: 1, site: "prod" } as const

    expect(pages.typeOfData("hum0002", "ja", "NGS(Exome)", preferred)).toBeNull()
    expect(pages.typeOfData("hum0001", "en", "NGS(Exome)", preferred)).toBeNull()
    expect(pages.typeOfData("hum0001", "ja", "NGS(WGS)", preferred)).toBeNull()
  })

  it("reads the language from the category and the research version from the title, whatever the alias", () => {
    const pages = researchPages([{ site: "prod", articles: [
      page("hum0006.v1", DATA_ID_TABLE_EN(row("JGAS000004", "NGS (Exome)")), { catid: 16 }),
      page("hum0006.v1_release note", DATA_ID_TABLE_EN(row("JGAS000004", "NGS (WGS)")), { catid: 16 }),
    ] }])

    expect(textOf(pages.typeOfData("hum0006", "en", "NGS (Exome)", { version: 1, site: "prod" }))).toBe("NGS (Exome)")
    expect(pages.typeOfData("hum0006", "en", "NGS (WGS)", { version: 1, site: "prod" })).toBeNull()
  })

  it("keeps the type of data apart from the other table cells", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", [
      DATA_ID_TABLE(row("JGAS000001", "NGS（Exome）")),
      "<table><tr><th>Platform</th><td>NGS (Exome)</td></tr></table>",
    ].join(""))] }])
    const preferred = { version: 1, site: "prod" } as const

    expect(textOf(pages.typeOfData("hum0001", "ja", "NGS(Exome)", preferred))).toBe("NGS（Exome）")
    expect(textOf(pages.tableValue("hum0001", "ja", "NGS (Exome)", preferred))).toBe("NGS (Exome)")
  })

  it("finds the type-of-data column under a row header that spans the rows", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", DATA_ID_TABLE(
      "<tr><td rowspan=\"2\">JGAS000001</td><td>NGS（Exome）</td><td>制限公開（Type I）</td><td>2020/01/01</td></tr>"
      + "<tr><td>SNP-chip</td><td>制限公開（Type I）</td><td>2020/01/01</td></tr>",
    ))] }])

    expect(textOf(pages.typeOfData("hum0001", "ja", "SNP-chip", { version: 1, site: "prod" }))).toBe("SNP-chip")
  })

  it("finds a table value without the bullets typed at the start of its lines, as v1's text reads", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", "<table><tr><td><p>・ 同義変異</p><p>・ アレル頻度＜1%</p></td></tr></table>")] }])

    expect(textOf(pages.tableValue("hum0001", "ja", "同義変異 アレル頻度<1%", { version: 1, site: "prod" }))).toBe("・ 同義変異・ アレル頻度＜1%")
  })

  describe("the cell taken where several have the words", () => {
    const versions = (...pairs: [number, string][]) => researchPages([{ site: "prod", articles: pairs.map(([version, type]) =>
      page(`hum0001.v${version}`, DATA_ID_TABLE(row("JGAS000001", type)))) }])

    it("takes, on one page, the one that gives exactly what v1 stored", () => {
      const pages = researchPages([{ site: "prod", articles: [
        page("hum0001.v2", DATA_ID_TABLE(row("JGAS000001", "NGS （Exome）") + row("JGAS000002", "NGS（Exome）"))),
      ] }])

      expect(textOf(pages.typeOfData("hum0001", "ja", "NGS(Exome)", { version: 2, site: "prod" }))).toBe("NGS（Exome）")
    })

    describe("the links v1's text has", () => {
      // hum0248: the data ID table links the ID to the page's own anchor, the experiment's table to the file.
      const pages = researchPages([{ site: "prod", articles: [
        page("hum0001.v2", [
          "<table><tr><td><a href=\"#AP023461-AP024084\">AP023461-AP024084</a></td></tr></table>",
          "<table><tr><td><a href=\"files/hum0001/Accession-Numbers.txt\" download>AP023461-AP024084</a></td></tr></table>",
          "<table><tr><td>AP023461-AP024084</td></tr></table>",
        ].join("")),
        page("hum0001.v3", "<table><tr><td>AP023461-AP024084</td></tr></table>"),
      ] }])
      const hrefOf = (cell: Element | null) => cell?.children.find((one): one is Element => one.type === "element")?.properties.href ?? "(no link)"

      it("take, on one page, the cell with every one of them, whatever the root and escapes of the address", () => {
        expect(hrefOf(pages.tableValue("hum0001", "ja", "AP023461-AP024084", { version: 2, site: "prod" }, ["/files/hum0001/Accession-Numbers.txt"])))
          .toBe("files/hum0001/Accession-Numbers.txt")
        expect(hrefOf(pages.tableValue("hum0001", "ja", "AP023461-AP024084", { version: 2, site: "prod" }, ["https://humandbs.dbcls.jp/files/hum0001/Accession%2DNumbers.txt"])))
          .toBe("files/hum0001/Accession-Numbers.txt")
      })

      it("do not take a cell on a farther page over the preferred version's", () => {
        expect(hrefOf(pages.tableValue("hum0001", "ja", "AP023461-AP024084", { version: 3, site: "prod" }, ["/files/hum0001/Accession-Numbers.txt"])))
          .toBe("(no link)")
      })

      it("leave the cells ranked as before where v1's text links nothing, or where no cell has its links", () => {
        const first = hrefOf(pages.tableValue("hum0001", "ja", "AP023461-AP024084", { version: 2, site: "prod" }))
        expect(first).toBe("#AP023461-AP024084")
        expect(hrefOf(pages.tableValue("hum0001", "ja", "AP023461-AP024084", { version: 2, site: "prod" }, ["/files/hum0001/other.txt"]))).toBe(first)
      })
    })

    it("takes the preferred version's page even where another page gives exactly what v1 stored", () => {
      const pages = versions([2, "NGS （Exome）"], [3, "NGS（Exome）"])

      expect(textOf(pages.typeOfData("hum0001", "ja", "NGS(Exome)", { version: 2, site: "prod" }))).toBe("NGS （Exome）")
    })

    it("takes the preferred version's page, then the nearest, a later one before an earlier", () => {
      const pages = versions([1, "NGS （Exome）"], [2, "NGS （ Exome ）"], [4, "NGS（Exome ）"], [5, "NGS（ Exome）"])
      const at = (version: number | null) => textOf(pages.typeOfData("hum0001", "ja", "NGS(Exome)", { version, site: "prod" }))

      expect(at(2)).toBe("NGS （ Exome ）")
      expect(at(3)).toBe("NGS（Exome ）")
      expect(at(null)).toBe("NGS（ Exome）")
    })

    it("takes the preferred site's page of the same version", () => {
      const pages = researchPages([
        { site: "prod", articles: [page("hum0001.v1", DATA_ID_TABLE(row("JGAS000001", "NGS （Exome）")))] },
        { site: "staging", articles: [page("hum0001.v1", DATA_ID_TABLE(row("JGAS000001", "NGS（ Exome）")))] },
      ])

      expect(textOf(pages.typeOfData("hum0001", "ja", "NGS(Exome)", { version: 1, site: "staging" }))).toBe("NGS（ Exome）")
      expect(textOf(pages.typeOfData("hum0001", "ja", "NGS(Exome)", { version: 1, site: "prod" }))).toBe("NGS （Exome）")
    })

    it("takes a published page over one that is not, on the same site", () => {
      const pages = researchPages([{ site: "prod", articles: [
        page("hum0001.v1", DATA_ID_TABLE(row("JGAS000001", "NGS （Exome）"))),
        page("hum0001.v1", DATA_ID_TABLE(row("JGAS000001", "NGS（ Exome）")), { state: 0 }),
      ] }])

      expect(textOf(pages.typeOfData("hum0001", "ja", "NGS(Exome)", { version: 1, site: "prod" }))).toBe("NGS （Exome）")
    })
  })
})

describe("researchPages passages", () => {
  const at = { version: 1, site: "prod" } as const
  const first = (pages: ReturnType<typeof researchPages>, text: string, lang: "ja" | "en" = "ja", preferred: { version: number | null, site: "prod" | "staging" } = at) =>
    [...pages.passages("hum0001", lang, text, preferred)][0] ?? null

  it("gives the rest of a line after a field name, with the brackets the page wrote", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", "<p><strong>目的：</strong>脳腫瘍（グリオーマ）の解析</p>")] }])

    expect(first(pages, "脳腫瘍 (グリオーマ) の解析")).toEqual([[{ text: "脳腫瘍（グリオーマ）の解析" }]])
  })

  it("gives the lines the page showed where v1 made one line", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", "<p><strong>対象：</strong>A症例</p><p>B症例</p><p><strong>方法：</strong>C</p>")] }])

    expect(first(pages, "A症例 B症例")).toEqual([[{ text: "A症例" }], [{ text: "B症例" }]])
  })

  it("keeps the page's links", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", "<p>詳細は<a href=\"https://example.org/\">こちら</a>（2020）</p>")] }])

    expect(first(pages, "詳細はこちら (2020)")).toEqual([[{ text: "詳細は" }, { text: "こちら", href: "https://example.org/" }, { text: "（2020）" }]])
  })

  it("keeps the bullets typed before the lines, which v1's text leaves out", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", "<p><strong>対象：</strong>- A症例</p><p>- B症例</p>")] }])

    expect(first(pages, "A症例 B症例")).toEqual([[{ text: "- A症例" }], [{ text: "- B症例" }]])
  })

  it("finds a list v1 made one line, whose bullets after the first are inside the line", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1_release note", "<p>- RNAs are provided.</p><p>- DNAs are provided.</p>", { catid: 16 })] }])

    expect(first(pages, "RNAs are provided. - DNAs are provided.", "en")).toEqual([[{ text: "- RNAs are provided." }], [{ text: "- DNAs are provided." }]])
  })

  it("gives a stretch that is a whole line before one inside a line", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", "<p>X社の研究（A）</p><table><tr><td>研究(A)</td></tr></table>")] }])

    expect([...pages.passages("hum0001", "ja", "研究 (A)", at)]).toEqual([[[{ text: "研究(A)" }]], [[{ text: "研究（A）" }]]])
  })

  it("reads a release note page as well as the research page", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1_release note", "<h2>hum0001.v1</h2><p>RNA（fastq）を提供</p>")] }])

    expect(first(pages, "RNA (fastq) を提供")).toEqual([[{ text: "RNA（fastq）を提供" }]])
  })

  it("gives the preferred version's page first, then the nearest", () => {
    const pages = researchPages([{ site: "prod", articles: [
      page("hum0001.v1", "<p>研究（A）</p>"),
      page("hum0001.v2", "<p>研究(A)</p>"),
      page("hum0001.v4", "<p>研究 （A）</p>"),
    ] }])

    expect(first(pages, "研究 (A)", "ja", { version: 2, site: "prod" })).toEqual([[{ text: "研究(A)" }]])
    expect(first(pages, "研究 (A)", "ja", { version: 3, site: "prod" })).toEqual([[{ text: "研究 （A）" }]])
  })

  it("gives nothing for another research, the other language or other words", () => {
    const pages = researchPages([{ site: "prod", articles: [page("hum0001.v1", "<p>研究（A）</p>")] }])

    expect([...pages.passages("hum0002", "ja", "研究 (A)", at)]).toEqual([])
    expect([...pages.passages("hum0001", "en", "研究 (A)", at)]).toEqual([])
    expect([...pages.passages("hum0001", "ja", "研究 (B)", at)]).toEqual([])
    expect([...pages.passages("hum0001", "ja", "", at)]).toEqual([])
  })
})

describe("researchPages listingCell", () => {
  const listing = (rows: string, over: Partial<PageArticle> = {}) => page("利用可能な研究データ一覧", `<table><tbody>${rows}</tbody></table>`, over)
  const listed = (hum: string, cell: string) => `<tr><th><a href="#">${hum}.v1</a></th><td>題名</td><td>${cell}</td></tr>`

  it("finds the cell of the research's row with the words, commas aside", () => {
    const pages = researchPages([{ site: "prod", articles: [
      listing(listed("hum0001", "<p>NGS</p><p>（Exome）</p><p>メチル化アレイ</p>")),
      page("List of All Research Projects", `<table>${listed("hum0001", "<p>NGS</p><p>(Exome, RNA-seq)</p><p>Methylation array</p>")}</table>`, { catid: 16 }),
    ] }])

    expect(textOf(pages.listingCell("hum0001", "ja", "NGS （Exome） メチル化アレイ", "prod"))).toBe("NGS（Exome）メチル化アレイ")
    expect(textOf(pages.listingCell("hum0001", "en", "NGS (Exome, RNA-seq), Methylation array", "prod"))).toBe("NGS(Exome, RNA-seq)Methylation array")
  })

  it("finds nothing in another research's row", () => {
    const pages = researchPages([{ site: "prod", articles: [listing(listed("hum0002", "NGS"))] }])

    expect(pages.listingCell("hum0001", "ja", "NGS", "prod")).toBeNull()
  })

  it("takes the given site's listing first", () => {
    const pages = researchPages([
      { site: "prod", articles: [listing(listed("hum0001", "NGS （Exome）"))] },
      { site: "staging", articles: [listing(listed("hum0001", "NGS（Exome）"))] },
    ])

    expect(textOf(pages.listingCell("hum0001", "ja", "NGS (Exome)", "staging"))).toBe("NGS（Exome）")
    expect(textOf(pages.listingCell("hum0001", "ja", "NGS (Exome)", "prod"))).toBe("NGS （Exome）")
  })
})

describe("alike", () => {
  it("keeps the space between two letters when spaced, and drops v1's spacing around brackets and colons", () => {
    expect(alike("宇佐美 真一", "宇佐美真一", "spaced")).toBe(false)
    expect(alike("基盤研究 (B) : 12", "基盤研究(B):12", "spaced")).toBe(true)
    expect(alike("Shinichi Usami", "ShinichiUsami", "spaced")).toBe(false)
  })

  it("drops every space when bare, and commas too when commas aside", () => {
    expect(alike("宇佐美 真一", "宇佐美真一", "bare")).toBe(true)
    expect(alike("NGS (Exome), Methylation array", "NGS (Exome) Methylation array", "bare")).toBe(false)
    expect(alike("NGS (Exome), Methylation array", "NGS (Exome) Methylation array", "commas aside")).toBe(true)
  })

  it("does not count markup, superscript forms or full-width letters as writing", () => {
    expect(alike("A<br />B&nbsp;C", "A B C", "bare")).toBe(true)
    expect(alike("CD4⁺ 1.73m²", "CD4+ 1.73m2", "spaced")).toBe(true)
    expect(alike("若手研究 (Ａ)", "若手研究 (A)", "spaced")).toBe(true)
  })

  it("counts other characters", () => {
    expect(alike("fastq、bam", "fastq,bam", "bare")).toBe(false)
    expect(alike("4＋3", "4+3", "bare")).toBe(false)
  })
})
