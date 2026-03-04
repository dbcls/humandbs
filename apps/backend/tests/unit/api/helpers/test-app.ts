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
  const app = getTestApp()
  return testClient(app)
}

/**
 * Get raw Hono app instance for lower-level testing
 */
export function getTestApp() {
  const saved = process.env.HUMANDBS_BACKEND_URL_PREFIX
  delete process.env.HUMANDBS_BACKEND_URL_PREFIX
  try {
    return createApp()
  } finally {
    if (saved !== undefined) {
      process.env.HUMANDBS_BACKEND_URL_PREFIX = saved
    }
  }
}

export type TestClient = ReturnType<typeof createTestClient>
