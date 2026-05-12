/**
 * Research es-client tests
 *
 * Covers:
 * - generateNextHumId: empty index -> hum0001; "hum0099" -> "hum0100"; "hum9999" -> "hum10000"
 * - createResearch (IT-RESEARCH-04, 05, 07, 20):
 *   - auto-generated humId (201)
 *   - explicit humId duplicate -> ConflictError.forDuplicate (op_type: create)
 *   - auto-generated humId retries up to MAX_RETRIES=3, then surfaces last error
 *   - rolls back ResearchVersion if Research index fails
 * - updateResearch (IT-RESEARCH-12, 14):
 *   - dateModified is set, optimistic lock failure -> null
 * - deleteResearch (IT-RESEARCH-18 partial):
 *   - sets status=deleted, draftVersion=null, dateModified=today
 *   - deletes linked Datasets by query
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
import fc from "fast-check"

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

const TODAY = new Date().toISOString().split("T")[0]

beforeEach(() => {
  mockEsIndex.mockReset()
  mockEsUpdate.mockReset()
  mockEsGet.mockReset()
  mockEsSearch.mockReset()
  mockEsDelete.mockReset()
  mockEsDeleteByQuery.mockReset()
})

// === generateNextHumId (Painless numeric aggregation) ===

describe("generateNextHumId", () => {
  it("returns hum0001 when the aggregation has no value (empty index)", async () => {
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: null } } })

    const id = await research.generateNextHumId()
    expect(id).toBe("hum0001")
  })

  it("returns hum0100 when the aggregation max is 99", async () => {
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: 99 } } })

    const id = await research.generateNextHumId()
    expect(id).toBe("hum0100")
  })

  it("returns 5-digit hum10000 when the aggregation max is 9999", async () => {
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: 9999 } } })

    const id = await research.generateNextHumId()
    expect(id).toBe("hum10000")
  })

  it("returns hum10001 after hum10000 has been allocated", async () => {
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: 10000 } } })

    const id = await research.generateNextHumId()
    expect(id).toBe("hum10001")
  })
})

// === createResearch ===

describe("createResearch", () => {
  const baseParams = { uids: ["owner-1"] } as Parameters<typeof research.createResearch>[0]

  it("succeeds with auto-generated humId on first attempt (IT-RESEARCH-04)", async () => {
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: 1 } } })
    mockEsIndex.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: true, _source: {}, _seq_no: 0, _primary_term: 1 })

    const result = await research.createResearch(baseParams)
    expect(result.research.humId).toBe("hum0002")
    expect(result.research.status).toBe("draft")
    expect(result.research.latestVersion).toBe(null)
    expect(result.research.draftVersion).toBe("v1")
    expect(result.research.dateModified).toBe(TODAY)
    expect(result.version.version).toBe("v1")
    expect(result.version.humVersionId).toBe("hum0002-v1")
    // ResearchVersion is indexed first, then Research
    expect(mockEsIndex).toHaveBeenCalledTimes(2)
  })

  it("throws ConflictError.forDuplicate when explicit humId already exists (IT-RESEARCH-05)", async () => {
    // First index call (research-version) fails with op_type:create dup
    mockEsIndex.mockImplementationOnce(async () => { throw versionConflictError() })

    let caught: unknown
    try {
      await research.createResearch({ ...baseParams, humId: "hum0001" })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ConflictError)
    expect((caught as Error).message).toContain("already exists")
  })

  it("retries up to MAX_RETRIES=3 with auto-generated humId (IT-RESEARCH-07)", async () => {
    let attempt = 0
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: 1 } } })
    mockEsIndex.mockImplementation(async () => {
      attempt += 1
      throw versionConflictError()
    })

    let caught: unknown
    try {
      await research.createResearch(baseParams)
    } catch (e) {
      caught = e
    }
    // Each attempt fails on the first index call (ResearchVersion), so 3 attempts -> 3 calls
    expect(attempt).toBe(3)
    expect(caught).toBeDefined()
  })

  it("rolls back ResearchVersion if Research index fails (atomicity)", async () => {
    let indexCall = 0
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: 1 } } })
    mockEsIndex.mockImplementation(async () => {
      indexCall += 1
      if (indexCall === 1) return {} // ResearchVersion: success
      throw new Error("ES research index failed")
    })

    let caught: unknown
    try {
      await research.createResearch(baseParams)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    // Best-effort rollback delete on the version doc
    expect(mockEsDelete).toHaveBeenCalled()
    const deleteArgs = mockEsDelete.mock.calls[0]?.[0] as { index: string; id: string }
    expect(deleteArgs.index).toBe("research-version")
    expect(deleteArgs.id).toBe("hum0002-v1")
  })

  it("rejects re-use of a deleted humId (IT-RESEARCH-20)", async () => {
    // Even logical-delete keeps the doc in ES, so op_type:create returns 409
    mockEsIndex.mockImplementationOnce(async () => { throw versionConflictError() })

    let caught: unknown
    try {
      await research.createResearch({ ...baseParams, humId: "hum_deleted" })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ConflictError)
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
        uids: ["owner-1"],
      },
      _seq_no: 5,
      _primary_term: 1,
    })

    const result = await research.updateResearch("hum0001", { title: { ja: "new", en: "new" } }, 4, 1)
    expect(result).not.toBeNull()
    expect(result?.dateModified).toBe(TODAY)

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
})

// === updateResearchUids ===

describe("updateResearchUids (IT-RESEARCH-21)", () => {
  it("returns the new uids on success", async () => {
    mockEsUpdate.mockResolvedValue({})

    const result = await research.updateResearchUids("hum0001", ["uid1", "uid2"], 1, 1)
    expect(result).toEqual(["uid1", "uid2"])
  })

  it("returns null on optimistic-lock failure", async () => {
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const result = await research.updateResearchUids("hum0001", ["uid1"], 0, 0)
    expect(result).toBeNull()
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
        uids: ["owner-1"],
      },
    })

    const result = await research.updateResearchStatus("hum0001", "review", 5, 1)
    expect(result).not.toBeNull()
    expect(result?.dateModified).toBe(TODAY)
    expect(result?.seqNo).toBe(6)
  })

  it("returns null on optimistic-lock failure", async () => {
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const result = await research.updateResearchStatus("hum0001", "review", 0, 0)
    expect(result).toBeNull()
  })
})

// === deleteResearch (IT-RESEARCH-18 partial: ES-side effects) ===

describe("deleteResearch", () => {
  it("sets status=deleted and deletes linked datasets by query", async () => {
    mockEsUpdate.mockResolvedValue({})
    mockEsDeleteByQuery.mockResolvedValue({})

    const ok = await research.deleteResearch("hum0001", 1, 1)
    expect(ok).toBe(true)

    const updateArgs = mockEsUpdate.mock.calls[0]?.[0] as { body: { doc: { status: string; draftVersion: null; dateModified: string } } }
    expect(updateArgs.body.doc.status).toBe("deleted")
    expect(updateArgs.body.doc.draftVersion).toBeNull()
    expect(updateArgs.body.doc.dateModified).toBe(TODAY)

    const delQueryArgs = mockEsDeleteByQuery.mock.calls[0]?.[0] as { index: string; query: { term: { humId: string } } }
    expect(delQueryArgs.index).toBe("dataset")
    expect(delQueryArgs.query.term.humId).toBe("hum0001")
  })

  it("returns false on optimistic-lock failure", async () => {
    mockEsUpdate.mockRejectedValue(optimisticLockError())

    const ok = await research.deleteResearch("hum0001", 0, 0)
    expect(ok).toBe(false)
    expect(mockEsDeleteByQuery).not.toHaveBeenCalled()
  })
})

// === createResearch humId collision retry (IT-RESEARCH-07 unit-delegated) ===

const humNumericPart = (id: string): number => {
  if (!id.startsWith("hum")) return NaN
  const numStr = id.slice(3).split("-")[0]
  const n = Number(numStr)
  return Number.isFinite(n) ? n : NaN
}

describe("createResearch humId collision retry", () => {
  const baseParams = { uids: ["owner-1"] } as Parameters<typeof research.createResearch>[0]

  it("PBT (a): succeeds on the (n+1)-th attempt when ResearchVersion has n preceding collisions", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 2 }), async (collisionCount) => {
        mockEsSearch.mockReset()
        mockEsIndex.mockReset()
        mockEsDelete.mockReset()
        mockEsGet.mockReset()

        let aggCall = 0
        mockEsSearch.mockImplementation(async () => {
          aggCall += 1
          return { aggregations: { max_hum_num: { value: aggCall } } }
        })
        let versionIndexAttempt = 0
        mockEsIndex.mockImplementation(async (params) => {
          const index = (params as { index?: string }).index
          if (index === "research-version") {
            versionIndexAttempt += 1
            if (versionIndexAttempt <= collisionCount) {
              throw versionConflictError()
            }
          }
          return {}
        })
        mockEsGet.mockResolvedValue({ found: true, _source: {}, _seq_no: 0, _primary_term: 1 })

        const result = await research.createResearch(baseParams)
        const expectedNum = collisionCount + 2
        const expectedHumId = `hum${String(expectedNum).padStart(4, "0")}`
        return result.research.humId === expectedHumId
      }),
      { numRuns: 15 },
    )
  })

  it("3 consecutive ResearchVersion collisions surface the last error (MAX_RETRIES=3)", async () => {
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: 1 } } })
    let attempt = 0
    mockEsIndex.mockImplementation(async () => {
      attempt += 1
      throw versionConflictError()
    })

    let caught: unknown
    try {
      await research.createResearch(baseParams)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    expect(attempt).toBe(3)
  })

  it("aggregation null → first attempt allocates hum0001", async () => {
    mockEsSearch.mockResolvedValue({ aggregations: { max_hum_num: { value: null } } })
    mockEsIndex.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: true, _source: {}, _seq_no: 0, _primary_term: 1 })

    const result = await research.createResearch(baseParams)
    expect(result.research.humId).toBe("hum0001")
  })

  it("5-digit humIds remain monotonic across two creates (hum9999 → hum10000 → hum10001)", async () => {
    mockEsIndex.mockResolvedValue({})
    mockEsGet.mockResolvedValue({ found: true, _source: {}, _seq_no: 0, _primary_term: 1 })

    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_hum_num: { value: 9999 } } })
    const r1 = await research.createResearch(baseParams)
    expect(r1.research.humId).toBe("hum10000")
    expect(r1.research.humId).toMatch(/^hum\d{5,}$/)

    mockEsSearch.mockResolvedValueOnce({ aggregations: { max_hum_num: { value: 10000 } } })
    const r2 = await research.createResearch(baseParams)
    expect(r2.research.humId).toBe("hum10001")
  })

  it("PBT (e): the allocated humId is never in the existing humNumber set", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 1, max: 999 }), { minLength: 1, maxLength: 5 }),
        async (existingHumNumbers) => {
          mockEsSearch.mockReset()
          mockEsIndex.mockReset()
          mockEsDelete.mockReset()
          mockEsGet.mockReset()

          const existingSet = new Set(existingHumNumbers)
          let aggCall = Math.max(...existingHumNumbers) - 1
          mockEsSearch.mockImplementation(async () => {
            aggCall += 1
            return { aggregations: { max_hum_num: { value: aggCall } } }
          })
          mockEsIndex.mockImplementation(async (params) => {
            const id = (params as { id?: string }).id ?? ""
            const n = humNumericPart(id)
            if (existingSet.has(n)) throw versionConflictError()
            return {}
          })
          mockEsGet.mockResolvedValue({ found: true, _source: {}, _seq_no: 0, _primary_term: 1 })

          const result = await research.createResearch(baseParams)
          const newNumPart = Number(result.research.humId.substring(3))
          return !existingSet.has(newNumPart)
        },
      ),
      { numRuns: 15 },
    )
  })
})
