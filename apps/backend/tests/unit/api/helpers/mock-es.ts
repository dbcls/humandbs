/**
 * Elasticsearch Client Mock
 *
 * Provides mock implementations for ES client operations.
 * Use with bun:test's mock() to override ES client behavior.
 */
import { mock } from "bun:test"

import type { EsResearchDoc, EsResearchVersionDoc, EsDatasetDoc, AuthUser } from "@/api/types"

// === Mock Data Factories ===

export const createMockResearchDoc = (overrides: Partial<EsResearchDoc> = {}): EsResearchDoc => ({
  humId: "hum0001",
  url: { ja: "https://humandbs.dbcls.jp/hum0001", en: "https://humandbs.dbcls.jp/en/hum0001" },
  title: { ja: "テスト研究", en: "Test Research" },
  summary: {
    aims: { ja: { text: "目的", rawHtml: "<span>目的</span>" }, en: { text: "Aims", rawHtml: "<span>Aims</span>" } },
    methods: { ja: { text: "方法", rawHtml: "<span>方法</span>" }, en: { text: "Methods", rawHtml: "<span>Methods</span>" } },
    targets: { ja: { text: "対象", rawHtml: "<span>対象</span>" }, en: { text: "Targets", rawHtml: "<span>Targets</span>" } },
    url: { ja: [], en: [] },
    footers: { ja: [], en: [] },
  },
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  controlledAccessUser: [],
  versionIds: ["hum0001-v1"],
  latestVersion: "v1",
  datePublished: "2024-01-01",
  dateModified: "2024-01-01",
  status: "published",
  uids: [],
  ...overrides,
})

export const createMockResearchVersionDoc = (overrides: Partial<EsResearchVersionDoc> = {}): EsResearchVersionDoc => ({
  humId: "hum0001",
  humVersionId: "hum0001-v1",
  version: "v1",
  versionReleaseDate: "2024-01-01",
  releaseNote: {
    ja: { text: "リリースノート", rawHtml: "<span>リリースノート</span>" },
    en: { text: "Release note", rawHtml: "<span>Release note</span>" },
  },
  datasets: [{ datasetId: "JGAD000001", version: "v1" }],
  ...overrides,
})

export const createMockDatasetDoc = (overrides: Partial<EsDatasetDoc> = {}): EsDatasetDoc => ({
  datasetId: "JGAD000001",
  version: "v1",
  humId: "hum0001",
  humVersionId: "hum0001-v1",
  versionReleaseDate: "2024-01-01",
  releaseDate: "2024-01-01",
  criteria: "Controlled-access (Type I)",
  typeOfData: { ja: "NGS(Exome)", en: "NGS(Exome)" },
  experiments: [],
  ...overrides,
})

export const createMockAuthUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  userId: "test-user-id",
  username: "testuser",
  email: "test@example.com",
  isAdmin: false,
  ...overrides,
})

// === Mock Search Results ===

export interface MockSearchResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  facets?: Record<string, Array<{ value: string; count: number }>>
}

export const createMockSearchResult = <T>(
  data: T[],
  overrides: Partial<MockSearchResult<T>["pagination"]> = {},
): MockSearchResult<T> => ({
  data,
  pagination: {
    page: 1,
    limit: 10,
    total: data.length,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
    ...overrides,
  },
})

// === Mock Functions ===

/**
 * Create mock for searchResearches
 */
export const mockSearchResearches = (result: MockSearchResult<ReturnType<typeof createMockResearchDoc>>) => {
  return mock(() => Promise.resolve(result))
}

/**
 * Create mock for searchDatasets
 */
export const mockSearchDatasets = (result: MockSearchResult<ReturnType<typeof createMockDatasetDoc>>) => {
  return mock(() => Promise.resolve(result))
}

/**
 * Create mock for getResearchDoc
 */
export const mockGetResearchDoc = (doc: ReturnType<typeof createMockResearchDoc> | null) => {
  return mock(() => Promise.resolve(doc))
}

/**
 * Create mock for getDataset
 */
export const mockGetDataset = (doc: ReturnType<typeof createMockDatasetDoc> | null) => {
  return mock(() => Promise.resolve(doc))
}
