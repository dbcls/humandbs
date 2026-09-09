import { describe, expect, it } from "vitest"

import type { DatasetContent } from "~/content/types"

import {
  UneditableValueKind,
  datasetContentInput,
  emptyValueInput,
  type DatasetContentInput,
  type ValueInput,
} from "./dataset-form"
import { datasetContentOf } from "./dataset-form.server"

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
  it("reports refused markup against the key and the language it was written in", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [text("type-of-data", "ふつうの文", "| a | b |\n| - | - |\n| 1 | 2 |")]
    }), UNITS)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toEqual([
      { path: "values.type-of-data.en", syntax: "table", line: 1 },
    ])
  })

  it("reports one written inside an experiment against that experiment", () => {
    const result = datasetContentOf(form((input) => {
      input.experiments = [
        { id: "exp-1", label: { state: "value", text: "Exome" }, values: [text("coverage", "# 見出し")] },
      ]
    }), UNITS)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toEqual([
      { path: "experiments.exp-1.values.coverage.ja", syntax: "heading", line: 1 },
    ])
  })

  it("reports every refusal rather than stopping at the first", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [text("type-of-data", "# 見出し", "- 箇条書き")]
      input.experiments = [
        { id: "exp-1", label: { state: "value", text: "" }, values: [text("coverage", "> 引用")] },
      ]
    }), UNITS)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.path)).toEqual([
      "values.type-of-data.ja",
      "values.type-of-data.en",
      "experiments.exp-1.values.coverage.ja",
    ])
  })

  it("drops whatever was typed into a slot whose state says there is no value", () => {
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

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content.values[0]?.value).toEqual({
      kind: "text",
      text: { ja: { state: "unknown" }, en: { state: "not-applicable" } },
    })
    expect(result.content.experiments[0]?.label).toEqual({ state: "unknown" })
    expect(result.content.experiments[0]?.values[0]?.value)
      .toEqual({ kind: "vocabulary", termIds: { state: "unknown" } })
  })

  it("converts a number to the unit its key stores and keeps what was typed", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: { kind: "number", state: "value", rows: [{ label: "", value: "1.5", unit: "TB", note: "" }] },
      }]
    }), UNITS)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content.values[0]?.value).toEqual({
      kind: "number",
      values: {
        state: "value",
        value: [{ label: null, value: 1536, unit: "GB", inputValue: 1.5, inputUnit: "TB", note: null }],
      },
    })
  })

  it("leaves out a number nobody typed, since there is no empty number to store", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: { kind: "number", state: "value", rows: [{ label: "", value: "  ", unit: "GB", note: "" }] },
      }]
    }), UNITS)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content.values).toEqual([])
  })

  it("keeps a number marked unsettled as a state with no value at all", () => {
    const result = datasetContentOf(form((input) => {
      input.values = [{
        keyId: "data-volume-gb",
        value: { kind: "number", state: "unknown", rows: [{ label: "", value: "1.5", unit: "TB", note: "" }] },
      }]
    }), UNITS)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content.values[0]?.value).toEqual({ kind: "number", values: { state: "unknown" } })
  })

  it("reads an unwritten date as no date rather than as an empty one", () => {
    const result = datasetContentOf(form(), UNITS)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content.releaseDate).toBeNull()
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
            value: [{ label: null, value: 1536, unit: "GB", inputValue: 1.5, inputUnit: "TB", note: null }],
          },
        },
      }],
      experiments: [],
    }

    expect(datasetContentInput(content).values[0]?.value).toEqual({
      kind: "number",
      state: "value",
      rows: [{ label: "", value: "1.5", unit: "TB", note: "" }],
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
  })
})
