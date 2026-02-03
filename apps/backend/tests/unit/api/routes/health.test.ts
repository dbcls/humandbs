/**
 * Health endpoint tests
 *
 * Tests the /health endpoint for basic availability.
 */
import { describe, expect, it } from "bun:test"

import type { HealthResponse } from "@/api/types"

import { getTestApp } from "../helpers"

describe("api/routes/health", () => {
  describe("GET /health", () => {
    it("should return status ok", async () => {
      const app = getTestApp()
      const res = await app.request("/health")

      expect(res.status).toBe(200)

      const json = await res.json() as HealthResponse
      expect(json.status).toBe("ok")
      expect(json.timestamp).toBeDefined()
    })

    it("should return valid ISO timestamp", async () => {
      const app = getTestApp()
      const res = await app.request("/health")

      const json = await res.json() as HealthResponse
      const timestamp = new Date(json.timestamp)

      expect(timestamp.toISOString()).toBe(json.timestamp)
    })

    it("should return JSON content type", async () => {
      const app = getTestApp()
      const res = await app.request("/health")

      expect(res.headers.get("content-type")).toContain("application/json")
    })
  })
})
