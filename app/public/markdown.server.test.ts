import { describe, expect, it } from "vitest"

import { renderMarkdown } from "./markdown.server"

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
