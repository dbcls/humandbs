import { expect } from "bun:test"

import {
  describe,
  expectBaseMeta,
  expectPagination,
  fetchJson,
  itLive,
  itWithResearch,
} from "./helpers"

describe("Smoke: /research", () => {
  // === List ===

  itLive("GET /research?page=1&limit=5 -> 200, pagination", async () => {
    const { status, body } = await fetchJson("/research?page=1&limit=5")

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectBaseMeta(body.meta)
    expectPagination(body.meta.pagination)
  })

  // === Single ===

  itWithResearch("GET /research/{humId} -> 200, data/meta", async (humId) => {
    const { status, body } = await fetchJson(`/research/${humId}`)

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expectBaseMeta(body.meta)
    expect((body.data as Record<string, unknown>).humId).toBe(humId)
  })

  // === Versions ===

  itWithResearch("GET /research/{humId}/versions -> 200, data array", async (humId) => {
    const { status, body } = await fetchJson(`/research/${humId}/versions`)

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectBaseMeta(body.meta)
  })

  itWithResearch("GET /research/{humId}/versions/v1 -> 200 or 404", async (humId) => {
    const { status } = await fetchJson(`/research/${humId}/versions/v1`)

    expect([200, 404]).toContain(status)
  })

  // === Dataset sub-resource ===

  itWithResearch("GET /research/{humId}/dataset -> 200, data array", async (humId) => {
    const { status, body } = await fetchJson(`/research/${humId}/dataset`)

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectBaseMeta(body.meta)
  })
})
