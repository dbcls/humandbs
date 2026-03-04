import { expect } from "bun:test"

import {
  describe,
  expectBaseMeta,
  expectProblemDetails,
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

  itLive("GET /research?lang=en -> 200, english response", async () => {
    const { status, body } = await fetchJson("/research?lang=en&page=1&limit=1")

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })

  itLive("GET /research?sort=humId&order=desc -> 200, sorted", async () => {
    const { status, body } = await fetchJson("/research?sort=humId&order=desc&page=1&limit=5")

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectPagination(body.meta.pagination)
  })

  itLive("GET /research?page=1&limit=1 -> 200, single item", async () => {
    const { status, body } = await fetchJson("/research?page=1&limit=1")

    expect(status).toBe(200)
    const items = body.data as unknown[]
    expect(items.length).toBeLessThanOrEqual(1)
    expectPagination(body.meta.pagination)
    expect(body.meta.pagination.limit).toBe(1)
  })

  // === Single ===

  itWithResearch("GET /research/{humId} -> 200, data/meta", async (humId) => {
    const { status, body } = await fetchJson(`/research/${humId}`)

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expectBaseMeta(body.meta)
    expect((body.data as Record<string, unknown>).humId).toBe(humId)
  })

  itWithResearch("GET /research/{humId}?lang=en -> 200, english detail", async (humId) => {
    const { status, body } = await fetchJson(`/research/${humId}?lang=en`)

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expect((body.data as Record<string, unknown>).humId).toBe(humId)
  })

  itLive("GET /research/NONEXISTENT-ID -> 404, RFC 7807", async () => {
    const { status, body } = await fetchJson("/research/NONEXISTENT-ID")

    expect(status).toBe(404)
    expectProblemDetails(body, 404)
  })

  // === Versions ===

  itWithResearch("GET /research/{humId}/versions -> 200, data array with pagination", async (humId) => {
    const { status, body } = await fetchJson(`/research/${humId}/versions`)

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectBaseMeta(body.meta)
    expectPagination(body.meta.pagination)
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
