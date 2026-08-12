import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { addToCart, CART_LIMIT, isCartable, parseCart, removeFromCart } from "./store"

/** An accession the application system takes. */
const jgad = fc.integer({ min: 1, max: 999_999 })
  .map((n) => `JGAD${String(n).padStart(6, "0")}`)

/** Anything a page might hand the cart, most of which it must refuse. */
const anyId = fc.oneof(
  jgad,
  fc.constantFrom("DRA014188", "E-GEAD-1107", "MTBKS123", "PRJDB10452", "hum0014-NHA001", ""),
  fc.string(),
)

const cart = fc.array(jgad, { maxLength: 120 }).map((ids) => [...new Set(ids)].slice(0, CART_LIMIT))

/**
 * The cart is edited by a reader clicking rows, so what has to hold is not any
 * one operation but the state it leaves behind: three things are true of a cart
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

  it("never grows past the limit", () => {
    fc.assert(fc.property(cart, fc.array(anyId, { maxLength: 200 }), (held, adding) => {
      expect(addToCart(held, adding).length).toBeLessThanOrEqual(CART_LIMIT)
    }))
  })
})

describe("adding then removing the same datasets", () => {
  it("leaves the cart as it was, in the order it was", () => {
    fc.assert(fc.property(cart, fc.array(jgad), (held, adding) => {
      const fresh = adding.filter((id) => !held.includes(id))
      // Only what actually went in comes back out; what did not fit never went in.
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
      expect(read.length).toBeLessThanOrEqual(CART_LIMIT)
    }))
  })
})
