import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { drawingKey, fetcherSends } from "./navigating"

/**
 * What holds a panel's buttons shut and closes it when it lands is a fetcher
 * sending to an action; the page drawn beside a form is posted but is a read.
 */
describe("fetcherSends", () => {
  it("POST などの送信中の fetcher は送信に数える", () => {
    for (const formMethod of ["POST", "post", "PUT", "PATCH", "DELETE"]) {
      expect(fetcherSends({ state: "submitting", formMethod, key: "a" }), formMethod).toBe(true)
      expect(fetcherSends({ state: "loading", formMethod, key: "a" }), formMethod).toBe(true)
    }
  })

  it("止まっている fetcher、GET、method の無い fetcher は数えない", () => {
    expect(fetcherSends({ state: "idle", formMethod: "POST", key: "a" })).toBe(false)
    expect(fetcherSends({ state: "loading", formMethod: "GET", key: "a" })).toBe(false)
    expect(fetcherSends({ state: "loading", formMethod: "get", key: "a" })).toBe(false)
    expect(fetcherSends({ state: "loading", key: "a" })).toBe(false)
  })

  it("公開ページを描く fetcher は、POST で送信中でも数えない", () => {
    fc.assert(fc.property(fc.string(), fc.constantFrom("submitting", "loading"), fc.constantFrom("POST", "post", "PUT"), (id, state, formMethod) => {
      expect(fetcherSends({ state, formMethod, key: drawingKey(id) })).toBe(false)
    }))
  })

  it("描く fetcher の key で始まらない key は、ほかの条件どおりに数える", () => {
    fc.assert(fc.property(fc.string().filter((key) => !key.startsWith(drawingKey(""))), (key) => {
      expect(fetcherSends({ state: "submitting", formMethod: "POST", key })).toBe(true)
    }))
  })
})
