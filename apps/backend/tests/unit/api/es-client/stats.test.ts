/**
 * Public stats aggregation tests
 *
 * The stats facets are built from the Dataset index, so they have to see the
 * same documents the Dataset listing does: public versions only, and one
 * version per datasetId. A superseded version's values reaching a bucket would
 * make the dashboard disagree with the listing it links to.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test"

interface EsSearchArgs {
  index: string
  query?: unknown
  aggs?: unknown
  track_total_hits?: boolean
}

const searchCalls: EsSearchArgs[] = []

// `buildDatasetVisibilityFilter` issues its own Research-index lookup (the only
// one with `track_total_hits: false`) before the aggregation under test runs.
const isVisibilityLookup = (args: EsSearchArgs) =>
  args.index === "research" && args.track_total_hits === false

void mock.module("@/api/services/ownership", () => ({
  getOwnerUsernames: async () => [],
  getOwnedHumIds: async () => [],
  isOwner: async () => false,
  refreshOwnershipCache: async () => undefined,
  resetOwnershipCacheForTest: () => undefined,
}))

void mock.module("@/api/es-client/client", () => ({
  ES_INDEX: { research: "research", researchVersion: "research-version", dataset: "dataset" },
  esClient: {
    search: (args: EsSearchArgs) => {
      if (isVisibilityLookup(args)) {
        return Promise.resolve({ hits: { hits: [{ _source: { humId: "hum0001", latestVersion: "v2" } }] } })
      }
      searchCalls.push(args)
      return Promise.resolve({ aggregations: { total_dataset: { value: 3 } } })
    },
    count: () => Promise.resolve({ count: 1 }),
  },
  isConflictError: () => false,
  isDocumentExistsError: () => false,
}))

const { getPublicStats } = await import("@/api/es-client/stats")

beforeEach(() => {
  searchCalls.length = 0
})

describe("getPublicStats", () => {
  const datasetQuery = () => {
    const call = searchCalls.find(c => c.index === "dataset")!
    return (call.query as { bool: { must: unknown[] } }).bool.must
  }

  it("counts only the versions a public viewer can see", async () => {
    await getPublicStats()

    expect(datasetQuery()).toContainEqual({
      bool: {
        should: [{ terms: { humVersionId: ["hum0001-v1", "hum0001-v2"] } }],
        minimum_should_match: 1,
      },
    })
  })

  it("counts only the latest published version of each datasetId", async () => {
    await getPublicStats()

    expect(datasetQuery()).toContainEqual({ term: { isLatestPublished: true } })
  })

  it("reports the dataset total from the datasetId cardinality", async () => {
    const stats = await getPublicStats()

    expect(stats.dataset.total).toBe(3)
  })
})
