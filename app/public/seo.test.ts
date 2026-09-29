import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { API_ENDPOINTS } from "~/api/endpoints"

import { listingAlternate, type ListingRequest } from "./seo"
import { apiPath, datasetPath, listPath, researchPath, researchVersionPath } from "./urls"

/** The paths the API responds at, as patterns over a path as it is sent. */
const SERVED = API_ENDPOINTS.map((endpoint) =>
  new RegExp(`^/${endpoint.path.replaceAll(".", "\\.").replace(/:[A-Za-z]+/g, "[^/]+")}$`))

function served(address: string): boolean {
  const { pathname } = new URL(address, "https://humandbs.dbcls.jp")
  return SERVED.some((pattern) => pattern.test(pathname))
}

const LABEL = fc.stringMatching(/^[A-Za-z0-9_-]{1,16}$/)

const LISTING: ListingRequest = {
  query: "cancer",
  parseError: null,
  requestedSort: null,
  requestedOrder: null,
  requestedSize: null,
  page: 1,
}

function alternateOf(target: "research" | "dataset", listing: ListingRequest): string | undefined {
  const [link] = listingAlternate(target, listing)
  return link === undefined ? undefined : (link as { href: string }).href
}

describe("the JSON API's address for a page", () => {
  it("is an address the API responds at, for a research, a version, a dataset and either listing", () => {
    fc.assert(fc.property(LABEL, fc.integer({ min: 1, max: 999 }), (label, version) => {
      expect(served(apiPath(researchPath(label)))).toBe(true)
      expect(served(apiPath(researchVersionPath(label, version)))).toBe(true)
      expect(served(apiPath(datasetPath(label)))).toBe(true)
    }))
    expect(served(apiPath(listPath("research")))).toBe(true)
    expect(served(apiPath(listPath("dataset")))).toBe(true)
  })
})

describe("listingAlternate", () => {
  it("carries the search, its ordering and the page to the API's search of the same listing", () => {
    expect(alternateOf("research", { ...LISTING, requestedSort: "datePublished", requestedOrder: "asc", page: 3 }))
      .toBe("/api/research?q=cancer&sort=datePublished&order=asc&page=3")
    expect(alternateOf("dataset", { ...LISTING, query: "" })).toBe("/api/dataset")
  })

  it("leaves the page out when a page holds other than the default number of rows", () => {
    expect(alternateOf("research", { ...LISTING, requestedSize: 50, page: 3 })).toBe("/api/research?q=cancer")
    expect(alternateOf("research", { ...LISTING, requestedSize: "all", page: 1 })).toBe("/api/research?q=cancer")
  })

  it("names nothing for a search that could not be read, which the API refuses", () => {
    expect(listingAlternate("research", { ...LISTING, parseError: { code: "unexpected-token" } })).toEqual([])
  })

  it("hands the search over as it is written, whatever it holds", () => {
    fc.assert(fc.property(fc.string(), fc.constantFrom("research" as const, "dataset" as const), (query, target) => {
      const address = alternateOf(target, { ...LISTING, query }) ?? ""
      expect(served(address)).toBe(true)
      expect(new URL(address, "https://humandbs.dbcls.jp").searchParams.get("q") ?? "").toBe(query)
    }))
  })
})
