import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Line } from "~/content/types"
import type { FieldView, ValueView } from "~/public/view.server"

import { CHIPS_UNDER, experimentRows, onOneLine, type KeyHeading } from "./experiment-chips"

function value(code: string): ValueView {
  return { keyId: `k-${code}`, code, label: code, field: { state: "plain", text: code, untranslated: false } }
}

/** The paragraphs the catalog names, as the page is given them. */
const HEADINGS = Object.fromEntries([...CHIPS_UNDER.keys()].map((code) => [code, { keyId: `k-${code}`, label: code }]))

/**
 * What the rows draw, as codes: a row's key (in brackets where the row has no
 * value of its own), and its chips after a `>`.
 */
function shape(values: ValueView[], headings: Record<string, KeyHeading> = HEADINGS): string[] {
  return experimentRows(values, headings).map((row) => {
    const head = row.value === null ? `[${row.label}]` : row.value.code
    return row.chips.length === 0
      ? head
      : `${head} > ${row.chips.map((chip) => chip.countedAs === undefined ? chip.value.code : `${chip.value.code}+${chip.countedAs.code}`).join(" ")}`
  })
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

  it("draws the classifications under the paragraph's name, where the first of them comes, when the paragraph is not written", () => {
    expect(shape(["disease", "health-status", "subject-count", "subject-count-type", "platform", "tissue"].map(value)))
      .toEqual([
        "disease",
        "[materials-and-participants] > health-status subject-count+subject-count-type",
        "platform",
        "[sample-description] > tissue",
      ])
  })

  it("keeps a classification as a row of its own where the catalog does not name its paragraph", () => {
    expect(shape(["disease", "health-status", "subject-count", "subject-count-type", "tissue"].map(value), {}))
      .toEqual(["disease", "health-status", "subject-count", "subject-count-type", "tissue"])
  })

  it("draws a paragraph with nothing under it as a plain row", () => {
    expect(shape(["materials-and-participants", "sample-description"].map(value)))
      .toEqual(["materials-and-participants", "sample-description"])
  })

  it("draws every value once, heads each paragraph once, and keeps the rows in the order they came", () => {
    const codes = [...new Set([...CHIPS_UNDER].flatMap(([under, chips]) => [under, ...chips]))]
    const others = ["disease", "cell-line", "platform", "reference-sequence", "total-data-volume"]
    const headings = fc.subarray([...CHIPS_UNDER.keys()]).map((named) =>
      Object.fromEntries(named.map((code) => [code, { keyId: `k-${code}`, label: code }])))
    fc.assert(fc.property(fc.subarray([...codes, ...others]), fc.boolean(), headings, (picked, shuffle, named) => {
      const values = (shuffle ? picked.toReversed() : picked).map(value)
      const rows = experimentRows(values, named)
      const chipped = (row: (typeof rows)[number]) => row.chips.flatMap((chip) => chip.countedAs === undefined ? [chip.value] : [chip.value, chip.countedAs])
      const drawn = rows.flatMap((row) => [...(row.value === null ? [] : [row.value]), ...chipped(row)])

      expect(drawn.map((one) => one.code).toSorted()).toEqual(values.map((one) => one.code).toSorted())
      expect(new Set(rows.map((row) => row.keyId)).size).toBe(rows.length)
      // A row with no value of its own is only ever a paragraph the catalog names, heading chips.
      for (const row of rows.filter((one) => one.value === null)) {
        expect(Object.values(named).map((one) => one.keyId)).toContain(row.keyId)
        expect(row.chips.length).toBeGreaterThan(0)
      }
      const order = values.map((one) => one.code)
      const rowOrder = rows.map((row) => order.indexOf((row.value ?? chipped(row)[0])?.code ?? ""))
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
