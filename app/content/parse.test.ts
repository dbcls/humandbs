import { describe, expect, it } from "vitest"

import { parseRichText } from "./parse.server"
import { toMarkdown } from "./richtext"

describe("parseRichText", () => {
  it("reads a single newline as a line, which is how values list things", () => {
    expect(parseRichText("JGAD000004: 375.31 GB\nJGAD000106: 885.30 GB")).toEqual([
      [{ text: "JGAD000004: 375.31 GB" }],
      [{ text: "JGAD000106: 885.30 GB" }],
    ])
  })

  it("reads a blank line as an empty line between paragraphs", () => {
    expect(parseRichText("a\n\nb")).toEqual([[{ text: "a" }], [], [{ text: "b" }]])
  })

  it("collapses several blank lines into the one line the tree can hold", () => {
    expect(parseRichText("a\n\n\n\nb")).toEqual([[{ text: "a" }], [], [{ text: "b" }]])
  })

  it("produces no lines at all for prose nobody wrote", () => {
    expect(parseRichText("")).toEqual([])
    expect(parseRichText("   \n  \n")).toEqual([])
  })

  it("drops the whitespace at either end of a line, which markdown cannot hold", () => {
    expect(parseRichText("  spaced  ")).toEqual([[{ text: "spaced" }]])
  })

  it("reads a written link as a span with a destination", () => {
    expect(parseRichText("see [NBDC policy](/nbdc-policy) first")).toEqual([[
      { text: "see " },
      { text: "NBDC policy", href: "/nbdc-policy" },
      { text: " first" },
    ]])
  })

  it("reads an angle-bracket autolink as a link", () => {
    expect(parseRichText("<https://ddbj.nig.ac.jp/>"))
      .toEqual([[{ text: "https://ddbj.nig.ac.jp/", href: "https://ddbj.nig.ac.jp/" }]])
  })

  it("leaves a bare URL as text, so that saving a field does not add a link nobody wrote", () => {
    expect(parseRichText("see https://ddbj.nig.ac.jp/ first"))
      .toEqual([[{ text: "see https://ddbj.nig.ac.jp/ first" }]])
    expect(parseRichText("mail x@y.z or www.example.com"))
      .toEqual([[{ text: "mail x@y.z or www.example.com" }]])
  })

  it("keeps a destination the page will refuse, because refusing is the renderer's job", () => {
    expect(parseRichText("[x](javascript:alert(1))"))
      .toEqual([[{ text: "x", href: "javascript:alert(1)" }]])
  })

  it("lets escaped punctuation through, which is how the editor shows a stored value", () => {
    expect(parseRichText("call rate \\< 0.95")).toEqual([[{ text: "call rate < 0.95" }]])
    expect(parseRichText("\\[not a link](x)")).toEqual([[{ text: "[not a link](x)" }]])
    expect(parseRichText("PI_HAT > 0.175")).toEqual([[{ text: "PI_HAT > 0.175" }]])
  })
})

/**
 * What prose cannot hold is not refused and not flattened into the words it
 * wraps: it stays as the characters typed, so the page beside the form shows
 * the author that the dialect did not read it.
 */
describe("parseRichText keeps what prose cannot hold as the characters typed", () => {
  it("keeps a heading, however it is written", () => {
    expect(parseRichText("# Aims")).toEqual([[{ text: "# Aims" }]])
    expect(parseRichText("Aims\n====")).toEqual([[{ text: "Aims" }], [{ text: "====" }]])
  })

  it("keeps a list, however it is written", () => {
    expect(parseRichText("- one\n- two")).toEqual([[{ text: "- one" }], [{ text: "- two" }]])
    expect(parseRichText("1. one")).toEqual([[{ text: "1. one" }]])
    expect(parseRichText("3) one")).toEqual([[{ text: "3) one" }]])
  })

  it("keeps a table as its rows", () => {
    expect(parseRichText("| a | b |\n| --- | --- |\n| 1 | 2 |")).toEqual([
      [{ text: "| a | b |" }],
      [{ text: "| --- | --- |" }],
      [{ text: "| 1 | 2 |" }],
    ])
  })

  it("keeps emphasis, strong text and strikethrough with their marks", () => {
    expect(parseRichText("*a*")).toEqual([[{ text: "*a*" }]])
    expect(parseRichText("**a** and b")).toEqual([[{ text: "**a** and b" }]])
    expect(parseRichText("~~a~~")).toEqual([[{ text: "~~a~~" }]])
  })

  it("keeps code, inline and fenced", () => {
    expect(parseRichText("`a`")).toEqual([[{ text: "`a`" }]])
    expect(parseRichText("```\na\n```")).toEqual([[{ text: "```" }], [{ text: "a" }], [{ text: "```" }]])
  })

  it("keeps raw HTML as text, which is the route the tree exists to close", () => {
    expect(parseRichText("<div>a</div>")).toEqual([[{ text: "<div>a</div>" }]])
    expect(parseRichText("a<sup>2</sup>")).toEqual([[{ text: "a<sup>2</sup>" }]])
    expect(parseRichText("line<br>break")).toEqual([[{ text: "line<br>break" }]])
  })

  it("keeps an image, a quote, a rule and a reference link", () => {
    expect(parseRichText("![alt](/a.png)")).toEqual([[{ text: "![alt](/a.png)" }]])
    expect(parseRichText("> quoted")).toEqual([[{ text: "> quoted" }]])
    expect(parseRichText("a\n\n---\n\nb")).toEqual([[{ text: "a" }], [], [{ text: "---" }], [], [{ text: "b" }]])
    expect(parseRichText("[a][b]\n\n[b]: /x")).toEqual([[{ text: "[a][b]" }], [], [{ text: "[b]: /x" }]])
  })

  it("keeps a link written inside emphasis as the characters of the whole, and emphasis inside a link as its text", () => {
    expect(parseRichText("*[a](/x)*")).toEqual([[{ text: "*[a](/x)*" }]])
    expect(parseRichText("[**a**](/x)")).toEqual([[{ text: "**a**", href: "/x" }]])
  })

  it("puts a blank line only where one was written, even between blocks the parser tells apart", () => {
    expect(parseRichText("a\n- b")).toEqual([[{ text: "a" }], [{ text: "- b" }]])
    expect(parseRichText("a\n\n- b")).toEqual([[{ text: "a" }], [], [{ text: "- b" }]])
    expect(parseRichText("# h\ntext")).toEqual([[{ text: "# h" }], [{ text: "text" }]])
  })

  it("reads back unchanged what the serialiser writes for a tree holding such characters", () => {
    for (const tree of [
      [[{ text: "**bold** and *em*" }]],
      [[{ text: "# not a heading" }], [{ text: "- not a list" }], [{ text: "1. nor this" }]],
      [[{ text: "a | b" }], [{ text: ":--- | ---:" }]],
      [[{ text: "[not a link](x) <b>" }, { text: "t", href: "/x" }]],
    ]) {
      expect(parseRichText(toMarkdown(tree))).toEqual(tree)
    }
  })
})
