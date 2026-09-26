import { describe, expect, it } from "vitest"

import type { DatasetContent, DiseaseValue } from "~/content/types"

import { assertDiseaseEditsApplied, type DiseaseEdit, editDiseases } from "./disease-edits"

const disease = (nameJa: string | null, nameEn: string | null, termIds: string[] = ["t-1"]): DiseaseValue => ({ termIds, nameJa, nameEn })

const datasetWith = (...diseases: DiseaseValue[]): DatasetContent => ({
  releaseDate: null,
  fileSelection: [],
  values: [],
  experiments: [{
    id: "experiment-1",
    label: { state: "value", value: "WGS" },
    values: [
      { keyId: "k-text", value: { kind: "text", text: { ja: { state: "value", value: [] }, en: { state: "value", value: [] } } } },
      { keyId: "k-disease", value: { kind: "disease", diseases: { state: "value", value: diseases } } },
    ],
  }],
})

const diseasesOf = (dataset: DatasetContent): DiseaseValue[] | null => {
  const slot = dataset.experiments[0]?.values.find((one) => one.value.kind === "disease")
  if (slot?.value.kind !== "disease" || slot.value.diseases.state !== "value") return null
  return slot.value.diseases.value
}

describe("editDiseases", () => {
  it("gives the value the names the edit sets and keeps the rest", () => {
    const applied = new Set<DiseaseEdit>()
    const one: DiseaseEdit = { hum: "hum0005", nameJa: "非症候群性難聴", nameEn: null, set: { nameEn: "non-syndromic hearing loss patients" } }
    const edited = editDiseases(datasetWith(disease("非症候群性難聴", null), disease("難聴", "hearing loss")), "hum0005", [one], applied)

    expect(diseasesOf(edited)).toEqual([
      disease("非症候群性難聴", "non-syndromic hearing loss patients"),
      disease("難聴", "hearing loss"),
    ])
    expect(applied.has(one)).toBe(true)
  })

  it("finds the value by both names, a missing one included", () => {
    const applied = new Set<DiseaseEdit>()
    const one: DiseaseEdit = { hum: "hum0005", nameJa: "非症候群性難聴", nameEn: null, set: { nameEn: "x" } }
    const kept = datasetWith(disease("非症候群性難聴", "non-syndromic hearing loss"))

    expect(editDiseases(kept, "hum0005", [one], applied)).toEqual(kept)
    expect(applied.size).toBe(0)
  })

  it("leaves the values of another research as they were", () => {
    const applied = new Set<DiseaseEdit>()
    const one: DiseaseEdit = { hum: "hum0006", nameJa: "乾癬", nameEn: null, set: { nameEn: "Psoriasis" } }
    const held = datasetWith(disease("乾癬", null))

    expect(editDiseases(held, "hum0005", [one], applied)).toBe(held)
    expect(applied.size).toBe(0)
  })

  it("drops a value, and the slot with its last value", () => {
    const one: DiseaseEdit = { hum: "hum0468", nameJa: null, nameEn: "Co-cultures", drop: true }
    const two = editDiseases(datasetWith(disease("関節リウマチ", "rheumatoid arthritis"), disease(null, "Co-cultures")), "hum0468", [one], new Set())
    const alone = editDiseases(datasetWith(disease(null, "Co-cultures")), "hum0468", [one], new Set())

    expect(diseasesOf(two)).toEqual([disease("関節リウマチ", "rheumatoid arthritis")])
    expect(alone.experiments[0]?.values.map((slot) => slot.keyId)).toEqual(["k-text"])
  })

  it("makes one value of two the edits make the same", () => {
    const edits: DiseaseEdit[] = [
      { hum: "hum0440", nameJa: "内2症例は重症筋無力症", nameEn: "cases", set: { nameJa: "重症筋無力症", nameEn: "myasthenia gravis" } },
      { hum: "hum0440", nameJa: "重症筋無力症", nameEn: "cases", set: { nameEn: "myasthenia gravis" } },
    ]
    const edited = editDiseases(datasetWith(disease("内2症例は重症筋無力症", "cases"), disease("重症筋無力症", "cases")), "hum0440", edits, new Set())

    expect(diseasesOf(edited)).toEqual([disease("重症筋無力症", "myasthenia gravis")])
  })

  it("keeps two values with the same names and other codes apart", () => {
    const one: DiseaseEdit = { hum: "hum0001", nameJa: "がん", nameEn: null, set: { nameEn: "cancer" } }
    const edited = editDiseases(datasetWith(disease("がん", null, ["t-1"]), disease("がん", "cancer", ["t-2"])), "hum0001", [one], new Set())

    expect(diseasesOf(edited)).toEqual([disease("がん", "cancer", ["t-1"]), disease("がん", "cancer", ["t-2"])])
  })
})

describe("assertDiseaseEditsApplied", () => {
  it("stops the load when an edit found nothing, and names it", () => {
    const one: DiseaseEdit = { hum: "hum0005", nameJa: "難聴", nameEn: null }
    expect(() => {
      assertDiseaseEditsApplied([one], new Set())
    }).toThrow(/hum0005 "難聴" \/ null/)
    expect(() => {
      assertDiseaseEditsApplied([one], new Set([one]))
    }).not.toThrow()
  })

  it("names the values the research has, for finding what the edit meant", () => {
    const one: DiseaseEdit = { hum: "hum0005", nameJa: "難聴", nameEn: null }
    const seen = new Map<string, Set<string>>()
    editDiseases(datasetWith(disease("非症候群性難聴", "hearing loss")), "hum0005", [one], new Set(), seen)

    expect(() => {
      assertDiseaseEditsApplied([one], new Set(), seen)
    }).toThrow(/the research has\n {4}"非症候群性難聴" \/ "hearing loss"/)
  })
})
