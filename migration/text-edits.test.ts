import { describe, expect, it } from "vitest"

import { assertEditsApplied, editText, type TextEdit } from "./text-edits"

const slot = (value: string) => ({ state: "value", value })

describe("editText", () => {
  const content = {
    title: { ja: slot("脳腫瘍のゲノム・遺伝子解析と その臨床病理学的意義の解明"), en: slot("Brain tumors and their analysis") },
    grants: [{ id: "grant-1", title: { ja: slot("研究助成-がん領域-"), en: slot("Grant") } }],
    summary: { aims: { ja: slot("その臨床"), en: slot("") } },
    datasets: [{ datasetId: "d-1", experiments: [{ text: { ja: { state: "value", value: [[{ text: "①ー2" }]] } } }] }],
  }
  const edit = (over: Partial<TextEdit>): TextEdit => ({ hum: "hum0006", field: "title", before: "と その", after: "とその", ...over })

  it("replaces the words in the named part of the named research's content, in the named language", () => {
    const applied = new Set<TextEdit>()
    const one = edit({ lang: "ja" })
    const edited = editText(content, { hum: "hum0006", dataset: false }, [one], applied)

    expect(edited.title.ja.value).toBe("脳腫瘍のゲノム・遺伝子解析とその臨床病理学的意義の解明")
    expect(edited.summary).toBe(content.summary)
    expect(applied.has(one)).toBe(true)
  })

  it("leaves another research, another part and another language as they were", () => {
    const applied = new Set<TextEdit>()
    const edits = [edit({ hum: "hum0007" }), edit({ field: "grants", before: "Grant" }), edit({ lang: "en" })]
    const edited = editText(content, { hum: "hum0006", dataset: false }, edits, applied)

    expect(edited.title).toEqual(content.title)
    expect(applied.size).toBe(1)
    expect(edited.grants[0]?.title.en.value).toBe("とその")
  })

  it("reaches the datasets inside a version and a dataset's own description only with `datasets`", () => {
    const one = edit({ field: "datasets", before: "①ー2", after: "①-2" })
    const inVersion = editText(content, { hum: "hum0006", dataset: false }, [one], new Set())
    const own = editText(content.datasets[0] ?? {}, { hum: "hum0006", dataset: true }, [one, edit({})], new Set())

    expect(inVersion.datasets[0]?.experiments[0]?.text.ja.value).toEqual([[{ text: "①-2" }]])
    expect(own).toEqual({ datasetId: "d-1", experiments: [{ text: { ja: { state: "value", value: [[{ text: "①-2" }]] } } }] })
  })

  it("does not touch identifiers", () => {
    const edited = editText(content, { hum: "hum0006", dataset: false }, [edit({ field: "grants", before: "grant-1", after: "x" })], new Set())

    expect(edited.grants[0]?.id).toBe("grant-1")
  })
})

describe("assertEditsApplied", () => {
  it("stops on an edit that found nothing", () => {
    const edits: TextEdit[] = [{ hum: "hum0001", field: "title", before: "a", after: "b" }]

    expect(() => {
      assertEditsApplied(edits, new Set())
    }).toThrow(/hum0001 title/)
    expect(() => {
      assertEditsApplied(edits, new Set(edits))
    }).not.toThrow()
  })
})
