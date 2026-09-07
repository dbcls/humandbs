import { describe, expect, it } from "vitest"

import {
  addToCart,
  applicationPayload,
  cartPressGathers,
  isCartable,
  noticeOf,
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

  it("takes a whole large row, since the cart has no ceiling", () => {
    expect(addToCart(many(200), ["JGAD009999"])).toHaveLength(201)
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

  it("keeps a large stored value whole", () => {
    expect(parseCart(JSON.stringify(many(300)))).toHaveLength(300)
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

describe("pressing a mark that stands for many", () => {
  it("gathers when the cart holds none of them", () => {
    expect(cartPressGathers([], many(20))).toBe(true)
  })

  it("gathers the rest when the cart holds only some", () => {
    expect(cartPressGathers(many(5), many(20))).toBe(true)
  })

  it("lets go once the cart holds every one of them", () => {
    expect(cartPressGathers(many(20), many(20))).toBe(false)
  })

  it("counts the same dataset named twice as one, so a repeated id cannot block letting go", () => {
    expect(cartPressGathers(["JGAD000001"], ["JGAD000001", "JGAD000001"])).toBe(false)
  })

  it("ignores what could never go in, so a row of archives lets go rather than gathering nothing", () => {
    expect(cartPressGathers([], ["DRA014188", "hum0014-NHA001"])).toBe(false)
  })
})

describe("what a press says afterwards", () => {
  it("says nothing when the cart did not move", () => {
    expect(noticeOf(["JGAD000001"], ["JGAD000001"], 1)).toBeNull()
    expect(noticeOf([], [], 1)).toBeNull()
  })

  it("names the one that went in, since that is what the reader pressed", () => {
    expect(noticeOf([], ["JGAD000001"], 1))
      .toMatchObject({ kind: "added", count: 1, only: "JGAD000001", total: 1 })
  })

  it("counts rather than names when a row put several in", () => {
    expect(noticeOf([], many(3), 1))
      .toMatchObject({ kind: "added", count: 3, only: null, total: 3 })
  })

  it("names the one that came out", () => {
    expect(noticeOf(["JGAD000001", "JGAD000002"], ["JGAD000002"], 1))
      .toMatchObject({ kind: "removed", count: 1, only: "JGAD000001", total: 1 })
  })

  it("counts what is left rather than what moved", () => {
    expect(noticeOf(many(5), many(2), 1)).toMatchObject({ count: 3, total: 2 })
  })

  it("holds the whole cart as it was, which is what taking the press back needs", () => {
    const before = many(3)
    expect(noticeOf(before, [], 1)?.before).toEqual(before)
  })

  it("tells one press from the next when the two would read the same", () => {
    expect(noticeOf([], ["JGAD000001"], 1)?.at)
      .not.toBe(noticeOf([], ["JGAD000001"], 2)?.at)
  })
})
