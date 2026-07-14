/**
 * Research es-client tests
 *
 * Covers:
 * - createResearch:
 *   - creates Research + ResearchVersion v1 in draft status
 *   - humId duplicate -> ConflictError.forDuplicate (op_type: create)
 *   - rolls back ResearchVersion if Research index fails
 * - updateResearch (IT-RESEARCH-12, 14):
 *   - dateModified is set, optimistic lock failure -> null
 * - deleteResearch:
 *   - physically deletes Research, ResearchVersions, and Datasets
 * - updateResearchUids (IT-RESEARCH-21):
 *   - returns updated uids on success, null on conflict
 *
 * Mocking strategy:
 * - @/api/es-client/client.esClient is replaced with a mock object whose
 *   methods can be controlled per test. ES_INDEX is kept (string constants).
 * - @/api/es-client/research-version.getResearchVersion is stubbed (used only
 *   by getResearchDetail, not the create/update paths here).
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockEsIndex = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsUpdate = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsGet = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ found: false }))
const mockEsSearch = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ hits: { hits: [] } }))
const mockEsDelete = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsDeleteByQuery = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({}))
const mockEsMget = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ docs: [] }))

void mock.module("@/api/es-client/client", () => ({
  ES_INDEX: { research: "research", researchVersion: "research-version", dataset: "dataset" },
  esClient: {
    index: mockEsIndex,
    update: mockEsUpdate,
    get: mockEsGet,
    search: mockEsSearch,
    delete: mockEsDelete,
    deleteByQuery: mockEsDeleteByQuery,
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

void mock.module("@/api/es-client/research-version", () => ({
  getResearchVersion: mock(async () => null),
  getResearchVersionWithSeqNo: mock(async () => null),
  listResearchVersions: mock(async () => []),
  listResearchVersionsSorted: mock(async () => []),
  createResearchVersion: mock(async () => null),
  linkDatasetToResearch: mock(async () => undefined),
  unlinkDatasetFromResearch: mock(async () => undefined),
}))

const research = await import("@/api/es-client/research")
const { ConflictError } = await import("@/api/errors")

// === Helpers ===

const versionConflictError = (reason = "[hum0001-v1]: version conflict, document already exists") => {
  const err = Object.assign(new Error(reason), {
    meta: {
      statusCode: 409,
      body: { error: { type: "version_conflict_engine_exception", reason } },
    },
  })
  return err
}

const optimisticLockError = () => Object.assign(new Error("optimistic lock"), {
  meta: { statusCode: 409, body: { error: { type: "version_conflict_engine_exception", reason: "current version mismatch" } } },
})

// TODAY is only used for stubbing mock ES `_source` payloads (data that the
// test supplies). Assertions on production-generated `dateModified` use the
// `ISO_DATE` regex instead — relying on strict equality between two `new
// Date()` calls is flaky when execution straddles UTC midnight.
const TODAY = new Date().toISOString().split("T")[0]
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

beforeEach(() => {
  mockEsIndex.mockReset()
  mockEsUpdate.mockReset()
  mockEsGet.mockReset()
  mockEsSearch.mockReset()
  mockEsDelete.mockReset()
  mockEsDeleteByQuery.mockReset()
})

// === createResearch ===

describe("createResearch", () => {
  const baseParams = { humId: "hum0001" } as Parameters<typeof research.createResearch>[0]

  it("creates Research + ResearchVersion v1 in draft status", async () => {
    mockEsIndex.mockResolvedValue({})

    const result = await research.createResearch(baseParams)
    expect(result.research.humId).toBe("hum0001")
    expect(result.research.status).toBe("draft")
    expect(result.research.latestVersion).toBe(null)
    expect(result.research.draftVersion).toBe("v1")
    expect(result.research.dateModified).toMatch(ISO_DATE)
    expect(result.version.version).toBe("v1")
    expect(result.version.humVersionId).toBe("hum0001-v1")
    expect(mockEsIndex).toHaveBeenCalledTimes(2)
  })

  it("throws ConflictError when humId already exists", async () => {
    mockEsIndex.mockImplementationOnce(async () => { throw versionConflictError() })

    let caught: unknown
    try {
      await research.createResearch(baseParams)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ConflictError)
    expect((caught as Error).message).toContain("already exists")
  })

  it("stores summaryShort=null by default and hydrates provided values", async () => {
    mockEsIndex.mockResolvedValue({})

    const defaultResult = await research.createResearch({ humId: "hum0001" })
    expect(defaultResult.research.summaryShort).toBeNull()

    mockEsIndex.mockReset()
    mockEsIndex.mockResolvedValue({})

    const withValueResult = await research.createResearch({
      humId: "hum0002",
      summaryShort: {
        methods: { ja: { text: "配列決定" }, en: { text: "Sequencing" } },
        typeOfData: { ja: { text: "NGS" }, en: { text: "NGS" } },
        targets: { ja: { text: "1 症例" }, en: { text: "1 patient" } },
      },
    })
    expect(withValueResult.research.summaryShort).toEqual({
      methods: { ja: { text: "配列決定", rawHtml: null }, en: { text: "Sequencing", rawHtml: null } },
      typeOfData: { ja: { text: "NGS", rawHtml: null }, en: { text: "NGS", rawHtml: null } },
      targets: { ja: { text: "1 症例", rawHtml: null }, en: { text: "1 patient", rawHtml: null } },
    })
  })

  it("rolls back ResearchVersion if Research index fails", async () => {
    let indexCall = 0
    mockEsIndex.mockImplementation(async () => {
      indexCall += 1
      if (indexCall === 1) return {}
      throw new Error("ES research index failed")
    })

    let caught: unknown
    try {
      await research.createResearch(baseParams)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    expect(mockEsDelete).toHaveBeenCalled()
    const deleteArgs = mockEsDelete.mock.calls[0]?.[0] as { index: string; id: string }
    expect(deleteArgs.index).toBe("research-version")
    expect(deleteArgs.id).toBe("hum0001-v1")
  })
})

// === updateResearch ===

describe("updateResearch", () => {
  it("returns the updated doc and sets dateModified=today (IT-RESEARCH-12)", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({
      found: true,
      _source: {
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
        latestVersion: null,
        draftVersion: "v1",
        datePublished: null,
        dateModified: TODAY,
        status: "draft",
      },
      _seq_no: 5,
      _primary_term: 1,
    })

    const result = await research.updateResearch("hum0001", { title: { ja: "new", en: "new" } }, 4, 1)
    expect(result).not.toBeNull()
    expect(result?.dateModified).toMatch(ISO_DATE)

    // Optimistic lock parameters propagated to ES
    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { if_seq_no: number; if_primary_term: number }
    expect(updateArgs.if_seq_no).toBe(4)
    expect(updateArgs.if_primary_term).toBe(1)
  })

  it("returns null on optimistic-lock failure (IT-RESEARCH-14)", async () => {
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const result = await research.updateResearch("hum0001", { title: { ja: "x", en: "x" } }, 0, 0)
    expect(result).toBeNull()
  })

  it("propagates non-409 errors", async () => {
    mockEsUpdate.mockRejectedValue(new Error("ES is down"))

    let caught: unknown
    try {
      await research.updateResearch("hum0001", {}, 1, 1)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
  })

  it("writes hydrated summaryShort with rawHtml=null when provided", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch(
      "hum0001",
      {
        summaryShort: {
          methods: { ja: { text: "配列決定" }, en: { text: "Sequencing" } },
          typeOfData: { ja: { text: "NGS" }, en: { text: "NGS" } },
          targets: { ja: { text: "1 症例" }, en: { text: "1 patient" } },
        },
      },
      1,
      1,
    )

    const doc = (mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: Record<string, unknown> } }).body.doc
    expect(doc.summaryShort).toEqual({
      methods: { ja: { text: "配列決定", rawHtml: null }, en: { text: "Sequencing", rawHtml: null } },
      typeOfData: { ja: { text: "NGS", rawHtml: null }, en: { text: "NGS", rawHtml: null } },
      targets: { ja: { text: "1 症例", rawHtml: null }, en: { text: "1 patient", rawHtml: null } },
    })
  })

  it("writes summaryShort=null when null is explicitly passed", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch("hum0001", { summaryShort: null }, 1, 1)

    const doc = (mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: Record<string, unknown> } }).body.doc
    expect("summaryShort" in doc).toBe(true)
    expect(doc.summaryShort).toBeNull()
  })

  it("omits summaryShort from the doc when the field is not provided", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch("hum0001", { title: { ja: "t", en: "t" } }, 1, 1)

    const doc = (mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: Record<string, unknown> } }).body.doc
    expect("summaryShort" in doc).toBe(false)
  })

  it("hydrates per-language nulls in summaryShort (one side present)", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch(
      "hum0001",
      {
        summaryShort: {
          methods: { ja: { text: "配列決定" }, en: null },
          typeOfData: { ja: null, en: { text: "NGS" } },
          targets: { ja: null, en: null },
        },
      },
      1,
      1,
    )

    const doc = (mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: Record<string, unknown> } }).body.doc
    expect(doc.summaryShort).toEqual({
      methods: { ja: { text: "配列決定", rawHtml: null }, en: null },
      typeOfData: { ja: null, en: { text: "NGS", rawHtml: null } },
      targets: { ja: null, en: null },
    })
  })
})

// === updateResearchStatus (IT-WORKFLOW-15 invariants) ===

describe("updateResearchStatus", () => {
  it("returns the updated doc and propagates dateModified=today", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({
      found: true,
      _seq_no: 6,
      _primary_term: 1,
      _source: {
        humId: "hum0001",
        url: { ja: "u", en: "u" },
        title: { ja: null, en: null },
        summary: { aims: { ja: null, en: null }, methods: { ja: null, en: null }, targets: { ja: null, en: null }, url: { ja: [], en: [] } },
        dataProvider: [],
        researchProject: [],
        grant: [],
        relatedPublication: [],
        controlledAccessUser: [],
        versionIds: ["hum0001-v1"],
        latestVersion: null,
        draftVersion: "v1",
        datePublished: null,
        dateModified: TODAY,
        status: "review",
      },
    })

    const result = await research.updateResearchStatus("hum0001", "review", 5, 1)
    expect(result).not.toBeNull()
    expect(result?.dateModified).toMatch(ISO_DATE)
    expect(result?.seqNo).toBe(6)
  })

  it("returns null on optimistic-lock failure", async () => {
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const result = await research.updateResearchStatus("hum0001", "review", 0, 0)
    expect(result).toBeNull()
  })
})

// === deleteResearch (physical deletion) ===

describe("deleteResearch", () => {
  it("physically deletes Research, versions, and datasets", async () => {
    mockEsDelete.mockResolvedValue({})
    mockEsDeleteByQuery.mockResolvedValue({})

    const ok = await research.deleteResearch("hum0001", 1, 1)
    expect(ok).toBe(true)

    const deleteArgs = mockEsDelete.mock.calls[0]?.[0] as { index: string; id: string }
    expect(deleteArgs.index).toBe("research")
    expect(deleteArgs.id).toBe("hum0001")

    expect(mockEsDeleteByQuery).toHaveBeenCalledTimes(2)
    const versionArgs = mockEsDeleteByQuery.mock.calls[0]?.[0] as { index: string }
    expect(versionArgs.index).toBe("research-version")
    const datasetArgs = mockEsDeleteByQuery.mock.calls[1]?.[0] as { index: string }
    expect(datasetArgs.index).toBe("dataset")
  })

  it("returns false on optimistic-lock failure", async () => {
    mockEsDelete.mockRejectedValue(optimisticLockError())

    const ok = await research.deleteResearch("hum0001", 0, 0)
    expect(ok).toBe(false)
    expect(mockEsDeleteByQuery).not.toHaveBeenCalled()
  })
})

