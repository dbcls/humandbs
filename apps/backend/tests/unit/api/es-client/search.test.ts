/**
 * Search es-client tests (Research search via Dataset-side resolution)
 *
 * Covers:
 * - IT-SEARCH-12: a datasetId query resolves to its parent Research via a
 *   secondary Dataset-index query, and the resulting humIds become a `terms
 *   humId` filter on the main Research query (ID route — no all_text).
 * - Public visibility filter is applied when authUser is null (latestVersion exists)
 * - Empty result short-circuit when Dataset filters yield no humIds
 *
 * Mocking strategy:
 * - @/api/es-client/client.esClient is mocked. esClient.search is the primary
 *   surface here; we capture the call sequence and supply staged responses.
 * - mgetMap fan-out is bypassed by returning empty hits (the test focuses on
 *   query shape, not on detail hydration).
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

import { createMockAuthUser, createMockResearchDoc } from "../helpers/mock-es"

interface SearchCall {
  index: string
  query?: unknown
  aggs?: unknown
}

const searchCalls: SearchCall[] = []
const mockEsSearch = mock<(args: { index: string; query?: unknown; aggs?: unknown }) => Promise<unknown>>(async () => ({ hits: { hits: [] } }))
const mockEsMget = mock<(..._args: unknown[]) => Promise<unknown>>(async () => ({ docs: [] }))

void mock.module("@/api/services/ownership", () => ({
  getOwnerUsernames: async () => [],
  getOwnedHumIds: async () => [],
  isOwner: async () => false,
  refreshOwnershipCache: async () => {},
  resetOwnershipCacheForTest: () => {},
}))

void mock.module("@/api/es-client/client", () => ({
  ES_INDEX: { research: "research", researchVersion: "research-version", dataset: "dataset" },
  esClient: {
    search: (args: { index: string; query?: unknown; aggs?: unknown }) => {
      searchCalls.push({ index: args.index, query: args.query, aggs: args.aggs })
      return mockEsSearch(args)
    },
    mget: mockEsMget,
    get: mock(async () => ({ found: false })),
    index: mock(async () => ({})),
    update: mock(async () => ({})),
    delete: mock(async () => ({})),
    deleteByQuery: mock(async () => ({})),
  },
  isConflictError: () => false,
  isDocumentExistsError: () => false,
}))

// `logger` is mocked at the module boundary so the post-filter defence-in-depth
// test below can observe `logger.error` calls without monkey-patching the
// exported object at runtime.
const noopLog: (message: string, context?: unknown) => void = () => undefined
const mockLoggerError = mock<(message: string, context?: unknown) => void>(noopLog)
const mockLoggerWarn = mock<(message: string, context?: unknown) => void>(noopLog)
const mockLoggerInfo = mock<(message: string, context?: unknown) => void>(noopLog)
const mockLoggerDebug = mock<(message: string, context?: unknown) => void>(noopLog)

void mock.module("@/api/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    debug: mockLoggerDebug,
  },
}))

const { searchResearches } = await import("@/api/es-client/search")

// ResearchSearchQuery has many required fields; cast to the runtime shape via unknown for tests.
const baseQuery = {
  page: 1,
  limit: 10,
  lang: "ja",
  sort: "humId",
  order: "asc",
  includeRawHtml: false,
} as unknown as import("@/api/types").ResearchSearchQuery

beforeEach(() => {
  searchCalls.length = 0
  mockEsSearch.mockReset()
  mockEsMget.mockReset()
  mockEsMget.mockResolvedValue({ docs: [] })
  mockLoggerError.mockClear()
  mockLoggerWarn.mockClear()
  mockLoggerInfo.mockClear()
  mockLoggerDebug.mockClear()
})

describe("searchResearches: full-text query via Dataset-side resolution (IT-SEARCH-12)", () => {
  it("resolves a datasetId query to its parent humIds and filters the Research query by them", async () => {
    // Call 1: dataset-index resolution returns hum0001 as the owning Research
    mockEsSearch.mockImplementationOnce(async () => ({
      aggregations: { humIds: { buckets: [{ key: "hum0001", doc_count: 1 }] } },
    }))
    // Call 2: research-index main query returns the parent
    mockEsSearch.mockImplementationOnce(async () => ({
      hits: {
        total: { value: 1 },
        hits: [{ _source: createMockResearchDoc({ humId: "hum0001" }) }],
      },
    }))

    const result = await searchResearches({ ...baseQuery, q: "JGAD000002" }, null)

    expect(result.data.map(d => d.humId)).toContain("hum0001")

    // Verify call ordering: dataset index first, then research index
    expect(searchCalls.length).toBeGreaterThanOrEqual(2)
    expect(searchCalls[0].index).toBe("dataset")
    expect(searchCalls[1].index).toBe("research")

    // The resolved parent humIds become a `terms humId` must clause on the Research
    // query (ID route: a datasetId never searches all_text).
    const researchQuery = searchCalls[1].query as { bool: { must: { terms?: { humId: string[] } }[] } }
    const termsClause = researchQuery.bool.must.find(m => typeof m === "object" && m !== null && "terms" in m)
    expect(termsClause).toBeDefined()
    expect((termsClause as { terms: { humId: string[] } }).terms.humId).toContain("hum0001")
    expect(JSON.stringify(researchQuery)).not.toContain("all_text")
  })

  it("dataset-index resolution is case-insensitive on both term and prefix (matching the implementation)", async () => {
    mockEsSearch.mockImplementationOnce(async () => ({ aggregations: { humIds: { buckets: [] } } }))
    mockEsSearch.mockImplementationOnce(async () => ({ hits: { total: { value: 0 }, hits: [] } }))

    await searchResearches({ ...baseQuery, q: "jgad000002" }, null)

    const datasetQuery = searchCalls[0].query as { bool: { should: unknown[] } }
    expect(Array.isArray(datasetQuery.bool.should)).toBe(true)
    const ds = datasetQuery.bool.should as { term?: { datasetId: { value: string; case_insensitive: boolean } }; prefix?: { datasetId: { value: string; case_insensitive: boolean } } }[]
    const termClause = ds.find(s => "term" in s)
    const prefixClause = ds.find(s => "prefix" in s)
    expect(termClause?.term?.datasetId.case_insensitive).toBe(true)
    expect(prefixClause?.prefix?.datasetId.case_insensitive).toBe(true)
  })

  it("a humId + word query filters by humId AND matches the word, with dataset-side text cross-search", async () => {
    // Dataset-side text cross-search for "cancer"
    mockEsSearch.mockImplementationOnce(async () => ({
      aggregations: { humIds: { buckets: [] } },
    }))
    // Research-index query
    mockEsSearch.mockImplementationOnce(async () => ({
      hits: { total: { value: 0 }, hits: [] },
    }))

    await searchResearches({ ...baseQuery, q: "hum0001 cancer" }, null)

    // Text cross-search issues a Dataset-index query for the text portion
    expect(searchCalls.some(c => c.index === "dataset")).toBe(true)
    const researchCall = searchCalls.find(c => c.index === "research")!
    const s = JSON.stringify(researchCall.query)
    // humId filter (ID extraction) AND the body word matched via all_text (operator:and).
    expect(s).toContain("hum0001")
    expect(s).toContain("all_text")
    expect(s).toContain("\"operator\":\"and\"")
  })
})

describe("searchResearches: visibility filter", () => {
  it("public: applies (latestVersion exists AND not deleted) when no explicit status is requested", async () => {
    mockEsSearch.mockImplementationOnce(async () => ({ hits: { total: { value: 0 }, hits: [] } }))

    await searchResearches({ ...baseQuery }, null)

    const q = searchCalls[0].query as { bool: { must: unknown[] } }
    const hasExistsFilter = (q.bool.must as { exists?: { field: string } }[])
      .some(m => m.exists?.field === "latestVersion")
    expect(hasExistsFilter).toBe(true)
  })

  it("admin: omits the visibility filter so all docs are reachable", async () => {
    mockEsSearch.mockImplementationOnce(async () => ({ hits: { total: { value: 0 }, hits: [] } }))

    await searchResearches({ ...baseQuery }, createMockAuthUser({ isAdmin: true }))

    const q = searchCalls[0].query as { bool?: { must: unknown[] } } | { match_all: object }
    if ("bool" in q && Array.isArray(q.bool?.must)) {
      const hasExistsFilter = (q.bool.must as { exists?: { field: string } }[])
        .some(m => m.exists?.field === "latestVersion")
      expect(hasExistsFilter).toBe(false)
    }
  })
})

describe("searchResearches: post-filter defence-in-depth", () => {
  it("excludes a doc with latestVersion=null + empty uids that the ES query should have filtered (public)", async () => {
    // Inject a doc the public ES query "should" never return — to prove the
    // post-filter actually drops it as a backstop and reports via logger.error.
    const goodDoc = createMockResearchDoc({ humId: "hum0001", latestVersion: "v1" })
    const leakedDoc = createMockResearchDoc({ humId: "hum0099", latestVersion: null })
    mockEsSearch.mockImplementationOnce(async () => ({
      hits: { total: { value: 2 }, hits: [{ _source: goodDoc }, { _source: leakedDoc }] },
    }))

    const result = await searchResearches({ ...baseQuery }, null)

    expect(result.data.map(d => d.humId)).toEqual(["hum0001"])
    const loggedMessages = mockLoggerError.mock.calls.map(call => call[0])
    expect(loggedMessages.some(m => m.includes("post-filter excluded"))).toBe(true)
  })
})

describe("searchResearches: explicit status request scoping", () => {
  // Authorization (e.g. forbidding public from requesting `draft`) is the route
  // layer's job; this layer just builds the ES query. The route caller is
  // expected to short-circuit with 403 before reaching here.

  it("authenticated non-admin requesting draft scopes to own uids (IT-AUTH-17 / IT-RESEARCH-03)", async () => {
    mockEsSearch.mockImplementationOnce(async () => ({ hits: { total: { value: 0 }, hits: [] } }))

    await searchResearches({ ...baseQuery, status: "draft" }, createMockAuthUser({ userId: "user-1", isAdmin: false }))

    const q = searchCalls[0].query as { bool: { must: unknown[] } }
    const must = q.bool.must as { term?: { status?: string; humId?: string }; terms?: { humId?: string[] } }[]
    expect(must.some(c => c.term?.status === "draft")).toBe(true)
    // Ownership is now resolved via JGA DB, filtered by humId terms
    expect(must.some(c => c.terms?.humId !== undefined || c.term?.humId !== undefined)).toBe(true)
  })

})
