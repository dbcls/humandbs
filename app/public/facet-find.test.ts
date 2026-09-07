import { describe, expect, it } from "vitest"

import { matches, rolledUpFind } from "./facet-find"

/** The roots a disease facet offers, as the panel carries them. */
const DISEASES = [
  { code: "C34", label: "気管支及び肺の悪性新生物＜腫瘍＞" },
  { code: "C61", label: "前立腺の悪性新生物＜腫瘍＞" },
]

/** What is left standing after the box was given these words. */
function found(find: string, values = DISEASES): string[] {
  const needle = rolledUpFind(find, values)
  return values.filter((one) => matches(needle, one)).map((one) => one.code)
}

describe("looking for a value among the ones a facet carries", () => {
  it("takes every value while nothing has been typed", () => {
    expect(found("")).toEqual(["C34", "C61"])
  })

  it("looks for a value by its code", () => {
    expect(found("C6")).toEqual(["C61"])
  })

  it("looks for a word in the heading", () => {
    expect(found("前立腺")).toEqual(["C61"])
    expect(found("悪性新生物")).toEqual(["C34", "C61"])
  })

  it("does not care about the case a code was written in", () => {
    expect(found("c61")).toEqual(["C61"])
  })

  /**
   * C349 is what an article writes and what a reader has in hand; C34 is what
   * the panel lists. The point and the case are the writer's, so neither is
   * asked about.
   */
  it("rolls a code up to the root the panel offers", () => {
    for (const typed of ["C349", "C34.9", "c349"]) {
      expect(found(typed)).toEqual(["C34"])
    }
  })

  /**
   * Rolling up is only allowed to reach a root the facet has. Without this, a
   * code under a disease nobody carries would silently widen to its root.
   */
  it("leaves a code alone when its root is not one of the values", () => {
    expect(found("Z998")).toEqual([])
    expect(rolledUpFind("Z998", DISEASES)).toBe("Z998")
  })

  it("looks for anything not shaped like a code as it was typed", () => {
    const slugs = [{ code: "wgs", label: "WGS" }, { code: "wes", label: "WES" }]
    expect(found("wg", slugs)).toEqual(["wgs"])
  })
})
