/**
 * Research routes unit tests
 *
 * Covers:
 * - validation: page, limit, lang, sort, order boundary rejections (400 + RFC 7807)
 * - authentication: 401 on the protected endpoints
 * - status filter authorization (IT-AUTH-16 / IT-RESEARCH-02):
 *     public requesting non-published -> 403
 *     authenticated non-admin requesting draft -> 200 (own scope; deeper
 *     filtering is exercised in tests/unit/api/es-client/search.test.ts)
 * - listing response includes status field for authenticated users (IT-AUTH-20)
 *
 * Mocking strategy:
 * - @/api/middleware/auth: simulate optionalAuth via X-Test-Auth header
 * - @/api/es-client/search.searchResearches: stubbed to return a deterministic
 *   payload so we can inspect the response shape independent of ES.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { AuthUser } from "@/api/types"

import { buildMockAuthModule, userAuthHeader } from "../../helpers/mock-auth"
import { createMockResearchDoc } from "../../helpers/mock-es"

// === Auth mock (shared header-based factory) ===

void mock.module("@/api/middleware/auth", buildMockAuthModule)

void mock.module("@/api/services/ownership", () => ({
  getOwnerUsernames: async () => [],
  getOwnedHumIds: async () => [],
  isOwner: async () => false,
  refreshOwnershipCache: async () => undefined,
  resetOwnershipCacheForTest: () => undefined,
}))

// === ES mocks ===

interface SearchCall {
  query: Record<string, unknown>
  authUser: AuthUser | null
}

const searchCalls: SearchCall[] = []

const sampleHit = () => createMockResearchDoc({
  humId: "hum0001",
  status: "published",
  latestVersion: "v1",
  // dataProvider / versionIds inherit defaults
})

const mockSearchResearches = mock(async (query: Record<string, unknown>, authUser: AuthUser | null) => {
  searchCalls.push({ query, authUser })
  return {
    data: [{
      humId: "hum0001",
      title: { ja: "T", en: "T" },
      versionIds: ["hum0001-v1"],
      latestVersion: "v1",
      dataProvider: [],
      summary: sampleHit().summary,
      status: "published" as const,
      _seq_no: 1,
      _primary_term: 1,
      datasets: [] as { datasetId: string; version: string }[],
    }],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
  }
})

void mock.module("@/api/es-client/search", () => ({
  searchResearches: mockSearchResearches,
  searchDatasets: mock(async () => ({
    data: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  })),
}))

// Avoid pulling real ES through other es-client modules at import time.
// Named mocks for the mutating paths so 401 assertions can prove that the
// auth gate short-circuits before any ES write is issued.
const mockGetResearchWithSeqNo = mock(async () => null as ({ doc: unknown; seqNo: number; primaryTerm: number } | null))
const mockCreateResearch = mock(async () => { throw new Error("not stubbed") })
const mockUpdateResearch = mock(async () => null)
const mockUpdateResearchStatus = mock(async () => null)
const mockDeleteResearch = mock(async () => false)
const mockCreateResearchVersion = mock(async () => null)

void mock.module("@/api/es-client/research", () => ({
  getResearchWithSeqNo: mockGetResearchWithSeqNo,
  getResearchDetail: mock(async () => null),
  getResearchDoc: mock(async () => null),
  createResearch: mockCreateResearch,
  updateResearch: mockUpdateResearch,
  updateResearchStatus: mockUpdateResearchStatus,
  deleteResearch: mockDeleteResearch,
}))

void mock.module("@/api/es-client/research-version", () => ({
  createResearchVersion: mockCreateResearchVersion,
  listResearchVersionsSorted: mock(async () => null),
  getResearchVersion: mock(async () => null),
  getResearchVersionWithSeqNo: mock(async () => null),
  listResearchVersions: mock(async () => []),
  linkDatasetToResearch: mock(async () => undefined),
  unlinkDatasetFromResearch: mock(async () => undefined),
  updateResearchVersionReleaseNote: mock(async () => true),
}))

const { getTestApp } = await import("../../helpers")

const userAuth = userAuthHeader

beforeEach(() => {
  searchCalls.length = 0
  mockSearchResearches.mockClear()
  mockGetResearchWithSeqNo.mockClear()
  mockCreateResearch.mockClear()
  mockUpdateResearch.mockClear()
  mockUpdateResearchStatus.mockClear()
  mockDeleteResearch.mockClear()
  mockCreateResearchVersion.mockClear()
})

describe("api/routes/research", () => {
  describe("validation (Zod -> RFC 7807)", () => {
    it.each([
      ["/research?page=0", 400],
      ["/research?page=-1", 400],
      ["/research?limit=0", 400],
      ["/research?limit=101", 400],
      ["/research?lang=invalid", 400],
      ["/research?sort=invalid", 400],
      ["/research?order=invalid", 400],
    ])("rejects %s with 400 (RFC 7807)", async (path, expected) => {
      const app = getTestApp()
      const res = await app.request(path)
      expect(res.status).toBe(expected)
      expect(res.headers.get("content-type")).toContain("application/problem+json")
      const body = await res.json() as { title?: string }
      expect(body.title).toBe("Validation Error")
    })
  })

  describe("authentication", () => {
    it.each([
      ["POST", "/research/new"],
      ["PUT", "/research/hum0001/update"],
      ["POST", "/research/hum0001/delete"],
      ["POST", "/research/hum0001/submit"],
      ["POST", "/research/hum0001/approve"],
      ["POST", "/research/hum0001/reject"],
      ["POST", "/research/hum0001/unpublish"],
      ["POST", "/research/hum0001/versions/new"],
    ])("%s %s without Authorization returns 401", async (method, path) => {
      const app = getTestApp()
      const res = await app.request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(401)
      // The auth gate must short-circuit before any ES read or write happens.
      expect(mockGetResearchWithSeqNo).not.toHaveBeenCalled()
      expect(mockCreateResearch).not.toHaveBeenCalled()
      expect(mockUpdateResearch).not.toHaveBeenCalled()
      expect(mockUpdateResearchStatus).not.toHaveBeenCalled()
      expect(mockDeleteResearch).not.toHaveBeenCalled()
      expect(mockCreateResearchVersion).not.toHaveBeenCalled()
    })
  })

  describe("status filter authorization (IT-AUTH-16 / IT-RESEARCH-02)", () => {
    it.each([
      ["draft", /Public users can only access published/],
      ["review", /Public users can only access published/],
    ] as const)(
      "public requesting status=%s returns 403",
      async (status, detailPattern) => {
        const app = getTestApp()
        const res = await app.request(`/research?status=${status}`)
        expect(res.status).toBe(403)
        expect(res.headers.get("content-type")).toContain("application/problem+json")
        const body = await res.json() as { title?: string; detail?: string }
        expect(body.title).toBe("Forbidden")
        expect(body.detail).toMatch(detailPattern)
        // route-layer 403 short-circuits before ES is contacted
        expect(mockSearchResearches).not.toHaveBeenCalled()
      },
    )

    it("public requesting status=published returns 200", async () => {
      const app = getTestApp()
      const res = await app.request("/research?status=published")
      expect(res.status).toBe(200)
      expect(mockSearchResearches).toHaveBeenCalledTimes(1)
    })

    it("authenticated non-admin requesting status=draft returns 200 (deeper own-scope filtering in es-client)", async () => {
      const app = getTestApp()
      const res = await app.request("/research?status=draft", { headers: userAuth() })
      expect(res.status).toBe(200)
      // The status param is forwarded; deeper own-only filter is verified in es-client/search.test.ts
      const call = searchCalls.at(-1)
      expect(call?.query.status).toBe("draft")
      expect(call?.authUser?.userId).toBe("user-1")
    })

  })

  describe("listing response shape (IT-AUTH-20)", () => {
    it("includes status field in items for authenticated callers", async () => {
      const app = getTestApp()
      const res = await app.request("/research", { headers: userAuth() })
      expect(res.status).toBe(200)
      const body = await res.json() as { data: { status: string }[] }
      expect(body.data[0].status).toBeDefined()
    })

    it("exposes pagination meta on the listing response", async () => {
      const app = getTestApp()
      const res = await app.request("/research")
      const body = await res.json() as { meta: { pagination?: { page: number; limit: number; total: number; totalPages: number } } }
      expect(body.meta.pagination).toBeDefined()
      expect(body.meta.pagination?.page).toBe(1)
    })
  })
})
