import { expect } from "bun:test"

import {
  describe,
  expectBaseMeta,
  expectPagination,
  fetchJson,
  itLive,
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

  // === Stats ===

  itLive("GET /stats -> 200, data/meta", async () => {
    const { status, body } = await fetchJson("/stats")

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expectBaseMeta(body.meta)
    expect(body.data).toHaveProperty("research")
    expect(body.data).toHaveProperty("dataset")
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
})
