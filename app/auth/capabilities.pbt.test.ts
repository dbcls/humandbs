import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { type Actor, CAPABILITIES, can, capabilitiesFor } from "./capabilities"

const capability = fc.constantFrom(...CAPABILITIES)

/**
 * An actor as the request path builds it: whatever the identity, the capability
 * set is always derived from `isAdmin` and never carried alongside it.
 */
const actor = fc.record({
  sessionId: fc.string(),
  sub: fc.string(),
  name: fc.string(),
  isAdmin: fc.boolean(),
}).map((fields): Actor => ({ ...fields, capabilities: capabilitiesFor(fields.isAdmin) }))

describe("認可の導出", () => {
  it("許されるかどうかは admin かどうかだけで決まる", () => {
    fc.assert(fc.property(actor, capability, (subject, asked) => {
      expect(can(subject, asked)).toBe(subject.isAdmin)
    }))
  })

  it("admin でない主体はどの capability も持たない", () => {
    fc.assert(fc.property(capability, (asked) => {
      expect(capabilitiesFor(false).has(asked)).toBe(false)
    }))
  })

  it("admin は capability の一覧そのものを持つ", () => {
    fc.assert(fc.property(capability, (asked) => {
      expect(capabilitiesFor(true).has(asked)).toBe(true)
    }))
  })
})
