import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { canonicalJgaIds } from "./jga-ids"

const prefix = fc.constantFrom("JGAS", "JGAD", "JGAC", "JGAP", "jgas", "Jgad")
const number = fc.integer({ min: 0, max: 99_999_999 })

describe("canonicalJgaIds", () => {
  it("reads any spelling padded past six digits as the accession with the same number", () => {
    fc.assert(fc.property(prefix, number, fc.integer({ min: 7, max: 15 }), (p, n, width) => {
      const typed = `${p}${String(n).padStart(width, "0")}`
      fc.pre(typed.length - p.length > 6 && typed[p.length] === "0")
      expect(canonicalJgaIds(typed)).toBe(`${p.toUpperCase()}${String(n).padStart(6, "0")}`)
    }))
  })

  it("changes nothing a second time", () => {
    fc.assert(fc.property(fc.string(), (text) => {
      const once = canonicalJgaIds(text)
      expect(canonicalJgaIds(once)).toBe(once)
    }))
  })

  it("keeps the number of every accession it rewrites", () => {
    fc.assert(fc.property(prefix, number, fc.integer({ min: 1, max: 8 }), fc.string(), (p, n, zeros, around) => {
      fc.pre(!/[0-9A-Za-z]$/.test(around))
      const typed = `${around}${p}${"0".repeat(zeros)}${String(n).padStart(6, "0")} `
      const digits = /JGA[SDCP](\d+) $/i.exec(canonicalJgaIds(typed))?.[1]
      expect(Number(digits)).toBe(n)
    }))
  })

  it("leaves a text without a JGA accession as it was", () => {
    fc.assert(fc.property(fc.string().filter((text) => !/jga/i.test(text)), (text) => {
      expect(canonicalJgaIds(text)).toBe(text)
    }))
  })
})
