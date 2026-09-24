import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `tolerantly()`'s catch, exercised without a real store.
 *
 * The store is the mock-able boundary here, not the orchestration in this
 * module: `listPrefix` is replaced so that the rest of `listing.server.ts`
 * runs for real. What every case below checks is the fallback two callers
 * depend on — the public page leaves the download section out and the JSON
 * API answers with an empty box rather than failing the whole response.
 */

vi.mock("./store.server", () => ({ listPrefix: vi.fn() }))

import { PRIVATE_BUCKET, publicPrefix } from "./box"
import {
  boxSummariesOf,
  everyPublicBox,
  fileListOf,
  publicBox,
  publicBoxesOf,
  publicRows,
} from "./listing.server"
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
      .toEqual({ rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 })
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

describe("boxSummariesOf", () => {
  const node = (name: string, size: number) => ({ name, size, updatedAt: "2020-01-01T00:00:00.000Z" })

  it("両方の bucket を数え、両方にある名前は 1 件と数える", async () => {
    mockedListPrefix.mockImplementation((bucket, prefix) => {
      if (bucket === PRIVATE_BUCKET) return Promise.resolve([node("b.zip", 6), node("c.zip", 1)])
      if (prefix === publicPrefix("hum0001")) return Promise.resolve([node("a.zip", 4), node("b.zip", 6)])
      return Promise.resolve([])
    })

    const summaries = await boxSummariesOf([{ researchId: "r1", humLabel: "hum0001" }])

    expect(summaries.get("r1")).toEqual({ count: 3, bytes: 11 })
  })

  it("研究 ID の無い研究は非公開側だけを数え、空なら 0 件", async () => {
    mockedListPrefix.mockResolvedValue([])

    const summaries = await boxSummariesOf([{ researchId: "r1", humLabel: null }])

    expect(summaries.get("r1")).toEqual({ count: 0, bytes: 0 })
    // The public side is not asked for: there is no label to name a prefix with.
    expect(mockedListPrefix).toHaveBeenCalledTimes(1)
  })

  it("答えなかった行だけが null で、他の行は残る", async () => {
    mockedListPrefix.mockImplementation((_bucket, prefix) => {
      if (prefix === publicPrefix("hum0002")) return Promise.reject(new Error("ECONNREFUSED"))
      return Promise.resolve([node("a.zip", 4)])
    })

    const summaries = await boxSummariesOf([
      { researchId: "r1", humLabel: "hum0001" },
      { researchId: "r2", humLabel: "hum0002" },
    ])

    expect(summaries.get("r1")).toEqual({ count: 1, bytes: 4 })
    expect(summaries.get("r2")).toBeNull()
  })
})
