/**
 * Search operations for Elasticsearch
 *
 * This module provides:
 * - Dataset search (searchDatasets)
 * - Research search (searchResearches)
 * - Filter clause builders
 * - Facet aggregation builders
 */
import type { estypes } from "@elastic/elasticsearch"

import facetOrder from "@/api/data/facet-order.json"
import { buildStatusFilter, canAccessResearchDoc, getPublishedHumIds } from "@/api/es-client/auth"
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { NESTED_TERMS_FILTERS, NESTED_RANGE_FILTERS, hasDatasetFilters } from "@/api/es-client/filters"
import {
  splitComma,
  nestedFacetAgg,
  doubleNestedFacetAgg,
  platformFacetAgg,
  topLevelFacetAgg,
} from "@/api/es-client/helpers"
import type { FacetCountField } from "@/api/es-client/helpers"
import {
  buildDatasetMultiMatchQuery,
  buildDatasetSortSpec,
  buildResearchDateRangeFilters,
  buildResearchMultiMatchQuery,
  buildResearchSortSpec,
  resolveDatasetSort,
  resolveResearchSort,
  versionSortSpec,
} from "@/api/es-client/query-builders"
import {
  nestedTermsQuery,
  nestedTermQuery,
  nestedRangeQuery,
  doubleNestedWildcardQuery,
  doubleNestedTermsQuery,
  nestedBooleanTermQuery,
} from "@/api/es-client/query-helpers"
import { esTotal, mgetMap, uniq } from "@/api/es-client/utils"
import { logger } from "@/api/logger"
import {
  EsDatasetSchema,
  EsResearchSchema,
  ResearchVersionSchema,
  createPagination,
} from "@/api/types"
import type {
  DatasetSearchQuery,
  ResearchSearchQuery,
  Pagination,
  FacetValue,
  FacetsMap,
  EsDataset,
  EsResearch,
  ResearchVersion,
  ResearchSummary,
  AuthUser,
} from "@/api/types"
import { isOwnerOrAdmin, parseVersionNum } from "@/api/utils/version"

// === Constants ===

/**
 * Elasticsearch default `index.max_result_window`. When `from + size` exceeds this,
 * ES returns 500. The list/search code paths cap pagination at this boundary and
 * return an empty page instead of issuing the doomed request.
 */
export const MAX_RESULT_WINDOW = 10000

// === Types ===

/** Internal search result (not the API response shape) */
interface DatasetSearchResult {
  data: EsDataset[]
  pagination: Pagination
  facets?: FacetsMap
}

/** Internal search result (not the API response shape) */
interface ResearchSearchResult {
  data: ResearchSummary[]
  pagination: Pagination
  facets?: FacetsMap
}

type QueryContainer = estypes.QueryDslQueryContainer
type FilterParams = Record<string, unknown>

// === Filter Clause Builders ===

export const buildNestedTermsFilters = (params: FilterParams): QueryContainer[] => {
  const clauses: QueryContainer[] = []
  for (const { param, field } of NESTED_TERMS_FILTERS) {
    const value = params[param]
    if (typeof value === "string" && value) {
      const values = splitComma(value)
      if (values.length > 0) {
        clauses.push(nestedTermsQuery("experiments", field, values))
      }
    }
  }
  return clauses
}

export const buildNestedRangeFilters = (params: FilterParams): QueryContainer[] => {
  const clauses: QueryContainer[] = []
  for (const { minParam, maxParam, field } of NESTED_RANGE_FILTERS) {
    const minVal = params[minParam]
    const maxVal = params[maxParam]
    if (minVal !== undefined && minVal !== null) {
      clauses.push(nestedRangeQuery("experiments", field, { gte: minVal as number }))
    }
    if (maxVal !== undefined && maxVal !== null) {
      clauses.push(nestedRangeQuery("experiments", field, { lte: maxVal as number }))
    }
  }
  return clauses
}

export const buildDatasetFilterClauses = (params: DatasetSearchQuery | ResearchSearchQuery): QueryContainer[] => {
  const must: QueryContainer[] = []
  const p = params as FilterParams

  // === Top-level filters ===

  // humId filter (Dataset only)
  if ("humId" in params && params.humId) {
    must.push({ term: { humId: params.humId } })
  }

  // criteria filter (comma-separated for OR)
  const criteriaValues = splitComma(params.criteria)
  if (criteriaValues.length > 0) {
    must.push({ terms: { criteria: criteriaValues } })
  }

  // typeOfData filter は tokenize 済み text に対する match。
  // filter なので fuzziness は付けず厳密 predicate として扱う (query 側は relevance/fuzzy)。
  if ("typeOfData" in params && params.typeOfData) {
    must.push({
      multi_match: {
        query: params.typeOfData,
        fields: ["typeOfData.ja", "typeOfData.en"],
        type: "best_fields",
      },
    })
  }

  // releaseDate range (top-level)
  if ("minReleaseDate" in params && params.minReleaseDate) {
    must.push({ range: { releaseDate: { gte: params.minReleaseDate } } })
  }
  if ("maxReleaseDate" in params && params.maxReleaseDate) {
    must.push({ range: { releaseDate: { lte: params.maxReleaseDate } } })
  }

  // === Nested terms filters (table-driven) ===
  must.push(...buildNestedTermsFilters(p))

  // === Nested range filters (table-driven) ===
  must.push(...buildNestedRangeFilters(p))

  // === Platform filter (vendor + model matching, double-nested) ===
  // Platform values are in format "Vendor||Model" (e.g., "Illumina||NovaSeq 6000")
  // experiments.searchable.platforms is nested inside experiments (double-nested)
  if ("platform" in params && params.platform) {
    const platformValues = splitComma(params.platform)
    if (platformValues.length > 0) {
      const platformShould = platformValues.map(platform => {
        const parts = platform.split("||").map(s => s.trim())
        // If we have "Vendor||Model" format, match both fields
        if (parts.length >= 2 && parts[0] && parts[1]) {
          const vendor = parts[0]
          const model = parts[1]
          return {
            nested: {
              path: "experiments",
              query: {
                nested: {
                  path: "experiments.searchable.platforms",
                  query: {
                    bool: {
                      must: [
                        { term: { "experiments.searchable.platforms.vendor": vendor } },
                        { term: { "experiments.searchable.platforms.model": model } },
                      ],
                    },
                  },
                },
              },
            },
          }
        }
        // Otherwise, try to match against either vendor or model
        return {
          nested: {
            path: "experiments",
            query: {
              nested: {
                path: "experiments.searchable.platforms",
                query: {
                  bool: {
                    should: [
                      { term: { "experiments.searchable.platforms.vendor": platform } },
                      { term: { "experiments.searchable.platforms.model": platform } },
                    ],
                    minimum_should_match: 1,
                  },
                },
              },
            },
          },
        }
      })
      must.push({ bool: { should: platformShould, minimum_should_match: 1 } })
    }
  }

  // === Nested boolean filters ===

  // isTumor
  if ("isTumor" in params && params.isTumor !== undefined) {
    must.push(nestedTermQuery("experiments", "experiments.searchable.isTumor", params.isTumor))
  }

  // hasPhenotypeData
  if ("hasPhenotypeData" in params && params.hasPhenotypeData !== undefined) {
    must.push(nestedBooleanTermQuery("experiments", "experiments.searchable.hasPhenotypeData", params.hasPhenotypeData))
  }

  // === Double-nested filters ===

  // disease (partial match on label)
  if (params.disease) {
    must.push(doubleNestedWildcardQuery(
      "experiments",
      "experiments.searchable.diseases",
      "experiments.searchable.diseases.label",
      params.disease,
    ))
  }

  // diseaseIcd10 (prefix match)
  if ("diseaseIcd10" in params && params.diseaseIcd10) {
    const icd10Codes = splitComma(params.diseaseIcd10)
    if (icd10Codes.length > 0) {
      const icd10Should = icd10Codes.map(code => ({
        nested: {
          path: "experiments",
          query: {
            nested: {
              path: "experiments.searchable.diseases",
              query: {
                prefix: { "experiments.searchable.diseases.icd10": { value: code, case_insensitive: true } },
              },
            },
          },
        },
      }))
      must.push({ bool: { should: icd10Should, minimum_should_match: 1 } })
    }
  }

  // policyId (double-nested terms)
  if ("policyId" in params && params.policyId) {
    const policyIds = splitComma(params.policyId)
    if (policyIds.length > 0) {
      must.push(doubleNestedTermsQuery(
        "experiments",
        "experiments.searchable.policies",
        "experiments.searchable.policies.id",
        policyIds,
      ))
    }
  }

  return must
}

// === Facet Aggregation Builders ===

const buildFacetAggregations = (
  countField: FacetCountField,
): Record<string, estypes.AggregationsAggregationContainer> => ({
  // Top-level facets (with cardinality for unique entity count)
  criteria: topLevelFacetAgg("criteria", countField),

  // Basic nested facets
  assayType: nestedFacetAgg("experiments.searchable.assayType", countField),
  tissues: nestedFacetAgg("experiments.searchable.tissues", countField),
  population: nestedFacetAgg("experiments.searchable.population", countField),
  cohorts: nestedFacetAgg("experiments.searchable.cohorts", countField),
  platform: platformFacetAgg(countField),
  fileTypes: nestedFacetAgg("experiments.searchable.fileTypes", countField),
  healthStatus: nestedFacetAgg("experiments.searchable.healthStatus", countField, 10),

  // Extended facets
  subjectCountType: nestedFacetAgg("experiments.searchable.subjectCountType", countField, 10),
  isTumor: nestedFacetAgg("experiments.searchable.isTumor", countField, 5),
  cellLine: nestedFacetAgg("experiments.searchable.cellLine", countField),
  sex: nestedFacetAgg("experiments.searchable.sex", countField, 10),
  ageGroup: nestedFacetAgg("experiments.searchable.ageGroup", countField, 10),
  libraryKits: nestedFacetAgg("experiments.searchable.libraryKits", countField),
  readType: nestedFacetAgg("experiments.searchable.readType", countField, 10),
  referenceGenome: nestedFacetAgg("experiments.searchable.referenceGenome", countField),
  processedDataTypes: nestedFacetAgg("experiments.searchable.processedDataTypes", countField),
  hasPhenotypeData: nestedFacetAgg("experiments.searchable.hasPhenotypeData", countField, 5),

  // Double-nested facets
  disease: doubleNestedFacetAgg(
    "experiments.searchable.diseases",
    "experiments.searchable.diseases.label",
    countField,
  ),
  diseaseIcd10: doubleNestedFacetAgg(
    "experiments.searchable.diseases",
    "experiments.searchable.diseases.icd10",
    countField,
  ),
  policyId: doubleNestedFacetAgg(
    "experiments.searchable.policies",
    "experiments.searchable.policies.id",
    countField,
  ),
})

// === Facet Extraction ===

interface TermsBucket {
  key: string | number | boolean
  doc_count: number
  dataset_count?: {
    doc_count?: number // reverse_nested doc_count
    value?: number // top-level cardinality
    unique?: { value: number } // nested reverse_nested + cardinality
  }
}

interface CompositeBucket {
  key: { vendor?: string | null; model?: string | null }
  doc_count: number
  dataset_count?: {
    doc_count?: number
    unique?: { value: number }
  }
}

// Type guard for Record<string, unknown>
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// Type guard for TermsBucket array
const isTermsBucketArray = (value: unknown): value is TermsBucket[] => {
  if (!Array.isArray(value)) return false
  return value.every(item =>
    isRecord(item) &&
    ("key" in item) &&
    typeof item.doc_count === "number",
  )
}

// Type guard for CompositeBucket array
const isCompositeBucketArray = (value: unknown): value is CompositeBucket[] => {
  if (!Array.isArray(value)) return false
  return value.every(item =>
    isRecord(item) &&
    isRecord(item.key) &&
    typeof item.doc_count === "number",
  )
}

/** Sort facet values: prioritized values first (in defined order), then remaining by count descending */
export const applyFacetOrder = (values: FacetValue[], order: string[]): FacetValue[] => {
  const orderIndex = new Map(order.map((v, i) => [v, i]))
  return values.toSorted((a, b) => {
    const aIdx = orderIndex.get(a.value) ?? Infinity
    const bIdx = orderIndex.get(b.value) ?? Infinity
    if (aIdx !== bIdx) return aIdx - bIdx
    return b.count - a.count
  })
}

const extractFacets = (aggs: Record<string, unknown> | undefined): FacetsMap => {
  if (!aggs) return {}
  const facets: Record<string, FacetValue[]> = {}

  // Extract count from bucket, preferring cardinality (unique datasetId count) over raw doc_count
  const extractBuckets = (buckets: TermsBucket[]) =>
    buckets.map(b => ({
      value: String(b.key),
      count: b.dataset_count?.unique?.value
        ?? b.dataset_count?.value
        ?? b.dataset_count?.doc_count
        ?? b.doc_count,
    }))

  // Extract platform composite buckets (vendor + model)
  // Format: "{vendor}||{model}" (e.g., "Illumina||NovaSeq 6000")
  const extractPlatformBuckets = (buckets: CompositeBucket[]) =>
    buckets
      .map(b => {
        const vendor = b.key.vendor ?? ""
        const model = b.key.model ?? ""
        // Combine vendor and model with "||" separator (no spaces)
        // Only include if both vendor and model are present
        if (!vendor || !model) return null
        const value = `${vendor}||${model}`
        return {
          value,
          count: b.dataset_count?.unique?.value
            ?? b.dataset_count?.doc_count
            ?? b.doc_count,
        }
      })
      .filter((item): item is { value: string; count: number } => item !== null)

  // Find vendorModel composite aggregation for platform
  const findPlatformBuckets = (obj: unknown): CompositeBucket[] | null => {
    if (!isRecord(obj)) return null

    // Check for vendorModel composite aggregation
    if ("vendorModel" in obj && isRecord(obj.vendorModel)) {
      const vendorModel = obj.vendorModel
      if ("buckets" in vendorModel && isCompositeBucketArray(vendorModel.buckets)) {
        return vendorModel.buckets
      }
    }

    // Search nested objects
    for (const [key, val] of Object.entries(obj)) {
      if (key === "doc_count") continue
      if (isRecord(val)) {
        const found = findPlatformBuckets(val)
        if (found) return found
      }
    }
    return null
  }

  // Recursively find buckets in nested aggregations
  const findBuckets = (obj: unknown): TermsBucket[] | null => {
    if (!isRecord(obj)) return null

    // Skip vendorModel (handled separately for platform)
    if ("vendorModel" in obj) return null

    // Direct buckets
    if ("buckets" in obj && isTermsBucketArray(obj.buckets)) {
      return obj.buckets
    }

    // Search nested objects (skip doc_count)
    for (const [key, val] of Object.entries(obj)) {
      if (key === "doc_count") continue
      if (isRecord(val)) {
        const found = findBuckets(val)
        if (found) return found
      }
    }
    return null
  }

  for (const [key, agg] of Object.entries(aggs)) {
    // Special handling for platform (composite aggregation)
    if (key === "platform") {
      const platformBuckets = findPlatformBuckets(agg)
      if (platformBuckets) {
        facets[key] = extractPlatformBuckets(platformBuckets)
      }
      continue
    }

    const buckets = findBuckets(agg)
    if (buckets) {
      facets[key] = extractBuckets(buckets)
    }
  }

  // Apply ordering from facet-order.json
  for (const [key, values] of Object.entries(facets)) {
    const order = (facetOrder as Record<string, string[]>)[key]
    if (order) {
      facets[key] = applyFacetOrder(values, order)
    }
  }

  return facets as FacetsMap
}

// === Dataset Search ===

export interface SearchDatasetsOptions {
  /** Field used for the cardinality count inside facet aggregations. Defaults to "datasetId". */
  facetCountField?: FacetCountField
}

export const searchDatasets = async (
  params: DatasetSearchQuery,
  authUser: AuthUser | null = null,
  opts: SearchDatasetsOptions = {},
): Promise<DatasetSearchResult> => {
  const { page, limit, sort, order, q, includeFacets } = params
  const from = (page - 1) * limit
  const facetCountField: FacetCountField = opts.facetCountField ?? "datasetId"
  // Resolve sort default here so GET and POST search paths share the same
  // "query → relevance, otherwise datasetId" rule (docs/api-guide.md).
  const resolvedSort = resolveDatasetSort(sort, !!q)

  // Pagination beyond ES `index.max_result_window` would 500. Short-circuit with an
  // empty page; callers see a regular SearchResponse with `data: []`.
  if (from + limit > MAX_RESULT_WINDOW) {
    return {
      data: [],
      pagination: createPagination(0, page, limit),
      facets: includeFacets ? {} : undefined,
    }
  }

  // Build query. BilingualText documents do not need a lang filter.
  const must: estypes.QueryDslQueryContainer[] = []

  // Apply authorization filter: Dataset visibility depends on parent Research status
  // Get humIds of accessible Research, then filter Datasets by those humIds
  const accessibleHumIds = await getPublishedHumIds(authUser)
  if (accessibleHumIds !== null) {
    if (accessibleHumIds.length === 0) {
      // No accessible Research, return empty result
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        facets: includeFacets ? {} : undefined,
      }
    }
    must.push({ terms: { humId: accessibleHumIds } })
  }

  must.push(...buildDatasetFilterClauses(params))

  // Full-text search
  if (q) {
    must.push(buildDatasetMultiMatchQuery(q))
  }

  // Sort configuration
  const sortSpec = buildDatasetSortSpec(resolvedSort, order, !!q)

  interface Aggs {
    uniq_ids: estypes.AggregationsCardinalityAggregate
    [key: string]: estypes.AggregationsAggregate
  }

  const res = await esClient.search<EsDataset, Aggs>({
    index: ES_INDEX.dataset,
    from,
    size: limit,
    query: { bool: { must } },
    collapse: {
      field: "datasetId",
      inner_hits: {
        name: "latest",
        size: 1,
        sort: [
          versionSortSpec("desc"),
          { releaseDate: { order: "desc" as const } },
        ],
        _source: true,
      },
    },
    sort: sortSpec,
    _source: false,
    track_total_hits: true,
    aggs: {
      uniq_ids: { cardinality: { field: "datasetId" } },
      ...(includeFacets ? buildFacetAggregations(facetCountField) : {}),
    },
  })

  interface InnerHit { _id: string; _source?: EsDataset }
  interface Hit { inner_hits?: { latest?: { hits: { hits: InnerHit[] } } } }

  const hits = (res.hits.hits as Hit[])
    .flatMap(hit => hit.inner_hits?.latest?.hits.hits ?? [])
    .map(inner => inner._source)
    .filter((src): src is EsDataset => !!src)
    .map(src => EsDatasetSchema.parse(src))

  const total = esTotal(res.aggregations?.uniq_ids?.value ?? 0)
  const facets = includeFacets ? extractFacets(res.aggregations as unknown as Record<string, unknown>) : undefined

  return {
    data: hits,
    pagination: createPagination(total, page, limit),
    facets,
  }
}

// === Research Search ===

const getHumIdsByDatasetFilters = async (
  params: ResearchSearchQuery,
): Promise<string[]> => {
  // BilingualText documents do not need a lang filter.
  const must: estypes.QueryDslQueryContainer[] = []
  must.push(...buildDatasetFilterClauses(params))

  interface HumIdAggs {
    humIds: estypes.AggregationsTermsAggregateBase<{ key: string; doc_count: number }>
  }

  const res = await esClient.search<unknown, HumIdAggs>({
    index: ES_INDEX.dataset,
    size: 0,
    query: { bool: { must } },
    aggs: {
      humIds: { terms: { field: "humId", size: 10000 } },
    },
  })

  const buckets = res.aggregations?.humIds.buckets
  if (!Array.isArray(buckets)) return []
  return buckets.map(b => b.key)
}

// Research 全文検索で "JGAD000002" のような Dataset ID を入れても親 Research (hum0001) が返るように、
// Dataset index に対して datasetId の term/prefix マッチを走らせて humId 集合を得る。
// Research index に datasetIds フィールドを持たせないための迂回路。
const getHumIdsByDatasetIdQuery = async (q: string): Promise<string[]> => {
  interface HumIdAggs {
    humIds: estypes.AggregationsTermsAggregateBase<{ key: string; doc_count: number }>
  }

  const res = await esClient.search<unknown, HumIdAggs>({
    index: ES_INDEX.dataset,
    size: 0,
    query: {
      bool: {
        should: [
          { term: { datasetId: { value: q, case_insensitive: true } } },
          { prefix: { datasetId: { value: q, case_insensitive: true } } },
        ],
        minimum_should_match: 1,
      },
    },
    aggs: {
      humIds: { terms: { field: "humId", size: 10000 } },
    },
  })

  const buckets = res.aggregations?.humIds.buckets
  if (!Array.isArray(buckets)) return []
  return buckets.map(b => b.key)
}

export const searchResearches = async (
  params: ResearchSearchQuery,
  authUser: AuthUser | null = null,
): Promise<ResearchSearchResult> => {
  const {
    page, limit, lang, sort, order, q, humId,
    minDatePublished, maxDatePublished, minDateModified, maxDateModified,
    includeFacets, status: requestedStatus,
  } = params
  const from = (page - 1) * limit
  // Resolve sort default here so GET and POST paths share the same
  // "query → relevance, otherwise humId" rule (docs/api-guide.md).
  const resolvedSort = resolveResearchSort(sort, !!q)

  // Pagination beyond ES `index.max_result_window` would 500. Short-circuit with an
  // empty page; callers see a regular SearchResponse with `data: []`.
  if (from + limit > MAX_RESULT_WINDOW) {
    return {
      data: [],
      pagination: createPagination(0, page, limit),
      facets: includeFacets ? {} : undefined,
    }
  }

  // Dataset filters (parent-child): resolve a humId allowlist from the Dataset
  // index first, so the Research query can constrain by it.
  let humIdFilter: string[] | null = null
  if (hasDatasetFilters(params)) {
    humIdFilter = await getHumIdsByDatasetFilters(params)
    if (humIdFilter.length === 0) {
      // No matching datasets, return empty result
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        facets: includeFacets ? {} : undefined,
      }
    }
  }

  // Build the Research query. BilingualText documents do not need a lang filter.
  const must: estypes.QueryDslQueryContainer[] = []

  // Status filter logic:
  // - If explicit status requested, use it (defense-in-depth permission check)
  // - Otherwise, apply default authorization filter
  if (requestedStatus) {
    must.push({ term: { status: requestedStatus } })

    // For non-admin authenticated users requesting non-published status, also filter by uids
    if (authUser && !authUser.isAdmin && requestedStatus !== "published") {
      must.push({ term: { uids: authUser.userId } })
    }
  } else {
    // No explicit status requested - apply default authorization filter
    const statusFilter = buildStatusFilter(authUser)
    if (statusFilter) {
      must.push(statusFilter)
    }
  }

  if (humId) {
    must.push({ term: { humId } })
  }

  if (humIdFilter) {
    must.push({ terms: { humId: humIdFilter } })
  }

  // Full-text search
  // multi_match (title/summary/humId) と、Dataset index で datasetId マッチから引いた humId 集合を
  // OR 合流する。これで "JGAD000002" を入れても親 Research (hum0001) がヒットする。
  if (q) {
    const datasetHumIds = await getHumIdsByDatasetIdQuery(q)
    const qShould: estypes.QueryDslQueryContainer[] = [buildResearchMultiMatchQuery(q)]
    if (datasetHumIds.length > 0) {
      qShould.push({ terms: { humId: datasetHumIds } })
    }
    must.push({ bool: { should: qShould, minimum_should_match: 1 } })
  }

  // Date range filters
  must.push(...buildResearchDateRangeFilters({
    minDatePublished, maxDatePublished, minDateModified, maxDateModified,
  }))

  // Sort configuration
  const sortSpec = buildResearchSortSpec(resolvedSort, order, lang, !!q)

  interface ResearchAggs {
    all_humIds?: estypes.AggregationsTermsAggregateBase<{ key: string; doc_count: number }>
  }

  const researchQuery = must.length > 0 ? { bool: { must } } : { match_all: {} }
  const res = await esClient.search<EsResearch, ResearchAggs>({
    index: ES_INDEX.research,
    from,
    size: limit,
    query: researchQuery,
    sort: sortSpec,
    _source: ["humId", "title", "versionIds", "latestVersion", "dataProvider", "summary", "uids", "status"],
    track_total_hits: true,
    // Aggregate all matching humIds for facet query (only when facets requested and no humIdFilter)
    ...(includeFacets && !humIdFilter ? {
      aggs: { all_humIds: { terms: { field: "humId", size: 10000 } } },
    } : {}),
  })

  const baseAll = res.hits.hits
    .map(hit => hit._source)
    .filter((doc): doc is EsResearch => !!doc)
    .map(doc => EsResearchSchema.pick({
      humId: true, title: true, versionIds: true, latestVersion: true, dataProvider: true, summary: true, uids: true, status: true,
    }).parse(doc))

  // Defense-in-depth: ES side should have already filtered by latestVersion
  // mapping, but if a stale/broken doc slips through we drop it here and emit
  // an error log so the mismatch is observable. `pagination.total` is corrected
  // below so the page count tracks the visible rows; we accept the per-page
  // discrepancy in exchange for surfacing the underlying mapping bug.
  const base = baseAll.filter(doc => canAccessResearchDoc(authUser, doc))
  const postFilterExcluded = baseAll.length - base.length
  if (postFilterExcluded > 0) {
    const leakedHumIds = baseAll
      .filter(doc => !canAccessResearchDoc(authUser, doc))
      .map(doc => doc.humId)
    logger.error(
      `searchResearches post-filter excluded ${postFilterExcluded} document(s) that ES query should have filtered out. Check ES index mapping for latestVersion.`,
      { humIds: leakedHumIds },
    )
  }

  // Fetch version and dataset details
  const rvIds = base.flatMap(doc => doc.versionIds)
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, (doc: unknown) => ResearchVersionSchema.parse(doc))

  // datasets is now { datasetId, version }[], convert to ES IDs
  const dsRefs = Array.from(rvMap.values()).flatMap(rv => rv.datasets)
  const dsIds = uniq(dsRefs.map(ref => `${ref.datasetId}-${ref.version}`))
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, (doc: unknown) => EsDatasetSchema.parse(doc))

  // Helper to extract text from BilingualTextValue
  const extractText = (value: { ja: { text: string } | null; en: { text: string } | null } | null | undefined): string => {
    if (!value) return ""
    return value[lang]?.text ?? value.ja?.text ?? value.en?.text ?? ""
  }

  // Helper to extract string from BilingualText
  const extractStr = (value: { ja: string | null; en: string | null } | null | undefined): string => {
    if (!value) return ""
    return value[lang] ?? value.ja ?? value.en ?? ""
  }

  const data: ResearchSummary[] = base.map(d => {
    // For non-owner users, only include versions up to latestVersion
    let effectiveVersionIds = d.versionIds
    if (!isOwnerOrAdmin(authUser, d.uids ?? []) && d.latestVersion) {
      const publishedNum = parseVersionNum(d.latestVersion)
      effectiveVersionIds = d.versionIds.filter(id => {
        const version = id.split("-").pop() ?? ""
        return parseVersionNum(version) <= publishedNum
      })
    }
    const rvs = effectiveVersionIds.map(id => rvMap.get(id)).filter((x): x is ResearchVersion => !!x)
    const datasetRefs = rvs.flatMap(rv => rv.datasets)
    const datasets = datasetRefs.map(ref => dsMap.get(`${ref.datasetId}-${ref.version}`)).filter((x): x is EsDataset => !!x)

    const versions = rvs.map(rv => ({ version: rv.version, releaseDate: rv.versionReleaseDate }))
    const methods = extractText(d.summary?.methods)
    const datasetIds = uniq(datasets.map(ds => ds.datasetId))
    // typeOfData is now BilingualText, extract as array with both languages
    const typeOfData = uniq(datasets.map(ds => extractStr(ds.typeOfData)).filter(x => !!x))
    const platforms = uniq(
      datasets
        .flatMap(ds => ds.experiments.map(e => extractText(e.data.Platform)))
        .filter(p => !!p),
    )
    const targets = extractText(d.summary?.targets)
    // dataProvider.name is BilingualTextValue, extract text
    const dataProvider = uniq((d.dataProvider ?? []).map(p => extractText(p.name)).filter(x => !!x))
    const criteria = datasets.map(ds => ds.criteria).find(x => !!x) ?? ""

    return {
      humId: d.humId,
      lang,
      title: d.title,
      versions,
      methods,
      datasetIds,
      typeOfData,
      platforms,
      targets,
      dataProvider,
      criteria,
      status: isOwnerOrAdmin(authUser, d.uids ?? []) ? d.status : "published" as const,
    }
  })

  const total = esTotal(res.hits.total) - postFilterExcluded

  // Get facets from Dataset index if requested (lang filter removed)
  let facets: FacetsMap | undefined
  if (includeFacets) {
    const datasetFacetQuery: estypes.QueryDslQueryContainer[] = []
    if (humIdFilter) {
      // Dataset filter already narrowed humIds
      datasetFacetQuery.push({ terms: { humId: humIdFilter } })
    } else {
      // Use all matching humIds from Research aggregation (not just current page)
      const allHumIdBuckets = res.aggregations?.all_humIds?.buckets
      const allHumIds = Array.isArray(allHumIdBuckets)
        ? allHumIdBuckets.map(b => b.key)
        : []
      if (allHumIds.length > 0) {
        datasetFacetQuery.push({ terms: { humId: allHumIds } })
      }
    }

    const facetRes = await esClient.search({
      index: ES_INDEX.dataset,
      size: 0,
      query: datasetFacetQuery.length > 0 ? { bool: { must: datasetFacetQuery } } : { match_all: {} },
      aggs: buildFacetAggregations("humId"),
    })

    facets = extractFacets(facetRes.aggregations as unknown as Record<string, unknown>)
  }

  return {
    data,
    pagination: createPagination(total, page, limit),
    facets,
  }
}
