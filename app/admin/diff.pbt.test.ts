import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { draftInputArb } from "./arbitraries/draft"
import { diffDraftInput, takeField } from "./diff"

/**
 * The diff and the take share one path vocabulary. Nothing in the types holds
 * them to it — the take walks the structure — so these are what does.
 */
describe("the conflict diff and taking a field", () => {
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

  it("leaves nothing to report once every path it reported has been taken", () => {
    fc.assert(fc.property(draftInputArb, draftInputArb, (mine, theirs) => {
      const merged = diffDraftInput(mine, theirs)
        .reduce((held, path) => takeField(held, theirs, path), mine)
      expect(diffDraftInput(merged, theirs)).toEqual([])
    }))
  })

  it("takes one field without disturbing any other", () => {
    fc.assert(fc.property(draftInputArb, draftInputArb, (mine, theirs) => {
      const before = diffDraftInput(mine, theirs)
      for (const path of before) {
        const after = diffDraftInput(takeField(mine, theirs, path), theirs)
        expect(after).not.toContain(path)
        expect(before).toEqual(expect.arrayContaining(after))
      }
    }))
  })

  it("changes nothing when asked for a path the two agree on", () => {
    fc.assert(fc.property(draftInputArb, (draft) => {
      expect(takeField(draft, draft, "title")).toEqual(draft)
      expect(takeField(draft, draft, "summary.url")).toEqual(draft)
    }))
  })
})
