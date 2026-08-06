import { describe, expect, it } from "vitest"

import { richTextFromMarkdown, richTextFromPlain } from "./richtext"

describe("richTextFromMarkdown", () => {
  it("makes a line of a single newline, which is how the values list things", () => {
    expect(richTextFromMarkdown("JGAD000004: 375.31 GB\nJGAD000106: 885.30 GB")).toEqual([
      [{ text: "JGAD000004: 375.31 GB" }],
      [{ text: "JGAD000106: 885.30 GB" }],
    ])
  })

  it("keeps a blank line between paragraphs", () => {
    expect(richTextFromMarkdown("first\n\nsecond")).toEqual([
      [{ text: "first" }],
      [],
      [{ text: "second" }],
    ])
  })

  it("turns a link into one span carrying its destination", () => {
    expect(richTextFromMarkdown("see [JGAD000234](https://ddbj.nig.ac.jp/x) for it")).toEqual([
      [
        { text: "see " },
        { text: "JGAD000234", href: "https://ddbj.nig.ac.jp/x" },
        { text: " for it" },
      ],
    ])
  })

  it("shows a link with no text of its own as its destination", () => {
    expect(richTextFromMarkdown("[](/nbdc-policy)"))
      .toEqual([[{ text: "/nbdc-policy", href: "/nbdc-policy" }]])
  })

  it("flattens a list into lines and loses the markers", () => {
    expect(richTextFromMarkdown("- one\n- two")).toEqual([[{ text: "one" }], [{ text: "two" }]])
    expect(richTextFromMarkdown("1. one\n2. two")).toEqual([[{ text: "one" }], [{ text: "two" }]])
  })

  it("keeps the text a heading or a quote was written on", () => {
    expect(richTextFromMarkdown("## 対象\n\n> 引用")).toEqual([
      [{ text: "対象" }],
      [],
      [{ text: "引用" }],
    ])
  })

  it("keeps the text emphasis and code were written on, and drops the markup", () => {
    expect(richTextFromMarkdown("**bold** and `code`"))
      .toEqual([[{ text: "bold and code" }]])
  })

  it("reads <br> as a line and keeps what a superscript was around", () => {
    expect(richTextFromMarkdown("one<br>two")).toEqual([[{ text: "one" }], [{ text: "two" }]])
    expect(richTextFromMarkdown("1.73m<sup>2</sup>")).toEqual([[{ text: "1.73m2" }]])
  })

  it("removes the escapes v1 baked into the text", () => {
    expect(richTextFromMarkdown("call rate \\< 0.95")).toEqual([[{ text: "call rate < 0.95" }]])
    expect(richTextFromMarkdown("PI\\_HAT > 0.175")).toEqual([[{ text: "PI_HAT > 0.175" }]])
  })

  it("produces nothing for a value nobody filled in", () => {
    expect(richTextFromMarkdown("")).toEqual([])
    expect(richTextFromMarkdown("   \n  ")).toEqual([])
  })

  it("leaves no blank line at either end", () => {
    expect(richTextFromMarkdown("\n\ntext\n\n")).toEqual([[{ text: "text" }]])
  })
})

describe("richTextFromPlain", () => {
  it("reads punctuation as text rather than as syntax", () => {
    expect(richTextFromPlain("SNP array (*.CEL) [raw]"))
      .toEqual([[{ text: "SNP array (*.CEL) [raw]" }]])
  })

  it("still ends a line on a newline", () => {
    expect(richTextFromPlain("a\nb")).toEqual([[{ text: "a" }], [{ text: "b" }]])
  })

  it("produces nothing for an empty value", () => {
    expect(richTextFromPlain("")).toEqual([])
  })
})
