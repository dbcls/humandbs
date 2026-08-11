import { describe, expect, it } from "vitest"

import { renderMarkdown } from "~/public/markdown.server"

import { checkArticleBody } from "./article.server"

/**
 * The save-time check for site content.
 *
 * The pairing that matters is with the renderer: what it would silently drop is
 * what this refuses, so an author cannot publish text that vanishes.
 */
describe("本文の検査", () => {
  it("見出し・表・箇条書き・強調は通る", () => {
    const body = [
      "## 節",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "- 一つ",
      "- 二つ",
      "",
      "**強調** と `コード`",
    ].join("\n")
    expect(checkArticleBody(body)).toEqual([])
  })

  it("空の本文も通る", () => {
    expect(checkArticleBody("")).toEqual([])
  })

  it("HTML のブロックを弾く", () => {
    expect(checkArticleBody("段落\n\n<div>中身</div>")).toEqual([{ syntax: "html", line: 3 }])
  })

  it("行の中のタグも弾く", () => {
    expect(checkArticleBody("これは <u>下線</u> です")).toEqual([
      { syntax: "html", line: 1 },
      { syntax: "html", line: 1 },
    ])
  })

  it("**描画が落とすものを弾く。** ブロックは中身ごと消えるので、通してはいけない", () => {
    const body = "<div>この文は描画で丸ごと消える</div>"
    expect(renderMarkdown(body)).not.toContain("消える")
    expect(checkArticleBody(body)).not.toEqual([])
  })

  it("開けない行き先のリンクを弾く", () => {
    expect(checkArticleBody("[x](javascript:alert(1))")).toEqual([{ syntax: "link", line: 1 }])
    expect(checkArticleBody("![x](javascript:alert(1))")).toEqual([{ syntax: "link", line: 1 }])
  })

  it("参照リンクの行き先も見る", () => {
    expect(checkArticleBody("[x][a]\n\n[a]: javascript:alert(1)")).toEqual([
      { syntax: "link", line: 3 },
    ])
  })

  it("http / https / mailto とサイト内の絶対パスは通る", () => {
    const body = "[a](https://example.org) [b](/files/common/x.pdf) [c](mailto:x@example.org)"
    expect(checkArticleBody(body)).toEqual([])
  })

  it("`//host` は行き先として通らない", () => {
    // A scheme-relative URL is another host with the scheme left out.
    expect(checkArticleBody("[x](//example.org)")).toEqual([{ syntax: "link", line: 1 }])
  })

  it("**最初の 1 つで止めず**、全部を行の順に返す", () => {
    const body = "[x](javascript:1)\n\n<div>a</div>\n\n[y](javascript:2)"
    expect(checkArticleBody(body).map((problem) => problem.line)).toEqual([1, 3, 5])
  })
})
