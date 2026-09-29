import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { isSearchBusy, orBusy, RETRY_AFTER_SECONDS } from "./busy.server"

const WAITED_TOO_LONG = new Error("timeout exceeded when trying to connect")
const RAN_TOO_LONG = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" })

describe("isSearchBusy", () => {
  it("is true when no search connection came free in time, and when a search ran too long", () => {
    expect(isSearchBusy(WAITED_TOO_LONG)).toBe(true)
    expect(isSearchBusy(RAN_TOO_LONG)).toBe(true)
  })

  it("looks through the errors the query builder wraps them in", () => {
    expect(isSearchBusy(new Error("Failed query: select 1", { cause: WAITED_TOO_LONG }))).toBe(true)
    expect(isSearchBusy(new Error("outer", { cause: new Error("Failed query", { cause: RAN_TOO_LONG }) }))).toBe(true)
  })

  it("is false for anything else", () => {
    for (const error of [new Error("boom"), Object.assign(new Error("duplicate key"), { code: "23505" }), null, undefined, "timeout exceeded when trying to connect", 57014]) {
      expect(isSearchBusy(error), String(error)).toBe(false)
    }
    fc.assert(fc.property(fc.string(), fc.string().filter((code) => code !== "57014"), (message, code) => {
      fc.pre(message !== "timeout exceeded when trying to connect")
      expect(isSearchBusy(Object.assign(new Error(message), { code }))).toBe(false)
    }))
  })

  it("does not loop on an error that is its own cause", () => {
    const error: Error & { cause?: unknown } = new Error("loop")
    error.cause = error
    expect(isSearchBusy(error)).toBe(false)
  })
})

describe("orBusy", () => {
  it("passes a result through", async () => {
    await expect(orBusy(() => Promise.resolve(42))).resolves.toBe(42)
  })

  it("turns a busy search into a 503 that asks to come back later", async () => {
    const thrown = await orBusy(() => Promise.reject(new Error("Failed query", { cause: WAITED_TOO_LONG })))
      .catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(Response)
    const response = thrown as Response
    expect(response.status).toBe(503)
    expect(response.headers.get("Retry-After")).toBe(String(RETRY_AFTER_SECONDS))
  })

  it("lets any other error through as it is", async () => {
    const other = new Error("boom")
    await expect(orBusy(() => Promise.reject(other))).rejects.toBe(other)
  })
})
