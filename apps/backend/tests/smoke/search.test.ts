import { expect } from "bun:test"

import {
  describe,
  expectBaseMeta,
  expectPagination,
  fetchJson,
  itLive,
  itWithDataset,
  itWithResearch,
} from "./helpers"

describe("Smoke: search & aggregations", () => {

  // === Research search ===

  itLive("POST /research/search -> 200, pagination", async () => {
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja" }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectBaseMeta(body.meta)
    expectPagination(body.meta.pagination)
  })

  itLive("POST /research/search with query -> 200, text search", async () => {
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja", query: "genome" }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectPagination(body.meta.pagination)
  })

  itWithResearch("POST /research/search with humId query -> 200, humId が先頭", async (humId) => {
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja", query: humId, sort: "relevance" }),
    })

    expect(status).toBe(200)
    const hits = body.data as { humId: string }[]
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.humId).toBe(humId)
  })

  itWithDataset("POST /research/search with datasetId query -> 200, 親 humId がヒットする", async (datasetId) => {
    // datasetId の親 Research を取得する (data は配列で返る)
    const parent = await fetchJson(`/dataset/${datasetId}/research`)
    expect(parent.status).toBe(200)
    const parentHumId = (parent.body.data as { humId?: string }[])[0]?.humId
    if (typeof parentHumId !== "string" || parentHumId === "") {
      throw new Error(`Expected parent humId for ${datasetId}, got: ${JSON.stringify(parent.body.data)}`)
    }

    // datasetId を Research 全文検索に入れると親 humId が結果に含まれること
    // (Research index に datasetIds フィールドが無い迂回路のリグレッションテスト)
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 100, lang: "ja", query: datasetId }),
    })

    expect(status).toBe(200)
    const hitHumIds = (body.data as { humId: string }[]).map(r => r.humId)
    expect(hitHumIds).toContain(parentHumId)
  })

  itLive("POST /research/search with lang=en -> 200, english search", async () => {
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "en" }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })

  itLive("POST /research/search with sort/order -> 200, sorted", async () => {
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja", sort: "humId", order: "desc" }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectPagination(body.meta.pagination)
  })

  itLive("POST /research/search with includeFacets=true -> 200, facets present", async () => {
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja", includeFacets: true }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty("facets")
    expect(typeof body.facets).toBe("object")
  })

  itLive("POST /research/search facets は Dataset 一覧より小さい (Research 単位カウント)", async () => {
    // Research 一覧は humId cardinality、Dataset 一覧は datasetId cardinality。
    // 1 Research が複数 Dataset を持つケースが含まれるため、facet ごとに
    // Research count ≤ Dataset count が成立するはず。
    const asMap = (facets: unknown): Record<string, { value: string; count: number }[]> =>
      (facets ?? {}) as Record<string, { value: string; count: number }[]>

    const [r, d] = await Promise.all([
      fetchJson("/research/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, limit: 1, lang: "ja", includeFacets: true }),
      }),
      fetchJson("/dataset/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, limit: 1, lang: "ja", includeFacets: true }),
      }),
    ])

    expect(r.status).toBe(200)
    expect(d.status).toBe(200)

    const researchFacets = asMap(r.body.facets)
    const datasetFacets = asMap(d.body.facets)

    // 全 18 facet について Research count ≤ Dataset count を検証
    const facetNames = Object.keys(datasetFacets)
    expect(facetNames.length).toBeGreaterThan(0)

    for (const name of facetNames) {
      const rVals = researchFacets[name] ?? []
      const dVals = datasetFacets[name] ?? []
      const dByValue = new Map(dVals.map(v => [v.value, v.count]))

      for (const rv of rVals) {
        const dCount = dByValue.get(rv.value)
        if (dCount === undefined) continue
        expect(rv.count).toBeLessThanOrEqual(dCount)
      }
    }
  })

  itLive("POST /research/search with datasetFilters -> 200, filtered", async () => {
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: 1,
        limit: 5,
        lang: "ja",
        datasetFilters: { assayType: ["WGS"] },
      }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })

  // === Dataset search ===

  itLive("POST /dataset/search -> 200, pagination", async () => {
    const { status, body } = await fetchJson("/dataset/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja" }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectBaseMeta(body.meta)
    expectPagination(body.meta.pagination)
  })

  itLive("POST /dataset/search with query -> 200, text search", async () => {
    const { status, body } = await fetchJson("/dataset/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja", query: "genome" }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectPagination(body.meta.pagination)
  })

  itWithResearch("POST /dataset/search with humId -> 200, filtered by research", async (humId) => {
    const { status, body } = await fetchJson("/dataset/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja", humId }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })

  itLive("POST /dataset/search with includeFacets=true -> 200, facets present", async () => {
    const { status, body } = await fetchJson("/dataset/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 5, lang: "ja", includeFacets: true }),
    })

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty("facets")
    expect(typeof body.facets).toBe("object")
  })

  // === Stats ===

  itLive("GET /stats -> 200, data/meta", async () => {
    const { status, body } = await fetchJson("/stats")

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expectBaseMeta(body.meta)
    expect(body.data).toHaveProperty("research")
    expect(body.data).toHaveProperty("dataset")
  })

  itLive("GET /stats -> 200, research/dataset have total fields", async () => {
    const { status, body } = await fetchJson("/stats")

    expect(status).toBe(200)
    const data = body.data as Record<string, unknown>
    const research = data.research as Record<string, unknown>
    const dataset = data.dataset as Record<string, unknown>
    expect(typeof research.total).toBe("number")
    expect(typeof dataset.total).toBe("number")
  })

  // === Facets ===

  itLive("GET /facets -> 200, data/meta", async () => {
    const { status, body } = await fetchJson("/facets")

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expectBaseMeta(body.meta)
    expect(typeof body.data).toBe("object")
  })

  itLive("GET /facets/assayType -> 200, fieldName/values", async () => {
    const { status, body } = await fetchJson("/facets/assayType")

    expect(status).toBe(200)
    const facet = body.data as Record<string, unknown>
    expect(facet).toHaveProperty("fieldName", "assayType")
    expect(Array.isArray(facet.values)).toBe(true)
  })

  itLive("GET /facets?assayType=WGS -> 200, filtered facets", async () => {
    const { status, body } = await fetchJson("/facets?assayType=WGS")

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expect(typeof body.data).toBe("object")
  })

  itLive("GET /facets/tissues -> 200, tissues facet", async () => {
    const { status, body } = await fetchJson("/facets/tissues")

    expect(status).toBe(200)
    const facet = body.data as Record<string, unknown>
    expect(facet).toHaveProperty("fieldName", "tissues")
    expect(Array.isArray(facet.values)).toBe(true)
  })

  itLive("GET /facets?countBy=research の count は countBy=dataset 以下", async () => {
    type FacetMap = Record<string, { value: string; count: number }[] | undefined>

    const [resDefault, resDataset, resResearch] = await Promise.all([
      fetchJson("/facets"),
      fetchJson("/facets?countBy=dataset"),
      fetchJson("/facets?countBy=research"),
    ])

    expect(resDefault.status).toBe(200)
    expect(resDataset.status).toBe(200)
    expect(resResearch.status).toBe(200)

    const defaultData = resDefault.body.data as FacetMap
    const datasetData = resDataset.body.data as FacetMap
    const researchData = resResearch.body.data as FacetMap

    // デフォルトは countBy=dataset と同じ値 (後方互換)
    expect(defaultData).toEqual(datasetData)

    // Research 一覧の count は Dataset 一覧の count 以下
    const facetNames = Object.keys(datasetData)
    expect(facetNames.length).toBeGreaterThan(0)

    for (const name of facetNames) {
      const rVals = researchData[name] ?? []
      const dVals = datasetData[name] ?? []
      const dByValue = new Map(dVals.map(v => [v.value, v.count]))

      for (const rv of rVals) {
        const dCount = dByValue.get(rv.value)
        if (dCount === undefined) continue
        expect(rv.count).toBeLessThanOrEqual(dCount)
      }
    }
  })

  itLive("GET /facets?countBy=invalid -> 400", async () => {
    const { status } = await fetchJson("/facets?countBy=invalid")
    expect(status).toBe(400)
  })
})
