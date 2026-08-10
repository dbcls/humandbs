import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetContentInputArb } from "./arbitraries/draft"
import { diffDatasetInput, takeDatasetField } from "./dataset-diff"
import { isEmptyThreeWay, takeAll, threeWayDataset } from "./merge"

/**
 * Splitting two sets of edits over one starting point.
 *
 * The three-way is what the publish gate warns from and what the editor offers
 * to take, and the two have to mean the same thing: **taking everything only
 * they changed must leave nothing of theirs to lose, and must not disturb
 * anything this side changed.** That is what these laws are.
 */
describe("the three-way over a dataset", () => {
  it("puts no path in both answers at once", () => {
    fc.assert(fc.property(
      datasetContentInputArb,
      datasetContentInputArb,
      datasetContentInputArb,
      (base, theirs, mine) => {
        const compared = threeWayDataset(base, theirs, mine)
        const overlap = compared.theirs.filter((path) => compared.both.includes(path))

        expect(overlap).toEqual([])
      },
    ))
  })

  it("finds nothing when nobody moved away from the same starting point", () => {
    fc.assert(fc.property(datasetContentInputArb, (base) => {
      expect(isEmptyThreeWay(threeWayDataset(base, base, base))).toBe(true)
    }))
  })

  it("finds nothing when both sides arrived at the same place", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (base, same) => {
      expect(isEmptyThreeWay(threeWayDataset(base, same, same))).toBe(true)
    }))
  })

  it("calls everything they changed takeable when this side changed nothing", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (base, theirs) => {
      const compared = threeWayDataset(base, theirs, base)

      expect(compared.both).toEqual([])
      expect(compared.theirs).toEqual(diffDatasetInput(base, theirs))
    }))
  })

  it("leaves nothing of theirs behind once the takeable paths are taken", () => {
    fc.assert(fc.property(
      datasetContentInputArb,
      datasetContentInputArb,
      datasetContentInputArb,
      (base, theirs, mine) => {
        const compared = threeWayDataset(base, theirs, mine)
        const taken = takeAll(takeDatasetField, mine, theirs, compared.theirs)
        const left = diffDatasetInput(taken, theirs)

        for (const path of compared.theirs) expect(left).not.toContain(path)
      },
    ))
  })

  it("costs nothing this side changed to take everything only they changed", () => {
    fc.assert(fc.property(
      datasetContentInputArb,
      datasetContentInputArb,
      datasetContentInputArb,
      (base, theirs, mine) => {
        const compared = threeWayDataset(base, theirs, mine)
        const taken = takeAll(takeDatasetField, mine, theirs, compared.theirs)

        // Everything this side moved away from the starting point is still
        // moved away from it, and to the same place.
        expect(diffDatasetInput(base, taken)).toEqual(
          expect.arrayContaining(diffDatasetInput(base, mine)),
        )
        for (const path of diffDatasetInput(base, mine)) {
          expect(diffDatasetInput(taken, mine)).not.toContain(path)
        }
      },
    ))
  })
})
