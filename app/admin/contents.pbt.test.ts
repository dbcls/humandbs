import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { latestVersionSlug, versionNumberIn } from "./contents"

describe("latestVersionSlug", () => {
  it("names a revision of the base whose number no other revision of it exceeds, whatever the order", () => {
    const slug = fc.oneof(
      fc.integer({ min: 0, max: 50 }).map((n) => `x/version/${String(n)}`),
      fc.integer({ min: 1, max: 50 }).map((n) => `y/version/${String(n)}`),
      fc.constant("x"),
    )
    fc.assert(fc.property(fc.array(slug), (slugs) => {
      const latest = latestVersionSlug("x", slugs)
      const numbers = slugs.flatMap((one) => versionNumberIn("x", one) ?? [])
      if (numbers.length === 0) {
        expect(latest).toBeNull()
        return
      }
      expect(versionNumberIn("x", latest ?? "")).toBe(Math.max(...numbers))
    }))
  })
})
