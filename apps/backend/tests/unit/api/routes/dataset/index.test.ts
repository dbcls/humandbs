/**
 * Dataset routes unit tests
 *
 * Tests route configuration without requiring ES.
 * For integration tests with real ES, see tests/integration/api/endpoints.test.ts
 */
import { describe, expect, it } from "bun:test"

import { getTestApp } from "../../helpers"

describe("api/routes/dataset", () => {
  describe("route configuration", () => {
    it("should have dataset routes registered", () => {
      const app = getTestApp()
      expect(app).toBeDefined()
    })
  })

  describe("validation (no ES required)", () => {
    it("should reject invalid page parameter", async () => {
      const app = getTestApp()

      // page=0 should be rejected (min is 1)
      const res0 = await app.request("/dataset?page=0")
      expect(res0.status).toBe(400)

      // page=-1 should be rejected
      const resNeg = await app.request("/dataset?page=-1")
      expect(resNeg.status).toBe(400)
    })

    it("should reject invalid limit parameter", async () => {
      const app = getTestApp()

      // limit=0 should be rejected (min is 1)
      const res0 = await app.request("/dataset?limit=0")
      expect(res0.status).toBe(400)

      // limit=101 should be rejected (max is 100)
      const res101 = await app.request("/dataset?limit=101")
      expect(res101.status).toBe(400)
    })

    it("should reject invalid lang parameter", async () => {
      const app = getTestApp()

      const res = await app.request("/dataset?lang=invalid")
      expect(res.status).toBe(400)
    })

    it("should reject invalid sort parameter", async () => {
      const app = getTestApp()

      const res = await app.request("/dataset?sort=invalid")
      expect(res.status).toBe(400)
    })

    it("should reject invalid order parameter", async () => {
      const app = getTestApp()

      const res = await app.request("/dataset?order=invalid")
      expect(res.status).toBe(400)
    })
  })

  describe("authentication (no ES required)", () => {
    // Note: PUT /dataset/{datasetId}/update validates body before auth check,
    // so we test with a valid body structure to trigger auth check
    it("should require authentication for PUT /dataset/{datasetId}/update", async () => {
      const app = getTestApp()
      const res = await app.request("/dataset/JGAD000001/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          humId: "hum0001",
          humVersionId: "hum0001-v1",
          releaseDate: "2024-01-01",
          criteria: "Controlled-access (Type I)",
          typeOfData: { ja: "NGS", en: "NGS" },
          experiments: [],
          _seq_no: 1,
          _primary_term: 1,
        }),
      })

      // Should return 401 (auth required) - not 400 (validation error)
      expect(res.status).toBe(401)
    })

    it("should require authentication for POST /dataset/{datasetId}/delete", async () => {
      const app = getTestApp()
      const res = await app.request("/dataset/JGAD000001/delete", {
        method: "POST",
      })

      expect(res.status).toBe(401)
    })
  })

  describe("search validation (no ES required)", () => {
    it("should reject invalid search body - negative page", async () => {
      const app = getTestApp()
      const res = await app.request("/dataset/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 0, limit: 10 }),
      })

      expect(res.status).toBe(400)
    })

    it("should reject invalid search body - limit too large", async () => {
      const app = getTestApp()
      const res = await app.request("/dataset/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, limit: 101 }),
      })

      expect(res.status).toBe(400)
    })

    it("should reject invalid search body - invalid lang", async () => {
      const app = getTestApp()
      const res = await app.request("/dataset/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, limit: 10, lang: "invalid" }),
      })

      expect(res.status).toBe(400)
    })
  })
})
