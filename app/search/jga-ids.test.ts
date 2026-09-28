import { describe, expect, it } from "vitest"

import { canonicalJgaIds } from "./jga-ids"

describe("canonicalJgaIds", () => {
  it("reads the eleven-digit spelling as the six-digit one", () => {
    expect(canonicalJgaIds("JGAS00000000197")).toBe("JGAS000197")
    expect(canonicalJgaIds("JGAD00000000004")).toBe("JGAD000004")
    expect(canonicalJgaIds("JGAC00000000001")).toBe("JGAC000001")
    expect(canonicalJgaIds("JGAP00000000001")).toBe("JGAP000001")
  })

  it("rewrites any spelling longer than six digits that starts with a zero", () => {
    expect(canonicalJgaIds("JGAS0000197")).toBe("JGAS000197")
    expect(canonicalJgaIds("JGAS00001234567")).toBe("JGAS1234567")
    expect(canonicalJgaIds("JGAS0000000")).toBe("JGAS000000")
  })

  it("leaves a spelling of six digits or fewer as typed, so part of an accession still matches", () => {
    expect(canonicalJgaIds("JGAS000197")).toBe("JGAS000197")
    expect(canonicalJgaIds("JGAS0001")).toBe("JGAS0001")
    expect(canonicalJgaIds("jgas000197")).toBe("jgas000197")
  })

  it("leaves a long number that does not start with a zero, which names another accession", () => {
    expect(canonicalJgaIds("JGAS1234567")).toBe("JGAS1234567")
  })

  it("rewrites each accession inside a longer text and nothing around them", () => {
    expect(canonicalJgaIds("JGAS00000000197, (JGAD00000000004) WGS"))
      .toBe("JGAS000197, (JGAD000004) WGS")
  })

  it("leaves what is not a JGA study, dataset, DAC or policy", () => {
    expect(canonicalJgaIds("JGA00000000385")).toBe("JGA00000000385")
    expect(canonicalJgaIds("JGAX00000000001")).toBe("JGAX00000000001")
    expect(canonicalJgaIds("hum00000000014")).toBe("hum00000000014")
    expect(canonicalJgaIds("XJGAS00000000197")).toBe("XJGAS00000000197")
  })
})
