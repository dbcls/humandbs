/**
 * Dataset mutation auth/precondition tests.
 *
 * Exercises PUT /dataset/{datasetId}/update and POST /dataset/{datasetId}/delete
 * through the full router so the order
 * (`optionalAuth` → `loadDatasetAndAuthorize` → handler) is part of the
 * regression. Mocks live at the external boundary (es-client) plus the
 * shared header-based auth mock (`mock-auth.ts`).
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { EsDataset, EsResearch } from "@/api/types"

import {
  adminAuthHeader,
  buildMockAuthModule,
  userAuthHeader,
} from "../../helpers/mock-auth"
import {
  createMockDatasetDoc,
  createMockResearchDoc,
} from "../../helpers/mock-es"

void mock.module("@/api/middleware/auth", buildMockAuthModule)

// === ES mocks (external boundary) ===

const mockResolveLatestDatasetVersion =
  mock<(datasetId: string) => Promise<string | null>>()
const mockGetDatasetWithSeqNo = mock<
  (datasetId: string, version: string) =>
  Promise<{ doc: EsDataset; seqNo: number; primaryTerm: number } | null>
>()
const mockUpdateDataset = mock<(...args: unknown[]) => Promise<EsDataset | null>>()
const mockDeleteDataset = mock<(...args: unknown[]) => Promise<boolean>>()
const mockGetResearchDoc = mock<(humId: string) => Promise<EsResearch | null>>()

void mock.module("@/api/es-client/dataset", () => ({
  getDataset: mock(() => Promise.resolve(null)),
  getDatasetWithSeqNo: (datasetId: string, version: string) =>
    mockGetDatasetWithSeqNo(datasetId, version),
  resolveLatestDatasetVersion: (datasetId: string) =>
    mockResolveLatestDatasetVersion(datasetId),
  listDatasetVersions: mock(() => Promise.resolve([])),
  updateDataset: (...args: unknown[]) => mockUpdateDataset(...args),
  deleteDataset: (...args: unknown[]) => mockDeleteDataset(...args),
  generateDraftDatasetId: mock(() => "DRAFT-hum0001-x"),
  createDataset: mock(() => Promise.reject(new Error("not used"))),
  getResearchByDatasetId: mock(() => Promise.resolve(null)),
}))

void mock.module("@/api/es-client/research", () => ({
  createResearch: mock(() => Promise.resolve(null)),
  deleteResearch: mock(() => Promise.resolve(false)),
  getResearchDetail: mock(() => Promise.resolve(null)),
  getResearchDoc: (humId: string) => mockGetResearchDoc(humId),
  getResearchWithSeqNo: mock(() => Promise.resolve(null)),
  updateResearch: mock(() => Promise.resolve(null)),
  updateResearchUids: mock(() => Promise.resolve(null)),
  updateResearchStatus: mock(() => Promise.resolve(null)),
  generateNextHumId: mock(() => Promise.resolve("hum0001")),
}))

void mock.module("@/api/es-client/search", () => ({
  searchResearches: mock(() => Promise.resolve({
    data: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  })),
  searchDatasets: mock(() => Promise.resolve({
    data: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  })),
}))

const { getTestApp } = await import("../../helpers")

// === Helpers ===

const owner = userAuthHeader({ userId: "owner-1" })
const stranger = userAuthHeader({ userId: "stranger-9" })
const admin = adminAuthHeader({ userId: "admin-1" })

const updateBody = {
  humId: "hum0001",
  humVersionId: "hum0001-v1",
  releaseDate: "2024-01-01",
  criteria: "Controlled-access (Type I)" as const,
  typeOfData: { ja: "NGS", en: "NGS" },
  experiments: [],
  _seq_no: 1,
  _primary_term: 1,
}

const wireDatasetAndParent = (
  parentOverrides: Partial<EsResearch> = {},
  datasetOverrides: Partial<EsDataset> = {},
) => {
  const parent = createMockResearchDoc({
    humId: "hum0001",
    status: "draft",
    uids: ["owner-1"],
    latestVersion: null,
    draftVersion: "v1",
    ...parentOverrides,
  })
  const dataset = createMockDatasetDoc({
    datasetId: "JGAD000001",
    humId: "hum0001",
    version: "v1",
    ...datasetOverrides,
  })
  mockResolveLatestDatasetVersion.mockResolvedValue(dataset.version)
  mockGetDatasetWithSeqNo.mockResolvedValue({ doc: dataset, seqNo: 1, primaryTerm: 1 })
  mockGetResearchDoc.mockResolvedValue(parent)
  return { parent, dataset }
}

const resetMocks = () => {
  mockResolveLatestDatasetVersion.mockReset()
  mockGetDatasetWithSeqNo.mockReset()
  mockUpdateDataset.mockReset()
  mockDeleteDataset.mockReset()
  mockGetResearchDoc.mockReset()
}

// === Tests ===

describe("PUT /dataset/{datasetId}/update mutation auth", () => {
  beforeEach(resetMocks)

  it("401 when no auth header", async () => {
    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(401)
    expect(mockUpdateDataset).not.toHaveBeenCalled()
  })

  it("404 when dataset does not exist", async () => {
    mockResolveLatestDatasetVersion.mockResolvedValue(null)
    const res = await getTestApp().request("/dataset/JGAD999/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(404)
    expect(mockUpdateDataset).not.toHaveBeenCalled()
  })

  it("404 when parent Research is deleted (cloak)", async () => {
    wireDatasetAndParent({ status: "deleted", latestVersion: "v1", draftVersion: null })
    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(404)
    expect(mockUpdateDataset).not.toHaveBeenCalled()
  })

  it("403 when authenticated stranger (not in parent.uids and not admin)", async () => {
    wireDatasetAndParent()
    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...stranger },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(403)
    expect(mockUpdateDataset).not.toHaveBeenCalled()
  })

  it("403 (not 409) when stranger hits a non-draft parent — ownership precedes parent-draft", async () => {
    wireDatasetAndParent({ status: "published", latestVersion: "v1", draftVersion: null })
    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...stranger },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(403)
    expect(mockUpdateDataset).not.toHaveBeenCalled()
  })

  it("409 when parent Research is in 'review' status (owner sees parent-draft check)", async () => {
    wireDatasetAndParent({ status: "review", latestVersion: null, draftVersion: "v1" })
    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(409)
    expect(mockUpdateDataset).not.toHaveBeenCalled()
  })

  it("400 when body.humId !== preloaded.humId", async () => {
    wireDatasetAndParent()
    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify({ ...updateBody, humId: "hum9999" }),
    })
    expect(res.status).toBe(400)
    expect(mockUpdateDataset).not.toHaveBeenCalled()
  })

  it("200 with rotated _seq_no when update succeeds", async () => {
    const { dataset } = wireDatasetAndParent()
    const updated = { ...dataset, releaseDate: "2024-12-31" }
    mockUpdateDataset.mockResolvedValue(updated)
    // Handler re-reads with seqNo for the response envelope
    mockGetDatasetWithSeqNo
      .mockResolvedValueOnce({ doc: dataset, seqNo: 1, primaryTerm: 1 }) // middleware preload
      .mockResolvedValueOnce({ doc: updated, seqNo: 2, primaryTerm: 1 }) // post-update fetch

    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { meta: { _seq_no: number } }
    expect(body.meta._seq_no).toBe(2)
    expect(mockUpdateDataset).toHaveBeenCalled()
  })

  it("409 when updateDataset returns null (lock mismatch)", async () => {
    wireDatasetAndParent()
    mockUpdateDataset.mockResolvedValue(null)
    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(409)
  })
})

describe("POST /dataset/{datasetId}/delete mutation auth", () => {
  beforeEach(resetMocks)

  it("401 when no auth header", async () => {
    const res = await getTestApp().request("/dataset/JGAD000001/delete", { method: "POST" })
    expect(res.status).toBe(401)
    expect(mockDeleteDataset).not.toHaveBeenCalled()
  })

  it("403 when authenticated non-admin (even owner)", async () => {
    wireDatasetAndParent()
    const res = await getTestApp().request("/dataset/JGAD000001/delete", {
      method: "POST",
      headers: { ...owner },
    })
    expect(res.status).toBe(403)
    expect(mockDeleteDataset).not.toHaveBeenCalled()
  })

  it("404 when dataset does not exist (no longer 204 — middleware-based check)", async () => {
    mockResolveLatestDatasetVersion.mockResolvedValue(null)
    const res = await getTestApp().request("/dataset/JGAD999/delete", {
      method: "POST",
      headers: { ...admin },
    })
    expect(res.status).toBe(404)
    expect(mockDeleteDataset).not.toHaveBeenCalled()
  })

  it("409 when parent Research is published (requireParentDraft)", async () => {
    wireDatasetAndParent({ status: "published", latestVersion: "v1", draftVersion: null })
    const res = await getTestApp().request("/dataset/JGAD000001/delete", {
      method: "POST",
      headers: { ...admin },
    })
    expect(res.status).toBe(409)
    expect(mockDeleteDataset).not.toHaveBeenCalled()
  })

  it("204 when admin deletes draft-parent dataset", async () => {
    wireDatasetAndParent()
    mockDeleteDataset.mockResolvedValue(true)
    const res = await getTestApp().request("/dataset/JGAD000001/delete", {
      method: "POST",
      headers: { ...admin },
    })
    expect(res.status).toBe(204)
    expect(mockDeleteDataset).toHaveBeenCalledWith("JGAD000001", undefined)
  })
})
