import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { DiseaseValue } from "~/content/types"

import type { SourceDatasetContent } from "./number-words"
import { type DiseaseEdit, editDiseases } from "./disease-edits"

const CODES = ["C34", "C349", "C50", "C18"]
const codeOf = (termId: string) => termId.slice("t-".length)

const datasetWith = (diseases: DiseaseValue[]): SourceDatasetContent => ({
  releaseDate: null,
  fileSelection: [],
  values: [],
  experiments: [{
    id: "experiment-1",
    label: { state: "value", value: "WES" },
    values: [{ keyId: "k-disease", value: { kind: "disease", diseases: { state: "value", value: diseases } } }],
  }],
})

const diseasesOf = (dataset: SourceDatasetContent): DiseaseValue[] => {
  const slot = dataset.experiments[0]?.values.find((one) => one.value.kind === "disease")
  return slot?.value.kind === "disease" && slot.value.diseases.state === "value" ? slot.value.diseases.value : []
}

const value = fc.record({
  termIds: fc.subarray(CODES, { minLength: 1 }).map((codes) => codes.map((code) => `t-${code}`)),
  nameJa: fc.constantFrom("肺腺がん", "大腸がん"),
  nameEn: fc.constantFrom("Lung adenocarcinoma", "CRC"),
})

describe("editDiseases", () => {
  it("drops by names and codes only the values with those names and exactly those codes", () => {
    fc.assert(fc.property(fc.array(value, { maxLength: 6 }), value, (held, target) => {
      const codes = target.termIds.map(codeOf)
      const edit: DiseaseEdit = { hum: "hum0094", nameJa: target.nameJa, nameEn: target.nameEn, codes, drop: true }
      const matches = (one: DiseaseValue) => one.nameJa === target.nameJa && one.nameEn === target.nameEn
        && one.termIds.length === codes.length && one.termIds.every((id) => codes.includes(codeOf(id)))
      const kept = diseasesOf(editDiseases(datasetWith(held), "hum0094", [edit], new Set(), undefined, undefined, codeOf))

      expect(kept.some(matches)).toBe(false)
      for (const one of held.filter((candidate) => !matches(candidate))) {
        expect(kept).toContainEqual(one)
      }
    }))
  })
})
