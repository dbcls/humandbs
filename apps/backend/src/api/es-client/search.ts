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

import { buildStatusFilter, getPublishedHumIds } from "@/api/es-client/auth"
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { NESTED_TERMS_FILTERS, NESTED_RANGE_FILTERS, hasDatasetFilters } from "@/api/es-client/filters"
import {
  splitComma,
  nestedFacetAgg,
  doubleNestedFacetAgg,
  platformFacetAgg,
} from "@/api/es-client/helpers"
import {
  nestedTermsQuery,
  nestedRangeQuery,
  doubleNestedWildcardQuery,
  doubleNestedTermsQuery,
  nestedBooleanTermQuery,
} from "@/api/es-client/query-helpers"
import { esTotal, mgetMap, uniq } from "@/api/es-client/utils"
import {
  EsDatasetDocSchema,
  EsResearchDocSchema,
  EsResearchVersionDocSchema,
} from "@/api/types"
import type {
  DatasetSearchQuery,
  DatasetSearchResponse,
  ResearchSearchQuery,
  ResearchSearchResponse,
  FacetsMap,
  EsDatasetDoc,
  EsResearchDoc,
  EsResearchVersionDoc,
  ResearchSummary,
  AuthUser,
} from "@/api/types"

// === Types ===

type QueryContainer = estypes.QueryDslQueryContainer
type FilterParams = Record<string, unknown>

// === Filter Clause Builders ===

const buildNestedTermsFilters = (params: FilterParams): QueryContainer[] => {
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

const buildNestedRangeFilters = (params: FilterParams): QueryContainer[] => {
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

const buildDatasetFilterClauses = (params: DatasetSearchQuery | ResearchSearchQuery): QueryContainer[] => {
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

  // typeOfData filter (partial match, bilingual wildcard)
  if ("typeOfData" in params && params.typeOfData) {
    must.push({
      bool: {
        should: [
          { wildcard: { "typeOfData.ja": { value: `*${params.typeOfData}*`, case_insensitive: true } } },
          { wildcard: { "typeOfData.en": { value: `*${params.typeOfData}*`, case_insensitive: true } } },
        ],
        minimum_should_match: 1,
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

  // === Platform filter (vendor + model matching) ===
  // Platform values are in format "Vendor||Model" (e.g., "Illumina||NovaSeq 6000")
  // We split by "||" and match against both platformVendor and platformModel fields
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
                bool: {
                  must: [
                    { term: { "experiments.searchable.platformVendor": vendor } },
                    { term: { "experiments.searchable.platformModel": model } },
                  ],
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
              bool: {
                should: [
                  { term: { "experiments.searchable.platformVendor": platform } },
                  { term: { "experiments.searchable.platformModel": platform } },
                ],
                minimum_should_match: 1,
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
    must.push(nestedBooleanTermQuery("experiments", "experiments.searchable.isTumor", params.isTumor))
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

const buildFacetAggregations = (): Record<string, estypes.AggregationsAggregationContainer> => ({
  // Top-level facets
  criteria: { terms: { field: "criteria", size: 10 } },

  // Basic nested facets
  assayType: nestedFacetAgg("experiments.searchable.assayType"),
  tissues: nestedFacetAgg("experiments.searchable.tissues"),
  population: nestedFacetAgg("experiments.searchable.population"),
  platform: platformFacetAgg(),
  fileTypes: nestedFacetAgg("experiments.searchable.fileTypes"),
  healthStatus: nestedFacetAgg("experiments.searchable.healthStatus", 10),

  // Extended facets
  subjectCountType: nestedFacetAgg("experiments.searchable.subjectCountType", 10),
  isTumor: nestedFacetAgg("experiments.searchable.isTumor", 5),
  cellLine: nestedFacetAgg("experiments.searchable.cellLine"),
  sex: nestedFacetAgg("experiments.searchable.sex", 10),
  ageGroup: nestedFacetAgg("experiments.searchable.ageGroup", 10),
  libraryKits: nestedFacetAgg("experiments.searchable.libraryKits"),
  readType: nestedFacetAgg("experiments.searchable.readType", 10),
  referenceGenome: nestedFacetAgg("experiments.searchable.referenceGenome"),
  processedDataTypes: nestedFacetAgg("experiments.searchable.processedDataTypes"),
  hasPhenotypeData: nestedFacetAgg("experiments.searchable.hasPhenotypeData", 5),

  // Double-nested facets
  disease: doubleNestedFacetAgg(
    "experiments.searchable.diseases",
    "experiments.searchable.diseases.label",
  ),
  diseaseIcd10: doubleNestedFacetAgg(
    "experiments.searchable.diseases",
    "experiments.searchable.diseases.icd10",
  ),
  policyId: doubleNestedFacetAgg(
    "experiments.searchable.policies",
    "experiments.searchable.policies.id",
  ),
})

// === Facet Extraction ===

interface TermsBucket {
  key: string | number | boolean
  doc_count: number
  dataset_count?: { doc_count: number }
}

interface CompositeBucket {
  key: { vendor?: string | null; model?: string | null }
  doc_count: number
  dataset_count?: { doc_count: number }
}

const extractFacets = (aggs: Record<string, unknown> | undefined): FacetsMap => {
  if (!aggs) return {}
  const facets: FacetsMap = {}

  // Extract count from bucket, preferring dataset_count (reverse_nested) for nested aggs
  const extractBuckets = (buckets: TermsBucket[]) =>
    buckets.map(b => ({
      value: String(b.key),
      count: b.dataset_count?.doc_count ?? b.doc_count,
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
          count: b.dataset_count?.doc_count ?? b.doc_count,
        }
      })
      .filter((item): item is { value: string; count: number } => item !== null)

  // Find vendorModel composite aggregation for platform
  const findPlatformBuckets = (obj: unknown): CompositeBucket[] | null => {
    if (!obj || typeof obj !== "object") return null
    const o = obj as Record<string, unknown>

    // Check for vendorModel composite aggregation
    if ("vendorModel" in o && o.vendorModel && typeof o.vendorModel === "object") {
      const vendorModel = o.vendorModel as Record<string, unknown>
      if ("buckets" in vendorModel && Array.isArray(vendorModel.buckets)) {
        return vendorModel.buckets as CompositeBucket[]
      }
    }

    // Search nested objects
    for (const [key, val] of Object.entries(o)) {
      if (key === "doc_count") continue
      if (typeof val === "object" && val !== null) {
        const found = findPlatformBuckets(val)
        if (found) return found
      }
    }
    return null
  }

  // Recursively find buckets in nested aggregations
  const findBuckets = (obj: unknown): TermsBucket[] | null => {
    if (!obj || typeof obj !== "object") return null
    const o = obj as Record<string, unknown>

    // Skip vendorModel (handled separately for platform)
    if ("vendorModel" in o) return null

    // Direct buckets
    if ("buckets" in o && Array.isArray(o.buckets)) {
      return o.buckets as TermsBucket[]
    }

    // Search nested objects (skip doc_count)
    for (const [key, val] of Object.entries(o)) {
      if (key === "doc_count") continue
      if (typeof val === "object" && val !== null) {
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

  return facets
}

// === Dataset Search ===

export const searchDatasets = async (
  params: DatasetSearchQuery,
  authUser: AuthUser | null = null,
): Promise<DatasetSearchResponse> => {
  const { page, limit, sort, order, q, includeFacets } = params
  const from = (page - 1) * limit

  // Build query (lang filter removed - documents are BilingualText)
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
    must.push({
      multi_match: {
        query: q,
        fields: [
          "typeOfData.ja^2",
          "typeOfData.en^2",
          "experiments.header.ja.text",
          "experiments.header.en.text",
          "experiments.searchable.targets",
        ],
        type: "best_fields",
        fuzziness: "AUTO",
      },
    })
  }

  // Sort configuration
  let sortSpec: estypes.Sort
  if (sort === "relevance" && q) {
    sortSpec = [{ _score: { order: "desc" } }, { datasetId: { order: "asc" } }]
  } else if (sort === "releaseDate") {
    sortSpec = [{ releaseDate: { order, missing: "_last" } }, { datasetId: { order: "asc" } }]
  } else {
    sortSpec = [{ datasetId: { order } }]
  }

  interface Aggs {
    uniq_ids: estypes.AggregationsCardinalityAggregate
    [key: string]: estypes.AggregationsAggregate
  }

  const res = await esClient.search<EsDatasetDoc, Aggs>({
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
          { version: { order: "desc" as const } },
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
      ...(includeFacets ? buildFacetAggregations() : {}),
    },
  })

  interface InnerHit { _id: string; _source?: EsDatasetDoc }
  interface Hit { inner_hits?: { latest?: { hits: { hits: InnerHit[] } } } }

  const hits = (res.hits.hits as Hit[])
    .flatMap(hit => hit.inner_hits?.latest?.hits.hits ?? [])
    .map(inner => inner._source)
    .filter((src): src is EsDatasetDoc => !!src)
    .map(src => EsDatasetDocSchema.parse(src))

  const total = esTotal(res.aggregations?.uniq_ids?.value ?? 0)
  const facets = includeFacets ? extractFacets(res.aggregations as unknown as Record<string, unknown>) : undefined

  return {
    data: hits,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      hasNext: from + limit < total,
      hasPrev: from > 0,
    },
    facets,
  }
}

// === Research Search ===

const getHumIdsByDatasetFilters = async (
  params: ResearchSearchQuery,
): Promise<string[]> => {
  // lang filter removed - documents are BilingualText
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

export const searchResearches = async (
  params: ResearchSearchQuery,
  authUser: AuthUser | null = null,
): Promise<ResearchSearchResponse> => {
  const {
    page, limit, lang, sort, order, q,
    releasedAfter, releasedBefore,
    minDatePublished, maxDatePublished, minDateModified, maxDateModified,
    includeFacets, status: requestedStatus,
  } = params
  const from = (page - 1) * limit

  // Step 1: If Dataset filters are present, get humIds from Dataset index
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

  // Step 2: Build Research query (lang filter removed - documents are BilingualText)
  const must: estypes.QueryDslQueryContainer[] = []

  // Status filter logic:
  // - If explicit status requested, use it (with authorization check)
  // - Otherwise, apply default authorization filter
  if (requestedStatus) {
    // Check authorization for requested status
    // public: can only request "published"
    // authenticated: can request "draft", "review", "published" (own resources only)
    // admin: can request any status including "deleted"
    if (!authUser && requestedStatus !== "published") {
      // Public user requesting non-published - return empty (forbidden handled in route)
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        facets: includeFacets ? {} : undefined,
      }
    }
    if (authUser && !authUser.isAdmin && requestedStatus === "deleted") {
      // Non-admin requesting deleted - return empty
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        facets: includeFacets ? {} : undefined,
      }
    }

    // Apply status filter
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

  if (humIdFilter) {
    must.push({ terms: { humId: humIdFilter } })
  }

  // Full-text search
  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: [
          "title.ja^2",
          "title.en^2",
          "summary.aims.ja.text",
          "summary.aims.en.text",
          "summary.methods.ja.text",
          "summary.methods.en.text",
          "summary.targets.ja.text",
          "summary.targets.en.text",
        ],
        type: "best_fields",
        fuzziness: "AUTO",
      },
    })
  }

  // Date range filters (legacy: releasedAfter/releasedBefore)
  if (releasedAfter) {
    must.push({ range: { dateModified: { gte: releasedAfter } } })
  }
  if (releasedBefore) {
    must.push({ range: { datePublished: { lte: releasedBefore } } })
  }

  // Date range filters (new: minDatePublished/maxDatePublished, minDateModified/maxDateModified)
  if (minDatePublished) {
    must.push({ range: { datePublished: { gte: minDatePublished } } })
  }
  if (maxDatePublished) {
    must.push({ range: { datePublished: { lte: maxDatePublished } } })
  }
  if (minDateModified) {
    must.push({ range: { dateModified: { gte: minDateModified } } })
  }
  if (maxDateModified) {
    must.push({ range: { dateModified: { lte: maxDateModified } } })
  }

  // Sort configuration
  let sortSpec: estypes.Sort
  if (sort === "relevance" && q) {
    // Relevance sort with full-text search query
    sortSpec = [{ _score: { order: "desc" } }, { humId: { order: "asc" } }]
  } else if (sort === "relevance") {
    // Relevance sort without query - fall back to humId
    sortSpec = [{ humId: { order } }]
  } else if (sort === "title") {
    sortSpec = [{ "title.kw": { order } }, { humId: { order: "asc" } }]
  } else if (sort === "releaseDate") {
    sortSpec = [{ dateModified: { order, missing: "_last" } }, { humId: { order: "asc" } }]
  } else {
    sortSpec = [{ humId: { order } }]
  }

  const res = await esClient.search<EsResearchDoc>({
    index: ES_INDEX.research,
    from,
    size: limit,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    sort: sortSpec,
    _source: ["humId", "title", "versionIds", "dataProvider", "summary"],
    track_total_hits: true,
  })

  const base = res.hits.hits
    .map(hit => hit._source)
    .filter((doc): doc is EsResearchDoc => !!doc)
    .map(doc => EsResearchDocSchema.pick({
      humId: true, title: true, versionIds: true, dataProvider: true, summary: true,
    }).parse(doc))

  // Fetch version and dataset details
  const rvIds = base.flatMap(doc => doc.versionIds)
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, (doc: unknown) => EsResearchVersionDocSchema.parse(doc))

  // datasets is now { datasetId, version }[], convert to ES IDs
  const dsRefs = Array.from(rvMap.values()).flatMap(rv => rv.datasets)
  const dsIds = uniq(dsRefs.map(ref => `${ref.datasetId}-${ref.version}`))
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, (doc: unknown) => EsDatasetDocSchema.parse(doc))

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
    const rvs = d.versionIds.map(id => rvMap.get(id)).filter((x): x is EsResearchVersionDoc => !!x)
    const datasetRefs = rvs.flatMap(rv => rv.datasets)
    const datasets = datasetRefs.map(ref => dsMap.get(`${ref.datasetId}-${ref.version}`)).filter((x): x is EsDatasetDoc => !!x)

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

    return { humId: d.humId, lang, title: extractStr(d.title), versions, methods, datasetIds, typeOfData, platforms, targets, dataProvider, criteria }
  })

  const total = esTotal(res.hits.total)

  // Get facets from Dataset index if requested (lang filter removed)
  let facets: FacetsMap | undefined
  if (includeFacets) {
    const datasetFacetQuery: estypes.QueryDslQueryContainer[] = []
    if (humIdFilter) {
      datasetFacetQuery.push({ terms: { humId: humIdFilter } })
    } else if (data.length > 0) {
      datasetFacetQuery.push({ terms: { humId: data.map(d => d.humId) } })
    }

    const facetRes = await esClient.search({
      index: ES_INDEX.dataset,
      size: 0,
      query: datasetFacetQuery.length > 0 ? { bool: { must: datasetFacetQuery } } : { match_all: {} },
      aggs: buildFacetAggregations(),
    })

    facets = extractFacets(facetRes.aggregations as unknown as Record<string, unknown>)
  }

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      hasNext: from + limit < total,
      hasPrev: from > 0,
    },
    facets,
  }
}
