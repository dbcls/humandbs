import { describe, expect, it } from "vitest"

import type { ContentKeySeed } from "./catalog"
import {
  applyKeyFixes,
  CATALOG_MERGES,
  moveImputationLines,
  moveMisfiledJgaAccessions,
  reshapeCatalog,
} from "./catalog-plan"
import type { EsExperiment } from "./es"
import { applyKeyRules, followedRules, type KeyRule } from "./prepare"

const cell = (ja: string, en = ja) => ({ ja: { text: ja, rawHtml: null }, en: { text: en, rawHtml: null } })
const experiment = (data: NonNullable<EsExperiment["data"]>): EsExperiment => ({ data })
const text = (e: EsExperiment, key: string, lang: "ja" | "en" = "ja") => e.data?.[key]?.[lang]?.text

describe("merging keys with headings", () => {
  it("puts each language's own heading in front of the value it moves", () => {
    const e = experiment({ Blocking: cell("正常ヤギ血清", "Normal goat serum") })
    applyKeyRules(e, CATALOG_MERGES)

    expect(e.data).toEqual({ "Sample Preparation": cell("ブロッキング: 正常ヤギ血清", "Blocking: Normal goat serum") })
  })

  it("adds a moved line after what the key holds, and not a line it already holds", () => {
    const e = experiment({
      Normalization: cell("NPX manager"),
      Validation: cell("NPX manager"),
    })
    applyKeyRules(e, new Map<string, KeyRule>([["Validation", { action: "merge-into", to: "Normalization" }]]))

    expect(text(e, "Normalization")).toBe("NPX manager")
  })

  it("lands a key merged into a merged key where the second one goes", () => {
    const rules = followedRules(new Map<string, KeyRule>([
      ["フィルタリング後のマーカー数", { action: "merge-into", to: "Marker Number after Filtering" }],
      ["Marker Number after Filtering", { action: "merge-into", to: "Variant Number" }],
    ]))

    expect(rules.get("フィルタリング後のマーカー数")).toEqual({ action: "merge-into", to: "Variant Number" })
  })

  it("refuses rules that go round in a circle", () => {
    expect(() => followedRules(new Map<string, KeyRule>([
      ["A", { action: "merge-into", to: "B" }],
      ["B", { action: "merge-into", to: "A" }],
    ]))).toThrow(/circle/)
  })
})

describe("moveImputationLines", () => {
  it("moves the imputation lines and keeps the rest of the analysis", () => {
    const e = experiment({ "Analysis Methods": cell("PLINK2 による関連解析\nMinimac4 (1000 Genomes)", "PLINK2\nMinimac4 (1000 Genomes)") })
    moveImputationLines(e)

    expect(text(e, "Analysis Methods")).toBe("PLINK2 による関連解析")
    expect(text(e, "Imputation")).toBe("Minimac4 (1000 Genomes)")
    expect(text(e, "Imputation", "en")).toBe("Minimac4 (1000 Genomes)")
  })

  it("leaves a line that names genotype calling as well, since it cannot be cut", () => {
    const e = experiment({ "Analysis Methods": cell("GenomeStudio for genotyping, minimac3 for imputation") })
    moveImputationLines(e)

    expect(e.data).toEqual({ "Analysis Methods": cell("GenomeStudio for genotyping, minimac3 for imputation") })
  })

  it("adds to an imputation key already there without repeating a line", () => {
    const e = experiment({ "Analysis Methods": cell("Beagle 5.1"), "Imputation": cell("Beagle 5.1") })
    moveImputationLines(e)

    expect(e.data).toEqual({ Imputation: cell("Beagle 5.1") })
  })
})

describe("moveMisfiledJgaAccessions", () => {
  const JGA = "Japanese Genotype-phenotype Archive Dataset Accession"
  const SRA = "Sequence Read Archive Accession"

  it("moves the English half of a JGA row that landed in the SRA key", () => {
    const link = "[JGAD000032](https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000032)"
    const e = experiment({ [JGA]: cell(link, ""), [SRA]: cell("", link) })
    moveMisfiledJgaAccessions(e)

    expect(e.data).toEqual({ [JGA]: cell(link, link) })
  })

  it("leaves a key that lists another archive's accession too", () => {
    const mixed = "① [JGAD000261](x)\n② [DRA008482](y)"
    const e = experiment({ [SRA]: cell(mixed) })
    moveMisfiledJgaAccessions(e)

    expect(e.data).toEqual({ [SRA]: cell(mixed) })
  })

  it("does not overwrite a JGA key that says something else", () => {
    const e = experiment({ [JGA]: cell("JGAD000001"), [SRA]: cell("JGAD000002") })
    moveMisfiledJgaAccessions(e)

    expect(text(e, SRA)).toBe("JGAD000002")
  })
})

describe("applyKeyFixes", () => {
  it("moves one research's row that v1 put under the wrong heading, with its own heading", () => {
    const e = experiment({ "Histological Staining": cell("BWA-MEM で HHV-6 リードを整列", "aligned with BWA-MEM") })
    applyKeyFixes("hum0238", e, [{ hum: "hum0238", from: "Histological Staining", to: "Analysis Methods", labelJa: "HHV-6配列構築方法", labelEn: "HHV-6 sequence construction" }])

    expect(e.data).toEqual({ "Analysis Methods": cell("HHV-6配列構築方法: BWA-MEM で HHV-6 リードを整列", "HHV-6 sequence construction: aligned with BWA-MEM") })
  })

  it("touches only the research named, and only a value that matches", () => {
    const fixes = [{ hum: "hum0197", from: "Reference Sequence", match: "GitHub", to: null }]
    const other = experiment({ "Reference Sequence": cell("上記GitHubリポジトリを参照") })
    applyKeyFixes("hum0343", other, fixes)
    const kept = experiment({ "Reference Sequence": cell("GRCh38") })
    applyKeyFixes("hum0197", kept, fixes)

    expect(text(other, "Reference Sequence")).toBe("上記GitHubリポジトリを参照")
    expect(text(kept, "Reference Sequence")).toBe("GRCh38")
  })
})

describe("reshapeCatalog", () => {
  const seed = (code: string, position: number): ContentKeySeed => ({
    code, scope: "experiment", valueType: "text", labelJa: code, labelEn: code, position,
    vocabularySetCode: null, facetCategoryCode: null, multiple: false, canonicalUnit: null, inputUnits: null,
  })
  const seeds = {
    keys: [seed("cell-lines", 3), seed("targets", 5), seed("measurement", 21)],
    codeBySourceKey: new Map([["Cell Lines", "cell-lines"], ["Targets", "targets"], ["Measurement", "measurement"]]),
  }

  it("renames, relabels and reorders as planned, and resolves the old spelling to the new code", () => {
    const shaped = reshapeCatalog(seeds, [
      { code: "targets", labelJa: "測定対象", labelEn: "Targets", position: 1 },
      { code: "sample-provider", labelJa: "試料の入手元", labelEn: "Sample provider", position: 0, seededAs: "cell-lines" },
    ], new Set(["measurement"]))

    expect(shaped.keys.map((key) => [key.code, key.labelJa, key.position])).toEqual([["sample-provider", "試料の入手元", 0], ["targets", "測定対象", 1]])
    expect(shaped.codeBySourceKey.get("Cell Lines")).toBe("sample-provider")
  })

  it("refuses a seeded key the plan does not place and nothing removed", () => {
    expect(() => reshapeCatalog(seeds, [{ code: "targets", labelJa: "", labelEn: "", position: 0 }], new Set())).toThrow(/cell-lines/)
  })

  it("refuses a planned key nothing seeded", () => {
    expect(() => reshapeCatalog(seeds, [{ code: "nowhere", labelJa: "", labelEn: "", position: 0 }], new Set(["cell-lines", "targets", "measurement"])))
      .toThrow(/nowhere/)
  })
})
