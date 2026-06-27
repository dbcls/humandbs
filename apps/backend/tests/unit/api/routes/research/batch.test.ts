/**
 * GET /research/batch unit tests
 *
 * Covers the batch-get behaviour without real ES:
 * - query validation (empty / missing / over-limit / bad lang)
 * - route precedence: "/batch" must reach the batch handler, not "/{humId}"
 * - comma-separated parsing, de-duplication, input-order preservation
 * - partial success: missing/inaccessible IDs collected in meta.batch.notFound
 * - value-based masking is applied per viewer (non-owner sees the published view)
 *
 * Mocking strategy:
 * - @/api/middleware/auth: header-based optionalAuth.
 * - @/api/es-client/research: getResearchDetail is the controllable seam; the
 *   handler then applies sanitizeResearchDetailForUser (the real implementation).
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { ResearchDetail } from "@/api/types"

import { adminAuthHeader, buildMockAuthModule, userAuthHeader } from "../../helpers/mock-auth"
import { createMockResearchDoc } from "../../helpers/mock-es"

void mock.module("@/api/middleware/auth", buildMockAuthModule)

void mock.module("@/api/services/ownership", () => ({
  getOwnerUsernames: async () => [],
  getOwnedHumIds: async () => [],
  isOwner: async (username: string) => username === "owner-1",
  refreshOwnershipCache: async () => undefined,
  resetOwnershipCacheForTest: () => undefined,
}))

const mockGetResearchDetail = mock<(id: string, opts: { version?: string }, authUser: unknown) => Promise<ResearchDetail | null>>()

void mock.module("@/api/es-client/research", () => ({
  getResearchDetail: mockGetResearchDetail,
  getResearchDoc: mock(async () => null),
  getResearchWithSeqNo: mock(async () => null),
  createResearch: mock(async () => { throw new Error("createResearch not stubbed in this test") }),
  updateResearch: mock(async () => null),
  updateResearchStatus: mock(async () => null),
  deleteResearch: mock(async () => false),
}))

const { getTestApp } = await import("../../helpers")

const makeDetail = (overrides: Partial<ResearchDetail> = {}): ResearchDetail => {
  const { versionIds: _versionIds, ...base } = createMockResearchDoc()
  return {
    ...base,
    humVersionId: "hum0001-v1",
    version: "v1",
    versionReleaseDate: "2024-01-01",
    releaseNote: { ja: { text: "note", rawHtml: null }, en: { text: "note", rawHtml: null } },
    datasets: [],
    ...overrides,
  }
}

interface BatchBody {
  data: { humId: string; status: string; draftVersion: string | null }[]
  meta: { batch: { requested: number; found: number; notFound: string[] } }
}

describe("api/routes/research GET /research/batch", () => {
  beforeEach(() => {
    mockGetResearchDetail.mockReset()
  })

  describe("validation (no ES required)", () => {
    it("rejects a request with no ids parameter", async () => {
      const app = getTestApp()
      const res = await app.request("/research/batch")
      expect(res.status).toBe(400)
      expect(mockGetResearchDetail).not.toHaveBeenCalled()
    })

    it("rejects an empty ids parameter", async () => {
      const app = getTestApp()
      const res = await app.request("/research/batch?ids=")
      expect(res.status).toBe(400)
      expect(mockGetResearchDetail).not.toHaveBeenCalled()
    })

    it("rejects more than the max number of ids", async () => {
      const app = getTestApp()
      const ids = Array.from({ length: 101 }, (_v, i) => `hum${String(i).padStart(4, "0")}`).join(",")
      const res = await app.request(`/research/batch?ids=${ids}`)
      expect(res.status).toBe(400)
      expect(mockGetResearchDetail).not.toHaveBeenCalled()
    })

    it("rejects an invalid lang parameter", async () => {
      const app = getTestApp()
      const res = await app.request("/research/batch?ids=hum0001&lang=xx")
      expect(res.status).toBe(400)
    })
  })

  describe("routing", () => {
    it("'/batch' reaches the batch handler, not the dynamic detail route", async () => {
      mockGetResearchDetail.mockImplementation(async (id) => makeDetail({ humId: id }))

      const app = getTestApp()
      const res = await app.request("/research/batch?ids=hum0001")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      expect(Array.isArray(body.data)).toBe(true)
      expect(body.meta.batch).toBeDefined()
      expect(mockGetResearchDetail).not.toHaveBeenCalledWith("batch", expect.anything(), expect.anything())
    })
  })

  describe("retrieval", () => {
    it("returns all research in input order with an empty notFound", async () => {
      mockGetResearchDetail.mockImplementation(async (id) => makeDetail({ humId: id }))

      const app = getTestApp()
      const res = await app.request("/research/batch?ids=hum0002,hum0001")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      expect(body.data.map(d => d.humId)).toEqual(["hum0002", "hum0001"])
      expect(body.meta.batch).toEqual({ requested: 2, found: 2, notFound: [] })
    })

    it("partial success: missing/inaccessible ids go to notFound, order preserved", async () => {
      mockGetResearchDetail.mockImplementation(async (id) =>
        id === "hum9999" ? null : makeDetail({ humId: id }))

      const app = getTestApp()
      const res = await app.request("/research/batch?ids=hum0001,hum9999,hum0002")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      expect(body.data.map(d => d.humId)).toEqual(["hum0001", "hum0002"])
      expect(body.meta.batch).toEqual({ requested: 3, found: 2, notFound: ["hum9999"] })
    })

    it("de-duplicates ids before fetching and counting", async () => {
      mockGetResearchDetail.mockImplementation(async (id) => makeDetail({ humId: id }))

      const app = getTestApp()
      const res = await app.request("/research/batch?ids=hum0001,hum0001,hum0002")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      expect(body.data.map(d => d.humId)).toEqual(["hum0001", "hum0002"])
      expect(body.meta.batch.requested).toBe(2)
      expect(mockGetResearchDetail).toHaveBeenCalledTimes(2)
    })
  })

  describe("value-based masking", () => {
    // A draft detail with owner-only fields populated, so masking is observable.
    const draftDetail = (id: string) => makeDetail({
      humId: id,
      status: "draft",
      latestVersion: "v1",
      draftVersion: "v2",
    })

    it("owner sees actual status/draftVersion", async () => {
      mockGetResearchDetail.mockImplementation(async (id) => draftDetail(id))

      const app = getTestApp()
      const res = await app.request("/research/batch?ids=hum0001", {
        headers: userAuthHeader({ userId: "owner-1", username: "owner-1" }),
      })

      const body = await res.json() as BatchBody
      expect(body.data[0].status).toBe("draft")
      expect(body.data[0].draftVersion).toBe("v2")
    })

    it("admin sees actual status/draftVersion", async () => {
      mockGetResearchDetail.mockImplementation(async (id) => draftDetail(id))

      const app = getTestApp()
      const res = await app.request("/research/batch?ids=hum0001", {
        headers: adminAuthHeader(),
      })

      const body = await res.json() as BatchBody
      expect(body.data[0].status).toBe("draft")
      expect(body.data[0].draftVersion).toBe("v2")
    })

    it("non-owner sees the masked published view", async () => {
      mockGetResearchDetail.mockImplementation(async (id) => draftDetail(id))

      const app = getTestApp()
      const res = await app.request("/research/batch?ids=hum0001", {
        headers: userAuthHeader({ userId: "stranger-1" }),
      })

      const body = await res.json() as BatchBody
      expect(body.data[0].status).toBe("published")
      expect(body.data[0].draftVersion).toBeNull()
    })
  })
})
