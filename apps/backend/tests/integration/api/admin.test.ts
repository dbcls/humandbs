/**
 * IT-ADMIN-*: admin endpoints (`/admin/is-admin`).
 *
 * Reference: `tests/integration-scenarios.md § IT-ADMIN-*`.
 *
 * IT-ADMIN-04 (admin_uids cache TTL) requires racing wall-clock against the cache
 * TTL constant; covered in `tests/unit/api/middleware/auth.test.ts` and not here.
 */
import { beforeAll, describe, expect } from "bun:test"

import type { SingleReadOnlyResponse } from "@/api/types"

import {
  authHeaders,
  getApp,
  itWithAdminToken,
  itWithEs,
  itWithNonAdminToken,
  setupIntegration,
  url,
} from "./setup"

beforeAll(setupIntegration)

interface IsAdminBody { isAdmin: boolean }

describe("IT-ADMIN-*: admin endpoints", () => {
  itWithEs("IT-ADMIN-01: GET /admin/is-admin without auth returns 401 problem+json", async () => {
    // IT-ADMIN-01
    const app = getApp()
    const res = await app.request(url("/admin/is-admin"))
    expect(res.status).toBe(401)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/problem\+json/)
  })

  itWithNonAdminToken("IT-ADMIN-02: GET /admin/is-admin (non-admin) returns isAdmin=false", async (token) => {
    // IT-ADMIN-02
    const app = getApp()
    const res = await app.request(url("/admin/is-admin"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<IsAdminBody>
    expect(json.data.isAdmin).toBe(false)
    expect(typeof json.meta.requestId).toBe("string")
    expect(typeof json.meta.timestamp).toBe("string")
  })

  itWithAdminToken("IT-ADMIN-03: GET /admin/is-admin (admin) returns isAdmin=true", async (token) => {
    // IT-ADMIN-03
    const app = getApp()
    const res = await app.request(url("/admin/is-admin"), { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const json = (await res.json()) as SingleReadOnlyResponse<IsAdminBody>
    expect(json.data.isAdmin).toBe(true)
  })
})
