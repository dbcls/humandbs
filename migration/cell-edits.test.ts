import { describe, expect, it } from "vitest"

import { applyCellEdits, type CellEdit } from "./cell-edits"
import type { EsDataset } from "./es"

const cell = (ja: string, en: string) => ({ ja: { text: ja, rawHtml: null }, en: { text: en, rawHtml: null } })
const doc = (humId: string, data: Record<string, ReturnType<typeof cell>>): EsDataset => ({
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

  it("stops when an edit lands nowhere, including in another research", () => {
    const edit: CellEdit = { op: "replace", hum: "hum0001", key: "Analysis Methods", lang: "ja", before: "GenomeStudio\nPLINK2", after: "x" }

    const docs = [doc("hum0014", { "Analysis Methods": cell("GenomeStudio\nPLINK2", "") })]

    expect(() => {
      applyCellEdits(docs, [edit])
    }).toThrow(/hum0001/)
  })
})
