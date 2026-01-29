import { Client, HttpConnection } from "@elastic/elasticsearch"
import type { estypes } from "@elastic/elasticsearch"

import type {
  DatasetSearchQuery,
  DatasetSearchResponse,
  ResearchSearchQuery,
  ResearchSearchResponse,
  FacetsMap,
  EsDatasetDoc,
  EsResearchDoc,
  EsResearchVersionDoc,
  EsResearchDetail,
  ResearchSummary,
  LangType,
  DatasetVersionItem,
  LangVersionQuery,
} from "@/api/types"
import {
  EsDatasetDocSchema,
  EsResearchDocSchema,
  EsResearchVersionDocSchema,
  EsResearchDetailSchema,
} from "@/api/types"

const ES_INDEX = {
  research: "research",
  researchVersion: "research-version",
  dataset: "dataset",
}

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "http://humandbs-elasticsearch-dev:9200"

const createEsClient = () => {
  const esClient = new Client({
    node: ES_HOST,
    Connection: HttpConnection,
  })

  return esClient
}

const esClient = createEsClient()

// === utils ===

const esTotal = (t: number | { value: number } | undefined) => {
  return typeof t === "number" ? t : t?.value ?? 0
}

const uniq = <T>(arr: T[]): T[] => {
  return Array.from(new Set(arr))
}

const mgetMap = async <T>(
  index: string,
  ids: string[],
  parse: (doc: unknown) => T,
): Promise<Map<string, T>> => {
  if (ids.length === 0) return new Map()
  const { docs } = await esClient.mget<T>({
    index,
    body: { ids: uniq(ids) },
  })
  const m = new Map<string, T>()
  for (const doc of docs as { found?: boolean; _id?: string; _source?: unknown }[]) {
    if (doc.found && doc._id && doc._source) {
      m.set(doc._id, parse(doc._source))
    }
  }
  return m
}

// === API Functions ===

export const getResearchDoc = async (
  humId: string,
  lang: LangType = "en",
): Promise<EsResearchDoc | null> => {
  const id = `${humId}-${lang}`
  const res = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id,
  }, { ignore: [404] })
  return res.found && res._source ? EsResearchDocSchema.parse(res._source) : null
}

export const getResearchVersion = async (
  humId: string,
  { lang = "en", version }: LangVersionQuery,
): Promise<EsResearchVersionDoc | null> => {
  if (version) {
    const id = `${humId}-${version}-${lang}`
    const res = await esClient.get<EsResearchVersionDoc>({
      index: ES_INDEX.researchVersion,
      id,
    }, { ignore: [404] })
    return res.found && res._source ? EsResearchVersionDocSchema.parse(res._source) : null
  }

  // If the version is not specified, get the latest version
  const { hits } = await esClient.search<EsResearchVersionDoc>({
    index: ES_INDEX.researchVersion,
    size: 1,
    query: {
      bool: {
        must: [{ term: { humId } }, { term: { lang } }],
      },
    },
    sort: [
      { version: { order: "desc" } },
      { releaseDate: { order: "desc" } },
    ],
    _source: true,
    track_total_hits: false,
  })
  const hit = hits.hits[0]
  return hit && hit._source ? EsResearchVersionDocSchema.parse(hit._source) : null
}

export const getResearchDetail = async (
  humId: string,
  { lang = "en", version }: LangVersionQuery,
): Promise<EsResearchDetail | null> => {
  const [researchDoc, researchVersionDoc] = await Promise.all([
    getResearchDoc(humId, lang),
    getResearchVersion(humId, { lang, version }),
  ])
  if (!researchDoc || !researchVersionDoc) return null

  const dsIds = researchVersionDoc.datasets
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, EsDatasetDocSchema.parse)
  const datasets = dsIds.map(id => dsMap.get(id)).filter((x): x is EsDatasetDoc => !!x)

  const { versions, ...researchDocRest } = researchDoc

  return EsResearchDetailSchema.parse({
    ...researchDocRest,
    humVersionId: researchVersionDoc.humVersionId,
    version: researchVersionDoc.version,
    releaseDate: researchVersionDoc.releaseDate,
    releaseNote: researchVersionDoc.releaseNote,
    datasets,
  })
}

export const listResearchVersions = async (
  humId: string,
  lang: LangType = "en",
): Promise<EsResearchVersionDoc[] | null> => {
  const res = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id: `${humId}-${lang}`,
  }, { ignore: [404] })
  if (!res.found || !res._source) return null
  const researchDoc = EsResearchDocSchema.parse(res._source)

  const rvIds = researchDoc.versions ?? []
  if (rvIds.length === 0) return []
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, EsResearchVersionDocSchema.parse)

  return rvIds
    .map(id => rvMap.get(id))
    .filter((x): x is EsResearchVersionDoc => !!x)
}

export const listResearchVersionsSorted = async (
  humId: string,
  lang: LangType = "en",
): Promise<EsResearchVersionDoc[] | null> => {
  const rows = await listResearchVersions(humId, lang)
  if (!rows) return null
  const verNum = (v: string) => Number(/^v(\d+)$/.exec(v)?.[1] ?? -1)
  rows.sort((a, b) => verNum(b.version) - verNum(a.version))
  return rows
}

export const getDataset = async (
  datasetId: string,
  { lang = "en", version }: LangVersionQuery,
): Promise<EsDatasetDoc | null> => {
  if (version) {
    const id = `${datasetId}-${version}-${lang}`
    const res = await esClient.get<EsDatasetDoc>({
      index: ES_INDEX.dataset,
      id,
    }, { ignore: [404] })
    return res.found && res._source ? EsDatasetDocSchema.parse(res._source) : null
  }

  // If the version is not specified, get the latest version
  const { hits } = await esClient.search<EsDatasetDoc>({
    index: ES_INDEX.dataset,
    size: 1,
    query: {
      bool: {
        must: [{ term: { datasetId } }, { term: { lang } }],
      },
    },
    sort: [
      { version: { order: "desc" } },
      { releaseDate: { order: "desc" } },
    ],
    _source: true,
    track_total_hits: false,
  })
  const hit = hits.hits[0]
  return hit && hit._source ? EsDatasetDocSchema.parse(hit._source) : null
}

export const listDatasetVersions = async (
  datasetId: string,
  lang: LangType = "en",
): Promise<DatasetVersionItem[]> => {
  const res = await esClient.search<EsDatasetDoc>({
    index: ES_INDEX.dataset,
    size: 500,
    query: { bool: { must: [{ term: { datasetId } }, { term: { lang } }] } },
    sort: [
      { version: { order: "desc" } },
      { releaseDate: { order: "desc" } },
    ],
    _source: ["version", "typeOfData", "criteria", "releaseDate"],
    track_total_hits: false,
  })

  const rows = res.hits.hits
    .map(h => h._source)
    .filter((d): d is EsDatasetDoc => !!d)

  return rows.map(d => ({
    version: d.version,
    typeOfData: d.typeOfData ?? null,
    criteria: d.criteria ?? null,
    releaseDate: d.releaseDate ?? null,
  }))
}

// === Search Functions ===

const splitComma = (s: string | undefined): string[] =>
  s ? s.split(",").map(v => v.trim()).filter(Boolean) : []

const buildDatasetFilterClauses = (params: DatasetSearchQuery | ResearchSearchQuery): estypes.QueryDslQueryContainer[] => {
  const must: estypes.QueryDslQueryContainer[] = []

  // humId filter (Dataset only)
  if ("humId" in params && params.humId) {
    must.push({ term: { humId: params.humId } })
  }

  // criteria filter (comma-separated for OR)
  const criteriaValues = splitComma(params.criteria)
  if (criteriaValues.length > 0) {
    must.push({ terms: { criteria: criteriaValues } })
  }

  // typeOfData filter (partial match, Dataset only)
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

  // assayType filter (comma-separated for OR) - nested query on experiments.refined
  const assayTypes = splitComma(params.assayType)
  if (assayTypes.length > 0) {
    must.push({
      nested: {
        path: "experiments",
        query: { terms: { "experiments.refined.assayType": assayTypes } },
      },
    })
  }

  // disease filter (partial match) - double nested query on experiments.refined.diseases
  if (params.disease) {
    must.push({
      nested: {
        path: "experiments",
        query: {
          nested: {
            path: "experiments.refined.diseases",
            query: {
              wildcard: { "experiments.refined.diseases.label": { value: `*${params.disease}*`, case_insensitive: true } },
            },
          },
        },
      },
    })
  }

  // tissue filter (comma-separated for OR) - nested query on experiments.refined
  const tissues = splitComma(params.tissue)
  if (tissues.length > 0) {
    must.push({
      nested: {
        path: "experiments",
        query: { terms: { "experiments.refined.tissues": tissues } },
      },
    })
  }

  // population filter (comma-separated for OR) - nested query on experiments.refined
  const populations = splitComma(params.population)
  if (populations.length > 0) {
    must.push({
      nested: {
        path: "experiments",
        query: { terms: { "experiments.refined.population": populations } },
      },
    })
  }

  // platform filter (partial match on vendor) - nested query on experiments.refined
  if (params.platform) {
    must.push({
      nested: {
        path: "experiments",
        query: {
          wildcard: { "experiments.refined.platformVendor": { value: `*${params.platform}*`, case_insensitive: true } },
        },
      },
    })
  }

  // fileType filter (comma-separated for OR) - nested query on experiments.refined
  const fileTypes = splitComma(params.fileType)
  if (fileTypes.length > 0) {
    must.push({
      nested: {
        path: "experiments",
        query: { terms: { "experiments.refined.fileTypes": fileTypes } },
      },
    })
  }

  // Boolean filters - nested query on experiments.refined
  if (params.hasHealthyControl !== undefined) {
    const healthStatusValues = params.hasHealthyControl ? ["healthy", "mixed"] : ["affected"]
    must.push({
      nested: {
        path: "experiments",
        query: { terms: { "experiments.refined.healthStatus": healthStatusValues } },
      },
    })
  }
  if (params.hasTumor !== undefined) {
    must.push({
      nested: {
        path: "experiments",
        query: { term: { "experiments.refined.isTumor": params.hasTumor } },
      },
    })
  }
  if (params.hasCellLine !== undefined) {
    must.push({
      nested: {
        path: "experiments",
        query: { exists: { field: "experiments.refined.cellLine" } },
      },
    })
  }

  // Subject count filters - nested query with script aggregation
  // Note: For exact count filtering, we need to aggregate across experiments
  // This is a simplified filter that checks if any experiment has subjects
  if (params.minSubjects !== undefined) {
    must.push({
      nested: {
        path: "experiments",
        query: { range: { "experiments.refined.subjectCount": { gte: 1 } } },
      },
    })
  }

  return must
}

const buildFacetAggregations = (): Record<string, estypes.AggregationsAggregationContainer> => ({
  criteria: { terms: { field: "criteria", size: 10 } },
  assayType: {
    nested: { path: "experiments" },
    aggs: {
      types: {
        terms: { field: "experiments.refined.assayType", size: 50 },
        aggs: { dataset_count: { reverse_nested: {} } },
      },
    },
  },
  disease: {
    nested: { path: "experiments" },
    aggs: {
      diseases_nested: {
        nested: { path: "experiments.refined.diseases" },
        aggs: {
          labels: {
            terms: { field: "experiments.refined.diseases.label", size: 50 },
            aggs: {
              dataset_count: {
                reverse_nested: {},
              },
            },
          },
        },
      },
    },
  },
  tissue: {
    nested: { path: "experiments" },
    aggs: {
      tissues: {
        terms: { field: "experiments.refined.tissues", size: 50 },
        aggs: { dataset_count: { reverse_nested: {} } },
      },
    },
  },
  population: {
    nested: { path: "experiments" },
    aggs: {
      populations: {
        terms: { field: "experiments.refined.population", size: 50 },
        aggs: { dataset_count: { reverse_nested: {} } },
      },
    },
  },
  platformVendor: {
    nested: { path: "experiments" },
    aggs: {
      vendors: {
        terms: { field: "experiments.refined.platformVendor", size: 50 },
        aggs: { dataset_count: { reverse_nested: {} } },
      },
    },
  },
  fileType: {
    nested: { path: "experiments" },
    aggs: {
      types: {
        terms: { field: "experiments.refined.fileTypes", size: 50 },
        aggs: { dataset_count: { reverse_nested: {} } },
      },
    },
  },
  healthStatus: {
    nested: { path: "experiments" },
    aggs: {
      statuses: {
        terms: { field: "experiments.refined.healthStatus", size: 10 },
        aggs: { dataset_count: { reverse_nested: {} } },
      },
    },
  },
})

interface TermsBucket {
  key: string | number | boolean
  doc_count: number
  dataset_count?: { doc_count: number }
}
interface NestedAgg { doc_count: number; [key: string]: { buckets?: TermsBucket[] } | number | unknown }

const extractFacets = (aggs: Record<string, unknown> | undefined): FacetsMap => {
  if (!aggs) return {}
  const facets: FacetsMap = {}

  // Extract count from bucket, preferring dataset_count (reverse_nested) for nested aggs
  const extractBuckets = (buckets: TermsBucket[]) =>
    buckets.map(b => ({
      value: String(b.key),
      count: b.dataset_count?.doc_count ?? b.doc_count,
    }))

  // Recursively find buckets in nested aggregations
  const findBuckets = (obj: unknown): TermsBucket[] | null => {
    if (!obj || typeof obj !== "object") return null
    const o = obj as Record<string, unknown>

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
    const buckets = findBuckets(agg)
    if (buckets) {
      facets[key] = extractBuckets(buckets)
    }
  }

  return facets
}

export const searchDatasets = async (params: DatasetSearchQuery): Promise<DatasetSearchResponse> => {
  const { page, limit, lang, sort, order, q, includeFacets } = params
  const from = (page - 1) * limit

  // Build query
  const must: estypes.QueryDslQueryContainer[] = [{ term: { lang } }]
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
        ],
        type: "best_fields",
        fuzziness: "AUTO",
      },
    })
  }

  // Sort configuration
  // Note: subjectCount sorting would require aggregating across nested experiments,
  // which is not directly sortable. Fallback to datasetId for subjectCount sort.
  let sortSpec: estypes.Sort
  if (sort === "relevance" && q) {
    sortSpec = [{ _score: { order: "desc" } }, { datasetId: { order: "asc" } }]
  } else if (sort === "subjectCount") {
    // Cannot sort by aggregated subject count from nested experiments directly
    // Fallback to datasetId
    sortSpec = [{ datasetId: { order } }]
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

const hasDatasetFilters = (params: ResearchSearchQuery): boolean => {
  return !!(
    params.assayType ||
    params.disease ||
    params.tissue ||
    params.population ||
    params.platform ||
    params.criteria ||
    params.fileType ||
    params.hasHealthyControl !== undefined ||
    params.hasTumor !== undefined ||
    params.hasCellLine !== undefined ||
    params.minSubjects !== undefined
  )
}

const getHumIdsByDatasetFilters = async (
  params: ResearchSearchQuery,
  lang: LangType,
): Promise<string[]> => {
  const must: estypes.QueryDslQueryContainer[] = [{ term: { lang } }]
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

  const buckets = res.aggregations?.humIds?.buckets
  if (!Array.isArray(buckets)) return []
  return buckets.map(b => b.key)
}

export const searchResearches = async (params: ResearchSearchQuery): Promise<ResearchSearchResponse> => {
  const { page, limit, lang, sort, order, q, releasedAfter, releasedBefore, includeFacets } = params
  const from = (page - 1) * limit

  // Step 1: If Dataset filters are present, get humIds from Dataset index
  let humIdFilter: string[] | null = null
  if (hasDatasetFilters(params)) {
    humIdFilter = await getHumIdsByDatasetFilters(params, lang)
    if (humIdFilter.length === 0) {
      // No matching datasets, return empty result
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        facets: includeFacets ? {} : undefined,
      }
    }
  }

  // Step 2: Build Research query
  const must: estypes.QueryDslQueryContainer[] = [{ term: { lang } }]

  if (humIdFilter) {
    must.push({ terms: { humId: humIdFilter } })
  }

  // Full-text search
  if (q) {
    must.push({
      bool: {
        should: [
          { match: { "title.ja": { query: q, boost: 2 } } },
          { match: { "title.en": { query: q, boost: 2 } } },
          { match: { "summary.aims.ja.text": q } },
          { match: { "summary.aims.en.text": q } },
          { match: { "summary.methods.ja.text": q } },
          { match: { "summary.methods.en.text": q } },
          {
            nested: {
              path: "dataProvider",
              query: {
                bool: {
                  should: [
                    { match: { "dataProvider.name.ja.text": q } },
                    { match: { "dataProvider.name.en.text": q } },
                  ],
                },
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    })
  }

  // Date range filters
  if (releasedAfter) {
    must.push({ range: { lastReleaseDate: { gte: releasedAfter } } })
  }
  if (releasedBefore) {
    must.push({ range: { firstReleaseDate: { lte: releasedBefore } } })
  }

  // Sort configuration
  let sortSpec: estypes.Sort
  if (sort === "relevance" && q) {
    sortSpec = [{ _score: { order: "desc" } }, { humId: { order: "asc" } }]
  } else if (sort === "title") {
    sortSpec = [{ "title.kw": { order } }, { humId: { order: "asc" } }]
  } else if (sort === "releaseDate") {
    sortSpec = [{ lastReleaseDate: { order, missing: "_last" } }, { humId: { order: "asc" } }]
  } else {
    sortSpec = [{ humId: { order } }]
  }

  const res = await esClient.search<EsResearchDoc>({
    index: ES_INDEX.research,
    from,
    size: limit,
    query: { bool: { must } },
    sort: sortSpec,
    _source: ["humId", "lang", "title", "versions", "dataProvider", "summary"],
    track_total_hits: true,
  })

  const base = res.hits.hits
    .map(hit => hit._source)
    .filter((doc): doc is EsResearchDoc => !!doc)
    .map(doc => EsResearchDocSchema.pick({
      humId: true, lang: true, title: true, versions: true, dataProvider: true, summary: true,
    }).parse(doc))

  // Fetch version and dataset details
  const rvIds = base.flatMap(doc => doc.versions)
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, EsResearchVersionDocSchema.parse)

  const dsIds = uniq(Array.from(rvMap.values()).flatMap(rv => rv.datasets))
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, EsDatasetDocSchema.parse)

  const data: ResearchSummary[] = base.map(d => {
    const rvs = d.versions.map(id => rvMap.get(id)).filter((x): x is EsResearchVersionDoc => !!x)
    const datasets = rvs.flatMap(rv => rv.datasets.map(id => dsMap.get(id))).filter((x): x is EsDatasetDoc => !!x)

    const versions = rvs.map(rv => ({ version: rv.version, releaseDate: rv.releaseDate }))
    const methods = d.summary?.methods ?? ""
    const datasetIds = uniq(datasets.map(ds => ds.datasetId))
    const typeOfData = uniq(datasets.flatMap(ds => ds.typeOfData ?? []).filter((x): x is string => !!x))
    const platforms = uniq(
      datasets
        .flatMap(ds => ds.experiments.map(e => e.data["Platform"]))
        .filter((p): p is string => !!p),
    )
    const targets = d.summary?.targets ?? ""
    const dataProvider = uniq((d.dataProvider ?? []).map(p => p.name).filter((x): x is string => !!x))
    const criteria = uniq(datasets.flatMap(ds => ds.criteria ?? []).filter((x): x is string => !!x))[0] ?? ""

    return { humId: d.humId, lang: d.lang, title: d.title, versions, methods, datasetIds, typeOfData, platforms, targets, dataProvider, criteria }
  })

  const total = esTotal(res.hits.total)

  // Get facets from Dataset index if requested
  let facets: FacetsMap | undefined
  if (includeFacets) {
    const datasetFacetQuery: estypes.QueryDslQueryContainer[] = [{ term: { lang } }]
    if (humIdFilter) {
      datasetFacetQuery.push({ terms: { humId: humIdFilter } })
    } else if (data.length > 0) {
      datasetFacetQuery.push({ terms: { humId: data.map(d => d.humId) } })
    }

    const facetRes = await esClient.search({
      index: ES_INDEX.dataset,
      size: 0,
      query: { bool: { must: datasetFacetQuery } },
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
