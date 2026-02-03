/**
 * Research routes unit tests
 *
 * Tests route configuration without requiring ES.
 * For integration tests with real ES, see tests/integration/api/endpoints.test.ts
 */
import { describe, expect, it } from "bun:test"

import { getTestApp } from "../../helpers"

describe("api/routes/research", () => {
  describe("route configuration", () => {
    it("should have research routes registered", () => {
      const app = getTestApp()
      expect(app).toBeDefined()
    })
  })

  // Note: These tests verify that routes exist and respond correctly
  // without requiring ES. The actual business logic is tested in integration tests.

  describe("validation (no ES required)", () => {
    it("should reject invalid page parameter", async () => {
      const app = getTestApp()

      // page=0 should be rejected (min is 1)
      const res0 = await app.request("/research?page=0")
      expect(res0.status).toBe(400)

      // page=-1 should be rejected
      const resNeg = await app.request("/research?page=-1")
      expect(resNeg.status).toBe(400)
    })

    it("should reject invalid limit parameter", async () => {
      const app = getTestApp()

      // limit=0 should be rejected (min is 1)
      const res0 = await app.request("/research?limit=0")
      expect(res0.status).toBe(400)

      // limit=101 should be rejected (max is 100)
      const res101 = await app.request("/research?limit=101")
      expect(res101.status).toBe(400)
    })

    it("should reject invalid lang parameter", async () => {
      const app = getTestApp()

      // Only ja and en are valid
      const res = await app.request("/research?lang=invalid")
      expect(res.status).toBe(400)
    })

    it("should reject invalid sort parameter", async () => {
      const app = getTestApp()

      // Invalid sort field
      const res = await app.request("/research?sort=invalid")
      expect(res.status).toBe(400)
    })

    it("should reject invalid order parameter", async () => {
      const app = getTestApp()

      // Only asc and desc are valid
      const res = await app.request("/research?order=invalid")
      expect(res.status).toBe(400)
    })
  })

  describe("authentication (no ES required)", () => {
    it("should require authentication for POST /research/new", async () => {
      const app = getTestApp()
      const res = await app.request("/research/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(401)
    })

    it("should require authentication for PUT /research/{humId}/update", async () => {
      const app = getTestApp()
      const res = await app.request("/research/hum0001/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(401)
    })

    it("should require authentication for POST /research/{humId}/delete", async () => {
      const app = getTestApp()
      const res = await app.request("/research/hum0001/delete", {
        method: "POST",
      })

      expect(res.status).toBe(401)
    })

    it("should require authentication for workflow actions", async () => {
      const app = getTestApp()

      // Submit
      let res = await app.request("/research/hum0001/submit", { method: "POST" })
      expect(res.status).toBe(401)

      // Approve
      res = await app.request("/research/hum0001/approve", { method: "POST" })
      expect(res.status).toBe(401)

      // Reject
      res = await app.request("/research/hum0001/reject", { method: "POST" })
      expect(res.status).toBe(401)

      // Unpublish
      res = await app.request("/research/hum0001/unpublish", { method: "POST" })
      expect(res.status).toBe(401)
    })

    it("should require authentication for POST /research/{humId}/versions/new", async () => {
      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(401)
    })

    it("should require authentication for PUT /research/{humId}/uids", async () => {
      const app = getTestApp()
      const res = await app.request("/research/hum0001/uids", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uids: ["uid1"] }),
      })

      expect(res.status).toBe(401)
    })
  })
})
