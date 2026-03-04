import { expect } from "bun:test"

import {
  describe,
  expectBaseMeta,
  expectPagination,
  fetchJson,
  itLive,
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
})
