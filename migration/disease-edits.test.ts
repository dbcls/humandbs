import { describe, expect, it } from "vitest"

import type { DiseaseValue } from "~/content/types"

import type { SourceDatasetContent } from "./number-words"
import { assertDiseaseEditsApplied, type DiseaseEdit, editDiseases } from "./disease-edits"

const disease = (nameJa: string | null, nameEn: string | null, termIds: string[] = ["t-1"]): DiseaseValue => ({ termIds, nameJa, nameEn })

const datasetWith = (...diseases: DiseaseValue[]): SourceDatasetContent => ({
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

const diseasesOf = (dataset: SourceDatasetContent): DiseaseValue[] | null => {
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

  it("drops a value from the dataset the edit names only", () => {
    const edit: DiseaseEdit = { hum: "hum0257", dataset: "JGAD000633", nameJa: "膵管内乳頭粘液性腫瘍", nameEn: "Intraductal papillary mucinous neoplasm", drop: true }
    const both = () => datasetWith(disease("膵管がん", "Pancreatic ductal adenocarcinoma"), disease("膵管内乳頭粘液性腫瘍", "Intraductal papillary mucinous neoplasm"))
    const applied = new Set<DiseaseEdit>()

    expect(diseasesOf(editDiseases(both(), "hum0257", [edit], applied, undefined, "JGAD000366"))).toHaveLength(2)
    expect(applied.size).toBe(0)
    expect(diseasesOf(editDiseases(both(), "hum0257", [edit], applied, undefined, "JGAD000633"))?.map((one) => one.nameJa)).toEqual(["膵管がん"])
    expect(applied.has(edit)).toBe(true)
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
  it("takes the edit naming the dataset over one for the whole research", () => {
    const rename: DiseaseEdit = { hum: "hum0094", nameJa: "肝転移を有さない大腸がん", nameEn: "CRC without liver metastasis", set: { nameJa: "大腸がん", nameEn: "CRC" } }
    const drop: DiseaseEdit = { hum: "hum0094", dataset: "JGAD000095", nameJa: "肝転移を有さない大腸がん", nameEn: "CRC without liver metastasis", drop: true }
    const held = () => datasetWith(disease("乳がん", "Breast cancer"), disease("肝転移を有さない大腸がん", "CRC without liver metastasis"))
    const applied = new Set<DiseaseEdit>()

    expect(diseasesOf(editDiseases(held(), "hum0094", [rename, drop], applied, undefined, "JGAD000095"))).toEqual([disease("乳がん", "Breast cancer")])
    expect(diseasesOf(editDiseases(held(), "hum0094", [rename, drop], applied, undefined, "JGAD000139"))).toEqual([disease("乳がん", "Breast cancer"), disease("大腸がん", "CRC")])
    expect(applied).toEqual(new Set([rename, drop]))
  })

  it("tells two values of the same names apart by the codes the edit names", () => {
    const codeOf = (termId: string) => ({ "t-c349": "C349", "t-c34": "C34" })[termId]
    const edit: DiseaseEdit = { hum: "hum0094", dataset: "JGAD000110", nameJa: "肺腺がん", nameEn: "Lung adenocarcinoma", codes: ["C34"], drop: true }
    const both = () => datasetWith(disease("肺腺がん", "Lung adenocarcinoma", ["t-c349"]), disease("肺腺がん", "Lung adenocarcinoma", ["t-c34"]))
    const applied = new Set<DiseaseEdit>()

    expect(diseasesOf(editDiseases(both(), "hum0094", [edit], applied, undefined, "JGAD000110", codeOf))).toEqual([disease("肺腺がん", "Lung adenocarcinoma", ["t-c349"])])
    expect(applied.has(edit)).toBe(true)
  })

  it("lands nowhere when it names codes and no code can be looked up", () => {
    const edit: DiseaseEdit = { hum: "hum0094", nameJa: "肺腺がん", nameEn: "Lung adenocarcinoma", codes: ["C34"], drop: true }
    const held = datasetWith(disease("肺腺がん", "Lung adenocarcinoma", ["t-c34"]))
    const applied = new Set<DiseaseEdit>()

    expect(diseasesOf(editDiseases(held, "hum0094", [edit], applied))).toHaveLength(1)
    expect(applied.size).toBe(0)
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
