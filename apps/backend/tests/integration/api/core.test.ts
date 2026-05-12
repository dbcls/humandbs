/**
 * IT-CORE-*: cross-cutting middleware (`requestIdMiddleware`, `cors`, URL prefix, not-found).
 *
 * Reference: `tests/integration-scenarios.md § IT-CORE-*`.
 */
import { beforeAll, describe, expect } from "bun:test"

import { getApp, getUrlPrefix, itWithEs, setupIntegration, url } from "./setup"

beforeAll(setupIntegration)

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe("IT-CORE-*: cross-cutting middleware/handlers", () => {
  itWithEs("IT-CORE-01: X-Request-ID is echoed when set on the request header", async () => {
    // IT-CORE-01
    // Invariants: same id is echoed in `X-Request-ID` response header; repeated calls return the same echo (no rewrite).
    const app = getApp()
    const customId = "req-id-from-client-12345"
    const res1 = await app.request(url("/health"), { headers: { "X-Request-ID": customId } })
    const res2 = await app.request(url("/health"), { headers: { "X-Request-ID": customId } })
    expect(res1.headers.get("X-Request-ID")).toBe(customId)
    expect(res2.headers.get("X-Request-ID")).toBe(customId)
  })

  itWithEs("IT-CORE-02: missing X-Request-ID is replaced with a fresh UUID v4 per request", async () => {
    // IT-CORE-02
    // Invariants: header is UUID v4; two calls produce two different ids (no caching).
    const app = getApp()
    const res1 = await app.request(url("/health"))
    const res2 = await app.request(url("/health"))
    const id1 = res1.headers.get("X-Request-ID") ?? ""
    const id2 = res2.headers.get("X-Request-ID") ?? ""
    expect(id1).toMatch(UUID_V4_REGEX)
    expect(id2).toMatch(UUID_V4_REGEX)
    expect(id1).not.toBe(id2)
  })

  itWithEs("IT-CORE-02b: error body `requestId` matches the X-Request-ID response header", async () => {
    // IT-CORE-02 (cross-check with IT-ERROR-01): the body field and the header must stay in sync.
    const app = getApp()
    const res = await app.request(url("/research/__does_not_exist__"))
    const headerId = res.headers.get("X-Request-ID")
    const json = (await res.json()) as { requestId?: string }
    expect(json.requestId).toBe(headerId ?? undefined)
    expect(headerId).toMatch(UUID_V4_REGEX)
  })

  itWithEs("IT-CORE-03: regular request returns Access-Control-Allow-Origin: *", async () => {
    // IT-CORE-03
    const app = getApp()
    const res = await app.request(url("/health"), { headers: { Origin: "https://example.com" } })
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
  })

  itWithEs("IT-CORE-03b: CORS preflight (OPTIONS) returns Access-Control-Allow-Origin: *", async () => {
    // IT-CORE-03 (preflight)
    const app = getApp()
    const res = await app.request(url("/health"), {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    })
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
  })

  itWithEs("IT-CORE-04: URL prefix is required exactly when env is set", async () => {
    // IT-CORE-04
    // Invariants: with prefix → `${prefix}/health` is 200 and `/health` is 404; without prefix → mirror.
    const app = getApp()
    const prefix = getUrlPrefix()
    if (prefix) {
      const withPrefix = await app.request(url("/health"))
      const naked = await app.request("/health")
      expect(withPrefix.status).toBe(200)
      expect(naked.status).toBe(404)
    } else {
      const naked = await app.request("/health")
      const synthetic = await app.request("/api/health")
      expect(naked.status).toBe(200)
      expect(synthetic.status).toBe(404)
    }
  })

  itWithEs("IT-CORE-05: unknown path returns 404 with RFC 7807 problem+json and instance=path", async () => {
    // IT-CORE-05
    const app = getApp()
    const path = url("/__not_a_route__")
    const res = await app.request(path)
    expect(res.status).toBe(404)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
    const json = (await res.json()) as { type?: string; title?: string; instance?: string }
    expect(json.type).toBe("https://humandbs.dbcls.jp/errors/not-found")
    expect(json.title).toBe("Not Found")
    expect(json.instance).toBe(path)
  })

  itWithEs("IT-CORE-06: disallowed HTTP method on GET-only endpoint returns 4xx and still echoes X-Request-ID", async () => {
    // IT-CORE-06
    // Hono routes a DELETE on /health to either 404 (no matching route) or 405. Either is acceptable
    // per IT-CORE-06; what must hold is RFC 7807 shape and X-Request-ID echo.
    const app = getApp()
    const res = await app.request(url("/health"), { method: "DELETE" })
    expect([404, 405]).toContain(res.status)
    expect(res.headers.get("X-Request-ID")).toBeTruthy()
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
  })
})
