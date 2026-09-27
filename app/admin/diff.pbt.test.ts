import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { draftInputArb } from "./arbitraries/draft"
import { diffDraftInput } from "./diff"
import { initialMerge, RESEARCH_IMPORT } from "./import"

/**
 * The diff and the settling of a conflict share one path vocabulary. Nothing in
 * the types holds them to it — the settling walks the structure — so these are
 * what does.
 */
describe("the conflict diff and settling a place", () => {
  it("reports nothing about a draft compared with itself", () => {
    fc.assert(fc.property(draftInputArb, (draft) => {
      expect(diffDraftInput(draft, draft)).toEqual([])
    }))
  })

  it("reports the same fields whichever way round the two are compared", () => {
    fc.assert(fc.property(draftInputArb, draftInputArb, (mine, theirs) => {
      expect(diffDraftInput(mine, theirs)).toEqual(diffDraftInput(theirs, mine))
    }))
  })

  it("leaves nothing to report once every place it reported is settled as it was saved", () => {
    fc.assert(fc.property(draftInputArb, draftInputArb, (mine, theirs) => {
      const settled = initialMerge(RESEARCH_IMPORT, mine, mine, theirs, diffDraftInput(mine, theirs))
      expect(diffDraftInput(settled, theirs)).toEqual([])
    }))
  })
})
