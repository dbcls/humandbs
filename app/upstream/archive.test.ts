import { describe, expect, it } from "vitest"

import { archiveResourceOf, calendarDayOf, isArchiveAccession } from "./archive"

describe("archiveResourceOf", () => {
  it.each([
    ["DRA000001", "sra-submission"],
    ["E-GEAD-563", "gea"],
    ["MTBKS123", "metabobank"],
    ["PRJDB10452", "bioproject"],
  ])("sends %s to the resource that answers for it", (accession, resource) => {
    expect(archiveResourceOf(accession)).toBe(resource)
  })

  it("does not guess for a JGA accession, which the application system answers for", () => {
    expect(archiveResourceOf("JGAD000001")).toBeNull()
  })

  it("does not guess for an id the portal issued", () => {
    expect(archiveResourceOf("hum0014-NHA001")).toBeNull()
  })

  it("does not guess for a prefix nobody has registered", () => {
    expect(isArchiveAccession("XYZ000001")).toBe(false)
  })
})

describe("calendarDayOf", () => {
  it("keeps a day that arrived as a day, which carries no time to move", () => {
    expect(calendarDayOf("2022-10-28")).toBe("2022-10-28")
  })

  it("reads the day an instant falls on in JST", () => {
    expect(calendarDayOf("2020-09-28T02:03:50Z")).toBe("2020-09-28")
  })

  it("moves an evening in UTC on to the next day, which is when it was published here", () => {
    expect(calendarDayOf("2020-08-21T16:30:00Z")).toBe("2020-08-22")
  })

  it.each([undefined, null, "", "   ", "not a date"])("answers null for %s", (value) => {
    expect(calendarDayOf(value)).toBeNull()
  })
})
