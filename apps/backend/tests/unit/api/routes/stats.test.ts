/**
 * Stats endpoint tests
 *
 * Covers:
 * - IT-STATS-01: response shape (data.research.total / dataset.total / facets, meta.requestId)
 * - IT-STATS-02: facets carry { research, dataset } breakdown; platform key uses "vendor||model"
 * - IT-STATS-03: publishedHumIds=[] short-circuits to totals=0 and empty facets
 * - IT-STATS-04: total_research / total_dataset are not exposed as facet keys
 *
 * Mocking strategy:
 * - @/api/es-client/auth.getPublishedHumIds is mocked (its result steers the
 *   stats handler's branching). buildStatusFilter is left as the real impl.
 * - @/api/es-client/client.esClient is mocked so no real ES is contacted.
 *   count() and search() return controlled shapes.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import { buildStatusFilter } from "@/api/es-client/auth"

const mockGetPublishedHumIds = mock<(...args: unknown[]) => Promise<string[] | null>>(
  async () => ["hum0001", "hum0002"],
)

void mock.module("@/api/es-client/auth", () => ({
  // re-export the real buildStatusFilter; only intercept getPublishedHumIds
  buildStatusFilter,
  getPublishedHumIds: mockGetPublishedHumIds,
}))

const mockEsCount = mock(async () => ({ count: 42 }))
const mockEsSearch = mock(async () => ({
  aggregations: {
    total_research: { value: 12 },
    total_dataset: { value: 87 },
    criteria: {
      buckets: [
        { key: "Controlled-access (Type I)", doc_count: 50, research_count: { value: 10 }, dataset_count: { value: 50 } },
        { key: "Unrestricted-access", doc_count: 5, research_count: { value: 2 }, dataset_count: { value: 5 } },
      ],
    },
    assayType: {
      doc_count: 100,
      values: {
        buckets: [
          {
            key: "WGS",
            doc_count: 20,
            counts: { doc_count: 20, research_count: { value: 5 }, dataset_count: { value: 18 } },
          },
        ],
      },
    },
    platform: {
      doc_count: 30,
      inner: {
        doc_count: 30,
        vendorModel: {
          buckets: [
            {
              key: ["Illumina", "NovaSeq"],
              doc_count: 20,
              counts: { doc_count: 20, research_count: { value: 4 }, dataset_count: { value: 18 } },
            },
          ],
        },
      },
    },
    disease: {
      doc_count: 10,
      inner: {
        doc_count: 10,
        values: {
          buckets: [
            {
              key: "lung cancer",
              doc_count: 8,
              counts: { doc_count: 8, research_count: { value: 3 }, dataset_count: { value: 7 } },
            },
          ],
        },
      },
    },
  },
}))

void mock.module("@/api/es-client/client", () => ({
  ES_INDEX: { research: "research", dataset: "dataset", researchVersion: "research_version" },
  esClient: {
    count: mockEsCount,
    search: mockEsSearch,
  },
  isConflictError: () => false,
  isDocumentExistsError: () => false,
}))

const { getTestApp } = await import("../helpers")

interface StatsBody {
  data: {
    research: { total: number }
    dataset: { total: number }
    facets: Record<string, Record<string, { research: number; dataset: number }>>
  }
  meta: { requestId: string; timestamp: string }
}

describe("api/routes/stats", () => {
  beforeEach(() => {
    mockGetPublishedHumIds.mockReset()
    mockGetPublishedHumIds.mockResolvedValue(["hum0001", "hum0002"])
    mockEsCount.mockClear()
    mockEsSearch.mockClear()
  })

  describe("GET /stats - normal path", () => {
    it("returns 200 with the documented shape (IT-STATS-01)", async () => {
      const app = getTestApp()
      const res = await app.request("/stats")

      expect(res.status).toBe(200)
      const body = await res.json() as StatsBody
      expect(typeof body.data.research.total).toBe("number")
      expect(typeof body.data.dataset.total).toBe("number")
      expect(typeof body.data.facets).toBe("object")
      expect(body.meta.requestId).toBeDefined()
      expect(body.meta.timestamp).toBeDefined()
      expect(Date.parse(body.meta.timestamp)).not.toBeNaN()
    })

    it("research.total is sourced from esClient.count (not from aggregations)", async () => {
      mockEsCount.mockResolvedValueOnce({ count: 7 })
      const app = getTestApp()
      const res = await app.request("/stats")

      const body = await res.json() as StatsBody
      expect(body.data.research.total).toBe(7)
    })

    it("dataset.total is sourced from total_dataset aggregation (IT-STATS-01)", async () => {
      const app = getTestApp()
      const res = await app.request("/stats")

      const body = await res.json() as StatsBody
      expect(body.data.dataset.total).toBe(87)
    })

    it("each facet bucket has { research, dataset } breakdown (IT-STATS-02)", async () => {
      const app = getTestApp()
      const res = await app.request("/stats")

      const body = await res.json() as StatsBody
      for (const facetMap of Object.values(body.data.facets)) {
        for (const counts of Object.values(facetMap)) {
          expect(typeof counts.research).toBe("number")
          expect(typeof counts.dataset).toBe("number")
          expect(counts.research).toBeGreaterThanOrEqual(0)
          expect(counts.dataset).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it("platform keys are joined as 'vendor||model' (IT-STATS-02)", async () => {
      const app = getTestApp()
      const res = await app.request("/stats")

      const body = await res.json() as StatsBody
      expect(body.data.facets.platform).toBeDefined()
      const platformKeys = Object.keys(body.data.facets.platform)
      expect(platformKeys).toContain("Illumina||NovaSeq")
      for (const k of platformKeys) {
        expect(k).toContain("||")
      }
    })

    it("does not expose total_research / total_dataset as facet keys (IT-STATS-04)", async () => {
      const app = getTestApp()
      const res = await app.request("/stats")

      const body = await res.json() as StatsBody
      expect(body.data.facets.total_research).toBeUndefined()
      expect(body.data.facets.total_dataset).toBeUndefined()
    })

    it("each facet count is <= corresponding total (IT-STATS-02 upper bound)", async () => {
      const app = getTestApp()
      const res = await app.request("/stats")

      const body = await res.json() as StatsBody
      const rTotal = body.data.research.total
      const dTotal = body.data.dataset.total
      for (const facetMap of Object.values(body.data.facets)) {
        for (const counts of Object.values(facetMap)) {
          expect(counts.research).toBeLessThanOrEqual(rTotal)
          expect(counts.dataset).toBeLessThanOrEqual(dTotal)
        }
      }
    })

    it("is publicly accessible (no authentication required)", async () => {
      const app = getTestApp()
      const res = await app.request("/stats")
      expect(res.status).toBe(200)
    })
  })

  describe("GET /stats - zero published path (IT-STATS-03)", () => {
    it("short-circuits to totals=0 and empty facets when no humIds are published", async () => {
      mockGetPublishedHumIds.mockResolvedValueOnce([])
      const app = getTestApp()
      const res = await app.request("/stats")

      expect(res.status).toBe(200)
      const body = await res.json() as StatsBody
      expect(body.data.research.total).toBe(0)
      expect(body.data.dataset.total).toBe(0)
      expect(body.data.facets).toEqual({})

      // No ES count/search should be issued in the short-circuit branch
      expect(mockEsCount).not.toHaveBeenCalled()
      expect(mockEsSearch).not.toHaveBeenCalled()
    })
  })
})
