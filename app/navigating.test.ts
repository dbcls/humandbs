import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { drawingKey, drawingMayStart, fetcherSends } from "./navigating"

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

/**
 * A drawing started while something else is in flight would take that
 * thing's reading of the screen away, so it waits for everything but the
 * drawings to settle.
 */
describe("drawingMayStart", () => {
  const idle = { state: "idle" }
  const fetcher = (state: string, key: string) => ({ state, key })

  it("何も動いていなければ描ける", () => {
    expect(drawingMayStart(idle, [])).toBe(true)
    expect(drawingMayStart(idle, [fetcher("idle", "save"), fetcher("idle", drawingKey("a"))])).toBe(true)
  })

  it("画面の移動・送信・読み直しのあいだは描かない", () => {
    for (const state of ["submitting", "loading"]) {
      expect(drawingMayStart({ state }, []), state).toBe(false)
    }
  })

  it("描く fetcher 以外の fetcher が送信中・読み込み中なら描かない", () => {
    for (const state of ["submitting", "loading"]) {
      expect(drawingMayStart(idle, [fetcher(state, "save")]), state).toBe(false)
    }
  })

  it("ほかの描く fetcher が動いていても描ける", () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.string(), fc.constantFrom("idle", "submitting", "loading"))), (drawings) => {
      expect(drawingMayStart(idle, drawings.map(([id, state]) => fetcher(state, drawingKey(id))))).toBe(true)
    }))
  })

  it("描く fetcher でない fetcher が 1 つでも動いていれば描かない", () => {
    fc.assert(fc.property(
      fc.array(fc.tuple(fc.string(), fc.constantFrom("idle", "submitting", "loading"))),
      fc.string().filter((key) => !key.startsWith(drawingKey(""))),
      fc.constantFrom("submitting", "loading"),
      (drawings, key, state) => {
        const all = [...drawings.map(([id, s]) => fetcher(s, drawingKey(id))), fetcher(state, key)]
        expect(drawingMayStart(idle, all)).toBe(false)
      },
    ))
  })
})
