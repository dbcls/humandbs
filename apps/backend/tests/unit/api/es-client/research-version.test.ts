/**
 * Research-Version es-client tests
 *
 * Covers:
 * - createResearchVersion:
 *   - Copies datasets from the latest version when datasets arg is omitted (IT-VERSION-06)
 *   - Bumps version number from versionIds.length + 1
 *   - Updates research.versionIds, draftVersion, status=draft, dateModified
 *   - Throws ConflictError on op_type:create dup
 *   - Rolls back the new version doc on optimistic-lock failure during the research update (IT-VERSION-14)
 * - linkDatasetToResearch:
 *   - Adds to datasets when not already present (IT-VERSION-11)
 *   - No-op when already linked (idempotent)
 *   - Returns null on optimistic-lock failure
 * - unlinkDatasetFromResearch:
 *   - Removes the matching pair (datasetId+version) only
 *   - Removes all versions when version is omitted
 *   - Returns false on optimistic-lock failure
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockEsGet = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ found: false }))
const mockEsSearch = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ hits: { hits: [] } }))
const mockEsIndex = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsUpdate = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsDelete = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsMget = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ docs: [] }))

void mock.module("@/api/es-client/client", () => ({
  ES_INDEX: { research: "research", researchVersion: "research-version", dataset: "dataset" },
  esClient: {
    get: mockEsGet,
    search: mockEsSearch,
    index: mockEsIndex,
    update: mockEsUpdate,
    delete: mockEsDelete,
    mget: mockEsMget,
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

const rv = await import("@/api/es-client/research-version")
const { ConflictError } = await import("@/api/errors")

// Assertions on production-generated `dateModified` use `ISO_DATE` because
// strict equality against `new Date()` taken at module-load time is flaky
// across UTC midnight (the production call resolves a fresh `new Date()`).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const baseResearch = (overrides: Record<string, unknown> = {}) => ({
  humId: "hum0001",
  url: { ja: "u", en: "u" },
  title: { ja: "T", en: "T" },
  summary: { aims: { ja: null, en: null }, methods: { ja: null, en: null }, targets: { ja: null, en: null }, url: { ja: [], en: [] } },
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  controlledAccessUser: [],
  versionIds: ["hum0001-v1"],
  latestVersion: "v1",
  draftVersion: null,
  datePublished: "2024-01-01",
  dateModified: "2024-01-01",
  status: "published",
  ...overrides,
})

const baseVersion = (overrides: Record<string, unknown> = {}) => ({
  humId: "hum0001",
  humVersionId: "hum0001-v1",
  version: "v1",
  versionReleaseDate: "2024-01-01",
  datasets: [] as { datasetId: string; version: string }[],
  releaseNote: { ja: null, en: null },
  ...overrides,
})

const versionConflictError = () => Object.assign(new Error("dup"), {
  meta: {
    statusCode: 409,
    body: { error: { type: "version_conflict_engine_exception", reason: "[hum0001-v2]: version conflict, document already exists" } },
  },
})

const optimisticLockError = () => Object.assign(new Error("optimistic lock"), {
  meta: { statusCode: 409, body: { error: { type: "version_conflict_engine_exception", reason: "current version mismatch" } } },
})

beforeEach(() => {
  mockEsGet.mockReset()
  mockEsSearch.mockReset()
  mockEsIndex.mockReset()
  mockEsUpdate.mockReset()
  mockEsDelete.mockReset()
})

// === createResearchVersion ===

describe("createResearchVersion (IT-VERSION-06)", () => {
  it("copies datasets from the latest version when datasets arg is undefined", async () => {
    // First esClient.get -> research doc; subsequent search inside getResearchVersion -> latest version with datasets
    mockEsGet.mockResolvedValueOnce({ found: true, _source: baseResearch({ versionIds: ["hum0001-v1"], latestVersion: "v1", draftVersion: null }) })
    mockEsSearch.mockResolvedValueOnce({
      hits: { hits: [{ _source: baseVersion({ datasets: [{ datasetId: "JGAD000001", version: "v1" }] }) }] },
    })
    mockEsIndex.mockResolvedValue({})
    mockEsUpdate.mockResolvedValue({})

    const result = await rv.createResearchVersion("hum0001", { ja: { text: "release" }, en: { text: "release" } }, undefined, 1, 1)

    expect(result).not.toBeNull()
    expect(result?.version).toBe("v2")
    expect(result?.humVersionId).toBe("hum0001-v2")
    // Datasets copied from v1
    expect(result?.datasets).toEqual([{ datasetId: "JGAD000001", version: "v1" }])

    // Research update sets draftVersion=v2 and status=draft
    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: Record<string, unknown> } }
    expect(updateArgs.body.doc.draftVersion).toBe("v2")
    expect(updateArgs.body.doc.status).toBe("draft")
    expect(updateArgs.body.doc.dateModified).toMatch(ISO_DATE)
    expect((updateArgs.body.doc.versionIds as string[])).toEqual(["hum0001-v1", "hum0001-v2"])
  })

  it("uses the datasets arg when provided (does not consult latest version)", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: baseResearch({ versionIds: ["hum0001-v1"] }) })
    mockEsIndex.mockResolvedValue({})
    mockEsUpdate.mockResolvedValue({})

    const explicit = [{ datasetId: "JGAD000002", version: "v1" }]
    const result = await rv.createResearchVersion("hum0001", { ja: null, en: null }, explicit, 1, 1)

    expect(result?.datasets).toEqual(explicit)
    expect(mockEsSearch).not.toHaveBeenCalled()
  })

  it("throws ConflictError when the new humVersionId already exists (op_type:create dup)", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: baseResearch({ versionIds: ["hum0001-v1"] }) })
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: baseVersion() }] } })
    mockEsIndex.mockRejectedValue(versionConflictError())

    let caught: unknown
    try {
      await rv.createResearchVersion("hum0001", { ja: null, en: null }, undefined, 1, 1)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ConflictError)
  })

  it("rolls back the version doc on optimistic-lock failure during research update (IT-VERSION-14)", async () => {
    mockEsGet.mockResolvedValueOnce({ found: true, _source: baseResearch({ versionIds: ["hum0001-v1"] }) })
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: baseVersion() }] } })
    mockEsIndex.mockResolvedValue({})
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const result = await rv.createResearchVersion("hum0001", { ja: null, en: null }, undefined, 0, 0)

    expect(result).toBeNull()
    // Rollback: delete the version doc
    expect(mockEsDelete).toHaveBeenCalled()
    const deleteArgs = mockEsDelete.mock.calls[0]?.[0] as { id: string }
    expect(deleteArgs.id).toBe("hum0001-v2")
  })

  it("throws when research doc is missing (preconditions)", async () => {
    mockEsGet.mockResolvedValueOnce({ found: false })

    let caught: unknown
    try {
      await rv.createResearchVersion("hum9999", { ja: null, en: null }, undefined, 1, 1)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    expect((caught as Error).message).toContain("not found")
  })
})

// === linkDatasetToResearch ===

describe("linkDatasetToResearch (IT-VERSION-11)", () => {
  it("appends the dataset to the latest version's datasets", async () => {
    // getResearchVersion: search returns latest version with empty datasets
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: baseVersion() }] } })
    // getResearchVersionWithSeqNo: get returns the version doc
    mockEsGet.mockResolvedValueOnce({ found: true, _source: baseVersion(), _seq_no: 1, _primary_term: 1 })
    mockEsUpdate.mockResolvedValue({})

    const result = await rv.linkDatasetToResearch("hum0001", "JGAD000003", "v1")

    expect(result).toEqual([{ datasetId: "JGAD000003", version: "v1" }])
    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: { datasets: { datasetId: string; version: string }[] } } }
    expect(updateArgs.body.doc.datasets).toEqual([{ datasetId: "JGAD000003", version: "v1" }])
  })

  it("is idempotent when the dataset is already linked", async () => {
    mockEsSearch.mockResolvedValueOnce({
      hits: { hits: [{ _source: baseVersion({ datasets: [{ datasetId: "JGAD000003", version: "v1" }] }) }] },
    })
    mockEsGet.mockResolvedValueOnce({
      found: true,
      _source: baseVersion({ datasets: [{ datasetId: "JGAD000003", version: "v1" }] }),
      _seq_no: 1,
      _primary_term: 1,
    })

    const result = await rv.linkDatasetToResearch("hum0001", "JGAD000003", "v1")

    expect(result).toEqual([{ datasetId: "JGAD000003", version: "v1" }])
    expect(mockEsUpdate).not.toHaveBeenCalled()
  })

  it("returns null on optimistic-lock failure", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: baseVersion() }] } })
    mockEsGet.mockResolvedValueOnce({ found: true, _source: baseVersion(), _seq_no: 1, _primary_term: 1 })
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const result = await rv.linkDatasetToResearch("hum0001", "JGAD000003", "v1")

    expect(result).toBeNull()
  })

  it("returns null when no latest version exists", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [] } })

    const result = await rv.linkDatasetToResearch("hum0001", "JGAD000003", "v1")

    expect(result).toBeNull()
  })
})

// === unlinkDatasetFromResearch ===

describe("unlinkDatasetFromResearch", () => {
  const existing = [
    { datasetId: "JGAD000001", version: "v1" },
    { datasetId: "JGAD000001", version: "v2" },
    { datasetId: "JGAD000003", version: "v1" },
  ]

  it("removes the exact (datasetId, version) pair", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: baseVersion({ datasets: existing }) }] } })
    mockEsGet.mockResolvedValueOnce({
      found: true, _source: baseVersion({ datasets: existing }), _seq_no: 1, _primary_term: 1,
    })
    mockEsUpdate.mockResolvedValue({})

    const ok = await rv.unlinkDatasetFromResearch("hum0001", "JGAD000001", "v1")
    expect(ok).toBe(true)

    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: { datasets: { datasetId: string; version: string }[] } } }
    expect(updateArgs.body.doc.datasets).toEqual([
      { datasetId: "JGAD000001", version: "v2" },
      { datasetId: "JGAD000003", version: "v1" },
    ])
  })

  it("removes all versions when version is omitted", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: baseVersion({ datasets: existing }) }] } })
    mockEsGet.mockResolvedValueOnce({
      found: true, _source: baseVersion({ datasets: existing }), _seq_no: 1, _primary_term: 1,
    })
    mockEsUpdate.mockResolvedValue({})

    const ok = await rv.unlinkDatasetFromResearch("hum0001", "JGAD000001")
    expect(ok).toBe(true)

    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: { datasets: { datasetId: string; version: string }[] } } }
    expect(updateArgs.body.doc.datasets).toEqual([{ datasetId: "JGAD000003", version: "v1" }])
  })

  it("returns true (no-op) when the pair is not present", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: baseVersion({ datasets: existing }) }] } })
    mockEsGet.mockResolvedValueOnce({
      found: true, _source: baseVersion({ datasets: existing }), _seq_no: 1, _primary_term: 1,
    })

    const ok = await rv.unlinkDatasetFromResearch("hum0001", "JGAD999999", "v1")
    expect(ok).toBe(true)
    expect(mockEsUpdate).not.toHaveBeenCalled()
  })

  it("returns false on optimistic-lock failure", async () => {
    mockEsSearch.mockResolvedValueOnce({ hits: { hits: [{ _source: baseVersion({ datasets: existing }) }] } })
    mockEsGet.mockResolvedValueOnce({
      found: true, _source: baseVersion({ datasets: existing }), _seq_no: 1, _primary_term: 1,
    })
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const ok = await rv.unlinkDatasetFromResearch("hum0001", "JGAD000001", "v1")
    expect(ok).toBe(false)
  })
})

// === listResearchVersionsSorted ===

describe("listResearchVersionsSorted", () => {
  it("returns versions sorted by version number desc", async () => {
    mockEsGet.mockResolvedValueOnce({
      found: true,
      _source: baseResearch({ versionIds: ["hum0001-v1", "hum0001-v2", "hum0001-v3"] }),
    })
    // mgetMap uses esClient.mget under the hood
    mockEsMget.mockResolvedValueOnce({
      docs: [
        { _id: "hum0001-v1", found: true, _source: baseVersion({ humVersionId: "hum0001-v1", version: "v1" }) },
        { _id: "hum0001-v2", found: true, _source: baseVersion({ humVersionId: "hum0001-v2", version: "v2" }) },
        { _id: "hum0001-v3", found: true, _source: baseVersion({ humVersionId: "hum0001-v3", version: "v3" }) },
      ],
    })

    const result = await rv.listResearchVersionsSorted("hum0001")
    expect(result?.map(v => v.version)).toEqual(["v3", "v2", "v1"])
  })

  it("returns null when research is not found", async () => {
    mockEsGet.mockResolvedValueOnce({ found: false })

    const result = await rv.listResearchVersionsSorted("hum9999")
    expect(result).toBeNull()
  })
})
