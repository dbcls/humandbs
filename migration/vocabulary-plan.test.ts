import { describe, expect, it } from "vitest"

import type { DatasetContent, ValueSlot } from "~/content/types"

import { applyVocabularyFixes, plannedCodesOf, vocabularyPlanOf, type VocabularyFix } from "./vocabulary-plan"

const tsv = (...rows: string[][]) => rows.map((row) => row.join("\t")).join("\n")
const TERMS = tsv(["code", "label_en", "label_ja", "maker", "note"], ["grch37", "GRCh37", "", "", ""], ["grch38", "GRCh38", "", "", ""], ["t2t-chm13", "T2T-CHM13", "", "", ""])
const MAP = tsv(["from_code", "from_label", "to_codes", "note"], ["hg19", "hg19", "grch37", ""], ["hs37d5", "hs37d5", "grch37", ""], ["both", "both", "grch37,grch38", ""], ["mm10-note", "x", "-", ""], ["(空)", "ご教示ください", "-", ""])

const planOf = (fixes = "") => vocabularyPlanOf(new Map([
  ["reference-sequence-terms.tsv", TERMS],
  ["reference-sequence-map.tsv", MAP],
  ...(fixes === "" ? [] : [["reference-sequence-fixes.tsv", fixes] as [string, string]]),
]))

describe("vocabularyPlanOf", () => {
  it("places each minted code on one planned code, several, or none", () => {
    const plan = planOf()

    expect(plannedCodesOf(plan, "reference-sequence", "hg19")).toEqual(["grch37"])
    expect(plannedCodesOf(plan, "reference-sequence", "both")).toEqual(["grch37", "grch38"])
    expect(plannedCodesOf(plan, "reference-sequence", "mm10-note")).toEqual([])
    expect(plannedCodesOf(plan, "reference-sequence", "")).toEqual([])
  })

  it("leaves a set it has no map for to the minted terms", () => {
    expect(plannedCodesOf(planOf(), "tissue", "liver")).toBeNull()
  })

  it("stops on a minted code the map does not place", () => {
    expect(() => plannedCodesOf(planOf(), "reference-sequence", "hg18")).toThrow(/does not place/)
  })

  it("stops on a map or a fix naming a code the terms do not have", () => {
    expect(() => vocabularyPlanOf(new Map([
      ["reference-sequence-terms.tsv", TERMS],
      ["reference-sequence-map.tsv", tsv(["from_code", "from_label", "to_codes", "note"], ["hg19", "hg19", "hg19", ""])],
    ]))).toThrow(/hg19 → hg19/)
    expect(() => planOf(tsv(["hum", "dataset_id", "experiment_header", "add_codes", "remove_codes", "evidence"], ["hum0001", "JGAD000001", "WGS", "grch36", "", ""])))
      .toThrow(/grch36/)
  })

  it("reads the article a term links to", () => {
    const plan = vocabularyPlanOf(new Map([["policies-terms.tsv", tsv(["code", "label_en", "label_ja", "maker", "document", "note"], ["nbdc", "NBDC data sharing policy", "NBDC データ共有ポリシー", "", "nbdc-policy", ""])]]))

    expect(plan.terms.get("policies")?.[0]?.document).toBe("nbdc-policy")
  })

  it("reads the terms with an empty Japanese label and maker as none", () => {
    expect(planOf().terms.get("reference-sequence")?.[0]).toEqual({ code: "grch37", labelEn: "GRCh37", labelJa: null, maker: null, document: null })
  })
})

describe("applyVocabularyFixes", () => {
  const vocab = (keyId: string, ...termIds: string[]): ValueSlot => ({ keyId, value: { kind: "vocabulary", termIds: { state: "value", value: termIds } } })
  const experiment = (id: string, label: string, values: ValueSlot[]) => ({ id, label: { state: "value" as const, value: label }, values })
  const dataset = (...experiments: DatasetContent["experiments"]): DatasetContent => ({ releaseDate: null, fileSelection: [], values: [], experiments })
  const target = {
    hum: "hum0001",
    datasetId: "JGAD000001",
    keyIdOfSet: (setCode: string) => setCode === "reference-sequence" ? "k-ref" : undefined,
    termIdOf: (_: string, code: string) => ({ grch37: "t37", grch38: "t38" } as Record<string, string>)[code],
  }
  const fix = (header: string, add: string[], remove: string[] = [], datasetId = "JGAD000001"): VocabularyFix =>
    ({ setCode: "reference-sequence", hum: "hum0001", datasetId, header, add, remove })

  it("adds and removes terms on the experiment the heading names, keeping the other values in place", () => {
    const before = dataset(experiment("experiment-1", "WGS", [vocab("k-other", "x"), vocab("k-ref", "t37"), vocab("k-last", "y")]))
    const { dataset: after, applied } = applyVocabularyFixes(before, [fix("WGS", ["grch38"], ["grch37"])], target)

    expect(after.experiments[0]?.values).toEqual([vocab("k-other", "x"), vocab("k-ref", "t38"), vocab("k-last", "y")])
    expect(applied.size).toBe(1)
  })

  it("adds a value the experiment did not have, and does not add a term twice", () => {
    const { dataset: after } = applyVocabularyFixes(
      dataset(experiment("experiment-1", "WGS", []), experiment("experiment-2", "RNA-seq", [vocab("k-ref", "t37")])),
      [fix("WGS", ["grch37"]), fix("RNA-seq", ["grch37"])],
      target,
    )

    expect(after.experiments.map((one) => one.values)).toEqual([[vocab("k-ref", "t37")], [vocab("k-ref", "t37")]])
  })

  it("removes the value when no term is left", () => {
    const { dataset: after } = applyVocabularyFixes(dataset(experiment("experiment-1", "WGS", [vocab("k-ref", "t37")])), [fix("WGS", [], ["grch37"])], target)

    expect(after.experiments[0]?.values).toEqual([])
  })

  it("tells experiments with one label apart by their id, and only then", () => {
    const before = dataset(experiment("experiment-1", "WGS", []), experiment("experiment-2", "WGS", []), experiment("experiment-3", "RNA-seq", []))
    const { dataset: after, applied } = applyVocabularyFixes(before, [fix("WGS [experiment-2]", ["grch38"]), fix("WGS", ["grch37"]), fix("RNA-seq [experiment-3]", ["grch37"])], target)

    expect(after.experiments.map((one) => one.values)).toEqual([[], [vocab("k-ref", "t38")], [vocab("k-ref", "t37")]])
    expect(applied.size).toBe(2)
  })

  it("leaves another dataset alone", () => {
    const before = dataset(experiment("experiment-1", "WGS", []))
    const { dataset: after, applied } = applyVocabularyFixes(before, [fix("WGS", ["grch37"], [], "JGAD000002")], target)

    expect(after).toBe(before)
    expect(applied.size).toBe(0)
  })
})
