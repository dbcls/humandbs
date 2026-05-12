/**
 * IT-SEARCH-*: search endpoints for Research / Dataset.
 *
 * Endpoints covered: `GET /research`, `GET /dataset`, `POST /research/search`,
 * `POST /dataset/search`. Reference: `tests/integration-scenarios.md § IT-SEARCH-*`.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { FacetsMap, SearchResponse } from "@/api/types"

import { getApp, itWithEs, setupIntegration, url } from "./setup"

beforeAll(setupIntegration)

interface ResearchSummary {
  humId: string
  status?: string
  datePublished?: string | null
  title?: { ja?: string; en?: string }
  methods?: string | null
}

interface DatasetSummary {
  datasetId: string
  humId: string
}

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const app = getApp()
  const res = await app.request(url(path), init)
  expect([200, 400, 403, 404]).toContain(res.status)
  return (await res.json()) as T
}

const postSearch = async <T>(path: string, body: object): Promise<{ status: number; json: T }> => {
  const app = getApp()
  const res = await app.request(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as T }
}

describe("IT-SEARCH-*: Research / Dataset search", () => {
  // === GET /research ===

  itWithEs("IT-SEARCH-01: GET /research returns SearchResponse with pagination meta", async () => {
    // IT-SEARCH-01
    const app = getApp()
    const res = await app.request(url("/research?page=1&limit=5&lang=ja"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<ResearchSummary>
    expect(json.meta.pagination.page).toBe(1)
    expect(json.meta.pagination.limit).toBe(5)
    expect(typeof json.meta.pagination.total).toBe("number")
    expect(typeof json.meta.pagination.totalPages).toBe("number")
    expect(json.data.length).toBeLessThanOrEqual(5)
    expect(json.data.length).toBeLessThanOrEqual(json.meta.pagination.total)
    for (const item of json.data) {
      expect(typeof item.title?.ja === "string" || item.title?.ja === undefined).toBe(true)
      expect(typeof item.title?.en === "string" || item.title?.en === undefined).toBe(true)
    }
  })

  itWithEs("IT-SEARCH-02: pagination boundaries (parametrize)", async () => {
    // IT-SEARCH-02
    const app = getApp()
    interface Case { qs: string; expect: number }
    const cases: Case[] = [
      { qs: "page=1&limit=1", expect: 200 },
      { qs: "page=1&limit=100", expect: 200 },
      { qs: "page=1&limit=101", expect: 400 },
      { qs: "page=0&limit=20", expect: 400 },
      { qs: "page=-1&limit=20", expect: 400 },
      { qs: "page=1&limit=0", expect: 400 },
    ]
    for (const c of cases) {
      const res = await app.request(url(`/research?${c.qs}`))
      expect(res.status).toBe(c.expect)
    }
    // Huge page: returns 200 with empty data and total > 0 (when ES has data).
    const huge = await app.request(url("/research?page=99999&limit=20"))
    expect(huge.status).toBe(200)
    const hugeJson = (await huge.json()) as SearchResponse<ResearchSummary>
    expect(hugeJson.data).toEqual([])
  })

  itWithEs("IT-SEARCH-03: lang=en returns English values for monolingual fields, title stays bilingual", async () => {
    // IT-SEARCH-03
    const app = getApp()
    const [resJa, resEn] = await Promise.all([
      app.request(url("/research?limit=3&lang=ja")),
      app.request(url("/research?limit=3&lang=en")),
    ])
    expect(resJa.status).toBe(200)
    expect(resEn.status).toBe(200)
    const ja = (await resJa.json()) as SearchResponse<ResearchSummary>
    const en = (await resEn.json()) as SearchResponse<ResearchSummary>
    if (ja.data.length === 0 || en.data.length === 0) {
      console.log("  SKIP IT-SEARCH-03: no Research in ES")
      return
    }
    // BilingualText title: ja and en keys are identical regardless of lang param.
    const sameKeys = (obj: object) => Object.keys(obj).sort().join(",")
    expect(sameKeys(ja.data[0].title ?? {})).toBe(sameKeys(en.data[0].title ?? {}))
  })

  itWithEs("IT-SEARCH-04: lang=fr returns 400 validation error", async () => {
    // IT-SEARCH-04
    const app = getApp()
    const res = await app.request(url("/research?lang=fr"))
    expect(res.status).toBe(400)
  })

  itWithEs("IT-SEARCH-05: sort=humId&order=asc orders items by humId ascending", async () => {
    // IT-SEARCH-05
    const app = getApp()
    const res = await app.request(url("/research?sort=humId&order=asc&limit=20"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as SearchResponse<ResearchSummary>
    for (let i = 1; i < json.data.length; i++) {
      expect(json.data[i - 1].humId <= json.data[i].humId).toBe(true)
    }
  })

  itWithEs("IT-SEARCH-06: invalid sort field returns 400", async () => {
    // IT-SEARCH-06
    const app = getApp()
    const res = await app.request(url("/research?sort=__not_a_field__"))
    expect(res.status).toBe(400)
  })

  // === POST /research/search ===

  itWithEs("IT-SEARCH-07: POST /research/search returns SearchResponse without facets unless requested", async () => {
    // IT-SEARCH-07
    const { status, json } = await postSearch<SearchResponse<ResearchSummary> & { facets?: FacetsMap | null }>(
      "/research/search",
      { page: 1, limit: 5, lang: "ja" },
    )
    expect(status).toBe(200)
    expect(json.meta.pagination.page).toBe(1)
    expect(json.facets === undefined || json.facets === null).toBe(true)
  })

  itWithEs("IT-SEARCH-08: POST /research/search with includeFacets=true returns facets object", async () => {
    // IT-SEARCH-08
    const { status, json } = await postSearch<SearchResponse<ResearchSummary> & { facets?: FacetsMap }>(
      "/research/search",
      { page: 1, limit: 5, lang: "ja", includeFacets: true },
    )
    expect(status).toBe(200)
    expect(typeof json.facets).toBe("object")
    expect(json.facets).not.toBeNull()
  })

  itWithEs("IT-SEARCH-09: query equal to existing humId returns that humId first", async () => {
    // IT-SEARCH-09
    const list = await fetchJson<SearchResponse<ResearchSummary>>("/research?limit=1")
    if (list.data.length === 0) {
      console.log("  SKIP IT-SEARCH-09: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const { status, json } = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1,
      limit: 10,
      lang: "ja",
      query: humId,
    })
    expect(status).toBe(200)
    expect(json.meta.pagination.total).toBeGreaterThanOrEqual(1)
    expect(json.data[0].humId).toBe(humId)
  })

  itWithEs("IT-SEARCH-10: query as humId prefix matches multiple", async () => {
    // IT-SEARCH-10
    const list = await fetchJson<SearchResponse<ResearchSummary>>("/research?limit=1")
    if (list.data.length === 0) {
      console.log("  SKIP IT-SEARCH-10: no Research in ES")
      return
    }
    const prefix = list.data[0].humId.slice(0, Math.max(3, list.data[0].humId.length - 2))
    const { status, json } = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1,
      limit: 50,
      lang: "ja",
      query: prefix,
    })
    expect(status).toBe(200)
    expect(json.meta.pagination.total).toBeGreaterThanOrEqual(1)
  })

  itWithEs("IT-SEARCH-11: query is case-insensitive for humId", async () => {
    // IT-SEARCH-11
    const list = await fetchJson<SearchResponse<ResearchSummary>>("/research?limit=1")
    if (list.data.length === 0) {
      console.log("  SKIP IT-SEARCH-11: no Research in ES")
      return
    }
    const humId = list.data[0].humId
    const { json } = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1,
      limit: 10,
      lang: "ja",
      query: humId.toUpperCase(),
    })
    expect(json.data.some((r) => r.humId === humId)).toBe(true)
  })

  itWithEs("IT-SEARCH-12: query equal to a datasetId surfaces the parent Research", async () => {
    // IT-SEARCH-12
    const dsList = await fetchJson<SearchResponse<DatasetSummary>>("/dataset?limit=1")
    if (dsList.data.length === 0) {
      console.log("  SKIP IT-SEARCH-12: no Dataset in ES")
      return
    }
    const { datasetId, humId } = dsList.data[0]
    const { json } = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1,
      limit: 10,
      lang: "ja",
      query: datasetId,
    })
    expect(json.data.some((r) => r.humId === humId)).toBe(true)
  })

  itWithEs("IT-SEARCH-14: POST /research/search with status=draft returns 403 for public", async () => {
    // IT-SEARCH-14
    const { status, json } = await postSearch<{ title?: string }>("/research/search", {
      page: 1, limit: 5, lang: "ja", status: "draft",
    })
    expect(status).toBe(403)
    expect(json.title).toBe("Forbidden")
  })

  itWithEs("IT-SEARCH-15: POST /research/search with datasetFilters narrows results", async () => {
    // IT-SEARCH-15
    // We don't know the available assayType values offline; pull the most-populated bucket and use it.
    const facets = await fetchJson<{ data: FacetsMap }>("/facets?countBy=research")
    const assay = facets.data.assayType ?? []
    if (assay.length === 0) {
      console.log("  SKIP IT-SEARCH-15: no assayType buckets")
      return
    }
    const target = assay.reduce((a, b) => (b.count > a.count ? b : a)).value
    const { status, json } = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1, limit: 5, lang: "ja", datasetFilters: { assayType: [target] },
    })
    expect(status).toBe(200)
    const baseline = await fetchJson<SearchResponse<ResearchSummary>>("/research?limit=1")
    expect(json.meta.pagination.total).toBeLessThanOrEqual(baseline.meta.pagination.total)
  })

  itWithEs("IT-SEARCH-16: POST /research/search with datePublished.min narrows or equals baseline", async () => {
    // IT-SEARCH-16
    const baseline = await fetchJson<SearchResponse<ResearchSummary>>("/research?limit=1")
    const { status, json } = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1, limit: 5, lang: "ja", datePublished: { min: "2020-01-01" },
    })
    expect(status).toBe(200)
    expect(json.meta.pagination.total).toBeLessThanOrEqual(baseline.meta.pagination.total)
    for (const r of json.data) {
      if (r.datePublished) expect(r.datePublished >= "2020-01-01").toBe(true)
    }
  })

  // === POST /dataset/search ===

  itWithEs("IT-SEARCH-17: POST /dataset/search returns SearchResponse<EsDataset>", async () => {
    // IT-SEARCH-17
    const { status, json } = await postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
      page: 1, limit: 5, lang: "ja",
    })
    expect(status).toBe(200)
    expect(json.meta.pagination.page).toBe(1)
  })

  itWithEs("IT-SEARCH-18: POST /dataset/search filters AND across fields shrinks the result vs single-filter OR", async () => {
    // IT-SEARCH-18
    // OR within one field (assayType: [a, b]) vs AND across fields (assayType: [a] + tissues: [t]).
    const facets = await fetchJson<{ data: FacetsMap }>("/facets?countBy=dataset")
    const assay = facets.data.assayType ?? []
    const tissues = facets.data.tissues ?? []
    if (assay.length < 1 || tissues.length < 1) {
      console.log("  SKIP IT-SEARCH-18: not enough facet buckets")
      return
    }
    const a1 = assay[0].value
    const a2 = assay.length > 1 ? assay[1].value : assay[0].value
    const t1 = tissues[0].value
    const [or, andRes] = await Promise.all([
      postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
        page: 1, limit: 5, filters: { assayType: [a1, a2] },
      }),
      postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
        page: 1, limit: 5, filters: { assayType: [a1], tissues: [t1] },
      }),
    ])
    expect(or.status).toBe(200)
    expect(andRes.status).toBe(200)
    expect(andRes.json.meta.pagination.total).toBeLessThanOrEqual(or.json.meta.pagination.total)
  })

  itWithEs("IT-SEARCH-19: POST /dataset/search query equal to datasetId returns that datasetId first", async () => {
    // IT-SEARCH-19
    const list = await fetchJson<SearchResponse<DatasetSummary>>("/dataset?limit=1")
    if (list.data.length === 0) {
      console.log("  SKIP IT-SEARCH-19: no Dataset in ES")
      return
    }
    const datasetId = list.data[0].datasetId
    const { json } = await postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
      page: 1, limit: 10, lang: "ja", query: datasetId,
    })
    expect(json.data.some((d) => d.datasetId === datasetId)).toBe(true)
  })

  itWithEs("IT-SEARCH-20: POST /dataset/search query=humId returns only children of that humId", async () => {
    // IT-SEARCH-20
    const list = await fetchJson<SearchResponse<DatasetSummary>>("/dataset?limit=1")
    if (list.data.length === 0) {
      console.log("  SKIP IT-SEARCH-20: no Dataset in ES")
      return
    }
    const { humId } = list.data[0]
    const { json } = await postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
      page: 1, limit: 50, lang: "ja", query: humId,
    })
    for (const d of json.data) expect(d.humId).toBe(humId)
  })

  itWithEs("IT-SEARCH-21: POST /dataset/search hasPhenotypeData filter narrows result", async () => {
    // IT-SEARCH-21
    const baseline = await postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
      page: 1, limit: 1,
    })
    const { status, json } = await postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
      page: 1, limit: 1, filters: { hasPhenotypeData: true },
    })
    expect(status).toBe(200)
    expect(json.meta.pagination.total).toBeLessThanOrEqual(baseline.json.meta.pagination.total)
  })

  itWithEs("IT-SEARCH-22: POST /dataset/search subjectCount range filter", async () => {
    // IT-SEARCH-22
    const baseline = await postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
      page: 1, limit: 1,
    })
    const { status, json } = await postSearch<SearchResponse<DatasetSummary>>("/dataset/search", {
      page: 1, limit: 1, filters: { subjectCount: { min: 100 } },
    })
    expect(status).toBe(200)
    expect(json.meta.pagination.total).toBeLessThanOrEqual(baseline.json.meta.pagination.total)
  })

  itWithEs("IT-SEARCH-26: identical search bodies return identical id sets and totals (idempotent)", async () => {
    // IT-SEARCH-26
    const body = { page: 1, limit: 20, lang: "ja" }
    const [a, b] = await Promise.all([
      postSearch<SearchResponse<ResearchSummary>>("/research/search", body),
      postSearch<SearchResponse<ResearchSummary>>("/research/search", body),
    ])
    expect(a.json.meta.pagination.total).toBe(b.json.meta.pagination.total)
    const ids = (j: SearchResponse<ResearchSummary>) => j.data.map((x) => x.humId).sort()
    expect(ids(a.json)).toEqual(ids(b.json))
  })

  itWithEs("IT-SEARCH-27: query 'cancer' vs 'CANCER' returns the same humId set", async () => {
    // IT-SEARCH-27
    const [lower, upper] = await Promise.all([
      postSearch<SearchResponse<ResearchSummary>>("/research/search", { page: 1, limit: 50, query: "cancer" }),
      postSearch<SearchResponse<ResearchSummary>>("/research/search", { page: 1, limit: 50, query: "CANCER" }),
    ])
    const ids = (j: SearchResponse<ResearchSummary>) => new Set(j.data.map((r) => r.humId))
    expect(ids(lower.json)).toEqual(ids(upper.json))
  })

  itWithEs("IT-SEARCH-28: empty query string behaves like no query (200, baseline total)", async () => {
    // IT-SEARCH-28
    const baseline = await fetchJson<SearchResponse<ResearchSummary>>("/research?limit=1")
    const { status, json } = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1, limit: 1, query: "",
    })
    expect(status).toBe(200)
    expect(json.meta.pagination.total).toBe(baseline.meta.pagination.total)
  })

  itWithEs("IT-SEARCH-29: sort=relevance without query still returns 200 with deterministic order", async () => {
    // IT-SEARCH-29
    const a = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1, limit: 10, sort: "relevance",
    })
    const b = await postSearch<SearchResponse<ResearchSummary>>("/research/search", {
      page: 1, limit: 10, sort: "relevance",
    })
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.json.data.map((r) => r.humId)).toEqual(b.json.data.map((r) => r.humId))
  })

  itWithEs("IT-SEARCH-30: list and search results contain no deleted Research", async () => {
    // IT-SEARCH-30
    const [list, search] = await Promise.all([
      fetchJson<SearchResponse<ResearchSummary>>("/research?limit=50"),
      postSearch<SearchResponse<ResearchSummary>>("/research/search", { page: 1, limit: 50 }),
    ])
    for (const r of list.data) expect(r.status).not.toBe("deleted")
    for (const r of search.json.data) expect(r.status).not.toBe("deleted")
  })

  // IT-SEARCH-13 (compound query like "hum0001 cancer"), IT-SEARCH-23 (disease partial),
  // IT-SEARCH-24 (icd10 prefix), IT-SEARCH-25 (fuzziness boundaries) require known test corpus
  // tokens to assert "must hit / must not hit". They are covered in unit
  // (`tests/unit/api/es-client/query-builders.test.ts`); here we additionally rely on
  // staging-side smoke (`tests/api-manual-testing.md`).
})
