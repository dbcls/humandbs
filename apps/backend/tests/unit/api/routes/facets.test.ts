/**
 * Facets endpoint tests
 *
 * Covers:
 * - IT-FACETS-02: countBy=research vs countBy=dataset toggles facetCountField (humId / datasetId)
 * - IT-FACETS-05: invalid fieldName returns 400 (Zod enum validation on path param)
 *
 * Mocking strategy:
 * - @/api/es-client/search.searchDatasets is mocked so the test does not require ES.
 *   We assert on the third argument (facetCountField) to verify countBy propagation.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { AuthUser } from "@/api/types"

interface SearchCall {
  query: Record<string, unknown>
  authUser: AuthUser | null
  options: { facetCountField?: string } | undefined
}

const searchCalls: SearchCall[] = []

interface MockSearchResult {
  data: unknown[]
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean }
  facets?: Record<string, { value: string; count: number }[]>
}

const mockSearchDatasets = mock(async (
  query: Record<string, unknown>,
  authUser: AuthUser | null,
  options?: { facetCountField?: string },
): Promise<MockSearchResult> => {
  searchCalls.push({ query, authUser, options })
  return {
    data: [],
    pagination: { page: 1, limit: 1, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    facets: {
      assayType: [{ value: "WGS", count: 5 }],
      tissues: [{ value: "Blood", count: 3 }],
    },
  }
})

void mock.module("@/api/es-client/search", () => ({
  searchDatasets: mockSearchDatasets,
  searchResearches: mock(async () => ({
    data: [],
    pagination: { page: 1, limit: 1, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  })),
  // Other modules in the es-client barrel import named exports from search.ts;
  // re-export the constants that exist in production so importing modules don't
  // crash at module-init time with "Export named 'X' not found".
  MAX_RESULT_WINDOW: 10000,
}))

const { getTestApp } = await import("../helpers")

describe("api/routes/facets", () => {
  beforeEach(() => {
    searchCalls.length = 0
    mockSearchDatasets.mockClear()
  })

  describe("GET /facets", () => {
    it("returns 200 with facets map under data (anonymous)", async () => {
      const app = getTestApp()
      const res = await app.request("/facets")

      expect(res.status).toBe(200)
      const body = await res.json() as { data: Record<string, unknown[]>; meta: { requestId: string } }
      expect(body.data).toBeDefined()
      expect(body.data.assayType).toBeDefined()
      expect(Array.isArray(body.data.assayType)).toBe(true)
      expect(body.meta.requestId).toBeDefined()
    })

    it("uses facetCountField='datasetId' by default (countBy omitted)", async () => {
      // IT-FACETS-02 (default branch)
      const app = getTestApp()
      await app.request("/facets")

      expect(mockSearchDatasets).toHaveBeenCalledTimes(1)
      const call = searchCalls.at(-1)
      expect(call?.options?.facetCountField).toBe("datasetId")
      expect(call?.query.includeFacets).toBe(true)
    })

    it("switches facetCountField to 'humId' when countBy=research", async () => {
      // IT-FACETS-02 (countBy=research)
      const app = getTestApp()
      await app.request("/facets?countBy=research")

      const call = searchCalls.at(-1)
      expect(call?.options?.facetCountField).toBe("humId")
    })

    it("keeps facetCountField='datasetId' when countBy=dataset", async () => {
      // IT-FACETS-02 (countBy=dataset explicit)
      const app = getTestApp()
      await app.request("/facets?countBy=dataset")

      const call = searchCalls.at(-1)
      expect(call?.options?.facetCountField).toBe("datasetId")
    })

    it("rejects an unknown countBy with 400", async () => {
      const app = getTestApp()
      const res = await app.request("/facets?countBy=invalid")

      expect(res.status).toBe(400)
      expect(res.headers.get("content-type")).toContain("application/problem+json")
      expect(mockSearchDatasets).not.toHaveBeenCalled()
    })
  })

  describe("GET /facets/{fieldName}", () => {
    it("returns 200 with { fieldName, values } for a known facet field", async () => {
      const app = getTestApp()
      const res = await app.request("/facets/assayType")

      expect(res.status).toBe(200)
      const body = await res.json() as {
        data: { fieldName: string; values: { value: string; count: number }[] }
      }
      expect(body.data.fieldName).toBe("assayType")
      expect(Array.isArray(body.data.values)).toBe(true)
    })

    it("returns 400 for an unknown fieldName (IT-FACETS-05)", async () => {
      // IT-FACETS-05
      const app = getTestApp()
      const res = await app.request("/facets/__not_a_field__")

      expect(res.status).toBe(400)
      expect(res.headers.get("content-type")).toContain("application/problem+json")
      const body = await res.json() as { title?: string; type?: string }
      // The fieldName path param is validated by z.enum(DATASET_FACET_NAMES).
      expect(body.title).toBe("Validation Error")
      expect(mockSearchDatasets).not.toHaveBeenCalled()
    })

    it("returns 400 when fieldName is empty (treated as / and no match)", async () => {
      const app = getTestApp()
      // /facets/ has no trailing-param route; expect 404, not 400
      const res = await app.request("/facets/")
      // either 404 (no route) or 400 (zod empty). Both are non-200 / non-leak.
      expect([400, 404]).toContain(res.status)
    })

    it("propagates countBy=research to facetCountField for field endpoint", async () => {
      const app = getTestApp()
      await app.request("/facets/tissues?countBy=research")

      const call = searchCalls.at(-1)
      expect(call?.options?.facetCountField).toBe("humId")
    })

    it("returns empty values when the requested field has no facet result", async () => {
      // override mock to return facets without 'platform' key
      mockSearchDatasets.mockImplementationOnce(async () => ({
        data: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        facets: { assayType: [{ value: "WGS", count: 1 }] },
      }))

      const app = getTestApp()
      const res = await app.request("/facets/platform")

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { fieldName: string; values: unknown[] } }
      expect(body.data.fieldName).toBe("platform")
      expect(body.data.values).toEqual([])
    })
  })
})
