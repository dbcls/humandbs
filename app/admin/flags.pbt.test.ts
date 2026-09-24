import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { translatedTextArb } from "~/content/arbitraries/content"
import { emptyResearchContent } from "~/content/empty"
import type { ResearchContent, TranslatedText } from "~/content/types"

import { researchProblems } from "./flags"

/** Whether each kind of problem turned up at all. */
function missing(content: ResearchContent) {
  const problems = researchProblems(content)
  return {
    unsettled: problems.unsettled.length > 0,
    untranslated: problems.untranslated.length > 0,
  }
}

/** A research whose only field that can say anything is its title. */
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

  it("never says one missing value is both unsettled and untranslated", () => {
    fc.assert(fc.property(translatedTextArb, (title) => {
      const flags = missing(withTitle(title))
      expect(flags.unsettled && flags.untranslated).toBe(false)
    }))
  })

  it("says a research is unsettled exactly when some language of some field is", () => {
    fc.assert(fc.property(translatedTextArb, (title) => {
      const marked = title.ja.state === "unknown" || title.en.state === "unknown"
      expect(missing(withTitle(title)).unsettled).toBe(marked)
    }))
  })
})
