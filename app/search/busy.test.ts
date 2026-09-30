import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { isSearchBusy, limiter, orBusy, RETRY_AFTER_SECONDS, SearchesFull } from "./busy.server"

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

/** A call that finishes when told to, and records when it started. */
function held(started: number[], at: number): { run: () => Promise<void>, finish: () => void } {
  const { promise, resolve } = Promise.withResolvers<undefined>()
  return {
    run: () => {
      started.push(at)
      return promise
    },
    finish: () => {
      resolve(undefined)
    },
  }
}

/** Lets every promise that can settle settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("limiter", () => {
  it("runs no more than its size at once, starts the rest in the order they came, and finishes all of them", async () => {
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 12 }).chain((count) => fc.tuple(fc.constant(count), fc.shuffledSubarray([...Array(count).keys()], { minLength: count }))),
      async (size, [count, finishing]) => {
        const limit = limiter({ size, waitMs: 60_000 })
        const started: number[] = []
        let running = 0
        let most = 0
        const calls = Array.from({ length: count }, (_, at) => held(started, at))
        const results = calls.map((call, at) => limit(async () => {
          running++
          most = Math.max(most, running)
          await call.run()
          running--
          return at
        }))
        await settle()
        for (const at of finishing) {
          calls[at]?.finish()
          await settle()
        }
        expect(await Promise.all(results)).toEqual([...Array(count).keys()])
        expect(most).toBe(Math.min(size, count))
        expect(started).toEqual([...Array(count).keys()])
      },
    ), { numRuns: 60 })
  })

  it("refuses a call that waited as long as it may, as a busy search, and still starts the next once one finishes", async () => {
    const limit = limiter({ size: 1, waitMs: 20 })
    const started: number[] = []
    const first = held(started, 0)
    const running = limit(first.run)
    const refused = await limit(() => Promise.resolve("never")).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(SearchesFull)
    expect(isSearchBusy(new Error("outer", { cause: refused }))).toBe(true)

    first.finish()
    await running
    await expect(limit(() => Promise.resolve("next"))).resolves.toBe("next")
  })

  it("gives the place of a call that fails to the one waiting", async () => {
    const limit = limiter({ size: 1, waitMs: 60_000 })
    const failing = limit(() => Promise.reject(new Error("boom")))
    const waiting = limit(() => Promise.resolve("ran"))
    await expect(failing).rejects.toThrow("boom")
    await expect(waiting).resolves.toBe("ran")
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
