import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

import { DdbjSearchApiError } from "@/api/external/ddbj-search/client"

const mockFetchJgaParentStudyId = mock<
  (datasetId: string, opts?: { requestId?: string }) => Promise<string | null>
>()

void mock.module("@/api/external/ddbj-search/jga-resources", () => ({
  fetchJgaParentStudyId: mockFetchJgaParentStudyId,
}))

const { getParentJgaStudyIdSafe } = await import("@/api/utils/parent-jga-study")

describe("getParentJgaStudyIdSafe", () => {
  beforeEach(() => {
    mockFetchJgaParentStudyId.mockReset()
  })

  afterEach(() => {
    mockFetchJgaParentStudyId.mockReset()
  })

  it("returns null and skips fetch for non-JGAD datasetIds", async () => {
    for (const id of ["DRA000001", "E-GEAD-1051", "MTBKS213", "hum0001.v1.freq.v1", "PRJDB10452"]) {
      mockFetchJgaParentStudyId.mockReset()
      const result = await getParentJgaStudyIdSafe(id)
      expect(result).toBeNull()
      expect(mockFetchJgaParentStudyId).not.toHaveBeenCalled()
    }
  })

  it("returns the parent JGAS accession for a JGAD dataset", async () => {
    mockFetchJgaParentStudyId.mockResolvedValueOnce("JGAS000001")

    const result = await getParentJgaStudyIdSafe("JGAD000001")
    expect(result).toBe("JGAS000001")
    expect(mockFetchJgaParentStudyId).toHaveBeenCalledWith("JGAD000001", { requestId: undefined })
  })

  it("forwards requestId to the underlying fetcher", async () => {
    mockFetchJgaParentStudyId.mockResolvedValueOnce("JGAS000002")

    await getParentJgaStudyIdSafe("JGAD000002", "req-xyz")
    expect(mockFetchJgaParentStudyId).toHaveBeenCalledWith("JGAD000002", { requestId: "req-xyz" })
  })

  it("returns null when the fetcher resolves null (no parent)", async () => {
    mockFetchJgaParentStudyId.mockResolvedValueOnce(null)

    const result = await getParentJgaStudyIdSafe("JGAD000003")
    expect(result).toBeNull()
  })

  it("returns null when the fetcher throws DdbjSearchApiError", async () => {
    mockFetchJgaParentStudyId.mockRejectedValueOnce(
      new DdbjSearchApiError("DDBJ 502", 502),
    )

    const result = await getParentJgaStudyIdSafe("JGAD000004")
    expect(result).toBeNull()
  })

  it("returns null when the fetcher throws any other error", async () => {
    mockFetchJgaParentStudyId.mockRejectedValueOnce(new Error("unexpected"))

    const result = await getParentJgaStudyIdSafe("JGAD000005")
    expect(result).toBeNull()
  })
})
