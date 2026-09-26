import { describe, expect, it } from "vitest"

import { DASH, headingKeys, restoreDashes } from "./dashes"
import type { EsDataset } from "./es"
import type { KeyRule } from "./prepare"
import type { PageArticle } from "./research-pages"

const TSV = [
  "日本語版の値\t英語版の値\t正規化・日本語\t正規化・英語",
  "断片化の方法\tFragmentation Methods\t断片化方法\tFragmentation",
  "検体情報（購入の場合）\tCell Lines\t購入検体情報\tCell Lines",
  "対象領域（Target Captureの場合）\tTarget Loci for Capture Methods\t対象領域\tTargets",
  "プラットフォーム\tPlatform\tプラットフォーム\tPlatform",
  "リード長\tRead Length\tリード長\tRead Length",
].join("\n")

const table = (rows: [string, string][]) =>
  `<table><tbody>${rows.map(([head, value]) => `<tr><td>${head}</td><td>${value}</td></tr>`).join("")}</tbody></table>`

const page = (title: string, catid: number, html: string, state = 1): PageArticle => ({ title, catid, state, introtext: html })

const experiment = (data: Record<string, { ja?: string, en?: string }>) => ({
  data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, {
    ja: value.ja === undefined ? null : { text: value.ja, rawHtml: null },
    en: value.en === undefined ? null : { text: value.en, rawHtml: null },
  }])),
})

const doc = (experiments: ReturnType<typeof experiment>[], humVersionId = "hum0001-v1"): EsDataset & { humVersionId: string } =>
  ({ datasetId: "JGAD000001", version: "v1", humId: "hum0001", humVersionId, experiments })

const ja = (...tables: string[]) => page("hum0001.v1", 10, tables.join(""))
const en = (...tables: string[]) => page("hum0001.v1", 16, tables.join(""))

const heldTable = table([["プラットフォーム", "Illumina HiSeq 2500"], ["リード長", "100 bp"], ["断片化の方法", "-"], ["検体情報（購入の場合）", "－"]])
const heldTableEn = table([["Platform", "Illumina HiSeq 2500"], ["Read Length", "100 bp"], ["Fragmentation Methods", "-"], ["Cell Lines", "-"]])

describe("DASH", () => {
  it("is a dash of any width and nothing else", () => {
    for (const cell of ["-", "－", " ― ", "—", "–", "‐", "ー"]) expect(DASH.test(cell), cell).toBe(true)
    for (const cell of ["", "NA", "-1", "HLA-A", "- none"]) expect(DASH.test(cell), cell).toBe(false)
  })
})

describe("restoreDashes", () => {
  const rules = new Map<string, KeyRule>()

  it("puts a dash back into the key each dash row's heading goes to, in each language", () => {
    const one = experiment({ "Platform": { ja: "Illumina HiSeq 2500", en: "Illumina HiSeq 2500" }, "Read Length": { ja: "100 bp", en: "100 bp" } })
    const counts = restoreDashes([doc([one])], [{ site: "prod", articles: [ja(heldTable), en(heldTableEn)] }], headingKeys(TSV), rules)

    expect(one.data.Fragmentation).toEqual({ ja: { text: "-", rawHtml: null }, en: { text: "-", rawHtml: null } })
    expect(one.data["Cell Lines"]).toEqual({ ja: { text: "-", rawHtml: null }, en: { text: "-", rawHtml: null } })
    expect(counts).toMatchObject({ matched: 1, unmatched: 0, restored: 4 })
  })

  it("keeps a value another row put into the same key", () => {
    const one = experiment({ "Platform": { ja: "Illumina HiSeq 2500" }, "Read Length": { ja: "100 bp" }, "Targets": { ja: "全遺伝子" } })
    const withTarget = table([["プラットフォーム", "Illumina HiSeq 2500"], ["リード長", "100 bp"], ["対象領域（Target Captureの場合）", "-"]])
    restoreDashes([doc([one])], [{ site: "prod", articles: [ja(withTarget)] }], headingKeys(TSV), rules)

    expect(one.data.Targets?.ja?.text).toBe("全遺伝子")
  })

  it("puts nothing into a language whose key the other language has a value for", () => {
    const one = experiment({ "Platform": { ja: "Illumina HiSeq 2500", en: "Illumina HiSeq 2500" }, "Read Length": { ja: "100 bp", en: "100 bp" }, "Targets": { ja: "全遺伝子" } })
    const withTarget = table([["Platform", "Illumina HiSeq 2500"], ["Read Length", "100 bp"], ["Target Loci for Capture Methods", "-"]])
    restoreDashes([doc([one])], [{ site: "prod", articles: [en(withTarget)] }], headingKeys(TSV), rules)

    expect(one.data.Targets).toEqual({ ja: { text: "全遺伝子", rawHtml: null }, en: null })
  })

  it("follows the key rules, and puts nothing into a key they drop", () => {
    const one = experiment({ "Platform": { ja: "Illumina HiSeq 2500" }, "Read Length": { ja: "100 bp" } })
    const merged = new Map<string, KeyRule>([["Fragmentation", { action: "merge-into", to: "Sample Processing" }], ["Cell Lines", { action: "drop" }]])
    restoreDashes([doc([one])], [{ site: "prod", articles: [ja(heldTable)] }], headingKeys(TSV), merged)

    expect(Object.keys(one.data).toSorted()).toEqual(["Platform", "Read Length", "Sample Processing"])
  })

  it("takes the table whose other rows are the experiment's, not another dataset's", () => {
    const other = table([["プラットフォーム", "NovaSeq 6000"], ["リード長", "150 bp"], ["断片化の方法", "-"]])
    const mine = table([["プラットフォーム", "Illumina HiSeq 2500"], ["リード長", "100 bp"], ["検体情報（購入の場合）", "-"]])
    const one = experiment({ "Platform": { ja: "Illumina HiSeq 2500" }, "Read Length": { ja: "100 bp" } })
    restoreDashes([doc([one])], [{ site: "prod", articles: [ja(other, mine)] }], headingKeys(TSV), rules)

    expect(Object.keys(one.data).toSorted()).toEqual(["Cell Lines", "Platform", "Read Length"])
  })

  it("reads the page of the version the dataset was listed in, then the drafts' site, then the other versions", () => {
    const one = experiment({ "Platform": { ja: "Illumina HiSeq 2500" }, "Read Length": { ja: "100 bp" } })
    const later = page("hum0001.v2", 10, heldTable)
    const counts = restoreDashes([doc([one], "hum0001-v3")], [{ site: "prod", articles: [later] }], headingKeys(TSV), rules)

    expect(counts.matched).toBe(1)
    expect(one.data.Fragmentation?.ja?.text).toBe("-")
  })

  it("counts an experiment no table is the one of, and puts nothing back", () => {
    const one = experiment({ "Platform": { ja: "NovaSeq 6000" }, "Read Length": { ja: "150 bp" } })
    const counts = restoreDashes([doc([one])], [{ site: "prod", articles: [ja(heldTable)] }], headingKeys(TSV), rules)

    expect(counts).toMatchObject({ matched: 0, unmatched: 1, restored: 0 })
    expect(Object.keys(one.data)).toEqual(["Platform", "Read Length"])
  })

  it("does not take a table from one shared value alone", () => {
    const one = experiment({ "Platform": { ja: "Illumina HiSeq 2500" }, "Read Length": { ja: "150 bp" } })
    const counts = restoreDashes([doc([one])], [{ site: "prod", articles: [ja(heldTable)] }], headingKeys(TSV), rules)

    expect(counts.matched).toBe(0)
  })

  it("names a dash row whose heading v1's table does not have", () => {
    const one = experiment({ "Platform": { ja: "Illumina HiSeq 2500" }, "Read Length": { ja: "100 bp" } })
    const odd = table([["プラットフォーム", "Illumina HiSeq 2500"], ["リード長", "100 bp"], ["規模", "-"]])
    const counts = restoreDashes([doc([one])], [{ site: "prod", articles: [ja(odd)] }], headingKeys(TSV), rules)

    expect([...counts.unknownHeadings]).toEqual([["規模", 1]])
  })
})
