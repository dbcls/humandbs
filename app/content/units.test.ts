import { describe, expect, it } from "vitest"

import { convert, convertible } from "./units"

describe("converting a number to the unit its key stores", () => {
  it("scales within a group of units", () => {
    expect(convert(1.5, "TB", "GB")).toBe(1500)
    expect(convert(500, "MB", "GB")).toBe(0.5)
    expect(convert(150, "bp", "bp")).toBe(150)
  })

  it("refuses to convert between things that are not the same measurement", () => {
    expect(convert(1, "GB", "bp")).toBeNull()
    expect(convertible("GB", "bp")).toBe(false)
  })

  it("refuses a unit it does not know rather than guessing at it", () => {
    expect(convert(1, "gigabytes", "GB")).toBeNull()
  })

  it("leaves a count alone and refuses to give one a unit", () => {
    expect(convert(42, null, null)).toBe(42)
    expect(convert(42, "GB", null)).toBeNull()
    expect(convert(42, null, "GB")).toBeNull()
  })

  it("comes back to where it started when converted both ways", () => {
    const there = convert(2, "TB", "MB")
    expect(there).not.toBeNull()
    expect(convert(there ?? 0, "MB", "TB")).toBeCloseTo(2, 10)
  })
})
