import { describe, expect, it } from "vitest"

import { leadingText, renderMarkdown } from "./markdown.server"

describe("サイトコンテンツの markdown", () => {
  it("生 HTML のブロックは中身ごと落ちる", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe("")
    expect(renderMarkdown("<div>hi</div>")).toBe("")
    expect(renderMarkdown("<iframe src=\"https://forms.gle/x\"></iframe>")).toBe("")
  })

  it("行の中の生 HTML はタグだけ落ち、文字は残る", () => {
    expect(renderMarkdown("a <u>b</u> c")).toBe("<p>a b c</p>")
    expect(renderMarkdown("x <img src=y onerror=\"z\"> w")).toBe("<p>x  w</p>")
  })

  it("markdown が構文と読まない不等号は文字として escape される", () => {
    expect(renderMarkdown("a & b < c")).toBe("<p>a &#x26; b &#x3C; c</p>")
  })

  it("javascript: を行き先にしたリンクは href を失う", () => {
    const html = renderMarkdown("[click](javascript:alert(1))")
    expect(html).toContain("click")
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("href")
  })

  it("プロトコル相対の // で始まる行き先も href を失う", () => {
    expect(renderMarkdown("[x](//evil.example/)")).not.toContain("href")
  })

  it("画像の src も同じ検査を受ける", () => {
    expect(renderMarkdown("![x](javascript:alert(1))")).not.toContain("src")
    expect(renderMarkdown("![x](/files/common/a.png)")).toContain("src=\"/files/common/a.png\"")
  })

  it("http / https / mailto とサイト内の絶対パスはリンクになる", () => {
    expect(renderMarkdown("[a](https://example.com/)")).toContain("href=\"https://example.com/\"")
    expect(renderMarkdown("[a](mailto:x@example.com)")).toContain("href=\"mailto:x@example.com\"")
    expect(renderMarkdown("[a](/faq)")).toContain("href=\"/faq\"")
  })

  it("GFM の表が table になる", () => {
    const html = renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |")
    expect(html).toContain("<table>")
    expect(html).toContain("<th>a</th>")
    expect(html).toContain("<td>1</td>")
  })

  it("本文が h1 を持つとき、ページの h1 と衝突しないよう見出しが 1 段下がる", () => {
    const html = renderMarkdown("# top\n\n## next\n")
    expect(html).toContain("<h2>top</h2>")
    expect(html).toContain("<h3>next</h3>")
  })

  it("本文に h1 が無ければ見出しの深さは動かない", () => {
    const html = renderMarkdown("## a\n\n### b\n")
    expect(html).toContain("<h2>a</h2>")
    expect(html).toContain("<h3>b</h3>")
  })

  it("h6 は 1 段下げようとしても h6 のまま", () => {
    expect(renderMarkdown("# a\n\n###### f\n")).toContain("<h6>f</h6>")
  })

  it("空文字と空白だけの本文は空文字を返す", () => {
    expect(renderMarkdown("")).toBe("")
    expect(renderMarkdown("   \n\n  ")).toBe("")
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
