import { describe, expect, it } from "vitest"

import { parseRichText, type RichTextSyntax } from "./parse.server"
import { toMarkdown } from "./richtext"

function parsed(source: string) {
  const result = parseRichText(source)
  if (!result.ok) throw new Error(`expected the source to parse: ${JSON.stringify(result.problems)}`)
  return result.value
}

function refusedAs(source: string): RichTextSyntax[] {
  const result = parseRichText(source)
  if (result.ok) throw new Error("expected the source to be refused")
  return result.problems.map((problem) => problem.syntax)
}

describe("parseRichText", () => {
  it("reads a single newline as a line, which is how values list things", () => {
    expect(parsed("JGAD000004: 375.31 GB\nJGAD000106: 885.30 GB")).toEqual([
      [{ text: "JGAD000004: 375.31 GB" }],
      [{ text: "JGAD000106: 885.30 GB" }],
    ])
  })

  it("reads a blank line as an empty line between paragraphs", () => {
    expect(parsed("a\n\nb")).toEqual([[{ text: "a" }], [], [{ text: "b" }]])
  })

  it("collapses several blank lines into the one line the tree can hold", () => {
    expect(parsed("a\n\n\n\nb")).toEqual([[{ text: "a" }], [], [{ text: "b" }]])
  })

  it("produces no lines at all for prose nobody wrote", () => {
    expect(parsed("")).toEqual([])
    expect(parsed("   \n  \n")).toEqual([])
  })

  it("drops the whitespace at either end of a line, which markdown cannot hold", () => {
    expect(parsed("  spaced  ")).toEqual([[{ text: "spaced" }]])
  })

  it("reads a written link as a span with a destination", () => {
    expect(parsed("see [NBDC policy](/nbdc-policy) first")).toEqual([[
      { text: "see " },
      { text: "NBDC policy", href: "/nbdc-policy" },
      { text: " first" },
    ]])
  })

  it("reads an angle-bracket autolink as a link", () => {
    expect(parsed("<https://ddbj.nig.ac.jp/>"))
      .toEqual([[{ text: "https://ddbj.nig.ac.jp/", href: "https://ddbj.nig.ac.jp/" }]])
  })

  it("leaves a bare URL as text, so that saving a field does not add a link nobody wrote", () => {
    expect(parsed("see https://ddbj.nig.ac.jp/ first"))
      .toEqual([[{ text: "see https://ddbj.nig.ac.jp/ first" }]])
  })

  it("keeps a destination the page will refuse, because refusing is the renderer's job", () => {
    expect(parsed("[x](javascript:alert(1))"))
      .toEqual([[{ text: "x", href: "javascript:alert(1)" }]])
  })
})

describe("parseRichText refuses what prose cannot hold", () => {
  it("refuses a heading", () => {
    expect(refusedAs("# Aims")).toEqual(["heading"])
    expect(refusedAs("Aims\n====")).toEqual(["heading"])
  })

  it("refuses a list, however it is written", () => {
    expect(refusedAs("- one\n- two")).toEqual(["list"])
    expect(refusedAs("1. one")).toEqual(["list"])
  })

  it("refuses a table, which is why GFM is switched on at all", () => {
    expect(refusedAs("| a | b |\n| --- | --- |\n| 1 | 2 |")).toContain("table")
  })

  it("refuses emphasis, strong text and strikethrough alike", () => {
    expect(refusedAs("*a*")).toEqual(["emphasis"])
    expect(refusedAs("**a**")).toEqual(["emphasis"])
    expect(refusedAs("~~a~~")).toEqual(["emphasis"])
  })

  it("refuses code, inline and fenced", () => {
    expect(refusedAs("`a`")).toEqual(["code"])
    expect(refusedAs("```\na\n```")).toEqual(["code"])
  })

  it("refuses raw HTML, which is the route the tree exists to close", () => {
    expect(refusedAs("<div>a</div>")).toEqual(["html"])
    expect(refusedAs("a<sup>2</sup>")).toEqual(["html", "html"])
    expect(refusedAs("line<br>break")).toEqual(["html"])
  })

  it("refuses an image, a quote, a rule, a footnote and a reference link", () => {
    expect(refusedAs("![alt](/a.png)")).toEqual(["image"])
    expect(refusedAs("> quoted")).toEqual(["quote"])
    expect(refusedAs("a\n\n---\n\nb")).toEqual(["rule"])
    expect(refusedAs("a[^1]\n\n[^1]: note")).toEqual(["footnote", "footnote"])
    expect(refusedAs("[a][b]\n\n[b]: /x")).toEqual(["reference", "reference"])
  })

  it("refuses what is inside a link as well as what is beside it", () => {
    expect(refusedAs("[**a**](/x)")).toEqual(["emphasis"])
  })

  it("reports every problem rather than the first, in the order they were written", () => {
    const result = parseRichText("# heading\n\ntext\n\n- item")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toEqual([
      { syntax: "heading", line: 1 },
      { syntax: "list", line: 5 },
    ])
  })

  it("lets escaped punctuation through, which is how the editor shows a stored value", () => {
    expect(parsed("\\# not a heading")).toEqual([[{ text: "# not a heading" }]])
    expect(parsed("\\- not a list")).toEqual([[{ text: "- not a list" }]])
    expect(parsed("call rate \\< 0.95")).toEqual([[{ text: "call rate < 0.95" }]])
    expect(parsed("PI_HAT > 0.175")).toEqual([[{ text: "PI_HAT > 0.175" }]])
  })

  it("accepts everything the serialiser writes for a tree holding table punctuation", () => {
    const tree = [[{ text: "a | b" }], [{ text: ":--- | ---:" }]]
    expect(parsed(toMarkdown(tree))).toEqual(tree)
  })
})
