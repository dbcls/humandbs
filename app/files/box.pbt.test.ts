import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { composeBox, pageOfBox, selectedFrom, type StoredNode } from "./box"

/**
 * The laws the box is read by.
 *
 * The first two are what "the listing is the only source" comes to in practice:
 * a name appears once however many buckets hold it, and paging a listing loses
 * nothing and invents nothing. The third is the rule the public projection and
 * the editor both apply to a selection, and they have to agree — one drops what
 * a reader would not see, the other decides what a curator can pick.
 */

const nameArb = fc.oneof(
  fc.constantFrom("a.zip", "b.zip", "README.txt", "説明.pdf", "Dictionary file (AD).xlsx"),
  fc.string({ minLength: 1, maxLength: 8 }),
)

const nodeArb: fc.Arbitrary<StoredNode> = fc.record({
  name: nameArb,
  size: fc.nat({ max: 1_000_000_000 }),
  updatedAt: fc.constant("2026-01-01T00:00:00.000Z"),
})

const nodesArb = fc.array(nodeArb, { maxLength: 12 })

const pendingArb = fc.array(
  fc.record({
    fileName: nameArb,
    action: fc.constantFrom("publish" as const, "unpublish" as const),
    failed: fc.boolean(),
  }),
  { maxLength: 6 },
)

describe("composeBox", () => {
  it("lists every name once, however many buckets hold it", () => {
    fc.assert(fc.property(nodesArb, nodesArb, pendingArb, (open, closed, pending) => {
      const names = composeBox(open, closed, pending).map((entry) => entry.name)

      expect(names).toEqual([...new Set(names)])
    }))
  })

  it("lists exactly the names the two buckets hold between them", () => {
    fc.assert(fc.property(nodesArb, nodesArb, pendingArb, (open, closed, pending) => {
      const held = new Set([...open, ...closed].map((node) => node.name))
      const listed = new Set(composeBox(open, closed, pending).map((entry) => entry.name))

      expect(listed).toEqual(held)
    }))
  })

  it("calls a name public when the public bucket holds it, whatever the other one says", () => {
    fc.assert(fc.property(nodesArb, nodesArb, pendingArb, (open, closed, pending) => {
      const openNames = new Set(open.map((node) => node.name))

      for (const entry of composeBox(open, closed, pending)) {
        expect(entry.isPublic).toBe(openNames.has(entry.name))
      }
    }))
  })
})

describe("pageOfBox", () => {
  it("puts every row on exactly one page, in the order it was given", () => {
    fc.assert(fc.property(
      fc.array(fc.nat(), { maxLength: 60 }),
      fc.integer({ min: 1, max: 8 }),
      (rows, size) => {
        const pageCount = pageOfBox(rows, 1, size).pageCount
        const seen = Array.from({ length: pageCount }, (_, at) => pageOfBox(rows, at + 1, size).rows)

        expect(seen.flat()).toEqual(rows)
      },
    ))
  })

  it("never answers with a page number that has no page", () => {
    fc.assert(fc.property(
      fc.array(fc.nat(), { maxLength: 60 }),
      fc.integer({ min: -5, max: 40 }),
      fc.integer({ min: 1, max: 8 }),
      (rows, page, size) => {
        const cut = pageOfBox(rows, page, size)

        expect(cut.page).toBeGreaterThanOrEqual(1)
        expect(cut.page).toBeLessThanOrEqual(cut.pageCount)
      },
    ))
  })
})

describe("selectedFrom", () => {
  it("keeps a subsequence of the selection, and nothing the listing does not hold", () => {
    fc.assert(fc.property(
      fc.array(nameArb, { maxLength: 8 }),
      nodesArb,
      (selection, open) => {
        const listing = composeBox(open, [], [])
        const listed = new Set(listing.map((entry) => entry.name))
        const kept = selectedFrom(selection, listing).map((entry) => entry.name)

        expect(kept).toEqual(selection.filter((name) => listed.has(name)))
      },
    ))
  })
})
