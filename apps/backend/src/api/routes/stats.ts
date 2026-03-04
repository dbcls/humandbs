/**
 * Stats API Routes
 *
 * Provides statistics about published resources.
 * Queries ES directly for accurate Research/Dataset counts per facet value.
 */
import type { estypes } from "@elastic/elasticsearch"
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { getPublishedHumIds } from "@/api/es-client/auth"
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { esTotal } from "@/api/es-client/utils"
import { singleReadOnlyResponse } from "@/api/helpers/response"
import { ErrorSpec500 } from "@/api/routes/errors"
import { createSingleReadOnlyResponseSchema, StatsResponseSchema } from "@/api/types"
import type { StatsFacetCount } from "@/api/types"

// === Stats Aggregation Builders ===

/** Top-level facet agg with both research and dataset cardinality */
const statsTopLevelAgg = (field: string, size = 10): estypes.AggregationsAggregationContainer => ({
  terms: { field, size },
  aggs: {
    research_count: { cardinality: { field: "humId" } },
    dataset_count: { cardinality: { field: "datasetId" } },
  },
})

/** Nested facet agg with both research and dataset cardinality */
const statsNestedAgg = (field: string, size = 50): estypes.AggregationsAggregationContainer => ({
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
  size = 50,
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

/** Platform composite agg with both research and dataset cardinality */
const statsPlatformAgg = (size = 50): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    vendorModel: {
      composite: {
        size,
        sources: [
          { vendor: { terms: { field: "experiments.searchable.platformVendor", missing_bucket: true } } },
          { model: { terms: { field: "experiments.searchable.platformModel", missing_bucket: true } } },
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

// Type guard helpers
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

interface StatsBucket {
  key: string | number | boolean
  doc_count: number
  // Top-level: direct cardinality sub-aggs
  research_count?: { value: number }
  dataset_count?: { value: number }
  // Nested: reverse_nested "counts" with cardinality sub-aggs
  counts?: {
    doc_count: number
    research_count: { value: number }
    dataset_count: { value: number }
  }
}

interface StatsCompositeBucket {
  key: { vendor?: string | null; model?: string | null }
  doc_count: number
  counts?: {
    doc_count: number
    research_count: { value: number }
    dataset_count: { value: number }
  }
}

const isStatsBucketArray = (value: unknown): value is StatsBucket[] => {
  if (!Array.isArray(value)) return false
  return value.every(item =>
    isRecord(item) && ("key" in item) && typeof item.doc_count === "number",
  )
}

const isStatsCompositeBucketArray = (value: unknown): value is StatsCompositeBucket[] => {
  if (!Array.isArray(value)) return false
  return value.every(item =>
    isRecord(item) && isRecord(item.key) && typeof item.doc_count === "number",
  )
}

const extractStatsFacets = (aggs: Record<string, unknown>): Record<string, Record<string, StatsFacetCount>> => {
  const facets: Record<string, Record<string, StatsFacetCount>> = {}

  // Extract research/dataset counts from a bucket
  const extractCounts = (b: StatsBucket): StatsFacetCount => ({
    research: b.counts?.research_count.value ?? b.research_count?.value ?? 0,
    dataset: b.counts?.dataset_count.value ?? b.dataset_count?.value ?? 0,
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

  // Find platform composite buckets
  const findPlatformBuckets = (obj: unknown): StatsCompositeBucket[] | null => {
    if (!isRecord(obj)) return null
    if ("vendorModel" in obj && isRecord(obj.vendorModel)) {
      const vm = obj.vendorModel
      if ("buckets" in vm && isStatsCompositeBucketArray(vm.buckets)) return vm.buckets
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
    // Skip total cardinality aggs
    if (key === "total_research" || key === "total_dataset") continue

    // Platform (composite)
    if (key === "platform") {
      const buckets = findPlatformBuckets(agg)
      if (buckets) {
        facets[key] = {}
        for (const b of buckets) {
          const vendor = b.key.vendor ?? ""
          const model = b.key.model ?? ""
          if (!vendor || !model) continue
          const value = `${vendor}||${model}`
          facets[key][value] = {
            research: b.counts?.research_count.value ?? 0,
            dataset: b.counts?.dataset_count.value ?? 0,
          }
        }
      }
      continue
    }

    // Terms buckets
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

// === Response Schemas ===

// Stats response (read-only)
const StatsWrappedResponseSchema = createSingleReadOnlyResponseSchema(StatsResponseSchema)

// === Route Definitions ===

const getStatsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Stats"],
  summary: "Get Statistics",
  description: "Get statistics about published Research and Dataset resources, including counts and facets with Research/Dataset breakdown.",
  responses: {
    200: {
      content: { "application/json": { schema: StatsWrappedResponseSchema } },
      description: "Statistics about published resources",
    },
    500: ErrorSpec500,
  },
})

// === Router ===

export const statsRouter = new OpenAPIHono()

// GET /stats
statsRouter.openapi(getStatsRoute, async (c) => {
  // Get published humIds for Dataset filtering
  const publishedHumIds = await getPublishedHumIds(null)

  // Build Dataset query filtered to published Research only
  const must: estypes.QueryDslQueryContainer[] = []
  if (publishedHumIds !== null) {
    if (publishedHumIds.length === 0) {
      return singleReadOnlyResponse(c, {
        research: { total: 0 },
        dataset: { total: 0 },
        facets: {},
      })
    }
    must.push({ terms: { humId: publishedHumIds } })
  }

  // Count published Research directly
  const researchCount = await esClient.count({
    index: ES_INDEX.research,
    query: { term: { status: "published" } },
  })

  // Single Dataset query for all facets with research/dataset cardinality
  const datasetRes = await esClient.search({
    index: ES_INDEX.dataset,
    size: 0,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    aggs: buildStatsAggregations(),
  })

  const rawAggs = datasetRes.aggregations as unknown as Record<string, unknown>

  // Extract totals
  const totalDataset = isRecord(rawAggs.total_dataset) && typeof rawAggs.total_dataset.value === "number"
    ? rawAggs.total_dataset.value
    : 0

  // Extract facets
  const facets = extractStatsFacets(rawAggs)

  return singleReadOnlyResponse(c, {
    research: { total: esTotal(researchCount.count) },
    dataset: { total: totalDataset },
    facets,
  })
})
