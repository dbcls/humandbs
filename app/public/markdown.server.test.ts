import { describe, expect, it } from "vitest"

import { leadingText, renderMarkdown } from "./markdown.server"

/**
 * 見出しは id とアンカーを持つので、深さと語だけを取り出して見る。
 * `h2:top` のような形で、書いた順に並ぶ。
 */
function headings(html: string): string[] {
  return [...html.matchAll(/<(h[1-6])[^>]*>(?:<a[^>]*>#<\/a>)?([^<]*)<\/\1>/g)]
    .map((match) => `${match[1]}:${match[2]}`)
}

describe("サイトコンテンツの markdown", () => {
  it("生 HTML のブロックは中身ごと落ちる", () => {
    expect(renderMarkdown("<script>alert(1)</script>", "ja")).toBe("")
    expect(renderMarkdown("<div>hi</div>", "ja")).toBe("")
    expect(renderMarkdown("<iframe src=\"https://forms.gle/x\"></iframe>", "ja")).toBe("")
  })

  it("行の中の生 HTML はタグだけ落ち、文字は残る", () => {
    expect(renderMarkdown("a <u>b</u> c", "ja")).toBe("<p>a b c</p>")
    expect(renderMarkdown("x <img src=y onerror=\"z\"> w", "ja")).toBe("<p>x  w</p>")
  })

  it("markdown が構文と読まない不等号は文字として escape される", () => {
    expect(renderMarkdown("a & b < c", "ja")).toBe("<p>a &#x26; b &#x3C; c</p>")
  })

  it("javascript: を行き先にしたリンクは href を失う", () => {
    const html = renderMarkdown("[click](javascript:alert(1))", "ja")
    expect(html).toContain("click")
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("href")
  })

  it("プロトコル相対の // で始まる行き先も href を失う", () => {
    expect(renderMarkdown("[x](//evil.example/)", "ja")).not.toContain("href")
  })

  it("画像の src も同じ検査を受ける", () => {
    expect(renderMarkdown("![x](javascript:alert(1))", "ja")).not.toContain("src")
    expect(renderMarkdown("![x](/files/common/a.png)", "ja")).toContain("src=\"/files/common/a.png\"")
  })

  it("http / https / mailto とサイト内の絶対パスはリンクになる", () => {
    expect(renderMarkdown("[a](https://example.com/)", "ja")).toContain("href=\"https://example.com/\"")
    expect(renderMarkdown("[a](mailto:x@example.com)", "ja")).toContain("href=\"mailto:x@example.com\"")
    expect(renderMarkdown("[a](/faq)", "ja")).toContain("href=\"/faq\"")
  })

  it("GFM の表が table になる", () => {
    const html = renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |", "ja")
    expect(html).toContain("<table>")
    expect(html).toContain("<th>a</th>")
    expect(html).toContain("<td>1</td>")
  })

  it("本文が h1 を持つとき、ページの h1 と衝突しないよう見出しが 1 段下がる", () => {
    expect(headings(renderMarkdown("# top\n\n## next\n", "ja"))).toEqual(["h2:top", "h3:next"])
  })

  it("本文に h1 が無ければ見出しの深さは動かない", () => {
    expect(headings(renderMarkdown("## a\n\n### b\n", "ja"))).toEqual(["h2:a", "h3:b"])
  })

  it("h6 は 1 段下げようとしても h6 のまま", () => {
    expect(headings(renderMarkdown("# a\n\n###### f\n", "ja"))).toEqual(["h2:a", "h6:f"])
  })

  it("見出しは語から作った id と、そこへのリンクを持つ", () => {
    const html = renderMarkdown("## はじめに\n", "ja")
    expect(html).toContain("id=\"はじめに\"")
    expect(html).toContain("href=\"#はじめに\"")
    expect(html).toContain("aria-label=\"この見出しへのリンク\"")
  })

  it("アンカーの名前は読み手の言語で付く", () => {
    expect(renderMarkdown("## Overview\n", "en")).toContain("aria-label=\"Link to this heading\"")
  })

  it("記号は id に持ち込まず、空白は繋ぐ", () => {
    expect(renderMarkdown("## ５－１．適用範囲\n", "ja")).toContain("id=\"５１適用範囲\"")
    expect(renderMarkdown("## Data Use / 利用\n", "ja")).toContain("id=\"data-use--利用\"")
  })

  it("語を持たない見出しにも id は付く", () => {
    expect(renderMarkdown("## ---\n", "ja")).toContain("id=\"section\"")
  })

  it("同じ語の見出しが 2 つあれば id は分かれる", () => {
    const html = renderMarkdown("## 概要\n\n## 概要\n", "ja")
    expect(html).toContain("id=\"概要\"")
    expect(html).toContain("id=\"概要-2\"")
  })

  it("GitHub の 5 種の alert がそれぞれの器になる", () => {
    // NOTE は印を持たない器で、残る 4 つは色と字形で種類を言う。
    expect(renderMarkdown("> [!NOTE]\n> 本文", "ja")).not.toContain("<svg")
    for (const [mark, edge] of [
      ["TIP", "border-brand"],
      ["IMPORTANT", "border-ink-muted"],
      ["WARNING", "border-warning"],
      ["CAUTION", "border-danger"],
    ]) {
      const html = renderMarkdown(`> [!${mark}]\n> 本文`, "ja")
      expect(html).toContain(edge)
      expect(html).toContain("<svg")
      expect(html).not.toContain("blockquote")
    }
  })

  it("種類の語そのものは画面に出ない", () => {
    expect(renderMarkdown("> [!WARNING]\n> 本文", "ja")).not.toContain("WARNING")
  })

  it("印が行の途中にあるものは引用のまま", () => {
    // GitHub と同じで、印は 1 行を占めていなければならない。
    expect(renderMarkdown("> [!NOTE] 本文", "ja")).toContain("<blockquote>")
    expect(renderMarkdown("> 前置き\n> [!NOTE]", "ja")).toContain("<blockquote>")
  })

  it("知らない名前は引用のまま", () => {
    expect(renderMarkdown("> [!HINT]\n> 本文", "ja")).toContain("<blockquote>")
  })

  it("印の綴りは大文字小文字を問わない", () => {
    expect(renderMarkdown("> [!note]\n> 本文", "ja")).not.toContain("blockquote")
  })

  it("印だけの引用も器になる", () => {
    const html = renderMarkdown("> [!TIP]", "ja")
    expect(html).not.toContain("blockquote")
    expect(html).toContain("<svg")
  })

  it("段落が 2 つ以上ある注記は段落を保つ", () => {
    const html = renderMarkdown("> [!TIP]\n> 一つ目\n>\n> 二つ目", "ja")
    expect(html).toContain("<p>一つ目</p>")
    expect(html).toContain("<p>二つ目</p>")
  })

  it("見出しを含む引用は引用のまま出る", () => {
    // FAQ が引く条文がこの形をしている。
    const html = renderMarkdown("> ### 個人識別符号\n> 第二条 第二項", "ja")
    expect(html).toContain("<blockquote>")
    expect(html).toContain("個人識別符号")
  })

  it("本文が自分の見出しを指すリンクは href を保つ", () => {
    // FAQ とガイドラインは自分の節を指す目次を持っている。
    expect(renderMarkdown("[目次](#faq-1)", "ja")).toContain("href=\"#faq-1\"")
  })

  it("空文字と空白だけの本文は空文字を返す", () => {
    expect(renderMarkdown("", "ja")).toBe("")
    expect(renderMarkdown("   \n\n  ", "ja")).toBe("")
  })
})

describe("一覧に出す本文の書き出し", () => {
  it("記法ではなく語だけを返す", () => {
    expect(leadingText("[研究のページ](/research/hum0001) をご覧ください"))
      .toBe("研究のページ をご覧ください")
    expect(leadingText("## 見出し\n\n**太字**と`コード`")).toBe("見出し 太字とコード")
    expect(leadingText("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("a b 1 2")
  })

  it("ブロックの境目で語を繋げない", () => {
    // 繋げると「公開しました当該データの」のような、どこにも書かれていない語ができる。
    expect(leadingText("公開しました。\n\n当該データの利用には")).toBe("公開しました。 当該データの利用には")
    expect(leadingText("- 一つ目\n- 二つ目")).toBe("一つ目 二つ目")
  })

  it("空白を 1 つに畳む", () => {
    expect(leadingText("a  \n  b\n\n\n\nc")).toBe("a b c")
  })

  it("長い本文は切って、切ったことを示す", () => {
    const long = "あ".repeat(500)
    const said = leadingText(long, 20)
    expect(said).toBe(`${"あ".repeat(20)}…`)
    // ガイドライン 1 本ぶんが一覧の payload に乗らないための上限なので、
    // 既定でも本文全体が返ることはない。
    expect(leadingText(long).length).toBeLessThanOrEqual(201)
  })

  it("上限に足りない本文には印を付けない", () => {
    expect(leadingText("短い本文")).toBe("短い本文")
    expect(leadingText("ちょうど", 4)).toBe("ちょうど")
  })

  it("本文が無ければ空文字を返す", () => {
    expect(leadingText("")).toBe("")
    expect(leadingText("   \n\n  ")).toBe("")
  })
})
