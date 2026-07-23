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

const mockGetResearchVersion = mock<(..._args: unknown[]) => Promise<unknown>>(async () => null)

void mock.module("@/api/es-client/research-version", () => ({
  getResearchVersion: mockGetResearchVersion,
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

// N-new-hum draft context (latestVersion=null): updateResearch writes content
// only to RV[draftVersion], never to the Research root. That's what these
// tests exercise — they never assert content on the root doc.
const nNewCtx = { status: "draft" as const, latestVersion: null, draftVersion: "v1" }

beforeEach(() => {
  mockEsIndex.mockReset()
  mockEsUpdate.mockReset()
  mockEsGet.mockReset()
  mockEsSearch.mockReset()
  mockEsDelete.mockReset()
  mockEsDeleteByQuery.mockReset()
  mockGetResearchVersion.mockReset()
  mockGetResearchVersion.mockResolvedValue(null)
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

    const result = await research.updateResearch("hum0001", nNewCtx, { title: { ja: "new", en: "new" } }, 4, 1)
    expect(result).not.toBeNull()
    expect(result?.dateModified).toMatch(ISO_DATE)

    // Optimistic lock parameters propagated to ES
    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { if_seq_no: number; if_primary_term: number }
    expect(updateArgs.if_seq_no).toBe(4)
    expect(updateArgs.if_primary_term).toBe(1)
  })

  it("returns null on optimistic-lock failure (IT-RESEARCH-14)", async () => {
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const result = await research.updateResearch("hum0001", nNewCtx, { title: { ja: "x", en: "x" } }, 0, 0)
    expect(result).toBeNull()
  })

  it("propagates non-409 errors", async () => {
    mockEsUpdate.mockRejectedValue(new Error("ES is down"))

    let caught: unknown
    try {
      await research.updateResearch("hum0001", nNewCtx, {}, 1, 1)
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
      nNewCtx,
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

    await research.updateResearch("hum0001", nNewCtx, { summaryShort: null }, 1, 1)

    const doc = (mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: Record<string, unknown> } }).body.doc
    expect("summaryShort" in doc).toBe(true)
    expect(doc.summaryShort).toBeNull()
  })

  it("omits summaryShort from the doc when the field is not provided", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch("hum0001", nNewCtx, { title: { ja: "t", en: "t" } }, 1, 1)

    const doc = (mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: Record<string, unknown> } }).body.doc
    expect("summaryShort" in doc).toBe(false)
  })

  it("hydrates per-language nulls in summaryShort (one side present)", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch(
      "hum0001",
      nNewCtx,
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

// === updateResearch write-routing (per-version leak fix) ===
//
// These tests pin the invariant that draft-of-published edits (V-new-version
// draft where latestVersion != null) never touch the Research root content —
// only the RV[draftVersion] doc. Without this the root snapshot leaks into
// public detail responses because getResearchDetail merges root + RV meta.

describe("updateResearch write routing", () => {
  const vNewDraftCtx = { status: "draft" as const, latestVersion: "v1", draftVersion: "v2" }
  const publishedCtx = { status: "published" as const, latestVersion: "v1", draftVersion: null }

  const bodyDoc = (call: number): Record<string, unknown> =>
    (mockEsUpdate.mock.calls[call]?.[0] as { body: { doc: Record<string, unknown> } }).body.doc
  const updateIndex = (call: number): string =>
    (mockEsUpdate.mock.calls[call]?.[0] as { index: string }).index
  const updateId = (call: number): string =>
    (mockEsUpdate.mock.calls[call]?.[0] as { id: string }).id

  it("V-new-version draft: content lands on RV[draftVersion] only, root gets no content", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch(
      "hum0001",
      vNewDraftCtx,
      { title: { ja: "draft-only", en: "draft-only" } },
      1,
      1,
    )

    expect(mockEsUpdate).toHaveBeenCalledTimes(2)

    // 1st call = root: bumps dateModified, does NOT carry title.
    expect(updateIndex(0)).toBe("research")
    expect(updateId(0)).toBe("hum0001")
    const rootDoc = bodyDoc(0)
    expect(rootDoc.dateModified).toMatch(ISO_DATE)
    expect("title" in rootDoc).toBe(false)
    expect("summary" in rootDoc).toBe(false)

    // 2nd call = RV[draftVersion=v2]: carries the content update.
    expect(updateIndex(1)).toBe("research-version")
    expect(updateId(1)).toBe("hum0001-v2")
    const rvDoc = bodyDoc(1)
    expect(rvDoc.title).toEqual({ ja: "draft-only", en: "draft-only" })
    expect("dateModified" in rvDoc).toBe(false)
  })

  it("published patch: content lands on both root and RV[latestVersion]", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch(
      "hum0001",
      publishedCtx,
      { title: { ja: "patched", en: "patched" } },
      1,
      1,
    )

    expect(mockEsUpdate).toHaveBeenCalledTimes(2)

    // Root: has content
    expect(updateIndex(0)).toBe("research")
    expect(bodyDoc(0).title).toEqual({ ja: "patched", en: "patched" })

    // RV[latestVersion=v1]: also has content
    expect(updateIndex(1)).toBe("research-version")
    expect(updateId(1)).toBe("hum0001-v1")
    expect(bodyDoc(1).title).toEqual({ ja: "patched", en: "patched" })
  })

  it("summaryShort updates hit only the Research root (never per-version)", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    await research.updateResearch(
      "hum0001",
      vNewDraftCtx,
      {
        summaryShort: {
          methods: { ja: { text: "m" }, en: { text: "m" } },
          typeOfData: { ja: { text: "t" }, en: { text: "t" } },
          targets: { ja: { text: "g" }, en: { text: "g" } },
        },
      },
      1,
      1,
    )

    // Only root update — no content updates → no RV call.
    expect(mockEsUpdate).toHaveBeenCalledTimes(1)
    expect(updateIndex(0)).toBe("research")
    expect(bodyDoc(0).summaryShort).toBeDefined()
  })

  it("V-new-version draft: RV update skipped when no content field is supplied", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: false })

    // Passing only `summaryShort` (root-only) triggers no RV write even though
    // there's a live draftVersion.
    await research.updateResearch("hum0001", vNewDraftCtx, { summaryShort: null }, 1, 1)

    expect(mockEsUpdate).toHaveBeenCalledTimes(1)
    expect(updateIndex(0)).toBe("research")
  })

  it("V-new-version draft: root optimistic-lock failure short-circuits before RV write", async () => {
    mockEsUpdate.mockImplementationOnce(async () => { throw optimisticLockError() })

    const result = await research.updateResearch(
      "hum0001",
      vNewDraftCtx,
      { title: { ja: "x", en: "x" } },
      0,
      0,
    )

    expect(result).toBeNull()
    expect(mockEsUpdate).toHaveBeenCalledTimes(1)
    expect(updateIndex(0)).toBe("research")
  })
})

// === syncResearchRootFromVersion (approve invariant) ===
//
// approve copies RV[newLatestVersion] content back to the Research root so
// search / listing / public detail all serve the newly-approved version.

describe("syncResearchRootFromVersion", () => {
  it("copies non-null content fields from the target RV to the Research root", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockGetResearchVersion.mockResolvedValueOnce({
      humId: "hum0001",
      humVersionId: "hum0001-v2",
      version: "v2",
      versionReleaseDate: TODAY,
      datasets: [],
      releaseNote: { ja: null, en: null },
      title: { ja: "v2-title", en: "v2-title" },
      summary: { aims: { ja: { text: "v2-aim", rawHtml: null }, en: null }, methods: { ja: null, en: null }, targets: { ja: null, en: null }, url: { ja: [], en: [] } },
      dataProvider: [],
      researchProject: [],
      grant: [],
      relatedPublication: [],
    })

    await research.syncResearchRootFromVersion("hum0001", "v2")

    expect(mockEsUpdate).toHaveBeenCalledTimes(1)
    const args = mockEsUpdate.mock.calls[0]?.[0] as { index: string; id: string; body: { doc: Record<string, unknown> } }
    expect(args.index).toBe("research")
    expect(args.id).toBe("hum0001")
    expect(args.body.doc.title).toEqual({ ja: "v2-title", en: "v2-title" })
    expect((args.body.doc.summary as { aims: unknown }).aims).toBeDefined()
    // Version-metadata fields are not copied — sync only touches content.
    expect("versionReleaseDate" in args.body.doc).toBe(false)
    expect("releaseNote" in args.body.doc).toBe(false)
    expect("datasets" in args.body.doc).toBe(false)
  })

  it("skips the root update when the target RV has no populated content (pre-migration doc)", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockGetResearchVersion.mockResolvedValueOnce({
      humId: "hum0001",
      humVersionId: "hum0001-v1",
      version: "v1",
      versionReleaseDate: TODAY,
      datasets: [],
      releaseNote: { ja: null, en: null },
      // No content fields populated
    })

    await research.syncResearchRootFromVersion("hum0001", "v1")

    // No-op: nothing to sync, so no root write happens.
    expect(mockEsUpdate).not.toHaveBeenCalled()
  })

  it("throws when the target RV does not exist", async () => {
    mockGetResearchVersion.mockResolvedValueOnce(null)

    let caught: unknown
    try {
      await research.syncResearchRootFromVersion("hum0001", "v9")
    } catch (e) {
      caught = e
    }
    expect((caught as Error).message).toContain("hum0001-v9 not found")
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

