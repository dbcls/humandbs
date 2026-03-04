import { expect } from "bun:test"

import {
  describe,
  expectBaseMeta,
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

  // === Single ===

  itWithDataset("GET /dataset/{datasetId} -> 200, data/meta", async (datasetId) => {
    const { status, body } = await fetchJson(`/dataset/${datasetId}`)

    expect(status).toBe(200)
    expect(body).toHaveProperty("data")
    expectBaseMeta(body.meta)
    expect((body.data as Record<string, unknown>).datasetId).toBe(datasetId)
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
