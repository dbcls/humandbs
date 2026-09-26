import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { paneScrollTop, tableScrollLeft } from "./scroll"

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

/**
 * The same promise sideways, inside a table wider than its pane: the target
 * ends up in the middle of what shows of the table — the part right of the
 * columns that stay put — unless the table cannot scroll that far.
 */
const table = fc.record({
  left: fc.double({ min: 0, max: 2000, noNaN: true }),
  width: fc.double({ min: 200, max: 2000, noNaN: true }),
  scrollLeft: fc.double({ min: 0, max: 3000, noNaN: true }),
  extra: fc.double({ min: 0, max: 3000, noNaN: true }),
  covered: fc.double({ min: 0, max: 150, noNaN: true }),
}).map(({ extra, ...rest }) => ({ ...rest, scrollWidth: rest.width + extra }))
const cell = fc.record({
  left: fc.double({ min: -5000, max: 5000, noNaN: true }),
  width: fc.double({ min: 0, max: 400, noNaN: true }),
})

describe("where a wide table has to scroll to", () => {
  it("stays between the two ends the table can reach", () => {
    fc.assert(fc.property(table, cell, (t, c) => {
      const to = tableScrollLeft(t, c)
      expect(to).toBeGreaterThanOrEqual(0)
      expect(to).toBeLessThanOrEqual(t.scrollWidth - t.width + 1e-6)
    }))
  })

  it("puts the target's middle in the middle of what shows right of the fixed columns, where it can", () => {
    fc.assert(fc.property(table, cell, (t, c) => {
      const to = tableScrollLeft(t, c)
      if (to <= 0 || to >= t.scrollWidth - t.width) return
      const middleAfter = c.left - (to - t.scrollLeft) + c.width / 2
      expect(middleAfter).toBeCloseTo(t.left + t.covered + (t.width - t.covered) / 2, 6)
    }))
  })

  it("brings a cell hidden past the right edge back into view", () => {
    // 11 columns in a 700px pane, the provider column 1,500px along the row.
    const to = tableScrollLeft(
      { left: 100, width: 700, scrollLeft: 0, scrollWidth: 1900, covered: 104 },
      { left: 1600, width: 160 },
    )
    expect(to).toBe(1500 - 104 - (700 - 104 - 160) / 2)
  })
})
