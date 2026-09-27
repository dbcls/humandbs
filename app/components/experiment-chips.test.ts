import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { ValueView } from "~/public/view.server"

import { CHIPS_UNDER, experimentRows } from "./experiment-chips"

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
