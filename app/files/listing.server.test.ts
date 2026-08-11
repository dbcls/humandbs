import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `tolerantly()`'s catch, exercised without a real store.
 *
 * The store is the mock-able boundary here, not the orchestration in this
 * module: `listPrefix` is replaced so that the rest of `listing.server.ts`
 * runs for real. What every case below checks is the fallback two callers
 * depend on — the public page leaves the download section out
 * (docs/public-pages.md の「list が取れなければ節ごと出さない」) and the JSON
 * API answers with an empty box rather than failing the whole response
 * (docs/public-api.md の「ストアが答えなければ箱は空として返す」).
 */

vi.mock("./store.server", () => ({ listPrefix: vi.fn() }))

import { publicPrefix } from "./box"
import { everyPublicBox, fileListOf, publicBox, publicBoxesOf, publicRows } from "./listing.server"
import { listPrefix } from "./store.server"

const mockedListPrefix = vi.mocked(listPrefix)

beforeEach(() => {
  mockedListPrefix.mockReset()
})

describe("publicBox", () => {
  it("answers null rather than throwing when the store does not answer", async () => {
    mockedListPrefix.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    expect(await publicBox("hum0001")).toBeNull()
  })
})

describe("what a public page renders from publicBox", () => {
  it("shows no download section, the same as an empty box, when the store does not answer", async () => {
    mockedListPrefix.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    const listing = await publicBox("hum0001")

    expect(fileListOf(publicRows(listing), 1))
      .toEqual({ rows: [], total: 0, page: 1, pageCount: 1 })
  })
})

describe("everyPublicBox", () => {
  it("answers an empty map rather than throwing when the store does not answer", async () => {
    mockedListPrefix.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    expect(await everyPublicBox()).toEqual(new Map())
  })
})

describe("publicBoxesOf", () => {
  it("answers an empty box for every requested label when the store does not answer", async () => {
    mockedListPrefix.mockRejectedValue(new Error("ECONNREFUSED"))

    const boxes = await publicBoxesOf(["hum0001", "hum0002"])

    expect(boxes).toEqual(new Map([["hum0001", []], ["hum0002", []]]))
  })

  it("keeps the box the store answered for, even when another label in the same request fails", async () => {
    mockedListPrefix.mockImplementation((_bucket, prefix) => {
      if (prefix === publicPrefix("hum0002")) return Promise.reject(new Error("ECONNREFUSED"))
      return Promise.resolve([{ name: "a.zip", size: 4, updatedAt: "2020-01-01T00:00:00.000Z" }])
    })

    const boxes = await publicBoxesOf(["hum0001", "hum0002"])

    expect(boxes.get("hum0001")?.map((node) => node.name)).toEqual(["a.zip"])
    expect(boxes.get("hum0002")).toEqual([])
  })
})
