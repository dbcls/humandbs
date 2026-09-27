import fc from "fast-check"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `tolerantly()`'s catch, exercised without a real store.
 *
 * The store is the mock-able boundary here, not the orchestration in this
 * module: `listPrefix` is replaced so that the rest of `listing.server.ts`
 * runs for real. What every case below checks is the fallback two callers
 * depend on — the public page leaves the download section out and the JSON
 * API responds with an empty prefix rather than failing the whole response.
 */

vi.mock("./store.server", () => ({ listPrefix: vi.fn() }))

import { PAGE_SIZES } from "~/search/page-size"

import { fileListOf, PRIVATE_BUCKET, privatePrefix, PUBLIC_BUCKET, publicPrefix } from "./prefix"
import {
  listingSummariesOf,
  everyPublicListing,
  publicListing,
  publicListingsOf,
  publicRows,
} from "./listing.server"
import { listPrefix } from "./store.server"

const mockedListPrefix = vi.mocked(listPrefix)

beforeEach(() => {
  mockedListPrefix.mockReset()
})

describe("publicListing", () => {
  it("returns null rather than throwing when the store does not respond", async () => {
    mockedListPrefix.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    expect(await publicListing("hum0001")).toBeNull()
  })
})

describe("what a public page renders from publicListing", () => {
  it("shows no download section, the same as an empty prefix, when the store does not respond", async () => {
    mockedListPrefix.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    const listing = await publicListing("hum0001")

    expect(fileListOf(publicRows(listing, new Map(), "ja"), 1, 20))
      .toEqual({ rows: [], total: 0, page: 1, pageCount: 1, size: 20, rangeFrom: 0, rangeTo: 0 })
  })
})

describe("everyPublicListing", () => {
  it("returns an empty map rather than throwing when the store does not respond", async () => {
    mockedListPrefix.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    expect(await everyPublicListing()).toEqual(new Map())
  })
})

describe("publicListingsOf", () => {
  it("returns an empty prefix for every requested label when the store does not respond", async () => {
    mockedListPrefix.mockRejectedValue(new Error("ECONNREFUSED"))

    const listings = await publicListingsOf(["hum0001", "hum0002"])

    expect(listings).toEqual(new Map([["hum0001", []], ["hum0002", []]]))
  })

  it("keeps the listing the store returned, even when another label in the same request fails", async () => {
    mockedListPrefix.mockImplementation((_bucket, prefix) => {
      if (prefix === publicPrefix("hum0002")) return Promise.reject(new Error("ECONNREFUSED"))
      return Promise.resolve([{ name: "a.zip", size: 4, updatedAt: "2020-01-01T00:00:00.000Z" }])
    })

    const listings = await publicListingsOf(["hum0001", "hum0002"])

    expect(listings.get("hum0001")?.map((node) => node.name)).toEqual(["a.zip"])
    expect(listings.get("hum0002")).toEqual([])
  })
})

describe("listingSummariesOf", () => {
  const node = (name: string, size: number) => ({ name, size, updatedAt: "2020-01-01T00:00:00.000Z" })

  it("両方の bucket を数え、両方にある名前は 1 件と数える", async () => {
    mockedListPrefix.mockImplementation((bucket, prefix) => {
      if (bucket === PRIVATE_BUCKET) return Promise.resolve([node("b.zip", 6), node("c.zip", 1)])
      if (prefix === publicPrefix("hum0001")) return Promise.resolve([node("a.zip", 4), node("b.zip", 6)])
      return Promise.resolve([])
    })

    const summaries = await listingSummariesOf([{ researchId: "r1", humLabel: "hum0001" }])

    expect(summaries.get("r1")).toEqual({ count: 3, bytes: 11 })
  })

  it("研究 ID の無い研究は非公開側だけを数え、空なら 0 件", async () => {
    mockedListPrefix.mockResolvedValue([])

    const summaries = await listingSummariesOf([{ researchId: "r1", humLabel: null }])

    expect(summaries.get("r1")).toEqual({ count: 0, bytes: 0 })
    // The public side is not asked for: there is no label to name a prefix with.
    expect(mockedListPrefix).toHaveBeenCalledTimes(1)
  })

  it("応答しなかった行だけが null で、他の行は残る", async () => {
    mockedListPrefix.mockImplementation((_bucket, prefix) => {
      if (prefix === publicPrefix("hum0002")) return Promise.reject(new Error("ECONNREFUSED"))
      return Promise.resolve([node("a.zip", 4)])
    })

    const summaries = await listingSummariesOf([
      { researchId: "r1", humLabel: "hum0001" },
      { researchId: "r2", humLabel: "hum0002" },
    ])

    expect(summaries.get("r1")).toEqual({ count: 1, bytes: 4 })
    expect(summaries.get("r2")).toBeNull()
  })

  /**
   * Every research on one page is several hundred rows, and a pair of listings
   * per row was a thousand requests to the store for one page.
   */
  describe("for more rows than the largest page", () => {
    const LARGEST = Math.max(...PAGE_SIZES)
    const rowsArb = fc.array(fc.record({
      withLabel: fc.boolean(),
      publicFiles: fc.uniqueArray(fc.constantFrom("a.zip", "b.zip", "c.txt"), { maxLength: 3 }),
      privateFiles: fc.uniqueArray(fc.constantFrom("b.zip", "d.bam"), { maxLength: 2 }),
    }), { minLength: LARGEST + 1, maxLength: LARGEST + 20 })

    /** Both buckets as the store holds them, answered per prefix or whole. */
    function storeHolding(rows: { withLabel: boolean, publicFiles: string[], privateFiles: string[] }[]) {
      const keys = new Map<string, { name: string, size: number, updatedAt: string }[]>([[PUBLIC_BUCKET, []], [PRIVATE_BUCKET, []]])
      rows.forEach((row, at) => {
        const size = at + 1
        if (row.withLabel) {
          for (const name of row.publicFiles) keys.get(PUBLIC_BUCKET)?.push({ name: `${publicPrefix(`hum${String(at)}`)}${name}`, size, updatedAt: "2020-01-01T00:00:00.000Z" })
        }
        for (const name of row.privateFiles) keys.get(PRIVATE_BUCKET)?.push({ name: `${privatePrefix(`r${String(at)}`)}${name}`, size, updatedAt: "2020-01-01T00:00:00.000Z" })
      })
      mockedListPrefix.mockImplementation((bucket, prefix) => Promise.resolve((keys.get(bucket) ?? [])
        .filter((one) => one.name.startsWith(prefix))
        .map((one) => ({ ...one, name: one.name.slice(prefix.length) }))))
      return rows.map((row, at) => ({ researchId: `r${String(at)}`, humLabel: row.withLabel ? `hum${String(at)}` : null }))
    }

    it("reads each bucket once, and counts every row as reading its own prefixes would", async () => {
      await fc.assert(fc.asyncProperty(rowsArb, async (layout) => {
        mockedListPrefix.mockReset()
        const rows = storeHolding(layout)
        const each = new Map<string, unknown>()
        for (const row of rows) each.set(row.researchId, (await listingSummariesOf([row])).get(row.researchId))
        mockedListPrefix.mockClear()

        const all = await listingSummariesOf(rows)

        expect(mockedListPrefix).toHaveBeenCalledTimes(2)
        expect(all).toEqual(each)
      }), { numRuns: 15 })
    })

    it("has no numbers for any row when a bucket does not respond, since no row's could be read", async () => {
      mockedListPrefix.mockImplementation((bucket) =>
        bucket === PUBLIC_BUCKET ? Promise.reject(new Error("ECONNREFUSED")) : Promise.resolve([]))
      const rows = Array.from({ length: LARGEST + 1 }, (_, at) => ({ researchId: `r${String(at)}`, humLabel: `hum${String(at)}` }))

      const summaries = await listingSummariesOf(rows)

      expect([...summaries.values()].every((summary) => summary === null)).toBe(true)
      expect(summaries.size).toBe(LARGEST + 1)
    })
  })
})
