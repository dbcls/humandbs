import { expect } from "bun:test"

import { describe, fetchJson, itLive } from "./helpers"

describe("Smoke: template endpoints (admin only -> 401 without auth)", () => {
  itLive("GET /templates/research/J-DS000001 (no auth) -> 401", async () => {
    const { status } = await fetchJson("/templates/research/J-DS000001")
    expect(status).toBe(401)
  })

  itLive("GET /templates/dataset/JGAD000001 (no auth) -> 401", async () => {
    const { status } = await fetchJson("/templates/dataset/JGAD000001")
    expect(status).toBe(401)
  })

  itLive("GET /templates/dataset/DRA000001 (no auth) -> 401", async () => {
    const { status } = await fetchJson("/templates/dataset/DRA000001")
    expect(status).toBe(401)
  })
})
