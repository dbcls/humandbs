/**
 * JGA Shinsei endpoint tests
 *
 * Covers:
 * - IT-JGA-01: GET /jga-shinsei/ds without auth returns 401
 * - IT-JGA-02: non-admin authenticated returns 403
 * - IT-JGA-04: pagination boundary (page=0, limit=101 -> 400)
 * - IT-JGA-07: jdsId / jduId format validation -> 400
 *
 * Mocking strategy:
 * - @/api/middleware/auth: replace requireAuth / requireAdmin with controllable
 *   middlewares that set authUser based on an X-Test-Auth header. This avoids
 *   spinning up jose / fs and keeps each test independent.
 * - @/api/db-client/jga-shinsei: stubbed so no PostgreSQL is contacted; we
 *   only assert that the auth + validation guards never reach the DB layer
 *   for the failure cases.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createMiddleware } from "hono/factory"

import { ForbiddenError, UnauthorizedError } from "@/api/errors"
import type { AuthUser } from "@/api/types"

import { createMockAuthUser } from "../helpers/mock-es"

// === Auth mock (header-based) ===

const TEST_AUTH_HEADER = "X-Test-Auth"

const mockRequireAuth = createMiddleware(async (c, next) => {
  const raw = c.req.header(TEST_AUTH_HEADER)
  if (!raw) {
    throw new UnauthorizedError("Authentication required")
  }
  c.set("authUser", JSON.parse(raw) as AuthUser)
  await next()
})

const mockRequireAdmin = createMiddleware(async (c, next) => {
  const user = c.get("authUser")
  if (!user?.isAdmin) {
    throw new ForbiddenError("Admin access required")
  }
  await next()
})

const mockOptionalAuth = createMiddleware(async (c, next) => {
  const raw = c.req.header(TEST_AUTH_HEADER)
  if (raw) c.set("authUser", JSON.parse(raw) as AuthUser)
  else c.set("authUser", null)
  await next()
})

void mock.module("@/api/middleware/auth", () => ({
  requireAuth: mockRequireAuth,
  requireAdmin: mockRequireAdmin,
  optionalAuth: mockOptionalAuth,
  // routes/admin.ts imports this; surface it on the mock so registry-time
  // imports of `@/api/middleware/auth` see the same export shape as production.
  getAuthenticatedUser: (c: { get: (k: string) => AuthUser | undefined }): AuthUser => {
    const u = c.get("authenticatedUser")
    if (!u) throw new Error("mock getAuthenticatedUser: authenticatedUser not set")
    return u
  },
  isAdminUser: async (_: string) => false,
  __testing: { clearJwksCache: () => undefined, clearAdminUidsCache: () => undefined },
}))

// === DB-client mock ===

interface ListResult { hits: unknown[]; total: number }

const mockListDs = mock(async (..._args: unknown[]): Promise<ListResult> => ({ hits: [], total: 0 }))
const mockGetDs = mock(async (applIdStr: string): Promise<unknown> => ({ applIdStr }))
const mockGetDsByMaster = mock(async (dsDuId: string): Promise<unknown> => ({ dsDuId }))
const mockListDu = mock(async (..._args: unknown[]): Promise<ListResult> => ({ hits: [], total: 0 }))
const mockGetDu = mock(async (applIdStr: string): Promise<unknown> => ({ applIdStr }))

void mock.module("@/api/db-client/jga-shinsei", () => ({
  listDsApplications: mockListDs,
  getDsApplication: mockGetDs,
  getDsApplicationByMasterId: mockGetDsByMaster,
  listDuApplications: mockListDu,
  getDuApplication: mockGetDu,
  parseApplIdStr: (s: string) => {
    const m = /^(J-D[SU]\d+)-(\d{3})$/.exec(s)
    if (!m) throw new Error(`Invalid applIdStr: ${s}`)
    return { dsDuId: m[1], applVersion: parseInt(m[2], 10) }
  },
}))

const { getTestApp } = await import("../helpers")

const adminAuth = () => ({
  [TEST_AUTH_HEADER]: JSON.stringify(createMockAuthUser({ userId: "admin-1", isAdmin: true })),
})

const userAuth = () => ({
  [TEST_AUTH_HEADER]: JSON.stringify(createMockAuthUser({ userId: "user-1", isAdmin: false })),
})

describe("api/routes/jga-shinsei", () => {
  beforeEach(() => {
    mockListDs.mockClear()
    mockGetDs.mockClear()
    mockListDu.mockClear()
    mockGetDu.mockClear()
  })

  // === IT-JGA-01: unauthenticated -> 401 ===

  describe("authentication required (IT-JGA-01)", () => {
    it.each([
      ["GET /jga-shinsei/ds", "/jga-shinsei/ds"],
      ["GET /jga-shinsei/ds/{jdsApplId}", "/jga-shinsei/ds/J-DS000001-001"],
      ["GET /jga-shinsei/du", "/jga-shinsei/du"],
      ["GET /jga-shinsei/du/{jduApplId}", "/jga-shinsei/du/J-DU000001-001"],
    ])("%s returns 401 without Authorization", async (_label, path) => {
      const app = getTestApp()
      const res = await app.request(path)
      expect(res.status).toBe(401)
      expect(res.headers.get("content-type")).toContain("application/problem+json")
      const body = await res.json() as { title?: string }
      expect(body.title).toBe("Unauthorized")
    })

    it("does not invoke the DB layer when the caller is unauthenticated", async () => {
      const app = getTestApp()
      await app.request("/jga-shinsei/ds")
      expect(mockListDs).not.toHaveBeenCalled()
    })
  })

  // === IT-JGA-02: non-admin authenticated -> 403 ===

  describe("admin only (IT-JGA-02)", () => {
    it.each([
      ["GET /jga-shinsei/ds", "/jga-shinsei/ds"],
      ["GET /jga-shinsei/ds/{jdsApplId}", "/jga-shinsei/ds/J-DS000001-001"],
      ["GET /jga-shinsei/du", "/jga-shinsei/du"],
      ["GET /jga-shinsei/du/{jduApplId}", "/jga-shinsei/du/J-DU000001-001"],
    ])("%s returns 403 for non-admin authenticated", async (_label, path) => {
      const app = getTestApp()
      const res = await app.request(path, { headers: userAuth() })
      expect(res.status).toBe(403)
      expect(res.headers.get("content-type")).toContain("application/problem+json")
      const body = await res.json() as { title?: string }
      expect(body.title).toBe("Forbidden")
    })

    it("does not invoke the DB layer when the caller is non-admin", async () => {
      const app = getTestApp()
      await app.request("/jga-shinsei/ds", { headers: userAuth() })
      expect(mockListDs).not.toHaveBeenCalled()
    })
  })

  // === IT-JGA-07: jdsId / jduId format validation ===

  describe("ID format validation (IT-JGA-07)", () => {
    it.each([
      "invalid-id",
      "J-DS", // missing digits
      "JDS000001-001", // missing hyphen
      "J-DU000001-001", // wrong prefix for /ds/
      "j-ds000001-001", // wrong case
      "J-DS000001", // missing version suffix
    ])("rejects malformed jdsApplId=%s with 400", async (jdsApplId) => {
      const app = getTestApp()
      const res = await app.request(`/jga-shinsei/ds/${encodeURIComponent(jdsApplId)}`, {
        headers: adminAuth(),
      })
      expect(res.status).toBe(400)
      expect(res.headers.get("content-type")).toContain("application/problem+json")
      const body = await res.json() as { title?: string }
      expect(body.title).toBe("Validation Error")
      expect(mockGetDs).not.toHaveBeenCalled()
    })

    it.each([
      "invalid-id",
      "J-DU",
      "JDU000001-001",
      "J-DS000001-001",
      "J-DU000001", // missing version suffix
    ])("rejects malformed jduApplId=%s with 400", async (jduApplId) => {
      const app = getTestApp()
      const res = await app.request(`/jga-shinsei/du/${encodeURIComponent(jduApplId)}`, {
        headers: adminAuth(),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { title?: string }
      expect(body.title).toBe("Validation Error")
      expect(mockGetDu).not.toHaveBeenCalled()
    })

    it("accepts well-formed jdsApplId and reaches the DB layer", async () => {
      const app = getTestApp()
      await app.request("/jga-shinsei/ds/J-DS000123-001", { headers: adminAuth() })
      expect(mockGetDs).toHaveBeenCalledTimes(1)
      expect(mockGetDs.mock.calls[0]?.[0]).toBe("J-DS000123-001")
    })

    it("accepts well-formed jduApplId and reaches the DB layer", async () => {
      const app = getTestApp()
      await app.request("/jga-shinsei/du/J-DU000456-001", { headers: adminAuth() })
      expect(mockGetDu).toHaveBeenCalledTimes(1)
      expect(mockGetDu.mock.calls[0]?.[0]).toBe("J-DU000456-001")
    })
  })

  // === IT-JGA-04: pagination boundary ===

  describe("pagination boundary (IT-JGA-04)", () => {
    it("rejects limit=101 with 400", async () => {
      const app = getTestApp()
      const res = await app.request("/jga-shinsei/ds?page=1&limit=101", { headers: adminAuth() })
      expect(res.status).toBe(400)
    })

    it("rejects page=0 with 400", async () => {
      const app = getTestApp()
      const res = await app.request("/jga-shinsei/ds?page=0&limit=10", { headers: adminAuth() })
      expect(res.status).toBe(400)
    })

    it("accepts page=1 limit=1 (lower boundary)", async () => {
      const app = getTestApp()
      const res = await app.request("/jga-shinsei/ds?page=1&limit=1", { headers: adminAuth() })
      expect(res.status).toBe(200)
      expect(mockListDs).toHaveBeenCalledTimes(1)
      expect(mockListDs.mock.calls[0]).toEqual([1, 1, undefined])
    })

    it("accepts page=1 limit=100 (upper boundary)", async () => {
      const app = getTestApp()
      const res = await app.request("/jga-shinsei/ds?page=1&limit=100", { headers: adminAuth() })
      expect(res.status).toBe(200)
      expect(mockListDs.mock.calls[0]).toEqual([1, 100, undefined])
    })
  })
})
