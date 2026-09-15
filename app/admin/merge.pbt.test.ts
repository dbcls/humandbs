import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetContentInputArb } from "./arbitraries/draft"
import { diffDatasetInput, takeDatasetField } from "./dataset-diff"
import { compareDataset, isEmptyComparison, takeAll } from "./merge"

/**
 * Comparing a draft with the version it is shown against.
 *
 * The comparison is what the editor offers to take, so the list and the taking
 * have to agree: **taking everything listed must leave the two saying the same
 * thing, and must touch nothing outside the list.** That is what these laws are.
 */
describe("comparing a dataset against a version", () => {
  it("finds nothing between a description and itself", () => {
    fc.assert(fc.property(datasetContentInputArb, (content) => {
      expect(isEmptyComparison(compareDataset(content, content))).toBe(true)
    }))
  })

  it("lists exactly the paths the diff reports", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (theirs, mine) => {
      expect(compareDataset(theirs, mine).differing).toEqual(diffDatasetInput(mine, theirs))
    }))
  })

  it("answers the same whichever side is called mine", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (theirs, mine) => {
      const forwards = compareDataset(theirs, mine).differing
      const backwards = compareDataset(mine, theirs).differing

      expect(forwards.toSorted()).toEqual(backwards.toSorted())
    }))
  })

  it("leaves the two agreeing once every listed path is taken", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (theirs, mine) => {
      const compared = compareDataset(theirs, mine)
      const taken = takeAll(takeDatasetField, mine, theirs, compared.differing)

      expect(diffDatasetInput(taken, theirs)).toEqual([])
    }))
  })

  it("touches nothing the two already agreed on", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (theirs, mine) => {
      const compared = compareDataset(theirs, mine)
      const taken = takeAll(takeDatasetField, mine, theirs, compared.differing)

      // A path outside the list held the same value on both sides, so taking
      // the listed ones cannot have moved it.
      for (const path of diffDatasetInput(mine, taken)) {
        expect(compared.differing).toContain(path)
      }
    }))
  })

  it("reaches the same place taking one path at a time as taking them together", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (theirs, mine) => {
      const compared = compareDataset(theirs, mine)
      const together = takeAll(takeDatasetField, mine, theirs, compared.differing)
      const oneByOne = compared.differing.reduce(
        (held, path) => takeDatasetField(held, theirs, path),
        mine,
      )

      expect(diffDatasetInput(together, oneByOne)).toEqual([])
    }))
  })
})
