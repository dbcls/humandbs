import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { refusedAsCrossSite } from "./csrf"

const AT = "https://humandbs.dbcls.jp/admin/research/R/draft/D/comments"

function request(method: string, headers: Record<string, string>): Request {
  return new Request(AT, { method, headers })
}

const WRITES = ["POST", "PUT", "PATCH", "DELETE"] as const
const READS = ["GET", "HEAD", "OPTIONS"] as const

describe("refusedAsCrossSite", () => {
  it("lets a write from the portal's own pages through", () => {
    for (const method of WRITES) {
      expect(refusedAsCrossSite(request(method, { "origin": "https://humandbs.dbcls.jp", "sec-fetch-site": "same-origin" })), method).toBe(false)
      expect(refusedAsCrossSite(request(method, { origin: "https://humandbs.dbcls.jp" })), method).toBe(false)
      expect(refusedAsCrossSite(request(method, { "sec-fetch-site": "same-origin" })), method).toBe(false)
    }
  })

  it("refuses a write from a sibling subdomain, which SameSite=Lax would still send the cookie for", () => {
    expect(refusedAsCrossSite(request("POST", { "origin": "https://evil.dbcls.jp", "sec-fetch-site": "same-site" }))).toBe(true)
    expect(refusedAsCrossSite(request("POST", { origin: "https://evil.dbcls.jp" }))).toBe(true)
    expect(refusedAsCrossSite(request("POST", { "sec-fetch-site": "same-site" }))).toBe(true)
  })

  it("refuses a write from another site, a sandboxed document or with an unreadable origin", () => {
    expect(refusedAsCrossSite(request("POST", { "origin": "https://evil.example", "sec-fetch-site": "cross-site" }))).toBe(true)
    expect(refusedAsCrossSite(request("POST", { origin: "null" }))).toBe(true)
    expect(refusedAsCrossSite(request("DELETE", { origin: "not a url" }))).toBe(true)
    // Another port on the same host is another origin.
    expect(refusedAsCrossSite(request("POST", { origin: "https://humandbs.dbcls.jp:8443" }))).toBe(true)
  })

  it("refuses a write whose two headers disagree", () => {
    expect(refusedAsCrossSite(request("POST", { "origin": "https://humandbs.dbcls.jp", "sec-fetch-site": "cross-site" }))).toBe(true)
  })

  it("refuses a write that identifies no origin at all, which no current browser sends", () => {
    expect(refusedAsCrossSite(request("POST", {}))).toBe(true)
  })

  it("never refuses a read, whatever it has about where it came from", () => {
    const site = fc.constantFrom("same-origin", "same-site", "cross-site", "none", undefined)
    const origin = fc.constantFrom("https://humandbs.dbcls.jp", "https://evil.example", "null", "garbage", undefined)
    fc.assert(fc.property(fc.constantFrom(...READS), site, origin, (method, s, o) => {
      const headers: Record<string, string> = {}
      if (s !== undefined) headers["sec-fetch-site"] = s
      if (o !== undefined) headers.origin = o
      expect(refusedAsCrossSite(request(method, headers))).toBe(false)
    }))
  })

  it("refuses every write whose origin names another host, in any case of the method", () => {
    const host = fc.domain().filter((one) => one !== "humandbs.dbcls.jp")
    const method = fc.constantFrom(...WRITES).chain((one) => fc.constantFrom(one, one.toLowerCase()))
    fc.assert(fc.property(method, host, (m, h) => {
      expect(refusedAsCrossSite(request(m, { origin: `https://${h}` }))).toBe(true)
    }))
  })
})
