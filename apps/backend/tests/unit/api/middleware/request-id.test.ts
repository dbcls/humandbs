/**
 * Request ID middleware tests
 *
 * Covers IT-CORE-01 (X-Request-ID echo) and IT-CORE-02 (UUID auto-generation,
 * uniqueness, requestId field in error body).
 *
 * The middleware is exercised via getTestApp() so that the full app pipeline
 * (cors, requestIdMiddleware, onError) is tested as a whole, instead of
 * stubbing the Hono context. No external boundary is touched.
 */
import { describe, expect, it } from "bun:test"

import { getTestApp } from "../helpers"

// RFC 4122 v4 (case-insensitive). Variant nibble must be 8, 9, a, or b.
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe("api/middleware/request-id", () => {
  describe("X-Request-ID echo (client-provided)", () => {
    it("echoes the X-Request-ID header verbatim", async () => {
      // IT-CORE-01
      const app = getTestApp()
      const customId = "client-provided-id-abcdef"

      const res = await app.request("/health", {
        headers: { "X-Request-ID": customId },
      })

      expect(res.headers.get("X-Request-ID")).toBe(customId)
    })

    it("echoes the same value across repeated requests (no rewrite, no cache)", async () => {
      // IT-CORE-01 (rewrite/cache regression)
      const app = getTestApp()
      const customId = "shared-id-xyz"

      const res1 = await app.request("/health", { headers: { "X-Request-ID": customId } })
      const res2 = await app.request("/health", { headers: { "X-Request-ID": customId } })

      expect(res1.headers.get("X-Request-ID")).toBe(customId)
      expect(res2.headers.get("X-Request-ID")).toBe(customId)
    })

    it("preserves the provided id even on error responses", async () => {
      // IT-CORE-01 + IT-ERROR-08 (header consistency)
      const app = getTestApp()
      const customId = "error-path-id"

      const res = await app.request("/__not_a_route__", {
        headers: { "X-Request-ID": customId },
      })

      expect(res.status).toBe(404)
      expect(res.headers.get("X-Request-ID")).toBe(customId)
    })
  })

  describe("auto-generation (header missing)", () => {
    it("returns a UUID v4 when no X-Request-ID is sent", async () => {
      // IT-CORE-02
      const app = getTestApp()

      const res = await app.request("/health")
      const id = res.headers.get("X-Request-ID")

      expect(id).not.toBeNull()
      expect(id).toMatch(UUID_V4_REGEX)
    })

    it("generates a distinct UUID for each request (no per-instance caching)", async () => {
      // IT-CORE-02 (uniqueness)
      const app = getTestApp()

      const ids = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const res = await app.request("/health")
          return res.headers.get("X-Request-ID")
        }),
      )

      // all values present
      expect(ids.every(id => id != null)).toBe(true)
      // all 5 are unique
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe("requestId propagation to error body", () => {
    it("the auto-generated id appears as requestId in the RFC 7807 body", async () => {
      // IT-CORE-02 (header / body consistency)
      const app = getTestApp()

      const res = await app.request("/__does_not_exist__")
      const headerId = res.headers.get("X-Request-ID")

      expect(res.status).toBe(404)
      // Content-Type asserted in errors/index.test.ts; here we only need the body's requestId
      const body = await res.json() as { requestId?: string }
      expect(headerId).not.toBeNull()
      expect(body.requestId).toBe(headerId ?? "")
    })

    it("the client-provided id appears as requestId in the error body", async () => {
      // IT-CORE-01 + IT-ERROR-* (echo also reaches the body)
      const app = getTestApp()
      const customId = "trace-me-please"

      const res = await app.request("/__does_not_exist__", {
        headers: { "X-Request-ID": customId },
      })

      const body = await res.json() as { requestId?: string }
      expect(body.requestId).toBe(customId)
    })
  })
})
