import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { ListingSize } from "~/search/page-size"

import { branchListingQuery, filesQuery, listingQuery } from "./urls"

/** A setting of the listing of branches, of any shape the screen can write. */
const branchListing = fc.record({
  keyword: fc.string(),
  page: fc.integer({ min: 1, max: 50 }),
  sort: fc.constantFrom(null, "approved", "application"),
  order: fc.constantFrom(null, "asc", "desc"),
  size: fc.constantFrom<ListingSize | null>(null, 50, 100, "all"),
  branchStatuses: fc.subarray(["held", "absent", "unlabelled"]),
  applicationTypes: fc.subarray(["new", "update"]),
})

function read(address: string): URLSearchParams {
  return new URLSearchParams(address.replace(/^\?/, ""))
}

describe("the address of the listing of branches", () => {
  it("writes the word and the axis, and nothing it was not given", () => {
    fc.assert(fc.property(branchListing, (query) => {
      const written = read(branchListingQuery(query))
      expect(written.get("q") ?? "").toBe(query.keyword)
      expect(written.getAll("status")).toEqual(query.branchStatuses)
      expect(written.getAll("type")).toEqual(query.applicationTypes)
      expect(written.has("registered")).toBe(false)
    }))
  })
})

/** A day, written the way a date field writes it. */
const day = fc.date({
  min: new Date("2020-01-01T00:00:00.000Z"),
  max: new Date("2030-12-31T00:00:00.000Z"),
  noInvalidDate: true,
}).map((at) => at.toISOString().slice(0, 10))

/** A setting of the `common/` prefix, of any shape the screen can write. */
const filesListing = fc.record({
  keyword: fc.string(),
  page: fc.integer({ min: 1, max: 50 }),
  sort: fc.constantFrom(null, "size", "updated"),
  order: fc.constantFrom(null, "desc"),
  size: fc.constantFrom(null, 50, 100),
  from: fc.option(day, { nil: null }),
  to: fc.option(day, { nil: null }),
})

describe("the address of the common prefix", () => {
  it("writes each end of the range only when it is set, beside the words", () => {
    fc.assert(fc.property(filesListing, (query) => {
      const written = read(filesQuery(query))
      expect(written.getAll("from")).toEqual(query.from === null ? [] : [query.from])
      expect(written.getAll("to")).toEqual(query.to === null ? [] : [query.to])
      expect(written.get("q") ?? "").toBe(query.keyword)
      expect(written.get("page")).toBe(query.page === 1 ? null : String(query.page))
    }))
  })

  it("is the bare address when nothing differs from the default", () => {
    expect(filesQuery({ keyword: "", page: 1, sort: null, order: null, size: null, from: null, to: null })).toBe("")
  })
})

/** A setting of the research listing, of any shape the screen can write. */
const end = fc.option(fc.constantFrom("2024-01-01", "2025-06-30", "2026-09-26"), { nil: null })
const researchListing = fc.record({
  keyword: fc.string(),
  page: fc.integer({ min: 1, max: 50 }),
  sort: fc.constantFrom(null, "id", "datePublished", "dateModified"),
  order: fc.constantFrom(null, "asc", "desc"),
  size: fc.constantFrom<ListingSize | null>(null, 50, 100, "all"),
  statuses: fc.subarray(["published", "unpublished"]),
  publishedFrom: end,
  publishedTo: end,
  updatedFrom: end,
  updatedTo: end,
  files: fc.subarray(["with", "without"]),
})

describe("the address of the research listing", () => {
  it("writes each end of the two ranges it was given, the file ticks and the size, and nothing else", () => {
    fc.assert(fc.property(researchListing, (query) => {
      const written = read(listingQuery(query))
      for (const name of ["publishedFrom", "publishedTo", "updatedFrom", "updatedTo"] as const) {
        expect(written.get(name)).toBe(query[name])
      }
      expect(written.getAll("files")).toEqual(query.files)
      expect(written.getAll("status")).toEqual(query.statuses)
      expect(written.get("size")).toBe(query.size === null ? null : String(query.size))
    }))
  })
})
