import { describe, expect, it } from "vitest"

import { applyCellEdits, type CellEdit } from "./cell-edits"
import type { EsBilingualRich, EsDataset } from "./es"

const cell = (ja: string, en: string) => ({ ja: { text: ja, rawHtml: null }, en: { text: en, rawHtml: null } })
const doc = (humId: string, data: Record<string, EsBilingualRich>): EsDataset => ({
  datasetId: "JGAD000001", version: "v1", humId, experiments: [{ data }],
})

describe("applyCellEdits", () => {
  it("puts the headings back into a cell several rows were merged into, in every version that holds it", () => {
    const docs = [
      doc("hum0014", { "Analysis Methods": cell("GenomeStudio\nPLINK2", "GenomeStudio\nPLINK2") }),
      doc("hum0014", { "Analysis Methods": cell("GenomeStudio\nPLINK2", "x") }),
    ]
    applyCellEdits(docs, [{
      op: "replace", hum: "hum0014", key: "Analysis Methods", lang: "ja",
      before: "GenomeStudio\nPLINK2", after: "遺伝子型決定: GenomeStudio\n関連解析: PLINK2",
    }])

    expect(docs.map((one) => one.experiments?.[0]?.data?.["Analysis Methods"]?.ja?.text)).toEqual([
      "遺伝子型決定: GenomeStudio\n関連解析: PLINK2",
      "遺伝子型決定: GenomeStudio\n関連解析: PLINK2",
    ])
    expect(docs[0]?.experiments?.[0]?.data?.["Analysis Methods"]?.en?.text).toBe("GenomeStudio\nPLINK2")
  })

  it("moves one language of a row to the key its other language went to", () => {
    const docs = [doc("hum0311", { "Filtering": cell("", "Bowtie2 against the human genome"), "Analysis Methods": cell("Bowtie2 でヒト配列を除去", "") })]
    applyCellEdits(docs, [{ op: "move", hum: "hum0311", key: "Filtering", lang: "en", before: "Bowtie2 against the human genome", to: "Analysis Methods" }])

    expect(docs[0]?.experiments?.[0]?.data).toEqual({ "Analysis Methods": cell("Bowtie2 でヒト配列を除去", "Bowtie2 against the human genome") })
  })

  it("adds a dropped row where the row kept beside it is", () => {
    const docs = [doc("hum0290", { "Sample Description": cell("血漿", "Plasma") })]
    applyCellEdits(docs, [{
      op: "add", hum: "hum0290", key: "Sample Description", lang: "ja", text: "実験期間: 2020/11/1 - 2021/7/31",
      besideKey: "Sample Description", besideText: "血漿",
    }])

    expect(docs[0]?.experiments?.[0]?.data?.["Sample Description"]?.ja?.text).toBe("血漿\n実験期間: 2020/11/1 - 2021/7/31")
  })

  it("replaces a part of a cell in the text and in the HTML it was read from, in every version", () => {
    const written = { text: "関節リウマチ (ICD10: M05) 、バセドウ病 (ICD10: C719)", rawHtml: "<p>バセドウ病（ICD10：C719）</p>" }
    const docs = [
      doc("hum0197", { "Materials and Participants": { ja: { ...written }, en: { text: "Graves' disease (ICD10: C719)", rawHtml: null } } }),
      doc("hum0197", { "Materials and Participants": { ja: { ...written }, en: { text: "x", rawHtml: null } } }),
    ]
    applyCellEdits(docs, [
      { op: "substitute", hum: "hum0197", key: "Materials and Participants", lang: "ja", find: "バセドウ病 (ICD10: C719)", replace: "バセドウ病 (ICD10: E050)" },
      { op: "substitute", hum: "hum0197", key: "Materials and Participants", lang: "ja", find: "バセドウ病（ICD10：C719）", replace: "バセドウ病（ICD10：E050）" },
    ])

    expect(docs.map((one) => one.experiments?.[0]?.data?.["Materials and Participants"]?.ja)).toEqual([
      { text: "関節リウマチ (ICD10: M05) 、バセドウ病 (ICD10: E050)", rawHtml: "<p>バセドウ病（ICD10：E050）</p>" },
      { text: "関節リウマチ (ICD10: M05) 、バセドウ病 (ICD10: E050)", rawHtml: "<p>バセドウ病（ICD10：E050）</p>" },
    ])
    expect(docs[0]?.experiments?.[0]?.data?.["Materials and Participants"]?.en?.text).toBe("Graves' disease (ICD10: C719)")
  })

  it("stops when a substitution finds its text nowhere", () => {
    const docs = [doc("hum0197", { "Materials and Participants": cell("バセドウ病 (ICD10: E050)", "") })]

    expect(() => {
      applyCellEdits(docs, [
        { op: "substitute", hum: "hum0197", key: "Materials and Participants", lang: "ja", find: "C719", replace: "E050" },
      ])
    }).toThrow(/found nothing/)
  })

  it("stops when an edit lands nowhere, including in another research", () => {
    const edit: CellEdit = { op: "replace", hum: "hum0001", key: "Analysis Methods", lang: "ja", before: "GenomeStudio\nPLINK2", after: "x" }

    const docs = [doc("hum0014", { "Analysis Methods": cell("GenomeStudio\nPLINK2", "") })]

    expect(() => {
      applyCellEdits(docs, [edit])
    }).toThrow(/hum0001/)
  })
})
