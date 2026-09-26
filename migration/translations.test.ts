import { describe, expect, it } from "vitest"

import type { DatasetContent, RichText, Slot } from "~/content/types"

import { assertTranslationsApplied, fillResearchTranslations, fillTranslations, type ResearchTranslation, richTextOf, type Translation } from "./translations"

const rich = (...lines: string[]): Slot<RichText> => ({ state: "value", value: lines.map((line) => [{ text: line }]) })
const empty: Slot<RichText> = { state: "value", value: [] }

const dataset = (ja: Slot<RichText>, en: Slot<RichText>): DatasetContent => ({
  releaseDate: null,
  fileSelection: [],
  values: [{ keyId: "k-type", value: { kind: "text", text: { ja: rich("NGS"), en: empty } } }],
  experiments: [{
    id: "experiment-1",
    label: { state: "value", value: "WGS" },
    values: [{ keyId: "k-targets", value: { kind: "text", text: { ja, en } } }],
  }],
})

const keyIdOf = (code: string) => ({ "targets": "k-targets", "type-of-data": "k-type" })[code]
const entry = (over: Partial<Translation> = {}): Translation =>
  ({ hum: "hum0127", dataset: "JGAD000380", experiment: "experiment-1", key: "targets", lang: "en", text: "All genes", ...over })
const where = { hum: "hum0127", label: "JGAD000380" }

describe("richTextOf", () => {
  it("makes a line of each line and a link of each link", () => {
    expect(richTextOf("HLA region\n(HLA-A, -C)")).toEqual([[{ text: "HLA region" }], [{ text: "(HLA-A, -C)" }]])
    expect(richTextOf("see [遺伝子リスト](/files/a.xlsx) here")).toEqual([[{ text: "see " }, { text: "遺伝子リスト", href: "/files/a.xlsx" }, { text: " here" }]])
  })
})

describe("fillTranslations", () => {
  it("fills the empty language of the named value and records the entry", () => {
    const applied = new Set<Translation>()
    const one = entry()
    const filled = fillTranslations(dataset(rich("全遺伝子"), empty), where, [one], keyIdOf, applied)

    expect(filled.experiments[0]?.values[0]?.value).toEqual({ kind: "text", text: { ja: rich("全遺伝子"), en: rich("All genes") } })
    expect(applied.has(one)).toBe(true)
  })

  it("fills a value of the dataset itself when the entry names no experiment", () => {
    const one = entry({ experiment: null, key: "type-of-data" })
    const filled = fillTranslations(dataset(rich("全遺伝子"), empty), where, [one], keyIdOf, new Set())

    expect(filled.values[0]?.value).toEqual({ kind: "text", text: { ja: rich("NGS"), en: rich("All genes") } })
  })

  it("leaves a language already written, and one whose other language is empty too", () => {
    const applied = new Set<Translation>()
    const written = dataset(rich("全遺伝子"), rich("Whole genes"))
    const neither = dataset(empty, empty)

    expect(fillTranslations(written, where, [entry()], keyIdOf, applied)).toEqual(written)
    expect(fillTranslations(neither, where, [entry()], keyIdOf, applied)).toEqual(neither)
    expect(applied.size).toBe(0)
  })

  it("leaves another dataset and another experiment alone", () => {
    const applied = new Set<Translation>()
    const held = dataset(rich("全遺伝子"), empty)

    expect(fillTranslations(held, { hum: "hum0127", label: "JGAD000733" }, [entry()], keyIdOf, applied)).toBe(held)
    expect(fillTranslations(held, where, [entry({ experiment: "experiment-5" })], keyIdOf, applied)).toEqual(held)
    expect(applied.size).toBe(0)
  })
})

describe("fillResearchTranslations", () => {
  const text = (value: string): Slot<string> => ({ state: "value", value })
  const content = {
    title: { ja: text("関節リウマチの研究"), en: text("") },
    grants: [
      { id: "g-1", title: { ja: text("オルガノイドの研究"), en: text("") }, agency: { name: { ja: text("JSPS"), en: text("JSPS") } }, grantIds: [] },
      { id: "g-2", title: { ja: text("オルガノイドの研究"), en: text("") }, agency: { name: { ja: text("AMED"), en: text("AMED") } }, grantIds: [] },
    ],
    releaseNote: { ja: rich(""), en: rich("CAGE libraries were resequenced.") },
    datasets: [{ values: [{ keyId: "k", value: { kind: "text", text: { ja: rich("全遺伝子"), en: empty } } }] }],
  }
  const entry = (over: Partial<ResearchTranslation>): ResearchTranslation => ({ hum: "hum0001", lang: "en", from: "オルガノイドの研究", text: "A study of organoids", ...over })

  it("fills every empty language whose other language has the entry's words", () => {
    const applied = new Set<ResearchTranslation>()
    const one = entry({})
    const filled = fillResearchTranslations(content, "hum0001", [one], applied)

    expect(filled.grants.map((grant) => grant.title.en)).toEqual([text("A study of organoids"), text("A study of organoids")])
    expect(filled.title).toEqual(content.title)
    expect(applied.has(one)).toBe(true)
  })

  it("writes prose as lines and a single line as a string", () => {
    const filled = fillResearchTranslations(content, "hum0001", [
      entry({ lang: "ja", from: "CAGE libraries were resequenced.", text: "CAGE ライブラリを\n再シーケンスした。" }),
      entry({ from: "関節リウマチの研究", text: "A study of rheumatoid arthritis" }),
    ], new Set())

    expect(filled.releaseNote.ja).toEqual(rich("CAGE ライブラリを", "再シーケンスした。"))
    expect(filled.title.en).toEqual(text("A study of rheumatoid arthritis"))
  })

  it("leaves the datasets, a written language and another research alone", () => {
    const applied = new Set<ResearchTranslation>()
    const entries = [entry({ from: "全遺伝子", text: "All genes" }), entry({ lang: "ja", from: "JSPS", text: "日本学術振興会" }), entry({ hum: "hum0002" })]

    expect(fillResearchTranslations(content, "hum0001", entries, applied)).toEqual(content)
    expect(applied.size).toBe(0)
  })
})

describe("assertTranslationsApplied", () => {
  it("stops the load when an entry filled nothing, and names it", () => {
    const one = entry()
    expect(() => {
      assertTranslationsApplied([one], new Set())
    }).toThrow(/hum0127 JGAD000380 experiment-1 targets en/)
    expect(() => {
      assertTranslationsApplied([one], new Set([one]))
    }).not.toThrow()
  })
})
