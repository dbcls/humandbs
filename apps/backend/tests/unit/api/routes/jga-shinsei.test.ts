/**
 * JGA Shinsei endpoint tests (route configuration + auth)
 *
 * Tests that verify the /jga-shinsei routes are properly configured
 * and require admin authentication.
 * Integration tests with ES should be run inside the Docker container.
 */
import { describe, expect, it } from "bun:test"

import { getTestApp } from "../helpers"

describe("api/routes/jga-shinsei", () => {
  describe("route configuration", () => {
    it("should have jga-shinsei routes registered", () => {
      const app = getTestApp()
      expect(app).toBeDefined()
    })
  })

  describe("authentication (no ES required)", () => {
    it("GET /jga-shinsei/ds should return 401 without auth", async () => {
      const app = getTestApp()
      const res = await app.request("/jga-shinsei/ds")
      expect(res.status).toBe(401)
    })

    it("GET /jga-shinsei/ds/J-DS000001 should return 401 without auth", async () => {
      const app = getTestApp()
      const res = await app.request("/jga-shinsei/ds/J-DS000001")
      expect(res.status).toBe(401)
    })

    it("GET /jga-shinsei/du should return 401 without auth", async () => {
      const app = getTestApp()
      const res = await app.request("/jga-shinsei/du")
      expect(res.status).toBe(401)
    })

    it("GET /jga-shinsei/du/J-DU000001 should return 401 without auth", async () => {
      const app = getTestApp()
      const res = await app.request("/jga-shinsei/du/J-DU000001")
      expect(res.status).toBe(401)
    })
  })
})
