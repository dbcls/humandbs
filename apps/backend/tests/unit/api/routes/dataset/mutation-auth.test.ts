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

const mockIsOwner = mock<(username: string, humId: string) => Promise<boolean>>(async () => false)
void mock.module("@/api/services/ownership", () => ({
  getOwnerUsernames: async () => [],
  getOwnedHumIds: async () => [],
  isOwner: (username: string, humId: string) => mockIsOwner(username, humId),
  refreshOwnershipCache: async () => {},
  resetOwnershipCacheForTest: () => {},
}))

// === ES mocks (external boundary) ===

const mockResolveLatestDatasetVersion =
  mock<(datasetId: string) => Promise<string | null>>()
const mockGetDatasetWithSeqNo = mock<
  (datasetId: string, version: string) =>
  Promise<{ doc: EsDataset; seqNo: number; primaryTerm: number } | null>
>()
const mockGetDataset = mock<(...args: unknown[]) => Promise<EsDataset | null>>()
const mockUpdateDataset = mock<(...args: unknown[]) => Promise<EsDataset | null>>()
const mockDeleteDataset = mock<(...args: unknown[]) => Promise<boolean>>()
const mockGetResearchDoc = mock<(humId: string) => Promise<EsResearch | null>>()

void mock.module("@/api/es-client/dataset", () => ({
  getDataset: (...args: unknown[]) => mockGetDataset(...args),
  getDatasetWithSeqNo: (datasetId: string, version: string) =>
    mockGetDatasetWithSeqNo(datasetId, version),
  resolveLatestDatasetVersion: (datasetId: string) =>
    mockResolveLatestDatasetVersion(datasetId),
  listDatasetVersions: mock(() => Promise.resolve([])),
  updateDataset: (...args: unknown[]) => mockUpdateDataset(...args),
  patchDataset: (...args: unknown[]) => mockUpdateDataset(...args),
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
  updateResearchStatus: mock(() => Promise.resolve(null)),
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

const owner = userAuthHeader({ userId: "owner-1", username: "owner-1" })
const stranger = userAuthHeader({ userId: "stranger-9", username: "stranger-9" })
const admin = adminAuthHeader({ userId: "admin-1" })

const updateBody = {
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
  mockGetDataset.mockResolvedValue(dataset)
  mockGetResearchDoc.mockResolvedValue(parent)
  return { parent, dataset }
}

const resetMocks = () => {
  mockResolveLatestDatasetVersion.mockReset()
  mockGetDatasetWithSeqNo.mockReset()
  mockGetDataset.mockReset()
  mockUpdateDataset.mockReset()
  mockDeleteDataset.mockReset()
  mockGetResearchDoc.mockReset()
  mockIsOwner.mockReset()
  mockIsOwner.mockImplementation(async (username: string) => username === "owner-1")
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

  // Templates seed experiments[].searchable from upstream DRA metadata. Admins
  // can edit the JSON and POST/PUT it back; here we assert the wire payload
  // reaches the ES client unchanged (no silent strip / no over-validation).
  it("forwards experiments[].searchable verbatim to updateDataset", async () => {
    const { dataset } = wireDatasetAndParent()
    mockUpdateDataset.mockResolvedValue(dataset)
    mockGetDatasetWithSeqNo
      .mockResolvedValueOnce({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      .mockResolvedValueOnce({ doc: dataset, seqNo: 2, primaryTerm: 1 })

    const searchable = {
      subjectCount: 24,
      subjectCountType: null,
      healthStatus: null,
      diseases: [],
      tissues: ["blood"],
      isTumor: null,
      cellLine: [],
      population: [],
      cohorts: [],
      sex: null,
      ageGroup: null,
      assayType: ["WGS"],
      libraryKits: [],
      platforms: [{ vendor: "ILLUMINA", model: "HiSeq 2000" }],
      readType: "paired-end" as const,
      readLength: null,
      sequencingDepth: null,
      targetCoverage: null,
      referenceGenome: [],
      variantCounts: null,
      hasPhenotypeData: null,
      targets: null,
      fileTypes: [],
      processedDataTypes: [],
      dataVolumeGb: null,
      policies: [],
    }
    const body = {
      ...updateBody,
      experiments: [{
        header: { ja: { text: "DRX000001" }, en: { text: "DRX000001" } },
        data: {},
        searchable,
      }],
    }

    const res = await getTestApp().request("/dataset/JGAD000001/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)

    // updateDataset(datasetId, version, payload, ...)
    const call = mockUpdateDataset.mock.calls.at(-1)
    expect(call).toBeDefined()
    const payload = call![2] as { experiments: { searchable?: typeof searchable }[] }
    expect(payload.experiments).toHaveLength(1)
    expect(payload.experiments[0].searchable).toEqual(searchable)
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
    const res = await getTestApp().request("/dataset/JGAD000001/delete", {
      method: "POST",
      headers: { ...owner },
    })
    expect(res.status).toBe(403)
    expect(mockDeleteDataset).not.toHaveBeenCalled()
  })

  it("204 (idempotent) when dataset does not exist", async () => {
    mockGetDataset.mockResolvedValue(null)
    const res = await getTestApp().request("/dataset/JGAD999/delete", {
      method: "POST",
      headers: { ...admin },
    })
    expect(res.status).toBe(204)
    expect(mockDeleteDataset).not.toHaveBeenCalled()
  })

  it("409 when parent Research is published (requireParentDraft inline check)", async () => {
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

// === Patch (published) ===

const wirePublishedDatasetAndParent = (
  parentOverrides: Partial<EsResearch> = {},
  datasetOverrides: Partial<EsDataset> = {},
) => wireDatasetAndParent(
  { status: "published", latestVersion: "v1", draftVersion: null, ...parentOverrides },
  datasetOverrides,
)

const mockPatchDataset = mockUpdateDataset

describe("PUT /dataset/{datasetId}/patch mutation auth", () => {
  beforeEach(resetMocks)

  it("401 when no auth header", async () => {
    const res = await getTestApp().request("/dataset/JGAD000001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(401)
    expect(mockPatchDataset).not.toHaveBeenCalled()
  })

  it("404 when dataset does not exist", async () => {
    mockResolveLatestDatasetVersion.mockResolvedValue(null)
    const res = await getTestApp().request("/dataset/JGAD999/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(404)
    expect(mockPatchDataset).not.toHaveBeenCalled()
  })

  it("403 when authenticated stranger", async () => {
    wirePublishedDatasetAndParent()
    const res = await getTestApp().request("/dataset/JGAD000001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...stranger },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(403)
    expect(mockPatchDataset).not.toHaveBeenCalled()
  })

  it("409 when parent Research is in draft status", async () => {
    wireDatasetAndParent()
    const res = await getTestApp().request("/dataset/JGAD000001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(409)
    expect(mockPatchDataset).not.toHaveBeenCalled()
  })

  it("200 when owner patches published dataset", async () => {
    const { dataset } = wirePublishedDatasetAndParent()
    const updated = { ...dataset, releaseDate: "2024-12-31" }
    mockPatchDataset.mockResolvedValue(updated)
    mockGetDatasetWithSeqNo
      .mockResolvedValueOnce({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      .mockResolvedValueOnce({ doc: updated, seqNo: 2, primaryTerm: 1 })

    const res = await getTestApp().request("/dataset/JGAD000001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { meta: { _seq_no: number } }
    expect(body.meta._seq_no).toBe(2)
  })

  it("200 when admin patches published dataset", async () => {
    const { dataset } = wirePublishedDatasetAndParent()
    const updated = { ...dataset, releaseDate: "2024-12-31" }
    mockPatchDataset.mockResolvedValue(updated)
    mockGetDatasetWithSeqNo
      .mockResolvedValueOnce({ doc: dataset, seqNo: 1, primaryTerm: 1 })
      .mockResolvedValueOnce({ doc: updated, seqNo: 2, primaryTerm: 1 })

    const res = await getTestApp().request("/dataset/JGAD000001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...admin },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(200)
  })

  it("409 when patchDataset returns null (lock mismatch)", async () => {
    wirePublishedDatasetAndParent()
    mockPatchDataset.mockResolvedValue(null)
    const res = await getTestApp().request("/dataset/JGAD000001/patch", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...owner },
      body: JSON.stringify(updateBody),
    })
    expect(res.status).toBe(409)
  })
})
