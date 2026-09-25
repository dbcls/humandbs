import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { paneScrollTop } from "./scroll"

/**
 * The one promise of the number: after the pane scrolls to it, the target
 * sits where it was asked to. The pane's own top and what it had already
 * scrolled must fall out of the answer — the target is measured on screen,
 * against a pane that is itself somewhere on screen and partly scrolled.
 */
const rect = fc.record({
  top: fc.double({ min: -5000, max: 5000, noNaN: true }),
  height: fc.double({ min: 0, max: 3000, noNaN: true }),
})
const pane = fc.record({
  top: fc.double({ min: 0, max: 2000, noNaN: true }),
  height: fc.double({ min: 1, max: 3000, noNaN: true }),
  scrollTop: fc.double({ min: 0, max: 20000, noNaN: true }),
})

/** Where the target's top will be on screen once the pane has scrolled to `to`. */
function topAfter(p: { top: number, scrollTop: number }, t: { top: number }, to: number): number {
  return t.top - (to - p.scrollTop)
}

describe("where the pane has to scroll to", () => {
  it("puts the target's top at the pane's top for \"start\", unless that is above the pane's own start", () => {
    fc.assert(fc.property(pane, rect, (p, t) => {
      const to = paneScrollTop(p, t, "start")
      expect(to).toBeGreaterThanOrEqual(0)
      if (to > 0) expect(topAfter(p, t, to)).toBeCloseTo(p.top, 6)
    }))
  })

  it("puts the target's middle at the pane's middle for \"center\", unless that is above the pane's own start", () => {
    fc.assert(fc.property(pane, rect, (p, t) => {
      const to = paneScrollTop(p, t, "center")
      expect(to).toBeGreaterThanOrEqual(0)
      if (to > 0) expect(topAfter(p, t, to) + t.height / 2).toBeCloseTo(p.top + p.height / 2, 6)
    }))
  })

  it("scrolls nothing when the target already sits where it was asked to", () => {
    fc.assert(fc.property(pane, fc.double({ min: 0, max: 3000, noNaN: true }), (p, height) => {
      const atStart = { top: p.top, height }
      expect(paneScrollTop(p, atStart, "start")).toBeCloseTo(p.scrollTop, 6)
      const atCenter = { top: p.top + (p.height - height) / 2, height }
      expect(paneScrollTop(p, atCenter, "center")).toBeCloseTo(p.scrollTop, 6)
    }))
  })

  it("does not read anything sideways", () => {
    // The signature holds no x at all: what the pane is asked for cannot move it sideways.
    expect(paneScrollTop({ top: 100, height: 700, scrollTop: 0 }, { top: 500, height: 100 }, "start")).toBe(400)
  })
})
