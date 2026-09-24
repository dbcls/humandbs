import { describe, expect, it } from "vitest"

import { folded, lineDictionary, restoreLineBreaks, restoreLineBreaksIn } from "./line-breaks"

const CELL = "<table><tr><td>NGS（WGS）<br>NGS（Exome）<br>メチル化アレイ</td></tr></table>"

describe("folded", () => {
  it("drops whitespace and folds full-width forms, quotes and dashes", () => {
    expect(folded("NGS（WGS） ＡＢＣ “x”　1‐2")).toBe("NGS(WGS)ABC\"x\"1-2")
  })

  it("folds a half-width kana with its voicing mark to the full-width letter", () => {
    expect(folded("ｶﾞﾝ")).toBe(folded("ガン"))
  })
})

describe("lineDictionary", () => {
  it("keeps a table cell broken by <br> under its folded characters", () => {
    const dictionary = lineDictionary([CELL])

    expect(dictionary.get(folded("NGS(WGS) NGS(Exome) メチル化アレイ"))).toEqual(["NGS（WGS）", "NGS（Exome）", "メチル化アレイ"])
  })

  it("keeps a cell whose lines are paragraphs", () => {
    const dictionary = lineDictionary(["<table><tr><td><p>gliomas</p><p>NGS (Exome), Methylation array</p></td></tr></table>"])

    expect(dictionary.get(folded("gliomas NGS (Exome), Methylation array"))).toEqual(["gliomas", "NGS (Exome), Methylation array"])
  })

  it("keeps nothing for a block that shows one line", () => {
    const dictionary = lineDictionary(["<p>one <strong>line</strong> only</p>", "<table><tr><td>cell</td></tr></table>"])

    expect(dictionary.size).toBe(0)
  })

  it("skips lines that are only whitespace", () => {
    const dictionary = lineDictionary(["<td>first<br>&nbsp;<br><br>second</td>"])

    expect(dictionary.get("firstsecond")).toEqual(["first", "second"])
  })

  it("keeps a block two articles cut the same way, even when they write it differently", () => {
    const dictionary = lineDictionary([CELL, "<td>NGS(WGS)<br>NGS(Exome)<br>メチル化アレイ</td>"])

    expect(dictionary.get(folded("NGS(WGS)NGS(Exome)メチル化アレイ"))).toEqual(["NGS（WGS）", "NGS（Exome）", "メチル化アレイ"])
  })

  it("gives up on characters two blocks cut differently", () => {
    const dictionary = lineDictionary(["<td>NGS<br>(Target RNA-seq)</td>", "<td>NGS (Target<br>RNA-seq)</td>"])

    expect(dictionary.get(folded("NGS (Target RNA-seq)"))).toBeNull()
  })

  it("stays given up when a third block agrees with one of the two", () => {
    const dictionary = lineDictionary(["<td>a<br>bc</td>", "<td>ab<br>c</td>", "<td>a<br>bc</td>"])

    expect(dictionary.get("abc")).toBeNull()
  })

  it("reads nothing from comments or tags alone", () => {
    expect(lineDictionary(["<!-- a<br>b -->", "<td><br><br></td>", ""]).size).toBe(0)
  })
})

describe("restoreLineBreaks", () => {
  const dictionary = lineDictionary([CELL, "<td>NGS<br>(Target RNA-seq)</td>", "<td>NGS (Target<br>RNA-seq)</td>"])

  it("cuts a one-line value where the article's lines end, keeping the value's own characters", () => {
    const { rich, restored } = restoreLineBreaks([[{ text: "NGS(WGS) NGS(Exome) メチル化アレイ" }]], dictionary)

    expect(rich).toEqual([[{ text: "NGS(WGS)" }], [{ text: "NGS(Exome)" }], [{ text: "メチル化アレイ" }]])
    expect(restored).toBe(1)
  })

  it("keeps a link's destination on both sides of a cut that falls inside it", () => {
    const href = "https://example.org/a"
    const { rich } = restoreLineBreaks([[{ text: "NGS(W" }, { text: "GS) NGS(Ex", href }, { text: "ome) メチル化アレイ" }]], dictionary)

    expect(rich).toEqual([
      [{ text: "NGS(W" }, { text: "GS)", href }],
      [{ text: "NGS(Ex", href }, { text: "ome)" }],
      [{ text: "メチル化アレイ" }],
    ])
  })

  it("cuts on a span boundary without leaving an empty span", () => {
    const { rich } = restoreLineBreaks([[{ text: "NGS(WGS) " }, { text: "NGS(Exome) ", href: "https://example.org/" }, { text: "メチル化アレイ" }]], dictionary)

    expect(rich).toEqual([[{ text: "NGS(WGS)" }], [{ text: "NGS(Exome)", href: "https://example.org/" }], [{ text: "メチル化アレイ" }]])
  })

  it("cuts one paragraph among others and leaves the rest", () => {
    const { rich, restored } = restoreLineBreaks([
      [{ text: "before" }],
      [],
      [{ text: "NGS(WGS)NGS(Exome)メチル化アレイ" }],
      [],
      [{ text: "after" }],
    ], dictionary)

    expect(rich).toEqual([
      [{ text: "before" }],
      [],
      [{ text: "NGS(WGS)" }],
      [{ text: "NGS(Exome)" }],
      [{ text: "メチル化アレイ" }],
      [],
      [{ text: "after" }],
    ])
    expect(restored).toBe(1)
  })

  it("leaves a line that is part of a paragraph already on several lines", () => {
    const rich = [[{ text: "heading" }], [{ text: "NGS(WGS) NGS(Exome) メチル化アレイ" }]]

    expect(restoreLineBreaks(rich, dictionary)).toEqual({ rich, restored: 0 })
  })

  it("leaves a value no article showed on several lines", () => {
    const rich = [[{ text: "NGS(WGS) NGS(Exome)" }]]

    expect(restoreLineBreaks(rich, dictionary)).toEqual({ rich, restored: 0 })
  })

  it("leaves a value two articles would cut differently", () => {
    const rich = [[{ text: "NGS (Target RNA-seq)" }]]

    expect(restoreLineBreaks(rich, dictionary)).toEqual({ rich, restored: 0 })
  })

  it("leaves the empty rich text and empty lines", () => {
    expect(restoreLineBreaks([], dictionary)).toEqual({ rich: [], restored: 0 })
    expect(restoreLineBreaks([[]], dictionary)).toEqual({ rich: [[]], restored: 0 })
  })

  it("cuts a value written in half-width kana where the article wrote full-width", () => {
    const kana = lineDictionary(["<td>ガン<br>ゲノム</td>"])

    expect(restoreLineBreaks([[{ text: "ｶﾞﾝ ｹﾞﾉﾑ" }]], kana).rich).toEqual([[{ text: "ｶﾞﾝ" }], [{ text: "ｹﾞﾉﾑ" }]])
  })
})

describe("restoreLineBreaksIn", () => {
  const dictionary = lineDictionary([CELL])
  const one = [[{ text: "NGS(WGS) NGS(Exome) メチル化アレイ" }]]
  const cut = [[{ text: "NGS(WGS)" }], [{ text: "NGS(Exome)" }], [{ text: "メチル化アレイ" }]]

  it("cuts every rich text inside the content and counts the paragraphs", () => {
    const content = {
      datasets: [{ values: [{ keyId: "k", value: { kind: "text", text: { ja: { state: "value", value: one }, en: { state: "value", value: one } } } }] }],
    }

    const { content: out, restored } = restoreLineBreaksIn(content, dictionary)

    expect(out.datasets[0]?.values[0]?.value.text).toEqual({ ja: { state: "value", value: cut }, en: { state: "value", value: cut } })
    expect(restored).toBe(2)
  })

  it("leaves lists of addresses, lists of ids and plain strings alone", () => {
    const content = {
      url: { ja: { state: "value", value: [{ id: "l1", url: "https://example.org/", text: "NGS(WGS) NGS(Exome) メチル化アレイ" }] } },
      termIds: { state: "value", value: ["NGS(WGS) NGS(Exome) メチル化アレイ"] },
      label: "NGS(WGS) NGS(Exome) メチル化アレイ",
    }

    expect(restoreLineBreaksIn(content, dictionary)).toEqual({ content, restored: 0 })
  })

  it("leaves a list of empty lists alone", () => {
    expect(restoreLineBreaksIn({ a: [[], []] }, dictionary)).toEqual({ content: { a: [[], []] }, restored: 0 })
  })
})
