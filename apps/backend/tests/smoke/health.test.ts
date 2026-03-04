import { expect } from "bun:test"

import { describe, fetchJson, itLive } from "./helpers"

describe("Smoke: /health", () => {
  itLive("GET /health -> 200, status ok", async () => {
    const { status, body } = await fetchJson("/health")

    expect(status).toBe(200)
    expect(body.status).toBe("ok")
    expect(typeof body.timestamp).toBe("string")
  })
})
