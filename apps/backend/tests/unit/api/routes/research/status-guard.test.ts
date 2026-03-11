/**
 * Research update status guard tests
 *
 * Verifies that PUT /research/{humId}/update rejects non-draft Research.
 * ES client and auth middleware are mocked (external boundaries).
 */
import { OpenAPIHono } from "@hono/zod-openapi"
import { describe, expect, it, mock, beforeEach } from "bun:test"

import type { AuthUser, EsResearch } from "@/api/types"

import { createMockResearchDoc, createMockAuthUser } from "../../helpers/mock-es"

// === Mock external boundaries ===

const mockUpdateResearch = mock<(...args: unknown[]) => Promise<EsResearch | null>>()
const mockGetResearchWithSeqNo = mock<
  (humId: string) => Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number } | null>
>()

void mock.module("@/api/es-client/research", () => ({
  createResearch: mock(() => Promise.resolve(null)),
  deleteResearch: mock(() => Promise.resolve(false)),
  getResearchDetail: mock(() => Promise.resolve(null)),
  getResearchWithSeqNo: (...args: unknown[]) => mockGetResearchWithSeqNo(args[0] as string),
  updateResearch: (...args: unknown[]) => mockUpdateResearch(...args),
  updateResearchUids: mock(() => Promise.resolve(null)),
}))

void mock.module("@/api/es-client/search", () => ({
  searchResearches: mock(() => Promise.resolve({ data: [], pagination: { total: 0, page: 1, limit: 10 } })),
}))

// Mock auth middleware to inject test user
let testAuthUser: AuthUser | null = null

void mock.module("@/api/middleware/auth", () => {
  const fakeAuth = async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set("authUser", testAuthUser)
    await next()
  }

  return {
    optionalAuth: fakeAuth,
    requireAuth: fakeAuth,
    requireAdmin: fakeAuth,
    isAdminUser: mock(() => Promise.resolve(false)),
    canDeleteResource: (user: AuthUser | null) => user?.isAdmin ?? false,
  }
})

// Import AFTER mock setup
const { registerCrudHandlers } = await import("@/api/routes/research/crud")
const { loadResearchAndAuthorize } = await import("@/api/middleware/resource-auth")

// === Test app factory ===

const createUpdateTestApp = () => {
  const router = new OpenAPIHono()

  // Error handler: convert AppError to proper HTTP status
  router.onError((err, c) => {
    if (err && typeof err === "object" && "statusCode" in err) {
      const statusCode = (err as { statusCode: number }).statusCode as 409
      return c.json({ detail: (err as Error).message }, statusCode)
    }
    return c.json({ detail: "Internal error" }, 500)
  })

  router.use("*", async (c, next) => {
    c.set("authUser", testAuthUser)
    await next()
  })
  router.use("/:humId/update", loadResearchAndAuthorize({ requireOwnership: true }))

  registerCrudHandlers(router)
  return router
}

// === Tests ===

const owner = createMockAuthUser({ userId: "owner-1" })

const updateBody = {
  title: { ja: "更新", en: "Updated" },
  _seq_no: 1,
  _primary_term: 1,
}

describe("PUT /research/{humId}/update status guard", () => {
  let app: ReturnType<typeof createUpdateTestApp>

  beforeEach(() => {
    app = createUpdateTestApp()
    testAuthUser = owner
    mockUpdateResearch.mockReset()
    mockGetResearchWithSeqNo.mockReset()
  })

  it("allows update when status is draft", async () => {
    const draftDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "draft",
      uids: ["owner-1"],
      latestVersion: null,
      draftVersion: "v1",
    })

    const updatedDoc = { ...draftDoc, title: { ja: "更新", en: "Updated" } }

    // First call: middleware loads research
    // Second call: handler fetches updated seqNo
    mockGetResearchWithSeqNo
      .mockResolvedValueOnce({ doc: draftDoc, seqNo: 1, primaryTerm: 1 })
      .mockResolvedValueOnce({ doc: updatedDoc, seqNo: 2, primaryTerm: 1 })

    mockUpdateResearch.mockResolvedValue(updatedDoc)

    const res = await app.request("/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(200)
  })

  it("rejects update when status is review (409)", async () => {
    const reviewDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "review",
      uids: ["owner-1"],
      latestVersion: null,
      draftVersion: "v1",
    })

    mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc, seqNo: 1, primaryTerm: 1 })

    const res = await app.request("/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(409)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain("review")
  })

  it("rejects update when status is published (409)", async () => {
    const publishedDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "published",
      uids: ["owner-1"],
      latestVersion: "v1",
      draftVersion: null,
    })

    mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc, seqNo: 1, primaryTerm: 1 })

    const res = await app.request("/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(409)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain("published")
  })

  it("does not call updateResearch when status is not draft", async () => {
    const reviewDoc = createMockResearchDoc({
      humId: "hum0001",
      status: "review",
      uids: ["owner-1"],
    })

    mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc, seqNo: 1, primaryTerm: 1 })

    await app.request("/hum0001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    })

    expect(mockUpdateResearch).not.toHaveBeenCalled()
  })
})
