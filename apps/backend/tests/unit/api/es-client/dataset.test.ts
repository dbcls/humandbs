/**
 * Dataset es-client tests
 *
 * Covers:
 * - getDataset (IT-DATASET-03, 07, 08):
 *   - returns the doc for an authorized user
 *   - returns null when parent Research is not accessible
 * - listDatasetVersions (IT-DATASET-17):
 *   - returns versions in descending order with shape {version, typeOfData, criteria, releaseDate}
 *   - returns null when parent Research is not accessible
 *   - returns [] when no versions exist
 * - createDataset (IT-RESEARCH-24, IT-DATASET-* create flow):
 *   - auto-generates DRAFT-{humId}-{uuid} when datasetId omitted
 *   - bumps version via aggregation
 *   - throws ConflictError on op_type:create dup
 *   - auto-links to ResearchVersion
 * - updateDataset (IT-DATASET-12):
 *   - propagates if_seq_no / if_primary_term to es client
 *   - returns null on 409
 * - deleteDataset (IT-DATASET-16):
 *   - single-version path: unlink + delete by id
 *   - all-versions path: unlink + deleteByQuery
 *
 * Mocking strategy:
 * - @/api/es-client/client.esClient is mocked
 * - @/api/es-client/research.getResearchDoc is stubbed to control parent visibility
 * - @/api/es-client/research-version.linkDatasetToResearch / unlinkDatasetFromResearch / getResearchVersionWithSeqNo are stubbed
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"
import fc from "fast-check"

import { createMockAuthUser, createMockDatasetDoc, createMockResearchDoc, createMockResearchVersionDoc } from "../helpers/mock-es"

const mockEsGet = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ found: false }))
const mockEsSearch = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ hits: { hits: [] } }))
const mockEsIndex = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsUpdate = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsDelete = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsDeleteByQuery = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsUpdateByQuery = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))

void mock.module("@/api/es-client/client", () => ({
  ES_INDEX: { research: "research", researchVersion: "research-version", dataset: "dataset" },
  esClient: {
    get: mockEsGet,
    search: mockEsSearch,
    index: mockEsIndex,
    update: mockEsUpdate,
    delete: mockEsDelete,
    deleteByQuery: mockEsDeleteByQuery,
    updateByQuery: mockEsUpdateByQuery,
  },
  isConflictError: (e: unknown) => Boolean(e && typeof e === "object" && "meta" in e && (e as { meta?: { statusCode?: number } }).meta?.statusCode === 409),
  isDocumentExistsError: (e: unknown) => {
    if (!e || typeof e !== "object" || !("meta" in e)) return false
    const meta = (e as { meta?: { statusCode?: number; body?: { error?: { type?: string; reason?: string } } } }).meta
    if (meta?.statusCode !== 409) return false
    return meta.body?.error?.type === "version_conflict_engine_exception"
      && (meta.body.error.reason ?? "").includes("document already exists")
  },
}))

const mockGetResearchDoc = mock<(humId: string) => Promise<unknown>>(async () => null)
void mock.module("@/api/es-client/research", () => ({
  getResearchDoc: mockGetResearchDoc,
  getResearchWithSeqNo: mock(async () => null),
  getResearchDetail: mock(async () => null),
  createResearch: mock(async () => { throw new Error("not stubbed") }),
  updateResearch: mock(async () => null),
  updateResearchStatus: mock(async () => null),
  deleteResearch: mock(async () => false),
}))

const mockLinkDataset = mock(async (..._args: unknown[]) => undefined)
const mockUnlinkDataset = mock(async (..._args: unknown[]) => undefined)
const mockGetResearchVersionWithSeqNo = mock<(..._args: unknown[]) => Promise<unknown>>(async () => null)

void mock.module("@/api/es-client/research-version", () => ({
  linkDatasetToResearch: mockLinkDataset,
  unlinkDatasetFromResearch: mockUnlinkDataset,
  getResearchVersionWithSeqNo: mockGetResearchVersionWithSeqNo,
  getResearchVersion: mock(async () => null),
  listResearchVersions: mock(async () => []),
  listResearchVersionsSorted: mock(async () => []),
  createResearchVersion: mock(async () => null),
}))

const dataset = await import("@/api/es-client/dataset")
const { ConflictError } = await import("@/api/errors")

const optimisticLockError = () => Object.assign(new Error("optimistic lock"), {
  meta: { statusCode: 409 },
})

const dupCreateError = (id = "DRAFT-hum0001-abc-v1") => Object.assign(new Error("dup"), {
  meta: {
    statusCode: 409,
    body: { error: { type: "version_conflict_engine_exception", reason: `[${id}]: version conflict, document already exists` } },
  },
})

beforeEach(() => {
  mockEsGet.mockReset()
  mockEsSearch.mockReset()
  mockEsIndex.mockReset()
  mockEsUpdate.mockReset()
  mockEsDelete.mockReset()
  mockEsDeleteByQuery.mockReset()
  mockEsUpdateByQuery.mockReset()
  mockGetResearchDoc.mockReset()
  mockLinkDataset.mockReset()
  mockUnlinkDataset.mockReset()
  mockGetResearchVersionWithSeqNo.mockReset()
})

// === getDataset ===

describe("getDataset", () => {
  it("returns the doc for an authorized user (published parent)", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: createMockDatasetDoc() }] } })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({ humId: "hum0001", status: "published", latestVersion: "v1" }))

    const result = await dataset.getDataset("JGAD000001", {}, null)
    expect(result?.datasetId).toBe("JGAD000001")
  })

  it("returns null when parent Research is not accessible to caller (IT-DATASET-07)", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: createMockDatasetDoc() }] } })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
      humId: "hum0001", status: "draft", latestVersion: null,
    }))

    const result = await dataset.getDataset("JGAD000001", {}, null)
    expect(result).toBeNull()
  })

  it("admin can access drafts (parent is draft, latestVersion=null)", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: createMockDatasetDoc() }] } })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
      humId: "hum0001", status: "draft", latestVersion: null,
    }))

    const result = await dataset.getDataset("JGAD000001", {}, createMockAuthUser({ isAdmin: true }))
    expect(result?.datasetId).toBe("JGAD000001")
  })

  it("specific version: uses esClient.get with id={datasetId}-{version}", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ version: "v2" }) })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({ status: "published", latestVersion: "v2" }))

    const result = await dataset.getDataset("JGAD000001", { version: "v2" }, null)
    expect(result?.version).toBe("v2")

    const getArgs = mockEsGet.mock.calls[0]?.[0] as { id: string }
    expect(getArgs.id).toBe("JGAD000001-v2")
  })

  it("returns null when ES doc is not found (404 via ignore)", async () => {
    mockEsGet.mockResolvedValueOnce({ found: false })

    const result = await dataset.getDataset("JGAD999999", { version: "v1" }, null)
    expect(result).toBeNull()
  })
})

// === listDatasetVersions ===

describe("listDatasetVersions (IT-DATASET-17)", () => {
  it("returns versions in descending order with the documented shape", async () => {
    mockEsSearch.mockResolvedValueOnce({
      hits: { hits: [
        { _source: createMockDatasetDoc({ version: "v3", releaseDate: "2024-03-01" }) },
        { _source: createMockDatasetDoc({ version: "v2", releaseDate: "2024-02-01" }) },
        { _source: createMockDatasetDoc({ version: "v1", releaseDate: "2024-01-01" }) },
      ] },
    })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({ status: "published", latestVersion: "v3" }))

    const result = await dataset.listDatasetVersions("JGAD000001", null)
    expect(result).not.toBeNull()
    expect(result?.map(v => v.version)).toEqual(["v3", "v2", "v1"])
    // Shape contains version, typeOfData, criteria, releaseDate (no humId, no humVersionId)
    const keys = Object.keys(result![0])
    for (const expected of ["version", "typeOfData", "criteria", "releaseDate"]) {
      expect(keys).toContain(expected)
    }
  })

  it("returns null when parent Research is not accessible to caller", async () => {
    mockEsSearch.mockResolvedValueOnce({
      hits: { hits: [{ _source: createMockDatasetDoc() }] },
    })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
      status: "draft", latestVersion: null,
    }))

    const result = await dataset.listDatasetVersions("JGAD000001", null)
    expect(result).toBeNull()
  })

  it("returns [] when no versions exist", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [] } })

    const result = await dataset.listDatasetVersions("JGAD999999", null)
    expect(result).toEqual([])
  })
})

// V-new-version draft (draft-release.md) leak regression: parent Research has
// a published latestVersion (say v5) plus a draft v8. Dataset docs attached
// to the draft rv carry `humVersionId=hum{NNNN}-v8` — anonymous viewers must
// NOT see those. Owner/admin still see everything.
describe("V-draft dataset leak (draft-release.md invariant)", () => {
  const publishedDataset = createMockDatasetDoc({
    datasetId: "JGAD000004",
    version: "v5",
    humId: "hum0006",
    humVersionId: "hum0006-v5",
  })
  const draftDataset = createMockDatasetDoc({
    datasetId: "JGAD000004",
    version: "v6",
    humId: "hum0006",
    humVersionId: "hum0006-v8",
  })
  const parentWithDraft = createMockResearchDoc({
    humId: "hum0006", status: "draft", latestVersion: "v5", draftVersion: "v8",
  })

  it("getDataset (no version): skips draft, returns latest visible for anonymous", async () => {
    // ES returns draft first (versionSortSpec desc), published second.
    mockEsSearch.mockResolvedValueOnce({
      hits: { hits: [{ _source: draftDataset }, { _source: publishedDataset }] },
    })
    // canAccessDataset is called twice (once per inner_hit loop iteration).
    mockGetResearchDoc.mockResolvedValue(parentWithDraft)

    const result = await dataset.getDataset("JGAD000004", {}, null)

    expect(result?.version).toBe("v5")
    expect(result?.humVersionId).toBe("hum0006-v5")
  })

  it("getDataset (specific draft version): returns null for anonymous", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: draftDataset })
    mockGetResearchDoc.mockResolvedValueOnce(parentWithDraft)

    const result = await dataset.getDataset("JGAD000004", { version: "v6" }, null)

    expect(result).toBeNull()
  })

  it("getDataset (specific draft version): admin sees the draft", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: draftDataset })

    const result = await dataset.getDataset("JGAD000004", { version: "v6" }, createMockAuthUser({ isAdmin: true }))

    expect(result?.version).toBe("v6")
  })

  it("listDatasetVersions: filters out draft version for anonymous", async () => {
    mockEsSearch.mockResolvedValueOnce({
      hits: { hits: [{ _source: draftDataset }, { _source: publishedDataset }] },
    })
    mockGetResearchDoc.mockResolvedValueOnce(parentWithDraft)

    const result = await dataset.listDatasetVersions("JGAD000004", null)

    expect(result?.map(v => v.version)).toEqual(["v5"])
  })

  it("listDatasetVersions: admin sees draft version too", async () => {
    mockEsSearch.mockResolvedValueOnce({
      hits: { hits: [{ _source: draftDataset }, { _source: publishedDataset }] },
    })
    mockGetResearchDoc.mockResolvedValueOnce(parentWithDraft)

    const result = await dataset.listDatasetVersions("JGAD000004", createMockAuthUser({ isAdmin: true }))

    expect(result?.map(v => v.version)).toEqual(["v6", "v5"])
  })
})

// === createDataset ===

describe("createDataset", () => {
  const baseParams = {
    humId: "hum0001",
    humVersionId: "hum0001-v1",
    releaseDate: "2024-01-01",
    criteria: "Controlled-access (Type I)" as const,
    typeOfData: { ja: "NGS(Exome)", en: "NGS(Exome)" },
    experiments: [],
  }

  it("auto-generates DRAFT-{humId}-{uuid} when datasetId is omitted (IT-RESEARCH-24)", async () => {
    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_version: { value: 0 } }, hits: { hits: [] } })
    mockEsIndex.mockResolvedValue({})

    const result = await dataset.createDataset(baseParams)

    expect(result.datasetId).toMatch(/^DRAFT-hum0001-[0-9a-f]+$/)
    expect(result.version).toBe("v1")
    // auto-link should have been invoked
    expect(mockLinkDataset).toHaveBeenCalledTimes(1)
  })

  it("uses the provided datasetId when supplied", async () => {
    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_version: { value: 0 } } })
    mockEsIndex.mockResolvedValue({})

    const result = await dataset.createDataset({ ...baseParams, datasetId: "JGAD999999" })

    expect(result.datasetId).toBe("JGAD999999")
    expect(result.version).toBe("v1")
  })

  it("bumps version via max_version aggregation", async () => {
    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_version: { value: 2 } } })
    mockEsIndex.mockResolvedValue({})

    const result = await dataset.createDataset({ ...baseParams, datasetId: "JGAD000001" })

    expect(result.version).toBe("v3")
  })

  it("throws ConflictError on op_type:create dup", async () => {
    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_version: { value: 0 } } })
    mockEsIndex.mockRejectedValue(dupCreateError("JGAD000001-v1"))

    let caught: unknown
    try {
      await dataset.createDataset({ ...baseParams, datasetId: "JGAD000001" })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ConflictError)
  })

  it("does not auto-link when autoLinkToResearch=false", async () => {
    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_version: { value: 0 } } })
    mockEsIndex.mockResolvedValue({})

    await dataset.createDataset({ ...baseParams, datasetId: "JGAD000001" }, false)

    expect(mockLinkDataset).not.toHaveBeenCalled()
  })
})

// === updateDataset ===

describe("updateDataset (IT-DATASET-12 + IT-VERSION-09/10)", () => {
  it("Path E (first draft cycle, no latestVersion): propagates optimistic-lock parameters to in-place update", async () => {
    // 1st mockEsGet: getDatasetWithSeqNo (initial fetch)
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ version: "v1" }), _seq_no: 5, _primary_term: 2 })
    // parent is in first draft cycle: latestVersion is null → bump path not entered
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
      humId: "hum0001", status: "draft", latestVersion: null, draftVersion: "v1",
    }))
    mockEsUpdate.mockResolvedValueOnce({})
    // 2nd mockEsGet: getDatasetWithSeqNo (post-update reload)
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ version: "v1", releaseDate: "2024-09-01" }), _seq_no: 6, _primary_term: 2 })

    const result = await dataset.updateDataset("JGAD000001", "v1", { releaseDate: "2024-09-01" }, 5, 2)
    expect(result).not.toBeNull()
    expect(result?.version).toBe("v1")

    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { if_seq_no: number; if_primary_term: number; body: { doc: Record<string, unknown> } }
    expect(updateArgs.if_seq_no).toBe(5)
    expect(updateArgs.if_primary_term).toBe(2)
    expect(updateArgs.body.doc.releaseDate).toBe("2024-09-01")
    // bump path not taken: no index() / no parent ResearchVersion seq fetch
    expect(mockEsIndex).not.toHaveBeenCalled()
    expect(mockGetResearchVersionWithSeqNo).not.toHaveBeenCalled()
  })

  it("Path C (stale seqNo on existing doc): returns null without touching ES", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ version: "v1" }), _seq_no: 10, _primary_term: 2 })
    // caller seqNo (5) is stale → reject without update/index/parent fetch

    const result = await dataset.updateDataset("JGAD000001", "v1", { releaseDate: "2024-09-01" }, 5, 2)
    expect(result).toBeNull()
    expect(mockEsUpdate).not.toHaveBeenCalled()
    expect(mockEsIndex).not.toHaveBeenCalled()
    expect(mockGetResearchDoc).not.toHaveBeenCalled()
  })

  it("Path C (in-place ES 409 conflict): returns null", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ version: "v1" }), _seq_no: 5, _primary_term: 2 })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
      humId: "hum0001", status: "draft", latestVersion: null, draftVersion: "v1",
    }))
    mockEsUpdate.mockRejectedValueOnce(optimisticLockError())

    const result = await dataset.updateDataset("JGAD000001", "v1", {}, 5, 2)
    expect(result).toBeNull()
  })

  it("Path A (first PUT in a new draft cycle): creates a new Dataset version and rewires parent draftVersion (IT-VERSION-09)", async () => {
    // current dataset is v1 (the version pinned by parent.latestVersion)
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ datasetId: "JGAD000001", version: "v1", humId: "hum0001", humVersionId: "hum0001-v1" }), _seq_no: 5, _primary_term: 2 })
    // parent has latestVersion=v1 and draftVersion=v2 → bump candidate
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
      humId: "hum0001", status: "draft", latestVersion: "v1", draftVersion: "v2",
    }))
    // 1st getResearchVersionWithSeqNo: parent.latestVersion ResearchVersion has the dataset pinned at v1
    mockGetResearchVersionWithSeqNo.mockResolvedValueOnce({
      doc: createMockResearchVersionDoc({ humVersionId: "hum0001-v1", version: "v1", datasets: [{ datasetId: "JGAD000001", version: "v1" }] }),
      seqNo: 10,
      primaryTerm: 2,
    })
    // getNextDatasetVersion: aggregations max_version=1 → v2
    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_version: { value: 1 } } })
    // esClient.index: create new dataset doc (v2)
    mockEsIndex.mockResolvedValueOnce({})
    // 2nd getResearchVersionWithSeqNo: parent.draftVersion ResearchVersion (the rewire target)
    mockGetResearchVersionWithSeqNo.mockResolvedValueOnce({
      doc: createMockResearchVersionDoc({ humVersionId: "hum0001-v2", version: "v2", datasets: [{ datasetId: "JGAD000001", version: "v1" }] }),
      seqNo: 20,
      primaryTerm: 3,
    })
    // esClient.update: rewire parent.draftVersion ResearchVersion.datasets
    mockEsUpdate.mockResolvedValueOnce({})
    // syncDatasetDateModified: search the max versionReleaseDate, then update_by_query
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: { versionReleaseDate: "2024-09-01" } }] } })

    const result = await dataset.updateDataset("JGAD000001", "v1", { releaseDate: "2024-09-01" }, 5, 2)

    expect(result?.version).toBe("v2")
    expect(result?.humVersionId).toBe("hum0001-v2")
    expect(result?.releaseDate).toBe("2024-09-01")
    // new dataset doc created with op_type:create
    const indexArgs = mockEsIndex.mock.calls[0]?.[0] as { id: string; op_type: string; body: { datasetId: string; version: string; humVersionId: string } }
    expect(indexArgs.id).toBe("JGAD000001-v2")
    expect(indexArgs.op_type).toBe("create")
    expect(indexArgs.body.version).toBe("v2")
    expect(indexArgs.body.humVersionId).toBe("hum0001-v2")
    // parent.draftVersion datasets rewired v1 → v2
    const rewireArgs = mockEsUpdate.mock.calls[0]?.[0] as { id: string; if_seq_no: number; if_primary_term: number; body: { doc: { datasets: { datasetId: string; version: string }[] } } }
    expect(rewireArgs.id).toBe("hum0001-v2")
    expect(rewireArgs.if_seq_no).toBe(20)
    expect(rewireArgs.if_primary_term).toBe(3)
    expect(rewireArgs.body.doc.datasets).toEqual([{ datasetId: "JGAD000001", version: "v2" }])
  })

  it("Path B (second PUT in the same draft cycle): in-place update on the current draft version (IT-VERSION-10)", async () => {
    // current dataset is v2 (already bumped during the cycle); parent.latestVersion still references v1
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2", humId: "hum0001", humVersionId: "hum0001-v2" }), _seq_no: 7, _primary_term: 2 })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
      humId: "hum0001", status: "draft", latestVersion: "v1", draftVersion: "v2",
    }))
    // parent.latestVersion ResearchVersion still pins dataset to v1, but current is v2 → no bump
    mockGetResearchVersionWithSeqNo.mockResolvedValueOnce({
      doc: createMockResearchVersionDoc({ humVersionId: "hum0001-v1", version: "v1", datasets: [{ datasetId: "JGAD000001", version: "v1" }] }),
      seqNo: 10,
      primaryTerm: 2,
    })
    mockEsUpdate.mockResolvedValueOnce({})
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ version: "v2", releaseDate: "2024-10-01" }), _seq_no: 8, _primary_term: 2 })

    const result = await dataset.updateDataset("JGAD000001", "v2", { releaseDate: "2024-10-01" }, 7, 2)

    expect(result?.version).toBe("v2")
    // in-place esClient.update on the dataset doc (id=JGAD000001-v2)
    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { id: string; if_seq_no: number; if_primary_term: number }
    expect(updateArgs.id).toBe("JGAD000001-v2")
    expect(updateArgs.if_seq_no).toBe(7)
    // bump-path side effects must not have happened
    expect(mockEsIndex).not.toHaveBeenCalled()
  })

  it("Path D (bump rollback on parent ResearchVersion 409): deletes the new dataset doc and returns null", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ datasetId: "JGAD000001", version: "v1" }), _seq_no: 5, _primary_term: 2 })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
      humId: "hum0001", status: "draft", latestVersion: "v1", draftVersion: "v2",
    }))
    mockGetResearchVersionWithSeqNo.mockResolvedValueOnce({
      doc: createMockResearchVersionDoc({ humVersionId: "hum0001-v1", version: "v1", datasets: [{ datasetId: "JGAD000001", version: "v1" }] }),
      seqNo: 10,
      primaryTerm: 2,
    })
    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_version: { value: 1 } } })
    mockEsIndex.mockResolvedValueOnce({})
    mockGetResearchVersionWithSeqNo.mockResolvedValueOnce({
      doc: createMockResearchVersionDoc({ humVersionId: "hum0001-v2", version: "v2", datasets: [{ datasetId: "JGAD000001", version: "v1" }] }),
      seqNo: 20,
      primaryTerm: 3,
    })
    // parent.draftVersion ResearchVersion update fails with 409
    mockEsUpdate.mockRejectedValueOnce(optimisticLockError())
    mockEsDelete.mockResolvedValueOnce({})

    const result = await dataset.updateDataset("JGAD000001", "v1", { releaseDate: "2024-09-01" }, 5, 2)

    expect(result).toBeNull()
    // rollback: new dataset doc deleted
    const delArgs = mockEsDelete.mock.calls[0]?.[0] as { id: string }
    expect(delArgs.id).toBe("JGAD000001-v2")
  })

  it("PBT (Path A): bumped Dataset version is exactly max_existing + 1 and rewires parent.draftVersion accordingly", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 99 }), async (maxExisting) => {
        mockEsGet.mockReset()
        mockEsSearch.mockReset()
        mockEsIndex.mockReset()
        mockEsUpdate.mockReset()
        mockEsUpdateByQuery.mockReset()
        mockGetResearchDoc.mockReset()
        mockGetResearchVersionWithSeqNo.mockReset()

        mockEsGet.mockResolvedValueOnce({ found: true, _source: createMockDatasetDoc({ datasetId: "JGAD000001", version: "v1", humId: "hum0001" }), _seq_no: 5, _primary_term: 2 })
        mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({
          humId: "hum0001", status: "draft", latestVersion: "v1", draftVersion: `v${maxExisting + 1}`,
        }))
        mockGetResearchVersionWithSeqNo.mockResolvedValueOnce({
          doc: createMockResearchVersionDoc({ humVersionId: "hum0001-v1", version: "v1", datasets: [{ datasetId: "JGAD000001", version: "v1" }] }),
          seqNo: 10,
          primaryTerm: 2,
        })
        mockEsSearch.mockResolvedValueOnce({ aggregations: { max_version: { value: maxExisting } } })
        mockEsIndex.mockResolvedValueOnce({})
        mockGetResearchVersionWithSeqNo.mockResolvedValueOnce({
          doc: createMockResearchVersionDoc({
            humVersionId: `hum0001-v${maxExisting + 1}`,
            version: `v${maxExisting + 1}`,
            datasets: [{ datasetId: "JGAD000001", version: "v1" }],
          }),
          seqNo: 20,
          primaryTerm: 3,
        })
        mockEsUpdate.mockResolvedValueOnce({})
        // syncDatasetDateModified after the bump
        mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: { versionReleaseDate: "2024-09-01" } }] } })

        const result = await dataset.updateDataset("JGAD000001", "v1", {}, 5, 2)

        const expectedVersion = `v${maxExisting + 1}`
        return result?.version === expectedVersion
      }),
      { numRuns: 30 },
    )
  })
})

// === deleteDataset ===

describe("deleteDataset (IT-DATASET-16)", () => {
  it("single-version: unlinks and deletes the specific id", async () => {
    // getDataset (version-specific) uses esClient.get
    mockEsGet.mockResolvedValueOnce({
      found: true,
      _source: createMockDatasetDoc({ datasetId: "JGAD000001", version: "v2" }),
    })
    mockGetResearchDoc.mockResolvedValueOnce(createMockResearchDoc({ status: "published", latestVersion: "v1" }))
    mockEsDelete.mockResolvedValue({})
    // syncDatasetDateModified resyncs remaining docs after the version is removed
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: { versionReleaseDate: "2024-09-01" } }] } })

    const ok = await dataset.deleteDataset("JGAD000001", "v2")
    expect(ok).toBe(true)

    expect(mockUnlinkDataset).toHaveBeenCalledWith("hum0001", "JGAD000001", "v2")
    const delArgs = mockEsDelete.mock.calls[0]?.[0] as { id: string }
    expect(delArgs.id).toBe("JGAD000001-v2")
  })

  it("all-versions: unlinks and deletes by query", async () => {
    mockEsSearch.mockResolvedValueOnce({
      hits: { hits: [
        { _source: createMockDatasetDoc({ version: "v1" }) },
        { _source: createMockDatasetDoc({ version: "v2" }) },
      ] },
    })
    mockEsDeleteByQuery.mockResolvedValue({})

    const ok = await dataset.deleteDataset("JGAD000001")
    expect(ok).toBe(true)
    expect(mockUnlinkDataset).toHaveBeenCalledWith("hum0001", "JGAD000001")

    const delArgs = mockEsDeleteByQuery.mock.calls[0]?.[0] as { index: string; query: { term: { datasetId: string } } }
    expect(delArgs.index).toBe("dataset")
    expect(delArgs.query.term.datasetId).toBe("JGAD000001")
  })

  it("returns true when there is nothing to delete (no docs)", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [] } })

    const ok = await dataset.deleteDataset("JGAD999999")
    expect(ok).toBe(true)
    expect(mockEsDeleteByQuery).not.toHaveBeenCalled()
  })
})
