/**
 * Stats endpoint tests
 *
 * Covers:
 * - IT-STATS-01: response shape (data.research.total / dataset.total / facets, meta.requestId)
 * - IT-STATS-02: facets carry { research, dataset } breakdown; platform key uses "vendor||model"
 * - IT-STATS-03: no accessible Research yields totals=0 and empty facets
 * - IT-STATS-04: total_research / total_dataset are not exposed as facet keys
 * - IT-STATS-06: the Dataset aggregation is bounded by the same humVersionId
 *   ceiling as the Dataset listing, so `dataset.total` cannot count draft-release
 *   Datasets the listing hides
 *
 * Mocking strategy:
 * - @/api/es-client/client.esClient is mocked so no real ES is contacted.
 *   search() is dispatched on `index`: the Research index serves the visibility
 *   lookup behind `buildDatasetVisibilityFilter`, the Dataset index serves the
 *   stats aggregations. The auth module itself runs unmocked so the emitted
 *   filter is the real one.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

interface SearchArgs {
  index: string
  query?: unknown
  aggs?: unknown
}

interface ResearchHit {
  _source: { humId: string; latestVersion: string | null }
}

const DATASET_AGGS = {
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
}

const EMPTY_DATASET_AGGS = { total_research: { value: 0 }, total_dataset: { value: 0 } }

const searchCalls: SearchArgs[] = []
let researchHits: ResearchHit[] = []
let datasetAggs: Record<string, unknown> = DATASET_AGGS

const mockEsCount = mock(async () => ({ count: 42 }))
const mockEsSearch = mock(async (args: SearchArgs) => {
  searchCalls.push(args)
  if (args.index === "research") return { hits: { hits: researchHits } }
  return { aggregations: datasetAggs }
})

void mock.module("@/api/services/ownership", () => ({
  getOwnerUsernames: async () => [],
  getOwnedHumIds: async () => [],
  isOwner: async () => false,
  refreshOwnershipCache: async () => undefined,
  resetOwnershipCacheForTest: () => undefined,
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

/** The single Dataset-index search issued per request (the stats aggregation). */
const datasetSearchCall = (): SearchArgs => {
  const call = searchCalls.find(c => c.index === "dataset")
  if (!call) throw new Error("no Dataset-index search was issued")
  return call
}

/** Its filter clauses: the visibility ceiling and the latest-version scope. */
const datasetMust = (): unknown[] =>
  (datasetSearchCall().query as { bool: { must: unknown[] } }).bool.must

describe("api/routes/stats", () => {
  beforeEach(() => {
    searchCalls.length = 0
    researchHits = [
      { _source: { humId: "hum0001", latestVersion: "v2" } },
      { _source: { humId: "hum0002", latestVersion: "v1" } },
    ]
    datasetAggs = DATASET_AGGS
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

  describe("GET /stats - Dataset visibility ceiling (IT-STATS-06)", () => {
    it("bounds the aggregation to humVersionIds at or below each latestVersion", async () => {
      const app = getTestApp()
      await app.request("/stats")

      expect(datasetMust()).toContainEqual({
        bool: {
          should: [{ terms: { humVersionId: ["hum0001-v1", "hum0001-v2", "hum0002-v1"] } }],
          minimum_should_match: 1,
        },
      })
    })

    it("excludes a Research with no latestVersion from the enumerated humVersionIds", async () => {
      researchHits = [
        { _source: { humId: "hum0001", latestVersion: "v1" } },
        { _source: { humId: "hum0009", latestVersion: null } },
      ]
      const app = getTestApp()
      await app.request("/stats")

      expect(datasetMust()).toContainEqual({
        bool: {
          should: [{ terms: { humVersionId: ["hum0001-v1"] } }],
          minimum_should_match: 1,
        },
      })
    })

    it("does not fall back to a humId-only filter", async () => {
      const app = getTestApp()
      await app.request("/stats")

      expect(JSON.stringify(datasetMust()[0])).not.toContain("\"humId\"")
    })

    it("counts one version per datasetId", async () => {
      const app = getTestApp()
      await app.request("/stats")

      // Without this the facet breakdown carries values that only a superseded
      // version had, and stops matching the listing it links to.
      expect(datasetMust()).toContainEqual({ term: { isLatestPublished: true } })
    })
  })

  describe("GET /stats - no accessible Research (IT-STATS-03)", () => {
    beforeEach(() => {
      researchHits = []
      datasetAggs = EMPTY_DATASET_AGGS
      mockEsCount.mockResolvedValueOnce({ count: 0 })
    })

    it("returns totals=0 and empty facets", async () => {
      const app = getTestApp()
      const res = await app.request("/stats")

      expect(res.status).toBe(200)
      const body = await res.json() as StatsBody
      expect(body.data.research.total).toBe(0)
      expect(body.data.dataset.total).toBe(0)
      expect(body.data.facets).toEqual({})
    })

    it("fails closed: the aggregation query matches nothing", async () => {
      const app = getTestApp()
      await app.request("/stats")

      expect(datasetMust()).toContainEqual({ term: { humId: "__no_match__" } })
    })
  })
})
