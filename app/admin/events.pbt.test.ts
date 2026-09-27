import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { alertExcerpt } from "./events"

describe("alertExcerpt", () => {
  it("is one line of the text, at most 40 characters and the ellipsis", () => {
    fc.assert(fc.property(fc.string(), fc.string(), (ja, en) => {
      const name = alertExcerpt({ ja, en })
      expect(name).not.toContain("\n")
      expect(name.length).toBeLessThanOrEqual(41)
    }))
  })

  it("takes the Japanese text whenever it has any", () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim() !== "" && !s.includes("\n")), fc.string(), (ja, en) => {
      expect(alertExcerpt({ ja, en })).toBe(ja.trim())
    }))
  })

  it("is empty only when neither language has anything written", () => {
    expect(alertExcerpt({ ja: " \n", en: "" })).toBe("")
    expect(alertExcerpt({ ja: "", en: "Maintenance" })).toBe("Maintenance")
  })
})
