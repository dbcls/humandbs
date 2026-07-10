/**
 * GET /dataset/{datasetId} and GET /dataset/{datasetId}/versions/{version}
 * unit tests focused on response-body composition — specifically the
 * dynamic `parentJgaStudyId` field. Distribution/mergedSearchable have
 * dedicated coverage elsewhere.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { EsDataset } from "@/api/types"

import { buildMockAuthModule } from "../../helpers/mock-auth"
import { createMockDatasetDoc } from "../../helpers/mock-es"

void mock.module("@/api/middleware/auth", buildMockAuthModule)

const mockGetDataset = mock<
  (id: string, opts: { version?: string }, authUser: unknown) => Promise<EsDataset | null>
>()
const mockGetDatasetWithSeqNo = mock<
  (id: string, version: string) => Promise<{ seqNo: number; primaryTerm: number; dataset: EsDataset } | null>
>()

void mock.module("@/api/es-client/dataset", () => ({
  getDataset: mockGetDataset,
  getDatasetWithSeqNo: mockGetDatasetWithSeqNo,
  resolveLatestDatasetVersion: mock(async () => null),
  listDatasetVersions: mock(async () => null),
  generateDraftDatasetId: mock(() => "DRAFT-x"),
  createDataset: mock(async () => { throw new Error("createDataset not stubbed in this test") }),
  updateDataset: mock(async () => null),
  patchDataset: mock(async () => null),
  deleteDataset: mock(async () => false),
  getResearchByDatasetId: mock(async () => null),
}))

const mockGetParentJgaStudyIdSafe = mock<
  (datasetId: string, requestId?: string) => Promise<string | null>
>(async () => null)

void mock.module("@/api/utils/parent-jga-study", () => ({
  getParentJgaStudyIdSafe: mockGetParentJgaStudyIdSafe,
}))

const { getTestApp } = await import("../../helpers")

interface DetailBody {
  data: { datasetId: string; parentJgaStudyId: string | null }
  meta: { _seq_no?: number; _primary_term?: number }
}

const stubDataset = (doc: EsDataset) => {
  mockGetDataset.mockResolvedValue(doc)
  mockGetDatasetWithSeqNo.mockResolvedValue({ seqNo: 1, primaryTerm: 1, dataset: doc })
}

describe("api/routes/dataset GET /dataset/{datasetId} — parentJgaStudyId", () => {
  beforeEach(() => {
    mockGetDataset.mockReset()
    mockGetDatasetWithSeqNo.mockReset()
    mockGetParentJgaStudyIdSafe.mockReset()
    mockGetParentJgaStudyIdSafe.mockImplementation(async () => null)
  })

  it("includes the parent JGAS accession returned by the safe lookup", async () => {
    stubDataset(createMockDatasetDoc({ datasetId: "JGAD000001" }))
    mockGetParentJgaStudyIdSafe.mockResolvedValueOnce("JGAS000123")

    const app = getTestApp()
    const res = await app.request("/dataset/JGAD000001")
    expect(res.status).toBe(200)

    const body = await res.json() as DetailBody
    expect(body.data.parentJgaStudyId).toBe("JGAS000123")
    expect(mockGetParentJgaStudyIdSafe).toHaveBeenCalledWith("JGAD000001", expect.any(String))
  })

  it("returns parentJgaStudyId = null when the safe lookup resolves null", async () => {
    stubDataset(createMockDatasetDoc({ datasetId: "JGAD000001" }))
    mockGetParentJgaStudyIdSafe.mockResolvedValueOnce(null)

    const app = getTestApp()
    const res = await app.request("/dataset/JGAD000001")
    expect(res.status).toBe(200)

    const body = await res.json() as DetailBody
    expect(body.data.parentJgaStudyId).toBeNull()
  })

  it("still invokes the safe lookup for non-JGAD datasets — it short-circuits inside", async () => {
    // The route calls the safe wrapper unconditionally; the wrapper itself
    // decides not to hit DDBJ for non-JGAD IDs. The route contract is just
    // "populate the field", and the mock reflects that.
    stubDataset(createMockDatasetDoc({ datasetId: "DRA000908" }))
    mockGetParentJgaStudyIdSafe.mockResolvedValueOnce(null)

    const app = getTestApp()
    const res = await app.request("/dataset/DRA000908")
    expect(res.status).toBe(200)

    const body = await res.json() as DetailBody
    expect(body.data.parentJgaStudyId).toBeNull()
    expect(mockGetParentJgaStudyIdSafe).toHaveBeenCalledWith("DRA000908", expect.any(String))
  })
})

describe("api/routes/dataset GET /dataset/{datasetId}/versions/{version} — parentJgaStudyId", () => {
  beforeEach(() => {
    mockGetDataset.mockReset()
    mockGetDatasetWithSeqNo.mockReset()
    mockGetParentJgaStudyIdSafe.mockReset()
    mockGetParentJgaStudyIdSafe.mockImplementation(async () => null)
  })

  it("includes the parent JGAS accession on version detail", async () => {
    mockGetDataset.mockResolvedValue(createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2" }))
    mockGetParentJgaStudyIdSafe.mockResolvedValueOnce("JGAS000456")

    const app = getTestApp()
    const res = await app.request("/dataset/JGAD000001/versions/v2")
    expect(res.status).toBe(200)

    const body = await res.json() as DetailBody
    expect(body.data.parentJgaStudyId).toBe("JGAS000456")
  })

  it("returns parentJgaStudyId = null on version detail when lookup fails", async () => {
    mockGetDataset.mockResolvedValue(createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2" }))
    mockGetParentJgaStudyIdSafe.mockResolvedValueOnce(null)

    const app = getTestApp()
    const res = await app.request("/dataset/JGAD000001/versions/v2")
    expect(res.status).toBe(200)

    const body = await res.json() as DetailBody
    expect(body.data.parentJgaStudyId).toBeNull()
  })
})
