import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, LocalizedLinks, NumberValue, ResearchContent, TranslatedText } from "~/content/types"

import { datasetProblems, researchProblems } from "./flags"

/** Whether each kind of problem turned up at all. */
function missing(content: ResearchContent) {
  const problems = researchProblems(content)
  return {
    unsettled: problems.unsettled.length > 0,
    untranslated: problems.untranslated.length > 0,
  }
}

function withTitle(title: TranslatedText): ResearchContent {
  return { ...emptyResearchContent(), title }
}

function withUrl(url: LocalizedLinks): ResearchContent {
  const empty = emptyResearchContent()
  return { ...empty, summary: { ...empty.summary, url } }
}

const LINK = { id: "l1", url: "https://example.com/", text: "example" }

describe("what a research is still missing", () => {
  it("finds nothing missing in content nobody has touched", () => {
    expect(missing(emptyResearchContent())).toEqual({
      unsettled: false,
      untranslated: false,
    })
  })

  it("counts a value marked unsettled, in whichever language it was marked", () => {
    expect(missing(withTitle({ ja: { state: "unknown" }, en: filled("") })).unsettled)
      .toBe(true)
    expect(missing(withTitle({ ja: filled(""), en: { state: "unknown" } })).unsettled)
      .toBe(true)
  })

  it("does not count a value settled as not applicable, which is an answer", () => {
    expect(missing(withTitle({ ja: { state: "not-applicable" }, en: filled("") })))
      .toEqual({ unsettled: false, untranslated: false })
  })

  it("counts a pair as untranslated when one language holds a value and the other is empty", () => {
    expect(missing(withTitle({ ja: filled("研究題目"), en: filled("") })).untranslated)
      .toBe(true)
    expect(missing(withTitle({ ja: filled(""), en: filled("A title") })).untranslated)
      .toBe(true)
  })

  it("does not count a pair nobody has filled in as untranslated", () => {
    expect(missing(withTitle({ ja: filled(""), en: filled("") })).untranslated).toBe(false)
  })

  it("counts a pair whose states differ as unsettled and not as untranslated", () => {
    const flags = missing(withTitle({ ja: filled("研究題目"), en: { state: "unknown" } }))

    expect(flags).toEqual({ unsettled: true, untranslated: false })
  })

  it("never counts a URL pair as untranslated: its two sides are different pages", () => {
    const flags = missing(withUrl({ ja: filled([LINK]), en: filled([]) }))

    expect(flags.untranslated).toBe(false)
  })

  it("still counts a URL marked unsettled", () => {
    expect(missing(withUrl({ ja: { state: "unknown" }, en: filled([]) })).unsettled).toBe(true)
  })

  it("looks inside every array a research holds", () => {
    const content: ResearchContent = {
      ...emptyResearchContent(),
      grants: [{
        id: "g1",
        title: { ja: filled("課題名"), en: filled("") },
        agency: { name: { ja: filled(""), en: filled("") } },
        grantIds: [],
      }],
    }

    expect(missing(content).untranslated).toBe(true)
  })
})

/** Whether each kind of problem turned up at all, for a dataset. */
function missingDataset(content: DatasetContent) {
  const problems = datasetProblems(content)
  return {
    unsettled: problems.unsettled.length > 0,
    untranslated: problems.untranslated.length > 0,
  }
}

const BARE_NUMBER: NumberValue = {
  label: null,
  value: 1,
  unit: null,
  inputValue: 1,
  inputUnit: null,
  high: null,
  inputHigh: null,
  note: null,
}

function withNumber(value: NumberValue): DatasetContent {
  return {
    ...emptyDatasetContent(),
    values: [{ keyId: "k1", value: { kind: "number", values: filled([value]) } }],
  }
}

describe("what a dataset is still missing", () => {
  it("finds nothing missing in a number nobody gave a label or a note to", () => {
    expect(missingDataset(withNumber(BARE_NUMBER))).toEqual({ unsettled: false, untranslated: false })
  })

  it("counts a number's label as untranslated when one language holds a value and the other is empty", () => {
    expect(missingDataset(withNumber({ ...BARE_NUMBER, label: { ja: "常染色体", en: "" } })).untranslated)
      .toBe(true)
    expect(missingDataset(withNumber({ ...BARE_NUMBER, label: { ja: "", en: "Autosome" } })).untranslated)
      .toBe(true)
  })

  it("counts a number's note the same way as its label", () => {
    expect(missingDataset(withNumber({ ...BARE_NUMBER, note: { ja: "約", en: "" } })).untranslated)
      .toBe(true)
  })

  it("does not count a label given in both languages", () => {
    expect(missingDataset(withNumber({ ...BARE_NUMBER, label: { ja: "常染色体", en: "Autosome" } })).untranslated)
      .toBe(false)
  })

  it("does not count a label whose both sides are empty, the same as no label at all", () => {
    expect(missingDataset(withNumber({ ...BARE_NUMBER, label: { ja: "", en: "" } })).untranslated)
      .toBe(false)
  })

  it("addresses several numbers under one key by position, so each is counted on its own", () => {
    const content: DatasetContent = {
      ...emptyDatasetContent(),
      values: [{
        keyId: "k1",
        value: {
          kind: "number",
          values: filled([
            { ...BARE_NUMBER, label: { ja: "常染色体", en: "" } },
            { ...BARE_NUMBER, label: { ja: "X染色体", en: "X chromosome" } },
          ]),
        },
      }],
    }
    const problems = datasetProblems(content)

    expect(problems.untranslated).toEqual([{ path: "values.k1.0.label", missing: "en" }])
  })
})
