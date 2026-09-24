import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetIdentity, nameBasedUuid, researchIdentity } from "./identity"

describe("nameBasedUuid", () => {
  it("matches the published version 5 example", () => {
    // RFC 9562 appendix A.4: "www.example.com" under the DNS namespace.
    expect(nameBasedUuid("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2")
  })

  it("is a well-formed version 5 UUID for any name, and the same one every time", () => {
    fc.assert(fc.property(fc.string(), (name) => {
      const id = nameBasedUuid(name)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(nameBasedUuid(name)).toBe(id)
    }))
  })

  it("gives different names different identities", () => {
    fc.assert(fc.property(fc.string(), fc.string(), (a, b) => {
      fc.pre(a !== b)
      expect(nameBasedUuid(a)).not.toBe(nameBasedUuid(b))
    }))
  })
})

describe("researchIdentity and datasetIdentity", () => {
  it("never give a research and a dataset of the same name one identity", () => {
    expect(researchIdentity("hum0014")).not.toBe(datasetIdentity("hum0014"))
  })
})
