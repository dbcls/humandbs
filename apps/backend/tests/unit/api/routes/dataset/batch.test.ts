/**
 * GET /dataset/batch unit tests
 *
 * Covers the batch-get behaviour without real ES:
 * - query validation (empty / missing / over-limit / bad lang)
 * - route precedence: "/batch" must reach the batch handler, not "/{datasetId}"
 * - comma-separated parsing, de-duplication, input-order preservation
 * - partial success: missing/inaccessible IDs collected in meta.batch.notFound
 * - includeRawHtml stripping (matches the detail endpoint)
 *
 * Mocking strategy:
 * - @/api/middleware/auth: header-based optionalAuth.
 * - @/api/es-client/dataset: getDataset is the controllable seam; it already
 *   encapsulates authorization, so the handler trusts its null return.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { EsDataset } from "@/api/types"

import { buildMockAuthModule } from "../../helpers/mock-auth"
import { createMockDatasetDoc } from "../../helpers/mock-es"

void mock.module("@/api/middleware/auth", buildMockAuthModule)

const mockGetDataset = mock<(id: string, opts: { version?: string }, authUser: unknown) => Promise<EsDataset | null>>()

void mock.module("@/api/es-client/dataset", () => ({
  getDataset: mockGetDataset,
  getDatasetWithSeqNo: mock(async () => null),
  resolveLatestDatasetVersion: mock(async () => null),
  listDatasetVersions: mock(async () => null),
  generateDraftDatasetId: mock(() => "DRAFT-x"),
  createDataset: mock(async () => { throw new Error("createDataset not stubbed in this test") }),
  updateDataset: mock(async () => null),
  deleteDataset: mock(async () => false),
  getResearchByDatasetId: mock(async () => null),
}))

const { getTestApp } = await import("../../helpers")

interface BatchBody {
  data: { datasetId: string }[]
  meta: { batch: { requested: number; found: number; notFound: string[] } }
}

describe("api/routes/dataset GET /dataset/batch", () => {
  beforeEach(() => {
    mockGetDataset.mockReset()
  })

  describe("validation (no ES required)", () => {
    it("rejects a request with no ids parameter", async () => {
      const app = getTestApp()
      const res = await app.request("/dataset/batch")
      expect(res.status).toBe(400)
      expect(mockGetDataset).not.toHaveBeenCalled()
    })

    it("rejects an empty ids parameter", async () => {
      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=")
      expect(res.status).toBe(400)
      expect(mockGetDataset).not.toHaveBeenCalled()
    })

    it("rejects an ids list that only contains separators/whitespace", async () => {
      const app = getTestApp()
      const res = await app.request(`/dataset/batch?ids=${encodeURIComponent(" , , ")}`)
      expect(res.status).toBe(400)
      expect(mockGetDataset).not.toHaveBeenCalled()
    })

    it("rejects more than the max number of ids", async () => {
      const app = getTestApp()
      const ids = Array.from({ length: 101 }, (_v, i) => `JGAD${String(i).padStart(6, "0")}`).join(",")
      const res = await app.request(`/dataset/batch?ids=${ids}`)
      expect(res.status).toBe(400)
      expect(mockGetDataset).not.toHaveBeenCalled()
    })

    it("rejects an invalid lang parameter", async () => {
      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=JGAD000001&lang=xx")
      expect(res.status).toBe(400)
    })
  })

  describe("routing", () => {
    it("'/batch' reaches the batch handler, not the dynamic detail route", async () => {
      mockGetDataset.mockImplementation(async (id) => createMockDatasetDoc({ datasetId: id }))

      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=JGAD000001")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      // The batch shape (array data + meta.batch) distinguishes it from the
      // single-detail response (object data + meta._seq_no).
      expect(Array.isArray(body.data)).toBe(true)
      expect(body.meta.batch).toBeDefined()
      // "batch" must not have been treated as a datasetId.
      expect(mockGetDataset).not.toHaveBeenCalledWith("batch", expect.anything(), expect.anything())
    })
  })

  describe("retrieval", () => {
    it("returns all datasets in input order with an empty notFound", async () => {
      mockGetDataset.mockImplementation(async (id) => createMockDatasetDoc({ datasetId: id }))

      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=JGAD000002,JGAD000001")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      expect(body.data.map(d => d.datasetId)).toEqual(["JGAD000002", "JGAD000001"])
      expect(body.meta.batch).toEqual({ requested: 2, found: 2, notFound: [] })
    })

    it("partial success: missing/inaccessible ids go to notFound, order preserved", async () => {
      mockGetDataset.mockImplementation(async (id) =>
        id === "MISSING" ? null : createMockDatasetDoc({ datasetId: id }))

      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=JGAD000001,MISSING,JGAD000002")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      expect(body.data.map(d => d.datasetId)).toEqual(["JGAD000001", "JGAD000002"])
      expect(body.meta.batch).toEqual({ requested: 3, found: 2, notFound: ["MISSING"] })
    })

    it("de-duplicates ids before fetching and counting", async () => {
      mockGetDataset.mockImplementation(async (id) => createMockDatasetDoc({ datasetId: id }))

      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=JGAD000001,JGAD000001,JGAD000002")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      expect(body.data.map(d => d.datasetId)).toEqual(["JGAD000001", "JGAD000002"])
      expect(body.meta.batch.requested).toBe(2)
      expect(mockGetDataset).toHaveBeenCalledTimes(2)
    })

    it("returns 200 with all-notFound when nothing is retrievable", async () => {
      mockGetDataset.mockImplementation(async () => null)

      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=JGAD000001,JGAD000002")
      expect(res.status).toBe(200)

      const body = await res.json() as BatchBody
      expect(body.data).toEqual([])
      expect(body.meta.batch).toEqual({ requested: 2, found: 0, notFound: ["JGAD000001", "JGAD000002"] })
    })
  })

  describe("includeRawHtml", () => {
    const docWithRawHtml = () => createMockDatasetDoc({
      datasetId: "JGAD000001",
      experiments: [{
        header: { ja: { text: "h", rawHtml: "<b>h</b>" }, en: { text: "h", rawHtml: "<b>h</b>" } },
        data: {},
      }],
    })

    it("strips rawHtml fields by default", async () => {
      mockGetDataset.mockImplementation(async () => docWithRawHtml())

      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=JGAD000001")
      const text = await res.text()
      expect(text).not.toContain("rawHtml")
    })

    it("keeps rawHtml fields when includeRawHtml=true", async () => {
      mockGetDataset.mockImplementation(async () => docWithRawHtml())

      const app = getTestApp()
      const res = await app.request("/dataset/batch?ids=JGAD000001&includeRawHtml=true")
      const text = await res.text()
      expect(text).toContain("rawHtml")
    })
  })
})
