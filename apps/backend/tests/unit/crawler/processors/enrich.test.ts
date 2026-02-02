import { describe, expect, it } from "bun:test"

import {
  getOriginalMetadata,
  enrichDataset,
  enrichDatasets,
  enrichResearch,
  isDatasetEnriched,
  researchNeedsDoi,
  type MetadataApiClient,
} from "@/crawler/processors/enrich"
import type { Dataset, EnrichedDataset, Research } from "@/crawler/types"

const createMockApiClient = (options?: {
  jgadMetadata?: Record<string, unknown> | null
  draMetadata?: Record<string, unknown> | null
  doiResults?: Map<string, { doi: string } | null>
}): MetadataApiClient => ({
  getJgadMetadata: async () => options?.jgadMetadata ?? null,
  getDraMetadata: async () => options?.draMetadata ?? null,
  isDraAccession: (id) => /^(DRA|ERA|SRA|DRR|SRX|SRS)\d+/.test(id),
  batchSearchDois: async () => options?.doiResults ?? new Map(),
})

const createMockDataset = (overrides?: Partial<Dataset>): Dataset => ({
  datasetId: "JGAD000001",
  version: "v1",
  versionReleaseDate: "2024-01-15",
  humId: "hum0001",
  humVersionId: "hum0001-v1",
  releaseDate: "2024-01-15",
  criteria: "Controlled-access (Type I)",
  typeOfData: { ja: "WGS", en: "Whole Genome Sequencing" },
  experiments: [],
  ...overrides,
})

const createMockResearch = (overrides?: Partial<Research>): Research => ({
  humId: "hum0001",
  url: { ja: "https://humandbs.dbcls.jp/hum0001", en: "https://humandbs.dbcls.jp/en/hum0001" },
  title: { ja: "研究タイトル", en: "Research Title" },
  summary: {
    aims: { ja: null, en: null },
    methods: { ja: null, en: null },
    targets: { ja: null, en: null },
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
  datePublished: "2024-01-15",
  dateModified: "2024-01-15",
  ...overrides,
})

describe("processors/enrich.ts", () => {
  // ===========================================================================
  // getOriginalMetadata
  // ===========================================================================
  describe("getOriginalMetadata", () => {
    it("should get JGAD metadata for JGAD dataset", async () => {
      const mockMetadata = { accession: "JGAD000001", title: "Test" }
      const apiClient = createMockApiClient({ jgadMetadata: mockMetadata })

      const result = await getOriginalMetadata("JGAD000001", apiClient, true)

      expect(result).toEqual(mockMetadata)
    })

    it("should get DRA metadata for DRA dataset", async () => {
      const mockMetadata = { accession: "DRA001234", study: { title: "Test" } }
      const apiClient = createMockApiClient({ draMetadata: mockMetadata })

      const result = await getOriginalMetadata("DRA001234", apiClient, true)

      expect(result).toEqual(mockMetadata)
    })

    it("should get DRA metadata for ERA dataset", async () => {
      const mockMetadata = { accession: "ERA001234" }
      const apiClient = createMockApiClient({ draMetadata: mockMetadata })

      const result = await getOriginalMetadata("ERA001234", apiClient, true)

      expect(result).toEqual(mockMetadata)
    })

    it("should return null for unsupported dataset ID", async () => {
      const apiClient = createMockApiClient()

      const result = await getOriginalMetadata("UNKNOWN123", apiClient, true)

      expect(result).toBeNull()
    })

    it("should return null when API returns null", async () => {
      const apiClient = createMockApiClient({ jgadMetadata: null })

      const result = await getOriginalMetadata("JGAD000001", apiClient, true)

      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // enrichDataset
  // ===========================================================================
  describe("enrichDataset", () => {
    it("should enrich dataset with metadata", async () => {
      const mockMetadata = { accession: "JGAD000001", title: "Test" }
      const apiClient = createMockApiClient({ jgadMetadata: mockMetadata })
      const dataset = createMockDataset()

      const result = await enrichDataset(dataset, apiClient)

      expect(result.datasetId).toBe("JGAD000001")
      expect(result.originalMetadata).toEqual(mockMetadata)
    })

    it("should preserve dataset fields after enrichment", async () => {
      const apiClient = createMockApiClient({ jgadMetadata: { test: true } })
      const dataset = createMockDataset({
        criteria: "Controlled-access (Type II)",
        typeOfData: { ja: "WES", en: "Whole Exome Sequencing" },
      })

      const result = await enrichDataset(dataset, apiClient)

      expect(result.criteria).toBe("Controlled-access (Type II)")
      expect(result.typeOfData.ja).toBe("WES")
    })

    it("should set originalMetadata to null when API returns null", async () => {
      const apiClient = createMockApiClient({ jgadMetadata: null })
      const dataset = createMockDataset()

      const result = await enrichDataset(dataset, apiClient)

      expect(result.originalMetadata).toBeNull()
    })

    it("should respect useCache option", async () => {
      let cacheFlagReceived = false
      const apiClient: MetadataApiClient = {
        ...createMockApiClient(),
        getJgadMetadata: async (_id, useCache) => {
          cacheFlagReceived = useCache
          return null
        },
      }
      const dataset = createMockDataset()

      await enrichDataset(dataset, apiClient, { useCache: false })

      expect(cacheFlagReceived).toBe(false)
    })
  })

  // ===========================================================================
  // enrichDatasets
  // ===========================================================================
  describe("enrichDatasets", () => {
    it("should enrich multiple datasets", async () => {
      const apiClient = createMockApiClient({ jgadMetadata: { test: true } })
      const datasets = [
        createMockDataset({ datasetId: "JGAD000001" }),
        createMockDataset({ datasetId: "JGAD000002" }),
      ]

      const result = await enrichDatasets(datasets, apiClient, { delayMs: 0 })

      expect(result).toHaveLength(2)
      expect(result[0].datasetId).toBe("JGAD000001")
      expect(result[1].datasetId).toBe("JGAD000002")
    })

    it("should return empty array for empty input", async () => {
      const apiClient = createMockApiClient()

      const result = await enrichDatasets([], apiClient)

      expect(result).toEqual([])
    })

    it("should handle mixed dataset types", async () => {
      const apiClient: MetadataApiClient = {
        ...createMockApiClient(),
        getJgadMetadata: async () => ({ source: "jgad" }),
        getDraMetadata: async () => ({ source: "dra" }),
      }
      const datasets = [
        createMockDataset({ datasetId: "JGAD000001" }),
        createMockDataset({ datasetId: "DRA001234" }),
      ]

      const result = await enrichDatasets(datasets, apiClient, { delayMs: 0 })

      expect(result[0].originalMetadata).toEqual({ source: "jgad" })
      expect(result[1].originalMetadata).toEqual({ source: "dra" })
    })
  })

  // ===========================================================================
  // enrichResearch
  // ===========================================================================
  describe("enrichResearch", () => {
    it("should not search DOI when all publications have DOI", async () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "論文", en: "Paper" }, doi: "10.1234/test", datasetIds: [] },
        ],
      })
      let doiSearchCalled = false
      const apiClient: MetadataApiClient = {
        ...createMockApiClient(),
        batchSearchDois: async () => {
          doiSearchCalled = true
          return new Map()
        },
      }

      await enrichResearch(research, apiClient)

      expect(doiSearchCalled).toBe(false)
    })

    it("should search DOI when publication is missing DOI", async () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "論文", en: "Paper Without DOI" }, doi: null, datasetIds: [] },
        ],
      })
      const doiResults = new Map([["Paper Without DOI", { doi: "10.1234/found" }]])
      const apiClient = createMockApiClient({ doiResults })

      const result = await enrichResearch(research, apiClient)

      expect(result.relatedPublication[0].doi).toBe("10.1234/found")
    })

    it("should preserve existing DOI when search returns null", async () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "論文", en: "Paper" }, doi: "10.1234/existing", datasetIds: [] },
          { title: { ja: "別の論文", en: "Another Paper" }, doi: null, datasetIds: [] },
        ],
      })
      const apiClient = createMockApiClient({ doiResults: new Map() })

      const result = await enrichResearch(research, apiClient)

      expect(result.relatedPublication[0].doi).toBe("10.1234/existing")
      expect(result.relatedPublication[1].doi).toBeNull()
    })

    it("should use English title for DOI search", async () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "日本語タイトル", en: "English Title" }, doi: null, datasetIds: [] },
        ],
      })
      let searchedTitle = ""
      const apiClient: MetadataApiClient = {
        ...createMockApiClient(),
        batchSearchDois: async (_humId, pubs) => {
          searchedTitle = pubs[0].title
          return new Map()
        },
      }

      await enrichResearch(research, apiClient)

      expect(searchedTitle).toBe("English Title")
    })

    it("should fallback to Japanese title when English is null", async () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "日本語タイトル", en: null }, doi: null, datasetIds: [] },
        ],
      })
      let searchedTitle = ""
      const apiClient: MetadataApiClient = {
        ...createMockApiClient(),
        batchSearchDois: async (_humId, pubs) => {
          searchedTitle = pubs[0].title
          return new Map()
        },
      }

      await enrichResearch(research, apiClient)

      expect(searchedTitle).toBe("日本語タイトル")
    })
  })

  // ===========================================================================
  // isDatasetEnriched
  // ===========================================================================
  describe("isDatasetEnriched", () => {
    it("should return true for enriched dataset", () => {
      const dataset: EnrichedDataset = {
        ...createMockDataset(),
        originalMetadata: { test: true },
      }

      expect(isDatasetEnriched(dataset)).toBe(true)
    })

    it("should return true when originalMetadata is null", () => {
      const dataset: EnrichedDataset = {
        ...createMockDataset(),
        originalMetadata: null,
      }

      expect(isDatasetEnriched(dataset)).toBe(true)
    })

    it("should return false for non-enriched dataset", () => {
      const dataset = createMockDataset()

      expect(isDatasetEnriched(dataset)).toBe(false)
    })
  })

  // ===========================================================================
  // researchNeedsDoi
  // ===========================================================================
  describe("researchNeedsDoi", () => {
    it("should return true when publication has null DOI", () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "論文", en: "Paper" }, doi: null, datasetIds: [] },
        ],
      })

      expect(researchNeedsDoi(research)).toBe(true)
    })

    it("should return true when publication has undefined DOI", () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "論文", en: "Paper" }, doi: undefined, datasetIds: [] },
        ],
      })

      expect(researchNeedsDoi(research)).toBe(true)
    })

    it("should return false when all publications have DOI", () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "論文1", en: "Paper1" }, doi: "10.1234/test1", datasetIds: [] },
          { title: { ja: "論文2", en: "Paper2" }, doi: "10.1234/test2", datasetIds: [] },
        ],
      })

      expect(researchNeedsDoi(research)).toBe(false)
    })

    it("should return false when no publications", () => {
      const research = createMockResearch({
        relatedPublication: [],
      })

      expect(researchNeedsDoi(research)).toBe(false)
    })

    it("should return true when at least one publication needs DOI", () => {
      const research = createMockResearch({
        relatedPublication: [
          { title: { ja: "論文1", en: "Paper1" }, doi: "10.1234/test", datasetIds: [] },
          { title: { ja: "論文2", en: "Paper2" }, doi: null, datasetIds: [] },
        ],
      })

      expect(researchNeedsDoi(research)).toBe(true)
    })
  })
})
