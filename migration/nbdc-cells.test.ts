import { describe, expect, it } from "vitest"

import type { Bilingual, DatasetContent, Line, RichText, ValueSlot } from "~/content/types"

import { settleNbdcCells, type NbdcCellContext } from "./nbdc-cells"

const KEY = "key-nbdc"
const OTHER_KEY = "key-other"

/** A line from markdown-ish pieces: a string is words, a pair is a link. */
const line = (...parts: (string | [string, string])[]): Line =>
  parts.map((part) => (typeof part === "string" ? { text: part } : { text: part[0], href: part[1] }))
const file = (name: string, hum = "hum0001") => `/files/${hum}/${name}`

const cell = (ja: RichText, en: RichText = ja, keyId = KEY): ValueSlot =>
  ({ keyId, value: { kind: "text", text: { ja: { state: "value", value: ja }, en: { state: "value", value: en } } } })

const dataset = (datasetId: string, cells: ValueSlot[], fileSelection: string[] = []): DatasetContent & { datasetId: string } => ({
  datasetId,
  releaseDate: null,
  fileSelection,
  values: [],
  experiments: [{ id: "experiment-1", label: { state: "value", value: "GWAS" }, values: cells }],
})

const LABELS: Record<string, Bilingual> = {
  "dict.xlsx": { ja: "Dictionary file", en: "Dictionary file" },
  "dict_BBJ.html": { ja: "Dictionary file (BBJ)", en: "Dictionary file (BBJ)" },
  "dict_EUR.html": { ja: "Dictionary file (EUR)", en: "Dictionary file (EUR)" },
  "AR.zip": { ja: "不整脈", en: "Arrhythmia" },
  "rhm_dd.xlsx": { ja: "Dictionary file", en: "Dictionary file" },
  "gwas_dd.xlsx": { ja: "Dictionary file", en: "Dictionary file" },
}

const context = (over: Partial<NbdcCellContext> = {}): NbdcCellContext => ({
  keyId: KEY,
  hum: "hum0001",
  labelsOf: (id) => ({
    "d-1": new Set(["NHA000001", "hum0001.v1.gwas.v1"]),
    "d-2": new Set(["NHA000002", "hum0001.v1.rhm.v1"]),
  })[id],
  stored: (name) => name !== "gone.zip",
  labelOf: (name) => LABELS[name],
  ...over,
})

const cellsOf = (one: DatasetContent) => one.experiments.flatMap((experiment) => experiment.values.filter((slot) => slot.keyId === KEY))

describe("settleNbdcCells", () => {
  describe("the files selected", () => {
    it("are the files the dataset's own cell links that the research's prefix holds, in the prefix's order", () => {
      const one = dataset("d-1", [cell([
        line(["hum0001.v1.gwas.v1", file("gwas.zip")]),
        line(["Dictionary file", file("dict.xlsx")]),
        line(["old", file("gone.zip")]),
        line(["elsewhere", file("x.zip", "hum0002")]),
      ])], ["b.txt"])

      const out = settleNbdcCells([one], context())

      expect(out.datasets[0]?.fileSelection).toEqual(["b.txt", "dict.xlsx", "gwas.zip"])
      expect(out.selected).toEqual([{ datasetId: "d-1", name: "gwas.zip" }, { datasetId: "d-1", name: "dict.xlsx" }])
    })

    it("read an escaped name, and a directory the prefix does not have, as the file's name", () => {
      const out = settleNbdcCells([dataset("d-1", [cell([line(["Dictionary file", "/files/hum0001/sub/Dictionary%20file%20(AD).xlsx"])])])], context())

      expect(out.datasets[0]?.fileSelection).toEqual(["Dictionary file (AD).xlsx"])
    })

    it("leave out a line captioned for another dataset and a link whose words are another dataset's ID", () => {
      const own = dataset("d-2", [cell([
        line("RHM: ", ["hum0001.v1.rhm.v1", file("rhm.zip")]),
        line("RHM: ", ["Dictionary file", file("rhm_dd.xlsx")]),
        line("GWAS: ", ["Dictionary file", file("gwas_dd.xlsx")]),
        line(["hum0001.v1.gwas.v1", file("gwas.zip")]),
      ])])

      const out = settleNbdcCells([own, dataset("d-1", [])], context())

      expect(out.datasets[0]?.fileSelection).toEqual(["rhm.zip", "rhm_dd.xlsx"])
    })

    it("are none for a dataset of an external archive, whose cells stay as they are", () => {
      const external = dataset("JGAD000001", [cell([line(["Dictionary file", file("dict.xlsx")])])])

      const out = settleNbdcCells([external], context())

      expect(out.datasets[0]).toBe(external)
      expect(out.selected).toEqual([])
    })
  })

  describe("a cell taken out", () => {
    it("is one of the dataset's own ID and links to labelled files it selects, with a list's marks", () => {
      const out = settleNbdcCells([dataset("d-1", [cell(
        [line("1．", ["hum0001.v1.gwas.v1", file("gwas.zip")]), [], line("・", ["Dictionary file", file("dict.xlsx")])],
        [line("(1) hum0001.v1.gwas.v1"), line("- ", ["Dictionary file", file("dict.xlsx")])],
      ), cell([line("kept")], [line("kept")], OTHER_KEY)])], context())

      expect(cellsOf(out.datasets[0] as DatasetContent)).toEqual([])
      expect(out.datasets[0]?.experiments[0]?.values.map((slot) => slot.keyId)).toEqual([OTHER_KEY])
      expect(out.dropped).toEqual([{
        datasetId: "d-1",
        experimentId: "experiment-1",
        whole: true,
        ja: ["1．hum0001.v1.gwas.v1", "", "・Dictionary file"],
        en: ["(1) hum0001.v1.gwas.v1", "- Dictionary file"],
      }])
    })

    it("may link a file by its name, and hold words the labels of the line's files hold", () => {
      const out = settleNbdcCells([dataset("d-1", [cell([
        line(["gwas.zip", file("gwas.zip")]),
        line("Dictionary file（", ["BBJ", file("dict_BBJ.html")], "、", ["EUR", file("dict_EUR.html")], "）"),
      ])])], context())

      expect(cellsOf(out.datasets[0] as DatasetContent)).toEqual([])
    })

    it("may have a caption over the line of the file whose label it is, with a footnote mark", () => {
      const out = settleNbdcCells([dataset("d-1", [cell(
        [line("不整脈＊"), line(["hum0001.v1.gwas.v1", file("AR.zip")])],
        [line("Arrhythmia"), line("*", ["hum0001.v1.gwas.v1", file("AR.zip")])],
      )])], context())

      expect(cellsOf(out.datasets[0] as DatasetContent)).toEqual([])
    })

    it("may have lines captioned for another dataset whose files one of the research's datasets selects", () => {
      const lines = (own: string) => [
        line(`${own}: `, [`hum0001.v1.${own.toLowerCase()}.v1`, file(`${own.toLowerCase()}.zip`)]),
        line("RHM: ", ["Dictionary file", file("rhm_dd.xlsx")]),
        line("GWAS: ", ["Dictionary file", file("gwas_dd.xlsx")]),
      ]
      const out = settleNbdcCells([dataset("d-1", [cell(lines("GWAS"))]), dataset("d-2", [cell(lines("RHM"))])], context())

      expect(out.datasets.map((one) => cellsOf(one))).toEqual([[], []])
      expect(out.datasets.map((one) => one.fileSelection)).toEqual([["gwas.zip", "gwas_dd.xlsx"], ["rhm.zip", "rhm_dd.xlsx"]])
    })
  })

  describe("a cell that stays", () => {
    const stays = (ja: RichText, en: RichText = ja, over: Partial<NbdcCellContext> = {}, selection: string[] = []) => {
      const one = dataset("d-1", [cell(ja, en)], selection)
      const out = settleNbdcCells([one], context(over))
      expect(cellsOf(out.datasets[0] as DatasetContent)).toEqual(cellsOf(one))
      expect(out.dropped).toEqual([])
    }

    it("has a word that no label, ID or list mark holds", () => {
      stays([line("hum0001.v1.gwas.v1（腸内微生物叢）"), line(["Dictionary file", file("dict.xlsx")])])
      stays([line("・染色毎の一括ダウンロード")])
    })

    it("links a file it cannot select, or one with no label under words that are not its ID or name", () => {
      stays([line(["hum0001.v1.gwas.v1", file("gone.zip")])])
      stays([line(["README", file("readme.txt")])])
    })

    it("links anything other than the research's files", () => {
      stays([line("Phenotype：", ["JGAD000101", "https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000101"])])
      stays([line(["Case毎のダウンロード", "/en/hum0001-v1-st1"])])
    })

    it("has a caption that is not the label of the next line's file", () => {
      stays([line("喘息"), line(["hum0001.v1.gwas.v1", file("AR.zip")])])
    })

    it("has a line captioned for another dataset whose file no dataset selects", () => {
      stays([line("GWAS: ", ["hum0001.v1.gwas.v1", file("gwas.zip")]), line("RHM: ", ["Dictionary file", file("rhm_dd.xlsx")])], undefined, { stored: (name) => name !== "rhm_dd.xlsx" })
    })

    it("is shown in full by the file table in one language only", () => {
      stays([line(["Dictionary file", file("dict.xlsx")])], [line(["Dictionary file", file("dict.xlsx")]), line("see the note")])
    })
  })

  describe("a cell of groups under headings alone on their lines", () => {
    const groups = (en = true) => cell(
      [line("【GWAS集計情報】"), line(["hum0001.v1.gwas.v1", file("gwas.zip")]), line(["Dictionary file", file("dict.xlsx")]), line("【個別データ】"), line("Phenotype：", ["JGAD000101", "https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000101"])],
      en
        ? [line("[GWAS stats]"), line(["hum0001.v1.gwas.v1", file("gwas.zip")]), line(["Dictionary file", file("dict.xlsx")]), line("[Individual datasets]"), line("Phenotype: ", ["JGAD000101", "https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000101"])]
        : [line(["hum0001.v1.gwas.v1", file("gwas.zip")]), line(["Dictionary file", file("dict.xlsx")]), line("Phenotype: ", ["JGAD000101", "https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000101"])],
    )

    it("loses the groups the file table shows in full and keeps the others", () => {
      const out = settleNbdcCells([dataset("d-1", [groups()])], context())

      expect(cellsOf(out.datasets[0] as DatasetContent)).toEqual([cell(
        [line("【個別データ】"), line("Phenotype：", ["JGAD000101", "https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000101"])],
        [line("[Individual datasets]"), line("Phenotype: ", ["JGAD000101", "https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000101"])],
      )])
      expect(out.dropped.map((one) => [one.whole, one.ja])).toEqual([[false, ["【GWAS集計情報】", "hum0001.v1.gwas.v1", "Dictionary file"]]])
    })

    it("stays whole where the two languages are not grouped the same way", () => {
      const one = dataset("d-1", [groups(false)])

      expect(cellsOf(settleNbdcCells([one], context()).datasets[0] as DatasetContent)).toEqual(cellsOf(one))
    })

    it("is taken out whole where the file table shows every group in full", () => {
      const out = settleNbdcCells([dataset("d-1", [cell([line("【GWAS】"), line(["hum0001.v1.gwas.v1", file("gwas.zip")])], [line("[GWAS]"), line(["hum0001.v1.gwas.v1", file("gwas.zip")])])])], context())

      expect(cellsOf(out.datasets[0] as DatasetContent)).toEqual([])
    })
  })
})
