/**
 * App-level smoke for routing edges (preflight + trailing slash).
 *
 * These are regression anchors for behaviour that is easy to break with a
 * Hono / middleware re-wire and that is otherwise only exercised live.
 */
import { describe, expect, it } from "bun:test"

import { getTestApp } from "./helpers"

describe("OPTIONS preflight", () => {
  it("returns 2xx with CORS Access-Control-Allow-Origin header for /research", async () => {
    const res = await getTestApp().request("/research", {
      method: "OPTIONS",
      headers: {
        Origin: "https://humandbs.example.org",
        "Access-Control-Request-Method": "GET",
      },
    })

    // CORS preflight handled by hono/cors middleware should succeed (any 2xx).
    expect(res.status).toBeLessThan(300)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy()
  })

  it("preflight on a trailing-slash variant of /research also succeeds", async () => {
    const res = await getTestApp().request("/research/", {
      method: "OPTIONS",
      headers: {
        Origin: "https://humandbs.example.org",
        "Access-Control-Request-Method": "GET",
      },
    })
    expect(res.status).toBeLessThan(400)
  })
})

describe("Trailing slash handling", () => {
  it("GET /health responds 200", async () => {
    const res = await getTestApp().request("/health")
    expect(res.status).toBe(200)
  })

  it("GET /health/ (trailing slash) responds 404 — Hono distinguishes the path", async () => {
    // Anchor today's behaviour: Hono's router treats `/health` and `/health/`
    // as separate paths, and the app does not register the trailing-slash
    // variant. The 404 handler in app.ts catches it. If we later add a
    // trailing-slash normaliser this assertion will flag the change.
    const res = await getTestApp().request("/health/")
    expect(res.status).toBe(404)
  })
})
