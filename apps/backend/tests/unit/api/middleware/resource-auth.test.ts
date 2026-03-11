/**
 * Resource authorization tests
 *
 * Tests canModifyResource for ownership verification
 * and loadResearchAndAuthorize middleware behavior.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"

import { canModifyResource } from "@/api/middleware/resource-auth"
import type { AuthUser, EsResearch } from "@/api/types"

import { createMockResearchDoc, createMockAuthUser } from "../helpers/mock-es"

// === canModifyResource ===

describe("canModifyResource", () => {
  const admin = createMockAuthUser({ isAdmin: true })
  const owner = createMockAuthUser({ userId: "owner-1" })
  const otherUser = createMockAuthUser({ userId: "other-1" })

  it("admin can modify any resource", () => {
    const doc = createMockResearchDoc({ uids: ["someone-else"] })
    expect(canModifyResource(admin, doc)).toBe(true)
  })

  it("owner (in uids) can modify own resource", () => {
    const doc = createMockResearchDoc({ uids: ["owner-1"] })
    expect(canModifyResource(owner, doc)).toBe(true)
  })

  it("owner with multiple uids can modify", () => {
    const doc = createMockResearchDoc({ uids: ["other-user", "owner-1", "another-user"] })
    expect(canModifyResource(owner, doc)).toBe(true)
  })

  it("non-owner authenticated user cannot modify", () => {
    const doc = createMockResearchDoc({ uids: ["owner-1"] })
    expect(canModifyResource(otherUser, doc)).toBe(false)
  })

  it("unauthenticated user cannot modify", () => {
    const doc = createMockResearchDoc({ uids: ["owner-1"] })
    expect(canModifyResource(null, doc)).toBe(false)
  })

  it("empty uids rejects everyone except admin", () => {
    const doc = createMockResearchDoc({ uids: [] })
    expect(canModifyResource(admin, doc)).toBe(true)
    expect(canModifyResource(owner, doc)).toBe(false)
    expect(canModifyResource(null, doc)).toBe(false)
  })

  // Regression: public visibility must NOT grant modify access
  it("non-owner cannot modify publicly visible draft (latestVersion != null)", () => {
    const doc = createMockResearchDoc({
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: "v2",
      status: "draft",
    })
    expect(canModifyResource(otherUser, doc)).toBe(false)
  })

  it("non-owner cannot modify published resource", () => {
    const doc = createMockResearchDoc({
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: null,
      status: "published",
    })
    expect(canModifyResource(otherUser, doc)).toBe(false)
  })
})

// === loadResearchAndAuthorize middleware (integration via Hono) ===

// Mock getResearchWithSeqNo at the module boundary (ES = external)
const mockGetResearchWithSeqNo = mock<
  (humId: string) => Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number } | null>
>()

void mock.module("@/api/es-client/research", () => ({
  getResearchWithSeqNo: (...args: unknown[]) => mockGetResearchWithSeqNo(args[0] as string),
}))

// Import AFTER mock.module (bun hoists mock.module, but be explicit for clarity)
const { loadResearchAndAuthorize } = await import("@/api/middleware/resource-auth")

/** Create a minimal Hono app with the middleware under test */
const createTestApp = (options: { requireOwnership?: boolean; adminOnly?: boolean } = {}) => {
  const app = new Hono()

  // Error handler: convert AppError to proper HTTP status
  app.onError((err, c) => {
    if (err && typeof err === "object" && "statusCode" in err) {
      return c.json({ detail: (err as Error).message }, (err as { statusCode: number }).statusCode as 403)
    }
    return c.json({ detail: "Internal error" }, 500)
  })

  // Simulate auth middleware: inject authUser from X-Test-Auth header
  app.use("*", async (c, next) => {
    const authHeader = c.req.header("X-Test-Auth")
    if (authHeader) {
      c.set("authUser", JSON.parse(authHeader) as AuthUser)
    } else {
      c.set("authUser", null)
    }
    await next()
  })

  app.use("/:humId/action", loadResearchAndAuthorize(options))
  app.post("/:humId/action", (c) => {
    const research = c.get("research")
    return c.json({ humId: research.humId, status: research.status })
  })

  return app
}

const authHeader = (user: AuthUser) => ({ "X-Test-Auth": JSON.stringify(user) })

describe("loadResearchAndAuthorize", () => {
  const ownerDoc = createMockResearchDoc({
    humId: "hum0001",
    uids: ["owner-1"],
    status: "draft",
    latestVersion: null,
    draftVersion: "v1",
  })

  const publishedWithDraftDoc = createMockResearchDoc({
    humId: "hum0001",
    uids: ["owner-1"],
    status: "draft",
    latestVersion: "v1",
    draftVersion: "v2",
  })

  const deletedDoc = createMockResearchDoc({
    humId: "hum0001",
    uids: ["owner-1"],
    status: "deleted",
  })

  const owner = createMockAuthUser({ userId: "owner-1" })
  const otherUser = createMockAuthUser({ userId: "other-1" })
  const admin = createMockAuthUser({ isAdmin: true })

  beforeEach(() => {
    mockGetResearchWithSeqNo.mockReset()
  })

  describe("requireOwnership: true", () => {
    const app = createTestApp({ requireOwnership: true })

    it("allows owner to access own resource", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: ownerDoc, seqNo: 1, primaryTerm: 1 })

      const res = await app.request("/hum0001/action", {
        method: "POST",
        headers: authHeader(owner),
      })

      expect(res.status).toBe(200)
    })

    it("allows admin to access any resource", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: ownerDoc, seqNo: 1, primaryTerm: 1 })

      const res = await app.request("/hum0001/action", {
        method: "POST",
        headers: authHeader(admin),
      })

      expect(res.status).toBe(200)
    })

    it("rejects non-owner authenticated user (403)", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: ownerDoc, seqNo: 1, primaryTerm: 1 })

      const res = await app.request("/hum0001/action", {
        method: "POST",
        headers: authHeader(otherUser),
      })

      expect(res.status).toBe(403)
    })

    // Regression: non-owner must be rejected even when latestVersion != null
    it("rejects non-owner on publicly visible draft (latestVersion != null)", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({
        doc: publishedWithDraftDoc, seqNo: 1, primaryTerm: 1,
      })

      const res = await app.request("/hum0001/action", {
        method: "POST",
        headers: authHeader(otherUser),
      })

      expect(res.status).toBe(403)
    })

    it("rejects unauthenticated user (401)", async () => {
      const res = await app.request("/hum0001/action", { method: "POST" })

      expect(res.status).toBe(401)
    })

    it("returns 404 for deleted resource", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: deletedDoc, seqNo: 1, primaryTerm: 1 })

      const res = await app.request("/hum0001/action", {
        method: "POST",
        headers: authHeader(owner),
      })

      expect(res.status).toBe(404)
    })

    it("returns 404 for non-existent resource", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue(null)

      const res = await app.request("/hum9999/action", {
        method: "POST",
        headers: authHeader(owner),
      })

      expect(res.status).toBe(404)
    })
  })

  describe("adminOnly: true", () => {
    const app = createTestApp({ adminOnly: true })

    it("allows admin", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: ownerDoc, seqNo: 1, primaryTerm: 1 })

      const res = await app.request("/hum0001/action", {
        method: "POST",
        headers: authHeader(admin),
      })

      expect(res.status).toBe(200)
    })

    it("rejects non-admin authenticated user (403)", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: ownerDoc, seqNo: 1, primaryTerm: 1 })

      const res = await app.request("/hum0001/action", {
        method: "POST",
        headers: authHeader(owner),
      })

      expect(res.status).toBe(403)
    })

    it("rejects unauthenticated user (401)", async () => {
      const res = await app.request("/hum0001/action", { method: "POST" })

      expect(res.status).toBe(401)
    })
  })
})
