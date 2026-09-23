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
        const after = listingAfter(ids, { kind: "move", datasetId, by })
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
        expect(listingAfter(ids, { kind: "move", datasetId: stranger, by })).toEqual(ids)
      },
    ))
  })

  it("lists each dataset once however many times it is listed, and unlisting takes it out", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.uuid(), { maxLength: 6 }),
      fc.uuid(),
      (ids, datasetId) => {
        const once = listingAfter(ids, { kind: "list", datasetId })
        const twice = listingAfter(once, { kind: "list", datasetId })
        expect(twice).toEqual(once)
        expect(once.filter((id) => id === datasetId)).toHaveLength(1)
        expect(once.slice(0, ids.includes(datasetId) ? ids.length : ids.length)).toEqual(ids)
        expect(listingAfter(twice, { kind: "unlist", datasetId })).not.toContain(datasetId)
      },
    ))
  })
})
