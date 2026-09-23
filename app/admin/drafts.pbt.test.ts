import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { listingAfter } from "./drafts.server"

describe("listingAfter", () => {
  it("keeps the same set of datasets through any move, and moves the one named by at most a step", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 }),
      fc.nat(),
      fc.constantFrom(-1 as const, 1 as const),
      (ids, pick, by) => {
        const datasetId = ids[pick % ids.length] ?? ""
        const after = listingAfter(ids, { datasetId, by })
        expect([...after].toSorted()).toEqual([...ids].toSorted())
        expect(Math.abs(after.indexOf(datasetId) - ids.indexOf(datasetId))).toBeLessThanOrEqual(1)
      },
    ))
  })

  it("moves a dataset it does not list nowhere, and changes nothing else", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.uuid(), { maxLength: 6 }),
      fc.uuid(),
      fc.constantFrom(-1 as const, 1 as const),
      (ids, stranger, by) => {
        fc.pre(!ids.includes(stranger))
        expect(listingAfter(ids, { datasetId: stranger, by })).toEqual(ids)
      },
    ))
  })

  it("keeps the same datasets whatever the step, so a move only reorders", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 6 }),
      fc.nat(),
      fc.constantFrom(-1 as const, 1 as const),
      (ids, pick, by) => {
        const datasetId = ids[pick % ids.length] ?? ""
        const after = listingAfter(ids, { datasetId, by })

        expect(after.toSorted()).toEqual(ids.toSorted())
        expect(after).toHaveLength(ids.length)
      },
    ))
  })

  it("moves a dataset one place and no further, and the ends stay put", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 6 }),
      fc.nat(),
      fc.constantFrom(-1 as const, 1 as const),
      (ids, pick, by) => {
        const at = pick % ids.length
        const datasetId = ids[at] ?? ""
        const to = at + by

        const after = listingAfter(ids, { datasetId, by })

        // Off either end there is nowhere to go, and the order is untouched.
        expect(after.indexOf(datasetId)).toBe(to < 0 || to >= ids.length ? at : to)
      },
    ))
  })
})
