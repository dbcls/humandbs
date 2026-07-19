import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

import { DdbjSearchApiError } from "@/api/external/ddbj-search/client"
import type { DblinkResponse } from "@/api/external/ddbj-search/dblink"

const mockFetchDblink = mock<
  (type: string, id: string, requestId?: string) => Promise<DblinkResponse | null>
>()

// bun's mock.module replaces the whole module — every real export used by any
// module in this test file must be surfaced. `fetchDblinkTargets` is pulled in
// via distribution.ts (loaded transitively by the dataset routes) and must
// keep working, so it stays as a passthrough over the mocked fetchDblink.
void mock.module("@/api/external/ddbj-search/dblink", () => {
  const DblinkAccessionType = {
    SRA_SUBMISSION: "sra-submission",
    SRA_STUDY: "sra-study",
    SRA_EXPERIMENT: "sra-experiment",
    SRA_RUN: "sra-run",
    SRA_SAMPLE: "sra-sample",
    SRA_ANALYSIS: "sra-analysis",
    JGA_STUDY: "jga-study",
    JGA_DATASET: "jga-dataset",
    JGA_DAC: "jga-dac",
    JGA_POLICY: "jga-policy",
    BIOPROJECT: "bioproject",
    BIOSAMPLE: "biosample",
    HUMANDBS: "humandbs",
    PUBMED: "pubmed",
  } as const

  const fetchDblinkTargets = async (
    type: string,
    id: string,
    target: string,
    requestId?: string,
  ): Promise<string[]> => {
    const res = await mockFetchDblink(type, id, requestId)
    if (!res) return []
    return res.dbXrefs.filter((x) => x.type === target).map((x) => x.identifier)
  }

  return {
    DblinkAccessionType,
    fetchDblink: mockFetchDblink,
    fetchDblinkTargets,
  }
})

const {
  fetchJgaParentStudyId,
  parentStudyCache,
} = await import("@/api/external/ddbj-search/jga-resources")

const makeResponse = (dbXrefs: { identifier: string; type: string; url?: string }[]): DblinkResponse => ({
  identifier: "JGAD000001",
  type: "jga-dataset",
  dbXrefs,
})

describe("fetchJgaParentStudyId", () => {
  beforeEach(() => {
    parentStudyCache.clear()
    mockFetchDblink.mockReset()
  })

  afterEach(() => {
    mockFetchDblink.mockReset()
  })

  it("returns the first jga-study identifier from dbXrefs", async () => {
    mockFetchDblink.mockResolvedValueOnce(makeResponse([
      { identifier: "JGAP000001", type: "jga-policy" },
      { identifier: "JGAS000001", type: "jga-study" },
      { identifier: "JGAS999999", type: "jga-study" },
    ]))

    const result = await fetchJgaParentStudyId("JGAD000001")
    expect(result).toBe("JGAS000001")
    expect(mockFetchDblink).toHaveBeenCalledWith("jga-dataset", "JGAD000001", undefined)
  })

  it("returns null when no jga-study xref is present", async () => {
    mockFetchDblink.mockResolvedValueOnce(makeResponse([
      { identifier: "JGAP000001", type: "jga-policy" },
    ]))

    const result = await fetchJgaParentStudyId("JGAD000002")
    expect(result).toBeNull()
  })

  it("returns null when the dblink response is null (404 from DDBJ)", async () => {
    mockFetchDblink.mockResolvedValueOnce(null)

    const result = await fetchJgaParentStudyId("JGAD999999")
    expect(result).toBeNull()
  })

  it("propagates DdbjSearchApiError when the underlying client throws (5xx)", async () => {
    mockFetchDblink.mockRejectedValueOnce(new DdbjSearchApiError("DDBJ 500", 500))

    let caught: unknown = null
    try {
      await fetchJgaParentStudyId("JGAD000010")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DdbjSearchApiError)
  })

  it("propagates network / arbitrary errors from the underlying client", async () => {
    mockFetchDblink.mockRejectedValueOnce(new Error("boom"))

    let caught: unknown = null
    try {
      await fetchJgaParentStudyId("JGAD000011")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
  })

  it("forwards requestId to the underlying dblink client", async () => {
    mockFetchDblink.mockResolvedValueOnce(makeResponse([]))

    await fetchJgaParentStudyId("JGAD000020", { requestId: "req-abc" })
    expect(mockFetchDblink).toHaveBeenCalledWith("jga-dataset", "JGAD000020", "req-abc")
  })

  it("caches hits so subsequent calls do not hit the underlying client", async () => {
    mockFetchDblink.mockResolvedValueOnce(makeResponse([
      { identifier: "JGAS000005", type: "jga-study" },
    ]))

    const r1 = await fetchJgaParentStudyId("JGAD000030")
    const r2 = await fetchJgaParentStudyId("JGAD000030")
    expect(r1).toBe("JGAS000005")
    expect(r2).toBe("JGAS000005")
    expect(mockFetchDblink).toHaveBeenCalledTimes(1)
  })

  it("caches null results (dataset with no parent)", async () => {
    mockFetchDblink.mockResolvedValueOnce(null)

    const r1 = await fetchJgaParentStudyId("JGAD000031")
    const r2 = await fetchJgaParentStudyId("JGAD000031")
    expect(r1).toBeNull()
    expect(r2).toBeNull()
    expect(mockFetchDblink).toHaveBeenCalledTimes(1)
  })

  it("does NOT cache thrown errors — retries on next call", async () => {
    mockFetchDblink.mockRejectedValueOnce(new DdbjSearchApiError("DDBJ 500", 500))
    mockFetchDblink.mockResolvedValueOnce(makeResponse([
      { identifier: "JGAS000042", type: "jga-study" },
    ]))

    let caught: unknown = null
    try {
      await fetchJgaParentStudyId("JGAD000042")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DdbjSearchApiError)

    const retried = await fetchJgaParentStudyId("JGAD000042")
    expect(retried).toBe("JGAS000042")
    expect(mockFetchDblink).toHaveBeenCalledTimes(2)
  })
})
