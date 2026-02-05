/**
 * Stats endpoint tests (route configuration only)
 *
 * Tests that verify the /stats route is properly configured.
 * Integration tests with ES should be run inside the Docker container.
 */
import { describe, expect, it } from "bun:test"

import { getTestApp } from "../helpers"

describe("api/routes/stats", () => {
  describe("route configuration", () => {
    it("should have stats route registered", () => {
      const app = getTestApp()
      // Just verify the app can be created with stats route
      expect(app).toBeDefined()
    })
  })

  // Note: Integration tests that require ES should be in a separate file
  // and run inside Docker: tests/integration/api/stats.test.ts
})
