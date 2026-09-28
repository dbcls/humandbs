import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetContentInputArb, draftInputArb } from "./arbitraries/draft"
import { diffDraftInput } from "./diff"
import type { DraftInput } from "./form"
import { DATASET_IMPORT, initialMerge, mergeFieldPaths, RESEARCH_IMPORT } from "./import"
import { readAt } from "./paths"

const shape = RESEARCH_IMPORT

/** Two edits of one draft: each top-level place of the content is the base's or the edit's. */
function editOf(base: DraftInput, other: DraftInput, picks: readonly boolean[]): DraftInput {
  const keys = Object.keys(base.content) as (keyof DraftInput["content"])[]
  const content = { ...base.content }
  keys.forEach((key, at) => {
    if (picks[at % picks.length] === true) Object.assign(content, { [key]: other.content[key] })
  })
  return { ...base, content }
}

const picksArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 12 })

/** A save that came back refused: what the screen opened with, what it holds, and what was saved elsewhere. */
const refusedArb = fc.tuple(draftInputArb, draftInputArb, draftInputArb, picksArb, picksArb)
  .map(([base, x, y, mineBy, theirsBy]) => ({ base, mine: editOf(base, x, mineBy), theirs: editOf(base, y, theirsBy) }))

function at(value: DraftInput, path: string): unknown {
  return readAt(value, shape.keysOf(path)).value
}

/**
 * The dialog opens holding what will be saved, and the curator only has to read
 * what both sides touched: whatever one side left alone, the other side's
 * reading is the one to keep.
 */
describe("what the conflict dialog opens holding", () => {
  it("is this screen's input when nothing was changed elsewhere", () => {
    fc.assert(fc.property(refusedArb, ({ base, mine }) => {
      expect(initialMerge(shape, base, mine, base, diffDraftInput(base, base))).toEqual(mine)
    }))
  })

  it("keeps this screen's input at every place the other side did not change, and takes theirs where the screen could not write", () => {
    fc.assert(fc.property(refusedArb, ({ base, mine, theirs }) => {
      const changed = diffDraftInput(base, theirs)
      const written = initialMerge(shape, base, mine, theirs, changed)
      for (const path of diffDraftInput(mine, written)) {
        const theirsToo = changed.some((one) => one === path || one.startsWith(`${path}.`))
        expect(theirsToo || shape.skip.includes(path), path).toBe(true)
      }
      if (changed.includes("datasetIds")) expect(written.content.datasetIds).toEqual(theirs.content.datasetIds)
    }))
  })

  it("reads as theirs at a place this screen left as it opened, and as this screen's at one it changed too", () => {
    fc.assert(fc.property(refusedArb, ({ base, mine, theirs }) => {
      const changed = diffDraftInput(base, theirs)
      const typed = diffDraftInput(base, mine)
      const written = initialMerge(shape, base, mine, theirs, changed)
      for (const path of mergeFieldPaths(shape, mine, theirs, changed)) {
        // A list is decided an element at a time (`import.test.ts`).
        if (Array.isArray(at(written, path))) continue
        const against = typed.includes(path) ? mine : theirs
        expect(diffDraftInput(written, against), path).not.toContain(path)
      }
    }))
  })

  it("offers only places the other side changed, at them or inside them, that the two now disagree about", () => {
    fc.assert(fc.property(refusedArb, ({ base, mine, theirs }) => {
      const changed = diffDraftInput(base, theirs)
      const disagree = diffDraftInput(mine, theirs)
      for (const path of mergeFieldPaths(shape, mine, theirs, changed)) {
        expect(changed.some((one) => one === path || one.startsWith(`${path}.`)), path).toBe(true)
        expect(disagree).toContain(path)
      }
    }))
  })

  it("is this screen's input when nothing was changed elsewhere, for a dataset's entry too", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (base, theirs) => {
      expect(initialMerge(DATASET_IMPORT, base, theirs, base, DATASET_IMPORT.diff(base, base))).toEqual(theirs)
    }))
  })
})
