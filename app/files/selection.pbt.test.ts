import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { inListingOrder } from "./selection"

const names = fc.array(fc.string({ maxLength: 8 }), { maxLength: 12 })

describe("inListingOrder", () => {
  it("writes every name once, in name order", () => {
    fc.assert(fc.property(names, (selected) => {
      const written = inListingOrder(selected)
      expect(new Set(written).size).toBe(written.length)
      expect(new Set(written)).toEqual(new Set(selected))
      for (let at = 1; at < written.length; at += 1) {
        expect((written[at - 1] ?? "") < (written[at] ?? "")).toBe(true)
      }
    }))
  })

  it("writes the same selection chosen in any order the same way", () => {
    fc.assert(fc.property(names, fc.nat(), (selected, seed) => {
      const turned = selected.toSorted(() => (seed % 3) - 1)
      expect(inListingOrder(turned)).toEqual(inListingOrder(selected))
    }))
  })

  it("leaves a selection already written alone", () => {
    fc.assert(fc.property(names, (selected) => {
      expect(inListingOrder(inListingOrder(selected))).toEqual(inListingOrder(selected))
    }))
  })

  it("orders by code point, the way the prefix lists, not by locale", () => {
    expect(inListingOrder(["b.txt", "B.txt", "a.txt", "_x.txt"])).toEqual(["B.txt", "_x.txt", "a.txt", "b.txt"])
  })
})
