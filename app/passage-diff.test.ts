import { describe, expect, it } from "vitest"

import { diffSentences, diffText, pieces, sentences } from "./passage-diff"

describe("pieces", () => {
  it("keeps an English word whole and a Japanese sentence a character at a time", () => {
    expect(pieces("DNA 解析")).toEqual(["DNA", " ", "解", "析"])
  })

  it("does not split a character outside the basic plane", () => {
    expect(pieces("a🧬b")).toEqual(["a", "🧬", "b"])
  })
})

describe("diffText", () => {
  it("changes a word in English, not the letters it shares with the new one", () => {
    expect(diffText("The old words", "The new words")).toEqual([
      { kind: "same", text: "The " },
      { kind: "del", text: "old" },
      { kind: "ins", text: "new" },
      { kind: "same", text: " words" },
    ])
  })

  it("changes only the characters that moved in Japanese", () => {
    expect(diffText("血液を解析する", "組織を解析する")).toEqual([
      { kind: "del", text: "血液" },
      { kind: "ins", text: "組織" },
      { kind: "same", text: "を解析する" },
    ])
  })

  it("merges a lone particle between two changes into one rewrite", () => {
    const parts = diffText("血液の検体", "組織の標本")
    expect(parts).toEqual([
      { kind: "del", text: "血液の検体" },
      { kind: "ins", text: "組織の標本" },
    ])
  })

  it("reports a text that appears from nothing as one addition", () => {
    expect(diffText("", "新しい")).toEqual([{ kind: "ins", text: "新しい" }])
    expect(diffText("古い", "")).toEqual([{ kind: "del", text: "古い" }])
    expect(diffText("", "")).toEqual([])
  })
})

describe("sentences", () => {
  it("cuts after a Japanese full stop and keeps the stop", () => {
    expect(sentences("血液を解析する。組織も解析する。")).toEqual(["血液を解析する。", "組織も解析する。"])
  })

  it("cuts after an English full stop with the space after it, and not inside a number", () => {
    expect(sentences("Version 1.5 is out. It is new.")).toEqual(["Version 1.5 is out. ", "It is new."])
  })

  it("cuts at a line break and keeps the break with the line it ends", () => {
    expect(sentences("一行目\n二行目")).toEqual(["一行目\n", "二行目"])
  })

  it("keeps a text with no stop whole", () => {
    expect(sentences("研究題目")).toEqual(["研究題目"])
    expect(sentences("")).toEqual([])
  })
})

describe("diffSentences", () => {
  it("keeps a sentence both sides share as one line, and compares only the one that moved", () => {
    const rows = diffSentences("血液を解析する。組織を調べる。", "血液を解析する。臓器を調べる。")
    expect(rows[0]).toEqual({ kind: "same", text: "血液を解析する。" })
    expect(rows[1]).toMatchObject({ kind: "changed", before: "組織を調べる。", after: "臓器を調べる。" })
    expect(rows).toHaveLength(2)
  })

  it("shows a sentence only one side has on its own line", () => {
    const rows = diffSentences("一つ目。", "一つ目。二つ目。")
    expect(rows).toEqual([
      { kind: "same", text: "一つ目。" },
      { kind: "changed", before: null, after: "二つ目。", parts: null },
    ])
  })
})
