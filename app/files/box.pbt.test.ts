import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { dayInJst } from "~/dates"

import { composeBox, narrowedBox, pageOfBox, selectedFrom, type BoxFilter, type StoredNode } from "./box"

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
    lastError: fc.option(fc.string({ maxLength: 40 }), { nil: null }),
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

/** A day between 2020 and 2030, written the way a date field writes it. */
const dayArb = fc.date({
  min: new Date("2020-01-01T00:00:00.000Z"),
  max: new Date("2030-12-31T00:00:00.000Z"),
  noInvalidDate: true,
}).map((at) => at.toISOString().slice(0, 10))

const datedNodeArb: fc.Arbitrary<StoredNode> = fc.record({
  name: nameArb,
  size: fc.nat({ max: 1_000_000_000 }),
  updatedAt: fc.date({
    min: new Date("2020-01-01T00:00:00.000Z"),
    max: new Date("2030-12-31T23:59:59.000Z"),
    noInvalidDate: true,
  }).map((at) => at.toISOString()),
})

const filterArb: fc.Arbitrary<BoxFilter> = fc.record({
  // Short words drawn from the letters the names use, so that some of them hit.
  keyword: fc.string({ unit: fc.constantFrom("a", "b", "z", "i", "p", "R", "E", " ", "."), maxLength: 6 }),
  from: fc.option(dayArb, { nil: null }),
  to: fc.option(dayArb, { nil: null }),
})

describe("narrowedBox", () => {
  it("keeps a subsequence of the box, and never invents a row", () => {
    fc.assert(fc.property(fc.array(datedNodeArb, { maxLength: 12 }), filterArb, (rows, filter) => {
      const kept = narrowedBox(rows, filter)
      let at = 0
      for (const row of kept) {
        const found = rows.indexOf(row, at)
        expect(found).toBeGreaterThanOrEqual(at)
        at = found + 1
      }
    }))
  })

  it("keeps a row exactly when its slug holds every word and its JST day is inside the range", () => {
    fc.assert(fc.property(fc.array(datedNodeArb, { maxLength: 12 }), filterArb, (rows, filter) => {
      const words = filter.keyword.toLowerCase().split(/\s+/).filter((word) => word !== "")
      const wanted = rows.filter((row) => {
        const day = dayInJst(row.updatedAt)
        return words.every((word) => row.name.toLowerCase().includes(word))
          && (filter.from === null || filter.from <= day)
          && (filter.to === null || day <= filter.to)
      })
      expect(narrowedBox(rows, filter)).toEqual(wanted)
    }))
  })

  it("changes nothing when asked the same question twice", () => {
    fc.assert(fc.property(fc.array(datedNodeArb, { maxLength: 12 }), filterArb, (rows, filter) => {
      const once = narrowedBox(rows, filter)
      expect(narrowedBox(once, filter)).toEqual(once)
    }))
  })

  it("never keeps more for one more word, or for a narrower range", () => {
    fc.assert(fc.property(
      fc.array(datedNodeArb, { maxLength: 12 }),
      filterArb,
      fc.constantFrom("a", "z", "p", "."),
      dayArb,
      (rows, filter, word, day) => {
        const kept = new Set(narrowedBox(rows, filter))
        const more = narrowedBox(rows, { ...filter, keyword: `${filter.keyword} ${word}` })
        for (const row of more) expect(kept.has(row)).toBe(true)
        // Each end moved inwards, or set where it was open.
        const from = filter.from === null || day > filter.from ? day : filter.from
        const to = filter.to === null || day < filter.to ? day : filter.to
        for (const row of narrowedBox(rows, { ...filter, from })) expect(kept.has(row)).toBe(true)
        for (const row of narrowedBox(rows, { ...filter, to })) expect(kept.has(row)).toBe(true)
      },
    ))
  })

  it("reads the words without regard to case", () => {
    fc.assert(fc.property(fc.array(datedNodeArb, { maxLength: 12 }), filterArb, (rows, filter) => {
      expect(narrowedBox(rows, { ...filter, keyword: filter.keyword.toUpperCase() }))
        .toEqual(narrowedBox(rows, { ...filter, keyword: filter.keyword.toLowerCase() }))
    }))
  })
})
