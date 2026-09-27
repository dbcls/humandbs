import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Line } from "~/content/types"
import type { FieldView, ValueView } from "~/public/view.server"

import { CHIPS_UNDER, experimentRows, onOneLine } from "./experiment-chips"

function value(code: string): ValueView {
  return { keyId: `k-${code}`, code, label: code, field: { state: "plain", text: code, untranslated: false } }
}

/** What the rows draw, as codes: a row's own key, and its chips after a `>`. */
function shape(values: ValueView[]): string[] {
  return experimentRows(values).map((row) => row.chips.length === 0
    ? row.value.code
    : `${row.value.code} > ${row.chips.map((chip) => chip.countedAs === undefined ? chip.value.code : `${chip.value.code}+${chip.countedAs.code}`).join(" ")}`)
}

describe("experimentRows", () => {
  it("draws the short classifications of the participants and the samples under the paragraph they were read from", () => {
    const codes = [
      "materials-and-participants", "disease", "health-status", "subject-count", "subject-count-type", "population",
      "sample-description", "tissue", "is-tumor", "cell-line", "platform",
    ]

    expect(shape(codes.map(value))).toEqual([
      "materials-and-participants > health-status subject-count+subject-count-type population",
      "disease",
      "sample-description > tissue is-tumor",
      "cell-line",
      "platform",
    ])
  })

  it("draws how the subjects were counted as a chip of its own where there is no count", () => {
    expect(shape(["materials-and-participants", "subject-count-type"].map(value)))
      .toEqual(["materials-and-participants > subject-count-type"])
  })

  it("draws the count alone where how it was counted is not written", () => {
    expect(shape(["materials-and-participants", "subject-count"].map(value)))
      .toEqual(["materials-and-participants > subject-count"])
  })

  it("keeps a classification as a row of its own where the paragraph it belongs under is not there", () => {
    expect(shape(["disease", "health-status", "subject-count", "subject-count-type", "tissue"].map(value)))
      .toEqual(["disease", "health-status", "subject-count", "subject-count-type", "tissue"])
  })

  it("draws a paragraph with nothing under it as a plain row", () => {
    expect(shape(["materials-and-participants", "sample-description"].map(value)))
      .toEqual(["materials-and-participants", "sample-description"])
  })

  it("draws every value once and keeps the rows in the order they came", () => {
    const codes = [...new Set([...CHIPS_UNDER].flatMap(([under, chips]) => [under, ...chips]))]
    const others = ["disease", "cell-line", "platform", "reference-sequence", "total-data-volume"]
    fc.assert(fc.property(fc.subarray([...codes, ...others]), fc.boolean(), (picked, shuffle) => {
      const values = (shuffle ? picked.toReversed() : picked).map(value)
      const rows = experimentRows(values)
      const drawn = rows.flatMap((row) => [row.value, ...row.chips.flatMap((chip) => chip.countedAs === undefined ? [chip.value] : [chip.value, chip.countedAs])])

      expect(drawn.map((one) => one.code).toSorted()).toEqual(values.map((one) => one.code).toSorted())
      const order = values.map((one) => one.code)
      const rowOrder = rows.map((row) => order.indexOf(row.value.code))
      expect(rowOrder).toEqual(rowOrder.toSorted((a, b) => a - b))
    }))
  })
})

describe("onOneLine", () => {
  function rich(text: string[][]): FieldView {
    return { state: "rich", text: text.map((line) => line.map((one) => ({ text: one }))), untranslated: false }
  }

  it("runs a line each into one line with the Japanese page's separator", () => {
    expect(onOneLine(rich([["末梢血"], ["腫瘍組織"], ["正常組織"]]), "ja"))
      .toEqual(rich([["末梢血", "、", "腫瘍組織", "、", "正常組織"]]))
  })

  it("runs them together with a comma and a space on the English page", () => {
    expect(onOneLine(rich([["Peripheral blood"], ["Tumor tissue"]]), "en"))
      .toEqual(rich([["Peripheral blood", ", ", "Tumor tissue"]]))
  })

  it("keeps a link on the value it belongs to", () => {
    const field: FieldView = {
      state: "rich",
      text: [[{ text: "hum0001 policy", href: "/guidelines/data-use-policy" }], [{ text: "hum0002 policy" }]],
      untranslated: true,
    }
    expect(onOneLine(field, "ja")).toEqual({
      state: "rich",
      text: [[{ text: "hum0001 policy", href: "/guidelines/data-use-policy" }, { text: "、" }, { text: "hum0002 policy" }]],
      untranslated: true,
    })
  })

  it("leaves a value of one line, of none, or in words of a state as it is", () => {
    const kept: FieldView[] = [
      rich([["末梢血"]]),
      rich([]),
      { state: "plain", text: "末梢血", untranslated: false },
      { state: "unsettled" },
      { state: "not-applicable" },
    ]
    for (const field of kept) expect(onOneLine(field, "ja")).toEqual(field)
  })

  it("keeps every span of every line, in order, with one separator between two lines", () => {
    const line = fc.array(fc.record({ text: fc.string({ minLength: 1 }) }), { minLength: 1, maxLength: 3 })
    fc.assert(fc.property(fc.array(line, { maxLength: 6 }), fc.constantFrom("ja" as const, "en" as const), (text: Line[], locale) => {
      const field: FieldView = { state: "rich", text, untranslated: false }
      const joined = onOneLine(field, locale)
      if (joined.state !== "rich") throw new Error("a rich value stays rich")

      expect(joined.text).toHaveLength(Math.min(text.length, 1))
      const separator = locale === "ja" ? "、" : ", "
      const expected = text.flatMap((one, at) => at === 0 ? one : [{ text: separator }, ...one])
      expect(joined.text.flat()).toEqual(expected)
    }))
  })
})
