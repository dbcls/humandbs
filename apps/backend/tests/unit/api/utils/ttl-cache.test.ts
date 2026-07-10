import { describe, expect, it } from "bun:test"

import { TtlMapCache } from "@/api/utils/ttl-cache"

describe("TtlMapCache", () => {
  it("returns undefined for missing keys", () => {
    const cache = new TtlMapCache<string>(1000)
    expect(cache.get("missing")).toBeUndefined()
  })

  it("stores and retrieves values", () => {
    const cache = new TtlMapCache<string>(1000)
    cache.set("key", "value")
    expect(cache.get("key")).toBe("value")
  })

  it("expires entries after TTL", () => {
    const cache = new TtlMapCache<string>(0)
    cache.set("key", "value")
    expect(cache.get("key")).toBeUndefined()
  })

  it("clears all entries", () => {
    const cache = new TtlMapCache<string>(60_000)
    cache.set("a", "1")
    cache.set("b", "2")
    expect(cache.size).toBe(2)
    cache.clear()
    expect(cache.size).toBe(0)
  })
})
