/**
 * Resource authorization tests
 *
 * Tests canModifyResource for ownership verification
 * and loadResearchAndAuthorize middleware behavior.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"

import { canModifyResource } from "@/api/middleware/resource-auth"
import type { AuthUser, EsDataset, EsResearch } from "@/api/types"

import { createMockAuthUser, createMockDatasetDoc, createMockResearchDoc } from "../helpers/mock-es"

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

// === loadResearchAndAuthorize / loadDatasetAndAuthorize middleware (integration via Hono) ===

// Mock ES boundary (research + dataset clients). Both middlewares share the
// research module mock so the modules are replaced exactly once.
const mockGetResearchWithSeqNo = mock<
  (humId: string) => Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number } | null>
>()
const mockGetResearchDoc = mock<(humId: string) => Promise<EsResearch | null>>()
const mockGetDatasetWithSeqNo = mock<
  (datasetId: string, version: string) =>
  Promise<{ doc: EsDataset; seqNo: number; primaryTerm: number } | null>
>()
const mockResolveLatestDatasetVersion = mock<(datasetId: string) => Promise<string | null>>()

void mock.module("@/api/es-client/research", () => ({
  getResearchWithSeqNo: (...args: unknown[]) => mockGetResearchWithSeqNo(args[0] as string),
  getResearchDoc: (...args: unknown[]) => mockGetResearchDoc(args[0] as string),
}))

void mock.module("@/api/es-client/dataset", () => ({
  getDatasetWithSeqNo: (...args: unknown[]) =>
    mockGetDatasetWithSeqNo(args[0] as string, args[1] as string),
  resolveLatestDatasetVersion: (...args: unknown[]) =>
    mockResolveLatestDatasetVersion(args[0] as string),
}))

// Import AFTER mock.module (bun hoists mock.module, but be explicit for clarity)
const { loadResearchAndAuthorize, loadDatasetAndAuthorize } = await import(
  "@/api/middleware/resource-auth"
)

/** Create a minimal Hono app with the middleware under test */
const createTestApp = (options: { requireOwnership?: boolean; requireAdmin?: boolean } = {}) => {
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

    it("returns 404 for non-existent resource", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue(null)

      const res = await app.request("/hum9999/action", {
        method: "POST",
        headers: authHeader(owner),
      })

      expect(res.status).toBe(404)
    })
  })

  describe("requireAdmin: true", () => {
    const app = createTestApp({ requireAdmin: true })

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

// === loadDatasetAndAuthorize ===

/** Minimal Hono app exercising loadDatasetAndAuthorize on /:datasetId/action */
const createDatasetTestApp = (options: {
  requireOwnership?: boolean
  requireAdmin?: boolean
  requireParentDraft?: boolean
} = {}) => {
  const app = new Hono()

  app.onError((err, c) => {
    if (err && typeof err === "object" && "statusCode" in err) {
      return c.json(
        { detail: (err as Error).message },
        (err as { statusCode: number }).statusCode as 403,
      )
    }
    return c.json({ detail: "Internal error" }, 500)
  })

  app.use("*", async (c, next) => {
    const authHeader = c.req.header("X-Test-Auth")
    if (authHeader) {
      c.set("authUser", JSON.parse(authHeader) as AuthUser)
    } else {
      c.set("authUser", null)
    }
    await next()
  })

  app.use("/:datasetId/action", loadDatasetAndAuthorize(options))
  app.post("/:datasetId/action", (c) => {
    const dataset = c.get("dataset")
    const parent = c.get("parentResearch")
    return c.json({
      datasetId: dataset.datasetId,
      version: dataset.version,
      seqNo: dataset.seqNo,
      primaryTerm: dataset.primaryTerm,
      parentHumId: parent.humId,
      parentStatus: parent.status,
    })
  })

  return app
}

describe("loadDatasetAndAuthorize", () => {
  const draftParent = createMockResearchDoc({
    humId: "hum0001",
    uids: ["owner-1"],
    status: "draft",
    latestVersion: null,
    draftVersion: "v1",
  })
  const publishedParent = createMockResearchDoc({
    humId: "hum0001",
    uids: ["owner-1"],
    status: "published",
    latestVersion: "v1",
    draftVersion: null,
  })
  const reviewParent = createMockResearchDoc({
    humId: "hum0001",
    uids: ["owner-1"],
    status: "review",
    latestVersion: null,
    draftVersion: "v1",
  })
  const dataset = createMockDatasetDoc({ datasetId: "JGAD000001", version: "v1", humId: "hum0001" })

  const owner = createMockAuthUser({ userId: "owner-1" })
  const otherUser = createMockAuthUser({ userId: "other-1" })
  const admin = createMockAuthUser({ isAdmin: true })

  beforeEach(() => {
    mockGetDatasetWithSeqNo.mockReset()
    mockGetResearchDoc.mockReset()
    mockResolveLatestDatasetVersion.mockReset()
    // Default: resolve to "v1" so existing tests without ?version= keep their semantics.
    mockResolveLatestDatasetVersion.mockResolvedValue("v1")
  })

  describe("requireOwnership: true, requireParentDraft: true", () => {
    const app = createDatasetTestApp({ requireOwnership: true, requireParentDraft: true })

    it("allows owner on draft-parent dataset and exposes preloaded vars", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue({ doc: dataset, seqNo: 7, primaryTerm: 2 })
      mockGetResearchDoc.mockResolvedValue(draftParent)

      const res = await app.request("/JGAD000001/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(owner) },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body).toEqual({
        datasetId: "JGAD000001",
        version: "v1",
        seqNo: 7,
        primaryTerm: 2,
        parentHumId: "hum0001",
        parentStatus: "draft",
      })
    })

    it("allows admin even when not in uids", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      mockGetResearchDoc.mockResolvedValue(draftParent)

      const res = await app.request("/JGAD000001/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(admin) },
      })

      expect(res.status).toBe(200)
    })

    it("rejects unauthenticated caller with 401 (validators never run)", async () => {
      const res = await app.request("/JGAD000001/action", { method: "POST" })
      expect(res.status).toBe(401)
      // The ES boundary must not be hit when auth fails up-front
      expect(mockGetDatasetWithSeqNo).not.toHaveBeenCalled()
      expect(mockGetResearchDoc).not.toHaveBeenCalled()
    })

    it("rejects non-owner authenticated user with 403", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      mockGetResearchDoc.mockResolvedValue(draftParent)

      const res = await app.request("/JGAD000001/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(otherUser) },
      })

      expect(res.status).toBe(403)
      const body = (await res.json()) as { detail: string }
      expect(body.detail).toBe("Not authorized to update this dataset")
    })

    it("returns 409 with parent-draft message when parent is published", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      mockGetResearchDoc.mockResolvedValue(publishedParent)

      const res = await app.request("/JGAD000001/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(admin) },
      })

      expect(res.status).toBe(409)
      const body = (await res.json()) as { detail: string }
      expect(body.detail).toMatch(/'published' status, expected 'draft'/)
    })

    it("returns 409 with parent-draft message when parent is in review", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      mockGetResearchDoc.mockResolvedValue(reviewParent)

      const res = await app.request("/JGAD000001/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(owner) },
      })

      expect(res.status).toBe(409)
      const body = (await res.json()) as { detail: string }
      expect(body.detail).toMatch(/'review' status, expected 'draft'/)
    })

    it("returns 404 when Dataset is missing", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue(null)

      const res = await app.request("/JGADmissing/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(owner) },
      })

      expect(res.status).toBe(404)
      const body = (await res.json()) as { detail: string }
      expect(body.detail).toMatch(/Dataset JGADmissing version v1 not found/)
    })

    it("returns 404 when parent Research is missing", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      mockGetResearchDoc.mockResolvedValue(null)

      const res = await app.request("/JGAD000001/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(owner) },
      })

      expect(res.status).toBe(404)
      const body = (await res.json()) as { detail: string }
      expect(body.detail).toMatch(/Parent Research hum0001 not found/)
    })

    it("honors ?version=<v> from raw query (validators have not yet run)", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue({
        doc: createMockDatasetDoc({ datasetId: "JGAD000001", version: "v3", humId: "hum0001" }),
        seqNo: 1,
        primaryTerm: 1,
      })
      mockGetResearchDoc.mockResolvedValue(draftParent)

      const res = await app.request("/JGAD000001/action?version=v3", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(owner) },
      })

      expect(res.status).toBe(200)
      expect(mockGetDatasetWithSeqNo).toHaveBeenCalledWith("JGAD000001", "v3")
    })

    it("resolves to the latest dataset version when ?version is malformed", async () => {
      mockResolveLatestDatasetVersion.mockResolvedValue("v2")
      mockGetDatasetWithSeqNo.mockResolvedValue({
        doc: createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2", humId: "hum0001" }),
        seqNo: 1,
        primaryTerm: 1,
      })
      mockGetResearchDoc.mockResolvedValue(draftParent)

      const res = await app.request("/JGAD000001/action?version=foo", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(owner) },
      })

      expect(res.status).toBe(200)
      expect(mockResolveLatestDatasetVersion).toHaveBeenCalledWith("JGAD000001")
      expect(mockGetDatasetWithSeqNo).toHaveBeenCalledWith("JGAD000001", "v2")
    })

    it("404 when ?version is omitted and the Dataset has no versions in ES", async () => {
      mockResolveLatestDatasetVersion.mockResolvedValue(null)

      const res = await app.request("/JGAD999999/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(owner) },
      })

      expect(res.status).toBe(404)
      expect(mockGetDatasetWithSeqNo).not.toHaveBeenCalled()
    })
  })

  describe("requireAdmin: true", () => {
    const app = createDatasetTestApp({ requireAdmin: true })

    it("allows admin", async () => {
      mockGetDatasetWithSeqNo.mockResolvedValue({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      mockGetResearchDoc.mockResolvedValue(draftParent)

      const res = await app.request("/JGAD000001/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(admin) },
      })

      expect(res.status).toBe(200)
    })

    it("rejects non-admin authenticated user (403)", async () => {
      const res = await app.request("/JGAD000001/action", {
        method: "POST",
        headers: { "X-Test-Auth": JSON.stringify(owner) },
      })

      expect(res.status).toBe(403)
      // requireAdmin fails before any ES lookup
      expect(mockGetDatasetWithSeqNo).not.toHaveBeenCalled()
    })

    it("rejects unauthenticated user (401)", async () => {
      const res = await app.request("/JGAD000001/action", { method: "POST" })
      expect(res.status).toBe(401)
    })
  })
})
