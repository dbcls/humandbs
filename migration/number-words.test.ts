import { describe, expect, it } from "vitest"

import { prefixedDataset, prefixedNumber, type SourceDatasetContent, type SourceNumber } from "./number-words"

function read(over: Partial<SourceNumber> = {}): SourceNumber {
  return { label: null, value: 1, unit: null, inputValue: 1, inputUnit: null, high: null, inputHigh: null, note: null, ...over }
}

describe("prefixedNumber", () => {
  it("writes the label before the number with a colon and a space, and the note after it in brackets", () => {
    expect(prefixedNumber(read({ label: { ja: "常染色体", en: "Autosomes" }, note: { ja: "以上", en: "or more" } }), false))
      .toMatchObject({ prefix: { ja: "常染色体: ", en: "Autosomes: " }, suffix: { ja: " (以上)", en: " (or more)" } })
  })

  it("moves the word after a count into the suffix in front of the note, and leaves the count with no unit", () => {
    const count = prefixedNumber(read({ unit: "SNVs", inputUnit: "SNVs", note: { ja: "約", en: "approx." } }), true)
    expect(count).toMatchObject({ unit: null, inputUnit: null, suffix: { ja: " SNVs (約)", en: " SNVs (approx.)" } })
  })

  it("writes the three Japanese words after a count in English on the English side", () => {
    for (const [word, english] of [["プローブ", "probes"], ["遺伝子", "genes"], ["バリアント", "variants"]] as const) {
      expect(prefixedNumber(read({ unit: word, inputUnit: word }), true).suffix).toEqual({ ja: ` ${word}`, en: ` ${english}` })
    }
  })

  it("keeps the unit of a key that converts, and adds nothing for it", () => {
    expect(prefixedNumber(read({ value: 1500, unit: "GB", inputValue: 1.5, inputUnit: "TB" }), false))
      .toEqual({ prefix: null, value: 1500, unit: "GB", inputValue: 1.5, inputUnit: "TB", high: null, inputHigh: null, suffix: null })
  })

  it("keeps a side given in one language only, so the page falls back as it did", () => {
    expect(prefixedNumber(read({ label: { ja: "大腸がん", en: "" }, note: { ja: "", en: "average" } }), false))
      .toMatchObject({ prefix: { ja: "大腸がん: ", en: "" }, suffix: { ja: "", en: " (average)" } })
  })

  it("writes a pair with nothing on either side as null", () => {
    expect(prefixedNumber(read({ label: { ja: "", en: "" }, note: { ja: "", en: "" } }), false))
      .toMatchObject({ prefix: null, suffix: null })
  })
})

describe("prefixedDataset", () => {
  it("converts the numbers of the dataset and of its experiments, counting by key, and leaves the rest", () => {
    const content: SourceDatasetContent = {
      releaseDate: null,
      fileSelection: [],
      values: [{ keyId: "text", value: { kind: "text", text: { ja: { state: "unknown" }, en: { state: "unknown" } } } }],
      experiments: [{
        id: "e1",
        label: { state: "value", value: "WGS" },
        values: [
          { keyId: "variants", value: { kind: "number", values: { state: "value", value: [read({ unit: "SNPs", inputUnit: "SNPs" })] } } },
          { keyId: "length", value: { kind: "number", values: { state: "value", value: [read({ unit: "bp", inputUnit: "bp" })] } } },
          { keyId: "unsettled", value: { kind: "number", values: { state: "unknown" } } },
        ],
      }],
    }

    const converted = prefixedDataset(content, new Set(["variants"]))

    expect(converted.values).toEqual(content.values)
    expect(converted.experiments[0]?.values.map((slot) => slot.value)).toEqual([
      { kind: "number", values: { state: "value", value: [{ ...prefixedNumber(read(), false), suffix: { ja: " SNPs", en: " SNPs" } }] } },
      { kind: "number", values: { state: "value", value: [{ ...prefixedNumber(read(), false), unit: "bp", inputUnit: "bp" }] } },
      { kind: "number", values: { state: "unknown" } },
    ])
  })
})
