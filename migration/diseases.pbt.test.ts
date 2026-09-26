import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { diseasesIn, mentionsIn } from "./diseases"

/** Names as the articles write them: words of either script, brackets of their own included. */
const nameArb = fc.array(
  fc.constantFrom("肺腺がん", "胃がん", "Lung", "adenocarcinoma", "MSI-H", "（SCNEC）", "(CMT)", "2型糖尿病", "trisomy 18", "IgG4関連疾患"),
  { minLength: 1, maxLength: 3 },
).map((words) => words.join(" "))

/** A code, written with or without its point. */
const codeArb = fc.record({
  letter: fc.constantFrom("C", "E", "G", "M", "Q"),
  digits: fc.integer({ min: 0, max: 99 }).map((n) => String(n).padStart(2, "0")),
  fourth: fc.option(fc.integer({ min: 0, max: 9 }).map(String), { nil: undefined }),
  point: fc.boolean(),
}).map(({ letter, digits, fourth, point }) => ({
  written: `${letter}${digits}${fourth === undefined ? "" : `${point ? "." : ""}${fourth}`}`,
  code: `${letter}${digits}${fourth ?? ""}`,
}))

const annotationArb = fc.constantFrom(
  (codes: string) => `（ICD10：${codes}）`,
  (codes: string) => ` (ICD10: ${codes})`,
  (codes: string) => ` [ICD10：${codes}]`,
  (codes: string) => `(ICD-10:${codes})`,
)

const countArb = fc.constantFrom("", "：12症例", ": 3 cases", "：1,005症例（10検体）")

describe("mentionsIn", () => {
  it("reads every disease of a line with its own name and codes, whatever the brackets and counts around it", () => {
    fc.assert(fc.property(
      fc.array(fc.record({ name: nameArb, codes: fc.uniqueArray(codeArb, { minLength: 1, maxLength: 3, selector: (one) => one.code }), annotate: annotationArb, count: countArb }), { minLength: 1, maxLength: 4 }),
      (diseases) => {
        const line = diseases.map((one) => `${one.name}${one.annotate(one.codes.map((code) => code.written).join(", "))}${one.count}`).join("、")
        expect(mentionsIn(line)).toEqual(diseases.map((one) => ({ codes: one.codes.map((code) => code.code), name: one.name })))
      },
    ))
  })

  it("reads the same diseases from a line wrapped in a bracket that groups them", () => {
    fc.assert(fc.property(nameArb, fc.array(fc.tuple(nameArb, codeArb), { minLength: 1, maxLength: 3 }), (group, members) => {
      const inner = members.map(([name, code]) => `${name}（ICD10：${code.written}）`).join("、")
      expect(mentionsIn(`${group} [${inner}]`).map((one) => one.name)).toEqual(members.map(([name]) => name))
    }))
  })
})

describe("diseasesIn", () => {
  it("pairs each disease with the other language's whatever order either wrote them in", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.tuple(codeArb, nameArb, nameArb), { minLength: 1, maxLength: 5, selector: ([code]) => code.code }),
      fc.infiniteStream(fc.boolean()),
      (diseases, flips) => {
        const ja = diseases.map(([code, name]) => `${name}（ICD10：${code.written}）`).join("\n")
        const shuffled = diseases.toSorted(() => (flips.next().value ? 1 : -1))
        const en = shuffled.map(([code, , name]) => `${name} (ICD10: ${code.written})`).join("\n")
        const held = diseasesIn(ja, en)
        expect(held).toHaveLength(diseases.length)
        for (const [code, nameJa, nameEn] of diseases) {
          expect(held).toContainEqual({ codes: [code.code], nameJa, nameEn })
        }
      },
    ))
  })
})
