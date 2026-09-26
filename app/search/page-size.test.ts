import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { ALL_ROWS, LISTING_SIZES, PAGE_SIZE, PAGE_SIZES, readListingSize, rowsPerPage } from "./page-size"

describe("readListingSize", () => {
  it.each([
    [null, PAGE_SIZE],
    ["", PAGE_SIZE],
    ["20", 20],
    ["50", 50],
    ["100", 100],
    ["all", ALL_ROWS],
  ] as const)("reads %j as %j", (written, size) => {
    expect(readListingSize(written)).toBe(size)
  })

  it.each(["30", "0", "-20", "ALL", "All", " all", "all ", "size"])(
    "serves %j as the first size rather than refusing it",
    (written) => {
      expect(readListingSize(written)).toBe(PAGE_SIZE)
    },
  )

  it("always reads one of the offered sizes", () => {
    fc.assert(fc.property(fc.option(fc.string(), { nil: null }), (written) => {
      expect(LISTING_SIZES).toContain(readListingSize(written))
    }))
  })
})

describe("rowsPerPage", () => {
  it("keeps a numbered size as it is, however long the result", () => {
    fc.assert(fc.property(fc.constantFrom(...PAGE_SIZES), fc.nat(100_000), (size, total) => {
      expect(rowsPerPage(size, total)).toBe(size)
    }))
  })

  it("puts every row on one page for all, and still a page for an empty result", () => {
    fc.assert(fc.property(fc.nat(100_000), (total) => {
      const perPage = rowsPerPage(ALL_ROWS, total)
      expect(perPage).toBeGreaterThanOrEqual(1)
      expect(Math.max(1, Math.ceil(total / perPage))).toBe(1)
    }))
  })
})
