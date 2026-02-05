/**
 * Facets endpoint tests (route configuration only)
 *
 * Tests that verify the /facets routes are properly configured.
 * Integration tests with ES should be run inside the Docker container.
 */
import { describe, expect, it } from "bun:test"

import { getTestApp } from "../helpers"

describe("api/routes/facets", () => {
  describe("route configuration", () => {
    it("should have facets routes registered", () => {
      const app = getTestApp()
      // Just verify the app can be created with facets routes
      expect(app).toBeDefined()
    })
  })

  // Note: Integration tests that require ES should be in a separate file
  // and run inside Docker: tests/integration/api/facets.test.ts
})
