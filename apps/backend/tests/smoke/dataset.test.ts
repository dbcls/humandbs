import { expect } from "bun:test"

import {
  describe,
  expectBaseMeta,
  expectProblemDetails,
  expectPagination,
  fetchJson,
  itLive,
  itWithDataset,
} from "./helpers"

describe("Smoke: /dataset", () => {
  // === List ===

  itLive("GET /dataset?page=1&limit=5 -> 200, pagination", async () => {
    const { status, body } = await fetchJson("/dataset?page=1&limit=5")

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectBaseMeta(body.meta)
    expectPagination(body.meta.pagination)
  })

  itLive("GET /dataset?lang=en -> 200, english response", async () => {
    const { status, body } = await fetchJson("/dataset?lang=en&page=1&limit=1")

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })

  itLive("GET /dataset?sort=datasetId&order=desc -> 200, sorted", async () => {
    const { status, body } = await fetchJson("/dataset?sort=datasetId&order=desc&page=1&limit=5")

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectPagination(body.meta.pagination)
  })

  itLive("GET /dataset?page=1&limit=1 -> 200, single item", async () => {
    const { status, body } = await fetchJson("/dataset?page=1&limit=1")

    expect(status).toBe(200)
    const items = body.data as unknown[]
    expect(items.length).toBeLessThanOrEqual(1)
    expectPagination(body.meta.pagination)
    expect(body.meta.pagination.limit).toBe(1)
  })

  // === Single ===

  itWithDataset("GET /dataset/{datasetId} -> 200, data/meta", async (datasetId) => {
    const { status, body } = await fetchJson(`/dataset/${datasetId}`)

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expectBaseMeta(body.meta)
    expect((body.data as Record<string, unknown>).datasetId).toBe(datasetId)
  })

  itWithDataset("GET /dataset/{datasetId}?lang=en -> 200, english detail", async (datasetId) => {
    const { status, body } = await fetchJson(`/dataset/${datasetId}?lang=en`)

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expect((body.data as Record<string, unknown>).datasetId).toBe(datasetId)
  })

  itLive("GET /dataset/NONEXISTENT-ID -> 404, RFC 7807", async () => {
    const { status, body } = await fetchJson("/dataset/NONEXISTENT-ID")

    expect(status).toBe(404)
    expectProblemDetails(body, 404)
  })

  // === Research sub-resource ===

  itWithDataset("GET /dataset/{datasetId}/research -> 200, parent research", async (datasetId) => {
    const { status, body } = await fetchJson(`/dataset/${datasetId}/research`)

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expectBaseMeta(body.meta)
  })

  // === Versions ===

  itWithDataset("GET /dataset/{datasetId}/versions -> 200, data array", async (datasetId) => {
    const { status, body } = await fetchJson(`/dataset/${datasetId}/versions`)

    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expectBaseMeta(body.meta)
  })

  itWithDataset("GET /dataset/{datasetId}/versions/v1 -> 200 or 404", async (datasetId) => {
    const { status } = await fetchJson(`/dataset/${datasetId}/versions/v1`)

    expect([200, 404]).toContain(status)
  })
})
