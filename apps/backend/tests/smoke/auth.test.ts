import { expect } from "bun:test"

import { describe, fetchJson, itLive } from "./helpers"

describe("Smoke: auth-required endpoints (no auth -> 401)", () => {
  itLive("POST /research/new (no auth) -> 401", async () => {
    const { status } = await fetchJson("/research/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(status).toBe(401)
  })

  itLive("GET /admin/is-admin (no auth) -> 401", async () => {
    const { status } = await fetchJson("/admin/is-admin")

    expect(status).toBe(401)
  })
})
