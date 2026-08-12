import { describe, expect, it } from "vitest"

import {
  addToCart,
  applicationPayload,
  CART_LIMIT,
  isCartable,
  parseCart,
  removeFromCart,
} from "./store"

const many = (count: number, from = 1) =>
  Array.from({ length: count }, (_, at) => `JGAD${String(from + at).padStart(6, "0")}`)

describe("what may be put in the cart", () => {
  it("takes JGA datasets, which are the ones an application is made for", () => {
    expect(isCartable("JGAD000117")).toBe(true)
  })

  it("refuses archives whose data needs no application", () => {
    expect(isCartable("DRA014188")).toBe(false)
    expect(isCartable("E-GEAD-1107")).toBe(false)
    expect(isCartable("PRJDB10452")).toBe(false)
  })

  it("refuses a portal-issued id, which the application system does not know", () => {
    expect(isCartable("hum0014-NHA001")).toBe(false)
  })

  it("refuses a lower-case spelling, so one dataset cannot be held twice", () => {
    expect(isCartable("jgad000117")).toBe(false)
  })

  it("refuses a label that only starts like an accession", () => {
    expect(isCartable("JGAD000117-v2")).toBe(false)
    expect(isCartable("JGADXXX")).toBe(false)
    expect(isCartable("")).toBe(false)
  })
})

describe("adding to the cart", () => {
  it("keeps what is already there in the order it was added", () => {
    expect(addToCart(["JGAD000002", "JGAD000001"], ["JGAD000003"]))
      .toEqual(["JGAD000002", "JGAD000001", "JGAD000003"])
  })

  it("does not add a dataset that is already in the cart", () => {
    expect(addToCart(["JGAD000001"], ["JGAD000001"])).toEqual(["JGAD000001"])
  })

  it("adds a dataset once when the same row offers it twice", () => {
    expect(addToCart([], ["JGAD000001", "JGAD000001"])).toEqual(["JGAD000001"])
  })

  it("drops what cannot be applied for rather than refusing the whole row", () => {
    expect(addToCart([], ["JGAD000001", "DRA014188"])).toEqual(["JGAD000001"])
  })

  it("stops at the limit instead of failing", () => {
    const full = many(CART_LIMIT)
    expect(addToCart(full, ["JGAD009999"])).toEqual(full)
  })

  it("takes as many of a large row as fit", () => {
    const nearly = many(CART_LIMIT - 1)
    const added = addToCart(nearly, ["JGAD009998", "JGAD009999"])
    expect(added).toHaveLength(CART_LIMIT)
    expect(added.at(-1)).toBe("JGAD009998")
  })
})

describe("removing from the cart", () => {
  it("takes out only what was named", () => {
    expect(removeFromCart(["JGAD000001", "JGAD000002"], ["JGAD000001"])).toEqual(["JGAD000002"])
  })

  it("does nothing for a dataset that is not in the cart", () => {
    expect(removeFromCart(["JGAD000001"], ["JGAD000002"])).toEqual(["JGAD000001"])
  })
})

describe("reading the stored cart", () => {
  it("is empty when nothing was ever stored", () => {
    expect(parseCart(null)).toEqual([])
  })

  it("is empty rather than throwing when the value is not JSON", () => {
    expect(parseCart("{oh no")).toEqual([])
  })

  it("is empty when the value is JSON but not a list", () => {
    expect(parseCart(JSON.stringify({ ids: ["JGAD000001"] }))).toEqual([])
  })

  it("drops entries that are not ids at all", () => {
    expect(parseCart(JSON.stringify(["JGAD000001", 7, null, { id: "JGAD000002" }])))
      .toEqual(["JGAD000001"])
  })

  it("drops what may not be in a cart, so an edited value cannot smuggle one in", () => {
    expect(parseCart(JSON.stringify(["JGAD000001", "DRA014188"]))).toEqual(["JGAD000001"])
  })

  it("cuts a stored value that is over the limit", () => {
    expect(parseCart(JSON.stringify(many(CART_LIMIT + 10)))).toHaveLength(CART_LIMIT)
  })
})

describe("the application payload", () => {
  it("names every dataset under the key the application form reads", () => {
    expect(JSON.parse(applicationPayload(["JGAD000001", "JGAD000002"]))).toEqual({
      components: [
        { key: "use_dataset_request", value: "JGAD000001" },
        { key: "use_dataset_request", value: "JGAD000002" },
      ],
    })
  })

  it("is still well-formed for an empty cart", () => {
    expect(JSON.parse(applicationPayload([]))).toEqual({ components: [] })
  })
})
