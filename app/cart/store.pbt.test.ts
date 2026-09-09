import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { addToCart, isCartable, noticeOf, parseCart, removeFromCart } from "./store"

/** An accession the application system takes. */
const jgad = fc.integer({ min: 1, max: 999_999 })
  .map((n) => `JGAD${String(n).padStart(6, "0")}`)

/** Anything a page might hand the cart, most of which it must refuse. */
const anyId = fc.oneof(
  jgad,
  fc.constantFrom("DRA014188", "E-GEAD-1107", "MTBKS123", "PRJDB10452", "hum0014-NHA001", ""),
  fc.string(),
)

const cart = fc.array(jgad, { maxLength: 120 }).map((ids) => [...new Set(ids)])

/**
 * The cart is edited by a reader clicking rows, so what has to hold is not any
 * one operation but the state it leaves behind: two things are true of a cart
 * however it was arrived at, and they are what the screens rely on.
 */
describe("a cart", () => {
  it("only ever holds datasets an application can be made for", () => {
    fc.assert(fc.property(cart, fc.array(anyId), (held, adding) => {
      expect(addToCart(held, adding).every(isCartable)).toBe(true)
    }))
  })

  it("never holds the same dataset twice", () => {
    fc.assert(fc.property(cart, fc.array(anyId), (held, adding) => {
      const next = addToCart(held, adding)
      expect(new Set(next).size).toBe(next.length)
    }))
  })
})

describe("adding then removing the same datasets", () => {
  it("leaves the cart as it was, in the order it was", () => {
    fc.assert(fc.property(cart, fc.array(jgad), (held, adding) => {
      const fresh = adding.filter((id) => !held.includes(id))
      const added = addToCart(held, fresh)
      expect(removeFromCart(added, fresh)).toEqual(held)
    }))
  })
})

describe("what was stored", () => {
  it("is read back as it was written", () => {
    fc.assert(fc.property(cart, (held) => {
      expect(parseCart(JSON.stringify(held))).toEqual(held)
    }))
  })

  it("is never trusted: any stored value yields a cart the screens can hold", () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      const read = parseCart(JSON.stringify(value))
      expect(read.every(isCartable)).toBe(true)
      expect(new Set(read).size).toBe(read.length)
    }))
  })
})

/**
 * **The notice is the only way back.** Undo puts `before` into the cart, so a
 * notice that holds the wrong list silently loses whatever the reader had.
 * These say it holds the right one for any press, and that what it claims moved
 * is what moved.
 */
describe("what a press says about itself", () => {
  it("holds exactly the cart the press started from", () => {
    fc.assert(fc.property(cart, fc.array(anyId), (held, ids) => {
      const after = addToCart(held, ids)
      const notice = noticeOf(held, after, 1)
      if (notice === null) expect(after).toEqual(held)
      else expect(notice.before).toEqual(held)
    }))
  })

  it("counts what actually moved, and says where the cart stands now", () => {
    fc.assert(fc.property(cart, fc.array(anyId), (held, ids) => {
      const after = addToCart(held, ids)
      const notice = noticeOf(held, after, 1)
      if (notice === null) return
      expect(notice.kind).toBe("added")
      expect(notice.count).toBe(after.length - held.length)
      expect(notice.total).toBe(after.length)
    }))
  })

  it("names a dataset only when that one is what went in", () => {
    fc.assert(fc.property(cart, fc.array(anyId), (held, ids) => {
      const only = noticeOf(held, addToCart(held, ids), 1)?.only
      if (only === undefined || only === null) return
      expect(held).not.toContain(only)
      expect(addToCart(held, ids)).toContain(only)
    }))
  })

  it("reads a removal from the other side, and names only what left", () => {
    fc.assert(fc.property(cart, fc.array(jgad), (held, ids) => {
      const after = removeFromCart(held, ids)
      const notice = noticeOf(held, after, 1)
      if (notice === null) return
      expect(notice.kind).toBe("removed")
      expect(notice.count).toBe(held.length - after.length)
      expect(notice.total).toBe(after.length)
      if (notice.only !== null) {
        expect(held).toContain(notice.only)
        expect(after).not.toContain(notice.only)
      }
    }))
  })
})
