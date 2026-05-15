/**
 * POST /research/{humId}/versions/new tests
 *
 * Covers:
 * - IT-VERSION-07: 409 when Research is not in 'published' state
 * - IT-VERSION-08: 403 for non-owner authenticated user
 * - IT-VERSION-14: 409 on optimistic-lock failure
 * - IT-VERSION-01: GET /research/{humId}/versions normal shape
 * - IT-VERSION-02: public users do not see versions beyond latestVersion
 *
 * Mocking strategy:
 * - @/api/middleware/auth: simulate optionalAuth via X-Test-Auth header.
 * - @/api/es-client/research:
 *     - getResearchWithSeqNo: drives loadResearchAndAuthorize behaviour
 *     - getResearchDetail: not exercised here (GET /versions/{version} relies on it
 *       but that path is covered indirectly through error mapping)
 * - @/api/es-client/research-version: controls createResearchVersion outcome
 *   (returns null for optimistic-lock conflict)
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { AuthUser, EsResearch, ResearchVersion } from "@/api/types"

import { TEST_AUTH_HEADER, buildMockAuthModule } from "../../helpers/mock-auth"
import { createMockAuthUser, createMockResearchDoc, createMockResearchVersionDoc } from "../../helpers/mock-es"

// === Auth mock (shared header-based factory) ===

void mock.module("@/api/middleware/auth", buildMockAuthModule)

// === ES mocks ===

const mockGetResearchWithSeqNo = mock<(humId: string) => Promise<{ doc: EsResearch; seqNo: number; primaryTerm: number } | null>>()
const mockGetResearchDetail = mock<(...args: unknown[]) => Promise<unknown>>(async () => null)

void mock.module("@/api/es-client/research", () => ({
  getResearchWithSeqNo: mockGetResearchWithSeqNo,
  getResearchDetail: mockGetResearchDetail,
  getResearchDoc: mock(async () => null),
  generateNextHumId: mock(async () => "hum0001"),
  createResearch: mock(async () => { throw new Error("createResearch not stubbed in this test") }),
  updateResearch: mock(async () => null),
  updateResearchStatus: mock(async () => null),
  updateResearchUids: mock(async () => null),
  deleteResearch: mock(async () => false),
  getPendingReviews: mock(async () => []),
}))

const mockCreateResearchVersion = mock<(...args: unknown[]) => Promise<ResearchVersion | null>>()
const mockListResearchVersionsSorted = mock<(humId: string, _u: AuthUser | null) => Promise<{ version: string }[] | null>>(
  async () => null,
)

void mock.module("@/api/es-client/research-version", () => ({
  createResearchVersion: mockCreateResearchVersion,
  listResearchVersionsSorted: mockListResearchVersionsSorted,
  // Stubs for the rest of the module surface (consumed by sibling es-client modules)
  getResearchVersion: mock(async () => null),
  getResearchVersionWithSeqNo: mock(async () => null),
  listResearchVersions: mock(async () => []),
  linkDatasetToResearch: mock(async () => undefined),
  unlinkDatasetFromResearch: mock(async () => undefined),
}))

// (search-related modules are not exercised here, but mocked to avoid pulling ES)
void mock.module("@/api/es-client/search", () => ({
  searchResearches: mock(async () => ({
    data: [],
    pagination: { page: 1, limit: 1, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  })),
  searchDatasets: mock(async () => ({
    data: [],
    pagination: { page: 1, limit: 1, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  })),
}))

const { getTestApp } = await import("../../helpers")

const owner = createMockAuthUser({ userId: "owner-1" })
const stranger = createMockAuthUser({ userId: "stranger-1" })
const admin = createMockAuthUser({ userId: "admin-1", isAdmin: true })

const authHeader = (u: AuthUser): Record<string, string> => ({ [TEST_AUTH_HEADER]: JSON.stringify(u) })

const publishedDoc = (): EsResearch => createMockResearchDoc({
  humId: "hum0001",
  status: "published",
  uids: ["owner-1"],
  latestVersion: "v1",
  draftVersion: null,
})

const draftDoc = (): EsResearch => createMockResearchDoc({
  humId: "hum0001",
  status: "draft",
  uids: ["owner-1"],
  latestVersion: null,
  draftVersion: "v1",
})

const reviewDoc = (): EsResearch => createMockResearchDoc({
  humId: "hum0001",
  status: "review",
  uids: ["owner-1"],
  latestVersion: null,
  draftVersion: "v1",
})

describe("api/routes/research/versions", () => {
  beforeEach(() => {
    mockGetResearchWithSeqNo.mockReset()
    mockGetResearchDetail.mockReset()
    mockCreateResearchVersion.mockReset()
    mockListResearchVersionsSorted.mockReset()
  })

  // === POST /research/{humId}/versions/new ===

  describe("POST /research/{humId}/versions/new", () => {
    it("returns 409 when Research is in draft (IT-VERSION-07 draft case)", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: draftDoc(), seqNo: 1, primaryTerm: 1 })

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { ...authHeader(owner), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(409)
      expect(res.headers.get("content-type")).toContain("application/problem+json")
      const body = await res.json() as { title?: string; detail?: string }
      expect(body.title).toBe("Conflict")
      expect(body.detail).toContain("expected 'published'")
      expect(mockCreateResearchVersion).not.toHaveBeenCalled()
    })

    it("returns 409 when Research is in review (IT-VERSION-07 review case)", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: reviewDoc(), seqNo: 1, primaryTerm: 1 })

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { ...authHeader(owner), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(409)
      expect(mockCreateResearchVersion).not.toHaveBeenCalled()
    })

    it("returns 403 for non-owner authenticated user (IT-VERSION-08)", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc(), seqNo: 1, primaryTerm: 1 })

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { ...authHeader(stranger), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(403)
      expect(mockCreateResearchVersion).not.toHaveBeenCalled()
    })

    it("returns 401 when unauthenticated", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc(), seqNo: 1, primaryTerm: 1 })

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(401)
      // The auth gate must short-circuit before any ES read or write.
      expect(mockGetResearchWithSeqNo).not.toHaveBeenCalled()
      expect(mockCreateResearchVersion).not.toHaveBeenCalled()
    })

    it("returns 404 when humId does not exist", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue(null)

      const app = getTestApp()
      const res = await app.request("/research/hum9999/versions/new", {
        method: "POST",
        headers: { ...authHeader(owner), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(404)
      expect(mockCreateResearchVersion).not.toHaveBeenCalled()
    })

    it("returns 409 on optimistic-lock failure (IT-VERSION-14)", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({ doc: publishedDoc(), seqNo: 5, primaryTerm: 2 })
      mockCreateResearchVersion.mockResolvedValue(null)

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { ...authHeader(owner), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(409)
      expect(mockCreateResearchVersion).toHaveBeenCalledTimes(1)
    })

    it("returns 201 with new version data on success (owner)", async () => {
      mockGetResearchWithSeqNo
        .mockResolvedValueOnce({ doc: publishedDoc(), seqNo: 5, primaryTerm: 2 })
        // Second call inside handler (after createResearchVersion) to fetch updated seqNo
        .mockResolvedValueOnce({ doc: publishedDoc(), seqNo: 6, primaryTerm: 2 })
      mockCreateResearchVersion.mockResolvedValue(createMockResearchVersionDoc({
        humId: "hum0001",
        humVersionId: "hum0001-v2",
        version: "v2",
      }))

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { ...authHeader(owner), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(201)
      const body = await res.json() as { data: { version: string; humVersionId: string; datasets: unknown[] } }
      expect(body.data.version).toBe("v2")
      expect(body.data.humVersionId).toBe("hum0001-v2")
      expect(body.data.datasets).toEqual([])
    })

    it("allows admin even when admin is not in uids", async () => {
      mockGetResearchWithSeqNo
        .mockResolvedValueOnce({ doc: publishedDoc(), seqNo: 1, primaryTerm: 1 })
        .mockResolvedValueOnce({ doc: publishedDoc(), seqNo: 2, primaryTerm: 1 })
      mockCreateResearchVersion.mockResolvedValue(createMockResearchVersionDoc({
        humVersionId: "hum0001-v2", version: "v2",
      }))

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { ...authHeader(admin), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(201)
    })

    it("returns 404 for deleted Research even as admin", async () => {
      mockGetResearchWithSeqNo.mockResolvedValue({
        doc: createMockResearchDoc({ humId: "hum0001", status: "deleted", uids: ["owner-1"] }),
        seqNo: 1,
        primaryTerm: 1,
      })

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions/new", {
        method: "POST",
        headers: { ...authHeader(admin), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(404)
    })
  })

  // === GET /research/{humId}/versions (visibility filter) ===

  describe("GET /research/{humId}/versions visibility (IT-VERSION-02)", () => {
    it("public sees only versions up to latestVersion", async () => {
      mockListResearchVersionsSorted.mockResolvedValue([
        { version: "v1" }, { version: "v2" }, { version: "v3" },
      ])
      mockGetResearchWithSeqNo.mockResolvedValue({
        doc: createMockResearchDoc({
          humId: "hum0001",
          status: "draft",
          latestVersion: "v2",
          draftVersion: "v3",
          uids: ["owner-1"],
        }),
        seqNo: 1,
        primaryTerm: 1,
      })

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions")

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { version: string }[] }
      expect(body.data.map(v => v.version)).toEqual(["v1", "v2"])
    })

    it("owner sees all versions including v3", async () => {
      mockListResearchVersionsSorted.mockResolvedValue([
        { version: "v1" }, { version: "v2" }, { version: "v3" },
      ])
      mockGetResearchWithSeqNo.mockResolvedValue({
        doc: createMockResearchDoc({
          humId: "hum0001",
          status: "draft",
          latestVersion: "v2",
          draftVersion: "v3",
          uids: ["owner-1"],
        }),
        seqNo: 1,
        primaryTerm: 1,
      })

      const app = getTestApp()
      const res = await app.request("/research/hum0001/versions", { headers: authHeader(owner) })

      const body = await res.json() as { data: { version: string }[] }
      expect(body.data.map(v => v.version)).toEqual(["v1", "v2", "v3"])
    })

    it("404 when listResearchVersionsSorted returns null (humId not found)", async () => {
      mockListResearchVersionsSorted.mockResolvedValue(null)

      const app = getTestApp()
      const res = await app.request("/research/hum9999/versions")

      expect(res.status).toBe(404)
    })
  })
})
