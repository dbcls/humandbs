import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { optionalBilingualArb, translatedTextArb } from "~/content/arbitraries/content"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, NumberValue, ResearchContent, TranslatedText } from "~/content/types"

import { datasetProblems, researchProblems } from "./flags"

/** Whether each kind of problem turned up at all. */
function missing(content: ResearchContent) {
  const problems = researchProblems(content)
  return {
    unsettled: problems.unsettled.length > 0,
    untranslated: problems.untranslated.length > 0,
  }
}

/** A research whose only field that can hold anything is its title. */
function withTitle(title: TranslatedText): ResearchContent {
  return { ...emptyResearchContent(), title }
}

describe("what a research is still missing", () => {
  it("marks a pair untranslated only when both languages hold a value and one is empty", () => {
    fc.assert(fc.property(translatedTextArb, (title) => {
      const both = title.ja.state === "value" && title.en.state === "value"
      const one = title.ja.state === "value" && title.en.state === "value"
        && (title.ja.value === "") !== (title.en.value === "")

      expect(missing(withTitle(title)).untranslated).toBe(both && one)
    }))
  })

  it("never reports one missing value is both unsettled and untranslated", () => {
    fc.assert(fc.property(translatedTextArb, (title) => {
      const flags = missing(withTitle(title))
      expect(flags.unsettled && flags.untranslated).toBe(false)
    }))
  })

  it("reports a research is unsettled exactly when some language of some field is", () => {
    fc.assert(fc.property(translatedTextArb, (title) => {
      const marked = title.ja.state === "unknown" || title.en.state === "unknown"
      expect(missing(withTitle(title)).unsettled).toBe(marked)
    }))
  })
})

const BARE_NUMBER: NumberValue = {
  prefix: null,
  value: 1,
  unit: null,
  inputValue: 1,
  inputUnit: null,
  high: null,
  inputHigh: null,
  suffix: null,
}

function withNumberPrefix(prefix: NumberValue["prefix"]): DatasetContent {
  return {
    ...emptyDatasetContent(),
    values: [{ keyId: "k1", value: { kind: "number", values: filled([{ ...BARE_NUMBER, prefix }]) } }],
  }
}

describe("what a dataset is still missing", () => {
  it("marks a number's prefix untranslated only when it was given and one side is empty", () => {
    fc.assert(fc.property(optionalBilingualArb, (prefix) => {
      const expected = prefix !== null && (prefix.ja === "") !== (prefix.en === "")
      expect(datasetProblems(withNumberPrefix(prefix)).untranslated.length > 0).toBe(expected)
    }))
  })

  it("never reports a number's prefix as unsettled: it has no third state to ask for", () => {
    fc.assert(fc.property(optionalBilingualArb, (prefix) => {
      expect(datasetProblems(withNumberPrefix(prefix)).unsettled).toEqual([])
    }))
  })
})
