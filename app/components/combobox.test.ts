import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { comboKey, listPlace } from "./combobox"

describe("the keys of the term box", () => {
  const typed = { open: false, active: 0, find: "ゲノム" }

  it("opens on Down or Up once closed, whether anything is typed or not, at the first option", () => {
    for (const find of ["", "  ", "ゲノム"]) {
      for (const key of ["ArrowDown", "ArrowUp"]) {
        expect(comboKey({ open: false, active: 3, find }, key, 5)?.state).toEqual({ open: true, active: 0, find })
      }
    }
  })

  it("walks the list round at both ends", () => {
    const open = { ...typed, open: true }
    expect(comboKey({ ...open, active: 4 }, "ArrowDown", 5)?.state.active).toBe(0)
    expect(comboKey({ ...open, active: 0 }, "ArrowUp", 5)?.state.active).toBe(4)
  })

  it("takes the walked-to option on Enter only while the list is open and holds something", () => {
    expect(comboKey({ ...typed, open: true }, "Enter", 3)).toEqual({ state: { ...typed, open: true }, choose: true })
    expect(comboKey({ ...typed, open: true }, "Enter", 0)?.choose).toBe(false)
    // Closed, Enter is still caught — the box never sends the form.
    expect(comboKey(typed, "Enter", 3)).toEqual({ state: typed, choose: false })
  })

  it("closes on Escape, empties on a second, and leaves a third to whatever is around it", () => {
    const first = comboKey({ ...typed, open: true }, "Escape", 3)
    expect(first?.state).toEqual({ ...typed, open: false })
    const second = comboKey(first?.state ?? typed, "Escape", 3)
    expect(second?.state.find).toBe("")
    expect(comboKey({ open: false, active: 0, find: "" }, "Escape", 3)).toBeNull()
  })

  it("leaves every other key to the box", () => {
    expect(comboKey(typed, "a", 3)).toBeNull()
    expect(comboKey(typed, "Tab", 3)).toBeNull()
  })

  it("never walks outside the list, whatever the list's length or where it stood", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 50 }),
      fc.integer({ min: -5, max: 60 }),
      fc.constantFrom("ArrowDown", "ArrowUp"),
      (count, active, key) => {
        const next = comboKey({ open: true, active, find: "x" }, key, count)?.state.active ?? -1
        return next >= 0 && next < count
      },
    ))
  })
})

describe("where the list is drawn", () => {
  const box = { top: 300, bottom: 336, left: 40, width: 400 }
  const across = { left: 40, width: "max-content", minWidth: 400, maxWidth: 1396 }

  it("opens under the box, at least as wide as it and no wider than the window allows, where there is room below", () => {
    expect(listPlace(box, { width: 1440, height: 900 })).toEqual({ ...across, top: 340, maxHeight: 288 })
  })

  it("opens over the box where there is not room below and more above", () => {
    expect(listPlace({ ...box, top: 800, bottom: 836 }, { width: 1440, height: 900 })).toEqual({ ...across, bottom: 104, maxHeight: 288 })
  })

  it("stays under the box where there is room for a few lines, however much more there is above", () => {
    expect(listPlace({ ...box, top: 632, bottom: 668 }, { width: 1440, height: 900 })).toEqual({ ...across, top: 672, maxHeight: 224 })
  })

  it("stays under the box, shorter, where there is less room above than below", () => {
    expect(listPlace({ ...box, top: 100, bottom: 136 }, { width: 1440, height: 360 })).toEqual({ ...across, top: 140, maxHeight: 216 })
  })

  it("never runs past the window's right edge, nor narrower than the box", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 1800 }),
      fc.integer({ min: 40, max: 800 }),
      fc.integer({ min: 320, max: 2400 }),
      (left, width, windowWidth) => {
        const placed = listPlace({ top: 100, bottom: 136, left, width }, { width: windowWidth, height: 900 })
        expect(placed.minWidth).toBe(width)
        expect(Number(placed.maxWidth)).toBeGreaterThanOrEqual(width)
        if (left + width + 4 <= windowWidth) expect(left + Number(placed.maxWidth)).toBeLessThanOrEqual(windowWidth - 4)
      },
    ))
  })

  it("never runs past the window's edge on the side it opens to", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 2000 }),
      fc.integer({ min: 20, max: 60 }),
      fc.integer({ min: 200, max: 2000 }),
      (top, height, windowHeight) => {
        const placed = listPlace({ top, bottom: top + height, left: 0, width: 100 }, { width: 1440, height: windowHeight })
        const maxHeight = Number(placed.maxHeight)
        expect(maxHeight).toBeGreaterThanOrEqual(0)
        expect(maxHeight).toBeLessThanOrEqual(288)
        if (placed.top !== undefined && top + height + 8 <= windowHeight) expect(Number(placed.top) + maxHeight).toBeLessThanOrEqual(windowHeight - 4)
        if (placed.bottom !== undefined) expect(windowHeight - Number(placed.bottom) - maxHeight).toBeGreaterThanOrEqual(4)
      },
    ))
  })
})
