/**
 * Test Application Factory
 *
 * Provides a fully configured Hono app for testing without
 * connecting to real Elasticsearch or Keycloak.
 */
import { testClient } from "hono/testing"

import { createApp } from "@/api/app"

/**
 * Create a test client for the app
 * Uses hono/testing's testClient for type-safe testing
 */
export function createTestClient() {
  const app = createApp()
  return testClient(app)
}

/**
 * Get raw Hono app instance for lower-level testing
 */
export function getTestApp() {
  return createApp()
}

export type TestClient = ReturnType<typeof createTestClient>
