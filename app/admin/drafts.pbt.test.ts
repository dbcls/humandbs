import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { listingAfter } from "./drafts.server"

describe("listingAfter", () => {
  it("swaps the dataset named with the one just past it, and leaves the order in place off either end", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 }),
      fc.nat(),
      fc.constantFrom(-1 as const, 1 as const),
      (ids, pick, by) => {
        const at = pick % ids.length
        const datasetId = ids[at] ?? ""
        const to = at + by

        const after = listingAfter(ids, { datasetId, by })

        const expected = [...ids]
        if (to >= 0 && to < ids.length) {
          const left = expected[at] ?? ""
          const right = expected[to] ?? ""
          expected[at] = right
          expected[to] = left
        }
        expect(after).toEqual(expected)
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
})
