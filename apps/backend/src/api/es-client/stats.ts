/**
 * Public-stats aggregation against Elasticsearch.
 *
 * Builds and executes the dual-cardinality (research_count / dataset_count)
 * aggregations behind `GET /stats`. Kept separate from the generic facet
 * helpers in `helpers.ts` because the cardinality fan-out (two counts per
 * bucket) differs from the single-count facets used by search.
 */
import type { estypes } from "@elastic/elasticsearch"

import { buildStatusFilter, getPublishedHumIds } from "@/api/es-client/auth"
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { esTotal } from "@/api/es-client/utils"
import type { StatsFacetCount, StatsResponse } from "@/api/types"

// === Aggregation Builders ===

/** Top-level facet agg with both research and dataset cardinality */
const statsTopLevelAgg = (field: string, size = 10): estypes.AggregationsAggregationContainer => ({
  terms: { field, size },
  aggs: {
    research_count: { cardinality: { field: "humId" } },
    dataset_count: { cardinality: { field: "datasetId" } },
  },
})

/** Nested facet agg with both research and dataset cardinality */
const statsNestedAgg = (field: string, size = 500): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    values: {
      terms: { field, size },
      aggs: {
        counts: {
          reverse_nested: {},
          aggs: {
            research_count: { cardinality: { field: "humId" } },
            dataset_count: { cardinality: { field: "datasetId" } },
          },
        },
      },
    },
  },
})

/** Double-nested facet agg with both research and dataset cardinality */
const statsDoubleNestedAgg = (
  innerPath: string,
  field: string,
  size = 500,
): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    inner: {
      nested: { path: innerPath },
      aggs: {
        values: {
          terms: { field, size },
          aggs: {
            counts: {
              reverse_nested: {},
              aggs: {
                research_count: { cardinality: { field: "humId" } },
                dataset_count: { cardinality: { field: "datasetId" } },
              },
            },
          },
        },
      },
    },
  },
})

/** Platform multi_terms agg with both research and dataset cardinality (double-nested) */
const statsPlatformAgg = (size = 500): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    inner: {
      nested: { path: "experiments.searchable.platforms" },
      aggs: {
        vendorModel: {
          multi_terms: {
            size,
            terms: [
              { field: "experiments.searchable.platforms.vendor" },
              { field: "experiments.searchable.platforms.model" },
            ],
          },
          aggs: {
            counts: {
              reverse_nested: {},
              aggs: {
                research_count: { cardinality: { field: "humId" } },
                dataset_count: { cardinality: { field: "datasetId" } },
              },
            },
          },
        },
      },
    },
  },
})

/** Build all stats aggregations */
const buildStatsAggregations = (): Record<string, estypes.AggregationsAggregationContainer> => ({
  // Totals
  total_research: { cardinality: { field: "humId" } },
  total_dataset: { cardinality: { field: "datasetId" } },

  // Top-level facets
  criteria: statsTopLevelAgg("criteria"),

  // Basic nested facets
  assayType: statsNestedAgg("experiments.searchable.assayType"),
  tissues: statsNestedAgg("experiments.searchable.tissues"),
  population: statsNestedAgg("experiments.searchable.population"),
  cohorts: statsNestedAgg("experiments.searchable.cohorts"),
  platform: statsPlatformAgg(),
  fileTypes: statsNestedAgg("experiments.searchable.fileTypes"),
  healthStatus: statsNestedAgg("experiments.searchable.healthStatus", 10),

  // Extended facets
  subjectCountType: statsNestedAgg("experiments.searchable.subjectCountType", 10),
  isTumor: statsNestedAgg("experiments.searchable.isTumor", 5),
  cellLine: statsNestedAgg("experiments.searchable.cellLine"),
  sex: statsNestedAgg("experiments.searchable.sex", 10),
  ageGroup: statsNestedAgg("experiments.searchable.ageGroup", 10),
  libraryKits: statsNestedAgg("experiments.searchable.libraryKits"),
  readType: statsNestedAgg("experiments.searchable.readType", 10),
  referenceGenome: statsNestedAgg("experiments.searchable.referenceGenome"),
  processedDataTypes: statsNestedAgg("experiments.searchable.processedDataTypes"),
  hasPhenotypeData: statsNestedAgg("experiments.searchable.hasPhenotypeData", 5),

  // Double-nested facets
  disease: statsDoubleNestedAgg(
    "experiments.searchable.diseases",
    "experiments.searchable.diseases.label",
  ),
  diseaseIcd10: statsDoubleNestedAgg(
    "experiments.searchable.diseases",
    "experiments.searchable.diseases.icd10",
  ),
  policyId: statsDoubleNestedAgg(
    "experiments.searchable.policies",
    "experiments.searchable.policies.id",
  ),
})

// === Stats Facet Extraction ===

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

interface StatsBucket {
  key: string | number | boolean
  doc_count: number
  // Top-level: direct cardinality sub-aggs
  research_count?: { value: number }
  dataset_count?: { value: number }
  // Nested: reverse_nested "counts" with cardinality sub-aggs.
  // research_count / dataset_count are produced by sub-aggs we always request,
  // but mark them optional so a malformed ES response cannot trip a TypeError
  // at the access site (`b.counts.research_count.value`).
  counts?: {
    doc_count: number
    research_count?: { value: number }
    dataset_count?: { value: number }
  }
}

interface StatsMultiTermsBucket {
  key: (string | number | boolean | null)[]
  doc_count: number
  counts?: {
    doc_count: number
    research_count?: { value: number }
    dataset_count?: { value: number }
  }
}

const isStatsBucketArray = (value: unknown): value is StatsBucket[] => {
  if (!Array.isArray(value)) return false
  return value.every(item => {
    if (!isRecord(item)) return false
    if (typeof item.doc_count !== "number") return false
    if (!("key" in item)) return false
    const k = item.key
    return typeof k === "string" || typeof k === "number" || typeof k === "boolean"
  })
}

const isStatsMultiTermsBucketArray = (value: unknown): value is StatsMultiTermsBucket[] => {
  if (!Array.isArray(value)) return false
  return value.every(item =>
    isRecord(item) && Array.isArray(item.key) && typeof item.doc_count === "number",
  )
}

const extractStatsFacets = (aggs: Record<string, unknown>): Record<string, Record<string, StatsFacetCount>> => {
  const facets: Record<string, Record<string, StatsFacetCount>> = {}

  // Extract research/dataset counts from a bucket
  const extractCounts = (b: StatsBucket): StatsFacetCount => ({
    research: b.counts?.research_count?.value ?? b.research_count?.value ?? 0,
    dataset: b.counts?.dataset_count?.value ?? b.dataset_count?.value ?? 0,
  })

  // Find terms buckets recursively (skip vendorModel composite)
  const findBuckets = (obj: unknown): StatsBucket[] | null => {
    if (!isRecord(obj)) return null
    if ("vendorModel" in obj) return null
    if ("buckets" in obj && isStatsBucketArray(obj.buckets)) return obj.buckets
    for (const [key, val] of Object.entries(obj)) {
      if (key === "doc_count") continue
      if (isRecord(val)) {
        const found = findBuckets(val)
        if (found) return found
      }
    }
    return null
  }

  // Find platform multi_terms buckets
  const findPlatformBuckets = (obj: unknown): StatsMultiTermsBucket[] | null => {
    if (!isRecord(obj)) return null
    if ("vendorModel" in obj && isRecord(obj.vendorModel)) {
      const vm = obj.vendorModel
      if ("buckets" in vm && isStatsMultiTermsBucketArray(vm.buckets)) return vm.buckets
    }
    for (const [key, val] of Object.entries(obj)) {
      if (key === "doc_count") continue
      if (isRecord(val)) {
        const found = findPlatformBuckets(val)
        if (found) return found
      }
    }
    return null
  }

  for (const [key, agg] of Object.entries(aggs)) {
    if (key === "total_research" || key === "total_dataset") continue

    if (key === "platform") {
      const buckets = findPlatformBuckets(agg)
      if (buckets) {
        facets[key] = {}
        for (const b of buckets) {
          const vendor = String(b.key[0] ?? "")
          const model = String(b.key[1] ?? "")
          if (!vendor || !model) continue
          const value = `${vendor}||${model}`
          facets[key][value] = {
            research: b.counts?.research_count?.value ?? 0,
            dataset: b.counts?.dataset_count?.value ?? 0,
          }
        }
      }
      continue
    }

    const buckets = findBuckets(agg)
    if (buckets) {
      facets[key] = {}
      for (const b of buckets) {
        facets[key][String(b.key)] = extractCounts(b)
      }
    }
  }

  return facets
}

// === Public Stats Query ===

/**
 * Aggregate the public-facing stats over published Research / Dataset only.
 *
 * Returns counts and per-facet research/dataset breakdowns suitable for
 * `singleReadOnlyResponse(c, result)` in the route handler.
 */
export const getPublicStats = async (): Promise<StatsResponse> => {
  const publishedHumIds = await getPublishedHumIds(null)

  const must: estypes.QueryDslQueryContainer[] = []
  if (publishedHumIds !== null) {
    if (publishedHumIds.length === 0) {
      return { research: { total: 0 }, dataset: { total: 0 }, facets: {} }
    }
    must.push({ terms: { humId: publishedHumIds } })
  }

  const publicFilter = buildStatusFilter(null)
  const researchCount = await esClient.count({
    index: ES_INDEX.research,
    query: publicFilter ?? { match_all: {} },
  })

  const datasetRes = await esClient.search({
    index: ES_INDEX.dataset,
    size: 0,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    aggs: buildStatsAggregations(),
  })

  const rawAggs = datasetRes.aggregations as unknown as Record<string, unknown>
  const totalDataset = isRecord(rawAggs.total_dataset) && typeof rawAggs.total_dataset.value === "number"
    ? rawAggs.total_dataset.value
    : 0

  return {
    research: { total: esTotal(researchCount.count) },
    dataset: { total: totalDataset },
    facets: extractStatsFacets(rawAggs),
  }
}
