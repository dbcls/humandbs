import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { branchListingQuery, draftTargetQuery } from "./urls"

/** A setting of the listing of branches, of any shape the screen can write. */
const branchListing = fc.record({
  keyword: fc.string(),
  page: fc.integer({ min: 1, max: 50 }),
  sort: fc.constantFrom(null, "approved", "application"),
  order: fc.constantFrom(null, "asc", "desc"),
  size: fc.constantFrom(null, 50, 100),
  standings: fc.subarray(["held", "absent", "unlabelled"]),
  registrations: fc.subarray(["some", "none"]),
  draft: fc.option(fc.uuid(), { nil: null }),
})

function read(address: string): URLSearchParams {
  return new URLSearchParams(address.replace(/^\?/, ""))
}

describe("the address of the listing of branches", () => {
  /*
    Opened from a draft, every press on the listing — a condition, an ordering,
    a page — has to keep the draft, or the reader lands back on the listing the
    bar opens and takes a branch into somewhere they did not choose.
  */
  it("carries the draft it is aimed at through every other setting", () => {
    fc.assert(fc.property(branchListing, (query) => {
      const written = read(branchListingQuery(query))
      expect(written.getAll("draft")).toEqual(query.draft === null ? [] : [query.draft])
      expect(written.get("q") ?? "").toBe(query.keyword)
      expect(written.getAll("standing")).toEqual(query.standings)
      expect(written.getAll("registered")).toEqual(query.registrations)
    }))
  })
})

describe("the draft a branch screen is aimed at", () => {
  it("leaves the address bare when there is none", () => {
    expect(draftTargetQuery(null)).toBe("")
  })

  it("reads back as the same draft", () => {
    fc.assert(fc.property(fc.uuid(), (draftId) => {
      expect(read(draftTargetQuery(draftId)).getAll("draft")).toEqual([draftId])
    }))
  })
})
