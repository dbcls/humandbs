import { expect } from "bun:test"

import { describe, expectProblemDetails, expectValidationError, fetchJson, itLive } from "./helpers"

describe("Smoke: error responses (400/404)", () => {
  // === 400: Validation errors ===

  itLive("GET /research?limit=101 -> 400, limit exceeds max", async () => {
    const { status, body } = await fetchJson("/research?limit=101")

    expect(status).toBe(400)
    expectValidationError(body)
  })

  itLive("GET /dataset?limit=0 -> 400, limit below min", async () => {
    const { status, body } = await fetchJson("/dataset?limit=0")

    expect(status).toBe(400)
    expectValidationError(body)
  })

  itLive("GET /facets/invalidFieldName -> 400, invalid facet name", async () => {
    const { status, body } = await fetchJson("/facets/invalidFieldName")

    expect(status).toBe(400)
    expectValidationError(body)
  })

  itLive("POST /research/search with limit=101 -> 400, search limit exceeds max", async () => {
    const { status, body } = await fetchJson("/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, limit: 101, lang: "ja" }),
    })

    expect(status).toBe(400)
    expectValidationError(body)
  })

  // === 404: Not found ===

  itLive("GET /research/NONEXISTENT -> 404, RFC 7807", async () => {
    const { status, body } = await fetchJson("/research/NONEXISTENT")

    expect(status).toBe(404)
    expectProblemDetails(body, 404)
  })

  itLive("GET /dataset/NONEXISTENT -> 404, RFC 7807", async () => {
    const { status, body } = await fetchJson("/dataset/NONEXISTENT")

    expect(status).toBe(404)
    expectProblemDetails(body, 404)
  })
})
