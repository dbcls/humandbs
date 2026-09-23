import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { branchListingQuery, filesQuery } from "./urls"

/** A setting of the listing of branches, of any shape the screen can write. */
const branchListing = fc.record({
  keyword: fc.string(),
  page: fc.integer({ min: 1, max: 50 }),
  sort: fc.constantFrom(null, "approved", "application"),
  order: fc.constantFrom(null, "asc", "desc"),
  size: fc.constantFrom(null, 50, 100),
  standings: fc.subarray(["held", "absent", "unlabelled"]),
  registrations: fc.subarray(["some", "none"]),
})

function read(address: string): URLSearchParams {
  return new URLSearchParams(address.replace(/^\?/, ""))
}

describe("the address of the listing of branches", () => {
  it("writes the word and the two axes, and nothing it was not given", () => {
    fc.assert(fc.property(branchListing, (query) => {
      const written = read(branchListingQuery(query))
      expect(written.get("q") ?? "").toBe(query.keyword)
      expect(written.getAll("standing")).toEqual(query.standings)
      expect(written.getAll("registered")).toEqual(query.registrations)
    }))
  })
})

/** A day, written the way a date field writes it. */
const day = fc.date({
  min: new Date("2020-01-01T00:00:00.000Z"),
  max: new Date("2030-12-31T00:00:00.000Z"),
  noInvalidDate: true,
}).map((at) => at.toISOString().slice(0, 10))

/** A setting of the `common/` box, of any shape the screen can write. */
const filesListing = fc.record({
  keyword: fc.string(),
  page: fc.integer({ min: 1, max: 50 }),
  sort: fc.constantFrom(null, "size", "updated"),
  order: fc.constantFrom(null, "desc"),
  size: fc.constantFrom(null, 50, 100),
  from: fc.option(day, { nil: null }),
  to: fc.option(day, { nil: null }),
})

describe("the address of the common box", () => {
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
