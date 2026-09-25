import { describe, expect, it } from "vitest"

import type { DatasetContent } from "~/content/types"

import {
  UneditableValueKind,
  datasetContentInput,
  emptyValueInput,
  highBelowValue,
  type DatasetContentInput,
  type ValueInput,
} from "./dataset-form"
import { datasetContentOf, saveDatasetSchema, widthsOrdered } from "./dataset-form.server"

/** The units of the keys these tests use. Only the numeric ones have any. */
const UNITS = (keyId: string): string | null => (keyId === "data-volume-gb" ? "GB" : null)

function text(keyId: string, ja: string, en = ""): ValueInput {
  return {
    keyId,
    value: {
      kind: "text",
      text: { ja: { state: "value", text: ja }, en: { state: "value", text: en } },
    },
  }
}

function form(produce: (input: DatasetContentInput) => void = () => undefined): DatasetContentInput {
  const input: DatasetContentInput = {
    releaseDate: "",
    fileSelection: [],
    values: [],
    experiments: [],
  }
  produce(input)
  return input
}

describe("reading a dataset back off the form", () => {
  it("keeps markup the tree cannot hold as the characters typed, against the key and language it was written in", () => {
    const content = datasetContentOf(form((input) => {
      input.values = [text("type-of-data", "ふつうの文", "| a | b |\n| - | - |\n| 1 | 2 |")]
      input.experiments = [
        { id: "exp-1", label: { state: "value", text: "Exome" }, values: [text("coverage", "# 見出し")] },
      ]
    }), UNITS)

    expect(content.values[0]?.value).toEqual({
      kind: "text",
      text: {
        ja: { state: "value", value: [[{ text: "ふつうの文" }]] },
        en: { state: "value", value: [[{ text: "| a | b |" }], [{ text: "| - | - |" }], [{ text: "| 1 | 2 |" }]] },
      },
    })
    expect(content.experiments[0]?.values[0]?.value).toMatchObject({
      kind: "text",
      text: { ja: { state: "value", value: [[{ text: "# 見出し" }]] } },
    })
  })

  it("drops whatever was typed into a slot whose state reports there is no value", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "type-of-data",
        value: {
          kind: "text",
          text: {
            ja: { state: "unknown", text: "打ちかけ" },
            en: { state: "not-applicable", text: "half typed" },
          },
        },
      }]
      input.experiments = [{
        id: "exp-1",
        label: { state: "unknown", text: "打ちかけのラベル" },
        values: [{
          keyId: "access-criteria",
          value: { kind: "vocabulary", state: "unknown", termIds: ["term-a"] },
        }],
      }]
    }), UNITS)

    expect(result.values[0]?.value).toEqual({
      kind: "text",
      text: { ja: { state: "unknown" }, en: { state: "not-applicable" } },
    })
    expect(result.experiments[0]?.label).toEqual({ state: "unknown" })
    expect(result.experiments[0]?.values[0]?.value)
      .toEqual({ kind: "vocabulary", termIds: { state: "unknown" } })
  })

  it("converts a number to the unit its key stores and keeps what was typed", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: {
          kind: "number",
          state: "value",
          rows: [{ label: "", value: "1.5", unit: "TB", high: "", note: "" }],
        },
      }]
    }), UNITS)

    expect(result.values[0]?.value).toEqual({
      kind: "number",
      values: {
        state: "value",
        value: [{
          label: null,
          value: 1500,
          unit: "GB",
          inputValue: 1.5,
          inputUnit: "TB",
          high: null,
          inputHigh: null,
          note: null,
        }],
      },
    })
  })

  it("converts a width's upper end the same way as its lower end, and keeps what was typed", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: {
          kind: "number",
          state: "value",
          rows: [{ label: "", value: "0.9", unit: "TB", high: "1.3", note: "" }],
        },
      }]
    }), UNITS)

    expect(result.values[0]?.value).toEqual({
      kind: "number",
      values: {
        state: "value",
        value: [{
          label: null,
          value: 900,
          unit: "GB",
          inputValue: 0.9,
          inputUnit: "TB",
          high: 1300,
          inputHigh: 1.3,
          note: null,
        }],
      },
    })
  })

  it("still parses a row whose typed upper end sits below its typed lower end", () => {
    // The schema alone lets this through — the draw preview parses this same
    // shape from content that is still being typed, where a width caught
    // mid-edit is ordinary, and a preview that refused it would blank the
    // page over one field somebody has not finished typing
    // (`app/admin/pages.server.ts` の `datasetPageAction`). Only a save calls
    // `widthsOrdered` to refuse it (below).
    const payload = {
      revision: 1,
      content: form((input) => {
        input.values = [{
          keyId: "c9c6d5e2-1f1d-4c17-9a2a-0a3a2c5f6b71",
          value: {
            kind: "number",
            state: "value",
            rows: [{ label: "", value: "1.3", unit: "GB", high: "0.9", note: "" }],
          },
        }]
      }),
    }

    expect(saveDatasetSchema.safeParse(payload).success).toBe(true)
  })

  it("widthsOrdered refuses content with a row typed out of order, wherever it sits", () => {
    const outOfOrderInValues = form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: {
          kind: "number",
          state: "value",
          rows: [{ label: "", value: "1.3", unit: "GB", high: "0.9", note: "" }],
        },
      }]
    })
    const outOfOrderInExperiment = form((input) => {
      input.experiments = [{
        id: "exp-1",
        label: { state: "value", text: "" },
        values: [{
          keyId: "data-volume-gb",
          value: {
            kind: "number",
            state: "value",
            rows: [{ label: "", value: "1.3", unit: "GB", high: "0.9", note: "" }],
          },
        }],
      }]
    })
    const ordered = form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: {
          kind: "number",
          state: "value",
          rows: [{ label: "", value: "0.9", unit: "GB", high: "1.3", note: "" }],
        },
      }]
    })

    expect(widthsOrdered(outOfOrderInValues)).toBe(false)
    expect(widthsOrdered(outOfOrderInExperiment)).toBe(false)
    expect(widthsOrdered(ordered)).toBe(true)
    expect(widthsOrdered(form())).toBe(true)
  })

  it("leaves out a number nobody typed, since there is no empty number to store", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: {
          kind: "number",
          state: "value",
          rows: [{ label: "", value: "  ", unit: "GB", high: "", note: "" }],
        },
      }]
    }), UNITS)

    expect(result.values).toEqual([])
  })

  it("keeps a number marked unsettled as a state with no value at all", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: {
          kind: "number",
          state: "unknown",
          rows: [{ label: "", value: "1.5", unit: "TB", high: "", note: "" }],
        },
      }]
    }), UNITS)

    expect(result.values[0]?.value).toEqual({ kind: "number", values: { state: "unknown" } })
  })

  it("keeps a disease that identifies no term, which is what the type is for", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "disease",
        value: {
          kind: "disease",
          state: "value",
          diseases: [{ termIds: [], nameJa: "NASH", nameEn: "  NASH  " }],
        },
      }]
    }), UNITS)

    expect(result.values[0]?.value).toEqual({
      kind: "disease",
      diseases: {
        state: "value",
        value: [{ termIds: [], nameJa: "NASH", nameEn: "NASH" }],
      },
    })
  })

  it("reads a name written in one language only as one name, not as an empty other", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "disease",
        value: {
          kind: "disease",
          state: "value",
          diseases: [{ termIds: ["c9c6d5e2-1f1d-4c17-9a2a-0a3a2c5f6b71"], nameJa: "肺腺がん", nameEn: "" }],
        },
      }]
    }), UNITS)

    expect(result.values[0]?.value).toEqual({
      kind: "disease",
      diseases: {
        state: "value",
        value: [{
          termIds: ["c9c6d5e2-1f1d-4c17-9a2a-0a3a2c5f6b71"],
          nameJa: "肺腺がん",
          nameEn: null,
        }],
      },
    })
  })

  it("leaves out a disease row nobody filled in, and the slot with it", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "disease",
        value: {
          kind: "disease",
          state: "value",
          diseases: [{ termIds: [], nameJa: "   ", nameEn: "" }],
        },
      }]
    }), UNITS)

    expect(result.values).toEqual([])
  })

  it("reads an unwritten date as no date rather than as an empty one", () => {
    const result = datasetContentOf(form(), UNITS)

    expect(result.releaseDate).toBeNull()
  })
})

describe("putting a dataset on the form", () => {
  it("refuses a value of a kind that has no input control, rather than dropping it", () => {
    const content: DatasetContent = {
      releaseDate: null,
      fileSelection: [],
      values: [{ keyId: "an-accession", value: { kind: "accession", value: { state: "unknown" } } }],
      experiments: [],
    }

    expect(() => datasetContentInput(content)).toThrow(UneditableValueKind)
  })

  it("shows a number as it was typed, in the unit it was typed in", () => {
    const content: DatasetContent = {
      releaseDate: null,
      fileSelection: [],
      values: [{
        keyId: "data-volume-gb",
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{ label: null, value: 1500, unit: "GB", inputValue: 1.5, inputUnit: "TB", note: null }],
          },
        },
      }],
      experiments: [],
    }

    expect(datasetContentInput(content).values[0]?.value).toEqual({
      kind: "number",
      state: "value",
      rows: [{ label: "", value: "1.5", unit: "TB", high: "", note: "" }],
    })
  })

  it("shows a width's upper end as it was typed, beside the unit it was typed in", () => {
    const content: DatasetContent = {
      releaseDate: null,
      fileSelection: [],
      values: [{
        keyId: "data-volume-gb",
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{
              label: null,
              value: 900,
              unit: "GB",
              inputValue: 0.9,
              inputUnit: "TB",
              high: 1300,
              inputHigh: 1.3,
              note: null,
            }],
          },
        },
      }],
      experiments: [],
    }

    expect(datasetContentInput(content).values[0]?.value).toEqual({
      kind: "number",
      state: "value",
      rows: [{ label: "", value: "0.9", unit: "TB", high: "1.3", note: "" }],
    })
  })

  it("starts a new slot empty in both languages, which is not the same as unsettled", () => {
    expect(emptyValueInput("type-of-data", "text")).toEqual({
      keyId: "type-of-data",
      value: {
        kind: "text",
        text: { ja: { state: "value", text: "" }, en: { state: "value", text: "" } },
      },
    })
    expect(emptyValueInput("access-criteria", "vocabulary")).toEqual({
      keyId: "access-criteria",
      value: { kind: "vocabulary", state: "value", termIds: [] },
    })
    // A row to write in, naming nothing: the identifiers are what a curator
    // looks up afterwards, and a disease may end with none.
    expect(emptyValueInput("disease", "disease")).toEqual({
      keyId: "disease",
      value: {
        kind: "disease",
        state: "value",
        diseases: [{ termIds: [], nameJa: "", nameEn: "" }],
      },
    })
  })

  it("shows a disease as its terms and the names somebody wrote", () => {
    const content: DatasetContent = {
      releaseDate: null,
      fileSelection: [],
      values: [{
        keyId: "disease",
        value: {
          kind: "disease",
          diseases: {
            state: "value",
            value: [{ termIds: ["term-a"], nameJa: null, nameEn: "NASH" }],
          },
        },
      }],
      experiments: [],
    }

    // A name the article did not write in one language comes back as an empty
    // box rather than as the other language's word.
    expect(datasetContentInput(content).values[0]?.value).toEqual({
      kind: "disease",
      state: "value",
      diseases: [{ termIds: ["term-a"], nameJa: "", nameEn: "NASH" }],
    })
  })
})

describe("highBelowValue", () => {
  const row = (value: string, high: string) =>
    ({ label: "", value, unit: null, high, note: "" })

  it("is false when nothing is typed for the upper end", () => {
    expect(highBelowValue(row("1.3", ""))).toBe(false)
  })

  it("is false when the upper end is typed at or above the lower end", () => {
    expect(highBelowValue(row("0.9", "1.3"))).toBe(false)
    expect(highBelowValue(row("1.3", "1.3"))).toBe(false)
  })

  it("is true when the upper end is typed below the lower end", () => {
    expect(highBelowValue(row("1.3", "0.9"))).toBe(true)
  })

  it("is false when either end cannot be read as a number, since that is a different refusal", () => {
    expect(highBelowValue(row("", "0.9"))).toBe(false)
    expect(highBelowValue(row("見当たらない", "0.9"))).toBe(false)
  })
})
