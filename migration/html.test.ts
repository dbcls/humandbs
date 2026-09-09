import { describe, expect, it } from "vitest"

import { htmlToMarkdown, rewriteLinks } from "./html"

describe("v1 のサイトコンテンツの markdown 化", () => {
  it("段落と強調とリンクが markdown になる", () => {
    expect(htmlToMarkdown("<p>a <strong>b</strong> <a href=\"/faq\">c</a></p>"))
      .toBe("a **b** [c](/faq)")
  })

  it("Joomla が空けた &nbsp; だけの段落は消える", () => {
    expect(htmlToMarkdown("<p>a</p>\n<p>&nbsp;</p>\n<p>b</p>")).toBe("a\n\nb")
  })

  it("中身が画像だけの段落は残る", () => {
    expect(htmlToMarkdown("<p><img src=\"/x.png\" alt=\"\"></p>")).toContain("/x.png")
  })

  it("上付き文字は Unicode になる", () => {
    expect(htmlToMarkdown("<p>1.73m<sup>2</sup></p>")).toBe("1.73m²")
    expect(htmlToMarkdown("<p>CD4<sup>+</sup> T cells</p>")).toBe("CD4⁺ T cells")
  })

  it("Unicode に無い上付きは素の文字になる", () => {
    expect(htmlToMarkdown("<p>x<sup>#1</sup></p>")).toBe("x#1")
  })

  it("表は GFM の表になる", () => {
    const markdown = htmlToMarkdown(
      "<table><thead><tr><th>a</th><th>b</th></tr></thead>"
      + "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    )
    expect(markdown).toContain("| a")
    expect(markdown).toContain("| 1")
  })

  it("rowspan のセルは、またいでいた各行に複製される", () => {
    const markdown = htmlToMarkdown(
      "<table><tbody>"
      + "<tr><td rowspan=\"2\">A</td><td>1</td></tr>"
      + "<tr><td>2</td></tr>"
      + "</tbody></table>",
    )
    const rows = markdown.split("\n").filter((line) => line.includes("|"))
    expect(rows.filter((row) => row.includes("A"))).toHaveLength(2)
    expect(markdown).toContain("1")
    expect(markdown).toContain("2")
  })

  it("colspan のセルは、またいでいた各列に複製される", () => {
    const markdown = htmlToMarkdown(
      "<table><tbody><tr><td colspan=\"2\">A</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>",
    )
    const first = markdown.split("\n").find((line) => line.includes("A")) ?? ""
    expect(first.split("|").filter((cell) => cell.trim() === "A")).toHaveLength(2)
  })

  it("rowspan と colspan が同じセルに付いていても各行各列に届く", () => {
    const markdown = htmlToMarkdown(
      "<table><tbody>"
      + "<tr><td rowspan=\"2\" colspan=\"2\">A</td><td>x</td></tr>"
      + "<tr><td>y</td></tr>"
      + "</tbody></table>",
    )
    const rows = markdown.split("\n").filter((line) => line.includes("A"))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.split("|").filter((cell) => cell.trim() === "A")).toHaveLength(2)
    }
  })

  it("callout は名前を持つ引用 (注記) になる", () => {
    // v1 が callout と書いたものだけが注記になり、素の引用は引用のまま残る。
    expect(htmlToMarkdown(":::callout\nhello\n:::")).toBe("> [!TIP]\n> hello")
    expect(htmlToMarkdown("::: callout type=\"info\"\n\nhello\n\n:::")).toBe("> [!TIP]\n> hello")
  })

  it("callout の種類は綴りを変えて残り、名前の無いものは info になる", () => {
    const kind = (fence: string) => htmlToMarkdown(`${fence}\nx\n:::`).split("\n")[0]
    expect(kind(":::callout")).toBe("> [!TIP]")
    expect(kind("::: callout type=\"info\"")).toBe("> [!TIP]")
    expect(kind("::: callout type=\"tip\"")).toBe("> [!IMPORTANT]")
    expect(kind("::: callout type=\"warning\"")).toBe("> [!WARNING]")
    expect(kind("::: callout type=\"error\"")).toBe("> [!CAUTION]")
    expect(kind("::: callout type=\"plain\"")).toBe("> [!NOTE]")
    // v1 の getCalloutType が知らない綴りに落とす先と同じ。
    expect(kind("::: callout type=\"whatever\"")).toBe("> [!TIP]")
  })

  it("type 以外の属性を持つ callout は、黙って落とさず変換を止める", () => {
    expect(() => htmlToMarkdown("::: callout title=\"見出し\"\nx\n:::"))
      .toThrow(/unhandled callout attribute/)
  })

  it("開いた行の中に本文と閉じが並んだ callout も注記になる", () => {
    expect(htmlToMarkdown("::: callout type=\"info\" hello :::")).toBe("> [!TIP]\n> hello")
  })

  it("箇条書きの中の callout は、その項目の中の注記になる", () => {
    const markdown = htmlToMarkdown("1. item\n\n   ::: callout\n   note\n   :::\n")
    expect(markdown).toContain("1. item")
    expect(markdown).toContain("> note")
    expect(markdown.indexOf("> note")).toBeGreaterThan(markdown.indexOf("1. item"))
  })

  it("扱わない directive は黙って本文に残さず、変換を止める", () => {
    expect(() => htmlToMarkdown(":::button href=\"https://example.com\"\nx\n:::"))
      .toThrow(/unhandled markdown directive/)
  })

  it("閉じない directive は変換を止める", () => {
    expect(() => htmlToMarkdown(":::callout\nx\n")).toThrow(/unclosed markdown directive/)
  })

  it("開いていない閉じ fence は変換を止める", () => {
    expect(() => htmlToMarkdown("x\n:::\n")).toThrow(/unopened markdown directive/)
  })

  it("空の本文は空文字になる", () => {
    expect(htmlToMarkdown("")).toBe("")
    expect(htmlToMarkdown("  \n ")).toBe("")
  })
})

describe("v1 のアドレスの書き換え", () => {
  it("記事の添付は /public-files/ から /files/common/ に移る", () => {
    expect(rewriteLinks("[x](/public-files/dac/a.pdf)")).toBe("[x](/files/common/dac/a.pdf)")
  })

  it("日本語の /ja/ 接頭辞は落ちる", () => {
    expect(rewriteLinks("[x](/ja/nbdc-policy)")).toBe("[x](/nbdc-policy)")
  })

  it("英語の /en/ 接頭辞は残る", () => {
    expect(rewriteLinks("[x](/en/nbdc-policy)")).toBe("[x](/en/nbdc-policy)")
  })

  it("外部 URL の中の /ja/ は触らない", () => {
    expect(rewriteLinks("[x](https://www.nig.ac.jp/nig/ja/)"))
      .toBe("[x](https://www.nig.ac.jp/nig/ja/)")
  })
})

describe("v1 のページ内リンクの行き先", () => {
  it("見出しに付いていたアンカーは、その見出しの v2 のアドレスになる", () => {
    expect(htmlToMarkdown(
      "<p><a href=\"#faq-1\">目次</a></p><h2 id=\"faq-1\">１．目的は？</h2><p>本文</p>",
    )).toContain("[目次](#１目的は)")
  })

  it("節の途中に置かれたアンカーは、その上の見出しへ寄る", () => {
    const markdown = htmlToMarkdown(
      "<p><a href=\"#mid\">そこ</a></p><h2>はじめに</h2><p>a</p>"
      + "<h2>つぎ</h2><p>b</p><a id=\"mid\"></a><p>c</p>",
    )
    expect(markdown).toContain("[そこ](#つぎ)")
  })

  /**
   * The one document that needs this is a table of file names pointing down at
   * their own paragraphs, and it holds no heading at all.
   */
  it("上に見出しが 1 つも無いリンクは、リンクを失って文字だけ残る", () => {
    const markdown = htmlToMarkdown("<p><a href=\"#crf\">crf.tsv</a></p><p><a id=\"crf\">crf.tsv</a></p>")
    expect(markdown).toContain("crf.tsv")
    expect(markdown).not.toContain("(#crf)")
    expect(markdown).not.toContain("[crf.tsv]")
  })

  /**
   * Two headings reading the same take the same address until the second is
   * numbered, and the numbering is what tells the two links apart.
   */
  it("同じ文言の見出しが 2 つあると、2 つ目のアンカーは -2 の付いたほうへ行く", () => {
    const markdown = htmlToMarkdown(
      "<p><a href=\"#one\">前</a> <a href=\"#two\">後</a></p>"
      + "<h3 id=\"one\">通則編</h3><p>a</p><h3 id=\"two\">通則編</h3><p>b</p>",
    )
    expect(markdown).toContain("[前](#通則編)")
    expect(markdown).toContain("[後](#通則編-2)")
  })

  it("ページの外を指すリンクは触らない", () => {
    expect(htmlToMarkdown("<p><a href=\"/faq\">x</a></p>")).toBe("[x](/faq)")
  })
})

describe("行き先を持たない <a>", () => {
  /**
   * Joomla marked where a link lands with an `<a>` carrying only an id. Written
   * back as markdown it becomes `[crf.tsv]()` — an address a reader can press,
   * which reloads the page they are already on.
   */
  it("アンカーの目印は、リンクではなく文字として残る", () => {
    expect(htmlToMarkdown("<p>● 概要（<a id=\"crf_norm\">crf_normal.tsv</a>）</p>"))
      .toBe("● 概要（crf\\_normal.tsv）")
  })

  it("古い綴りの name= も同じ", () => {
    expect(htmlToMarkdown("<p><a name=\"top\">先頭</a></p>")).toBe("先頭")
  })

  it("空の href も同じ", () => {
    expect(htmlToMarkdown("<p><a href=\"\">x</a></p>")).toBe("x")
  })
})

describe("v1 の callout の種類", () => {
  it("type を書いた callout はその種類のまま", () => {
    expect(htmlToMarkdown("::: callout type=\"warning\"\n注意\n:::")).toContain("[!WARNING]")
  })

  it("type を書かない callout は v1 の既定と同じ info", () => {
    expect(htmlToMarkdown("::: callout\nお知らせ\n:::")).toContain("[!TIP]")
  })

  /**
   * The FAQ quotes the personal-information act under headings of its own and
   * the sharing guidelines carry the sample wording for a consent form the same
   * way. Neither is an aside, and a glyph saying "by the way" in front of a
   * statute names it wrongly.
   */
  it("自分の見出しを持つ callout は、印を持たない器になる", () => {
    expect(htmlToMarkdown("::: callout\n### 個人識別符号\n\n本文\n:::")).toContain("[!NOTE]")
    expect(htmlToMarkdown("::: callout\n<h3>個人識別符号</h3>\n\n本文\n:::")).toContain("[!NOTE]")
  })

  it("種類を書いてあれば、見出しを持っていてもその種類のまま", () => {
    expect(htmlToMarkdown("::: callout type=\"warning\"\n### 見出し\n\n本文\n:::"))
      .toContain("[!WARNING]")
  })

  it("見出しは、その callout の中のものだけを見る", () => {
    const markdown = htmlToMarkdown("::: callout\n短い注記\n:::\n\n### あとの見出し\n")
    expect(markdown).toContain("[!TIP]")
    expect(markdown).not.toContain("[!NOTE]")
  })
})
