import { Client, HttpConnection } from "@elastic/elasticsearch"
import type { estypes } from "@elastic/elasticsearch"

import type { DatasetDoc, ResearchDetail, ResearchDoc, ResearchesQuery, ResearchesResponse, ResearchVersionDoc, LangType, DatasetVersionItem, LangVersionQuery, DatasetsQuery, DatasetsResponse } from "@/types"
import { ResearchDocSchema, ResearchVersionDocSchema, DatasetDocSchema, ResearchDetailSchema } from "@/types"

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

export const listResearchSummaries = async (params: ResearchesQuery): Promise<ResearchesResponse> => {
  const { page, limit, lang, sort, order } = params
  const from = (page - 1) * limit

  const sortField = sort === "title" ? "title.kw" : "humId" // sort is either "humId" or "title"
  const sortSpec = { [sortField]: { order } as const }

  const res = await esClient.search<ResearchDoc>({
    index: ES_INDEX.research,
    from,
    sort: [sortSpec],
    size: limit,
    query: { term: { lang } },
    _source: ["humId", "lang", "title", "versions", "dataProvider", "summary"],
    track_total_hits: true,
  })

  const base = res.hits.hits
    .map(hit => hit._source)
    .filter((doc): doc is ResearchDoc => !!doc)
    .map(doc => ResearchDocSchema.pick({
      humId: true, lang: true, title: true, versions: true, dataProvider: true, summary: true,
    }).parse(doc))

  const rvIds = base.flatMap(doc => doc.versions)
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, ResearchVersionDocSchema.parse)

  const dsIds = uniq(Array.from(rvMap.values()).flatMap(rv => rv.datasets))
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, DatasetDocSchema.parse)

  const data = base.map(d => {
    const rvs = d.versions.map(id => rvMap.get(id)).filter((x): x is ResearchVersionDoc => !!x)
    const datasets = rvs.flatMap(rv => rv.datasets.map(id => dsMap.get(id))).filter((x): x is DatasetDoc => !!x)

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
  }
}

export const getResearchDoc = async (
  humId: string,
  lang: LangType = "en",
): Promise<ResearchDoc | null> => {
  const id = `${humId}-${lang}`
  const res = await esClient.get<ResearchDoc>({
    index: ES_INDEX.research,
    id,
  }, { ignore: [404] })
  return res.found && res._source ? ResearchDocSchema.parse(res._source) : null
}

export const getResearchVersion = async (
  humId: string,
  { lang = "en", version }: LangVersionQuery,
): Promise<ResearchVersionDoc | null> => {
  if (version) {
    const id = `${humId}-${version}-${lang}`
    const res = await esClient.get<ResearchVersionDoc>({
      index: ES_INDEX.researchVersion,
      id,
    }, { ignore: [404] })
    return res.found && res._source ? ResearchVersionDocSchema.parse(res._source) : null
  }

  // If the version is not specified, get the latest version
  const { hits } = await esClient.search<ResearchVersionDoc>({
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
  return hit && hit._source ? ResearchVersionDocSchema.parse(hit._source) : null
}

export const getResearchDetail = async (
  humId: string,
  { lang = "en", version }: LangVersionQuery,
): Promise<ResearchDetail | null> => {
  const [researchDoc, researchVersionDoc] = await Promise.all([
    getResearchDoc(humId, lang),
    getResearchVersion(humId, { lang, version }),
  ])
  if (!researchDoc || !researchVersionDoc) return null

  const dsIds = researchVersionDoc.datasets
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, DatasetDocSchema.parse)
  const datasets = dsIds.map(id => dsMap.get(id)).filter((x): x is DatasetDoc => !!x)

  const { versions, ...researchDocRest } = researchDoc

  return ResearchDetailSchema.parse({
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
): Promise<ResearchVersionDoc[] | null> => {
  const res = await esClient.get<ResearchDoc>({
    index: ES_INDEX.research,
    id: `${humId}-${lang}`,
  }, { ignore: [404] })
  if (!res.found || !res._source) return null
  const researchDoc = ResearchDocSchema.parse(res._source)

  const rvIds = researchDoc.versions ?? []
  if (rvIds.length === 0) return []
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, ResearchVersionDocSchema.parse)

  return rvIds
    .map(id => rvMap.get(id))
    .filter((x): x is ResearchVersionDoc => !!x)
}

export const listResearchVersionsSorted = async (
  humId: string,
  lang: LangType = "en",
): Promise<ResearchVersionDoc[] | null> => {
  const rows = await listResearchVersions(humId, lang)
  if (!rows) return null
  const verNum = (v: string) => Number(/^v(\d+)$/.exec(v)?.[1] ?? -1)
  rows.sort((a, b) => verNum(b.version) - verNum(a.version))
  return rows
}

export const listDatasetsLatest = async (params: DatasetsQuery): Promise<DatasetsResponse> => {
  const { page, limit, lang, sort, order } = params
  const from = (page - 1) * limit

  interface Aggs {
    uniq_ids: estypes.AggregationsCardinalityAggregate
  }

  const res = await esClient.search<DatasetDoc, Aggs>({
    index: ES_INDEX.dataset,
    from,
    size: limit,
    query: { term: { lang } },
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
    sort: [
      { [sort]: { order, missing: "_last" } },
      { datasetId: { order: "asc" } },
    ],
    _source: false,
    track_total_hits: true,
    aggs: { uniq_ids: { cardinality: { field: "datasetId" } } },
  })

  interface InnerHit { _id: string; _source?: DatasetDoc }
  interface Hit { inner_hits?: { latest?: { hits: { hits: InnerHit[] } } } }

  const hits = (res.hits.hits as Hit[])
    .flatMap(hit => hit.inner_hits?.latest?.hits.hits ?? [])
    .map(inner => inner._source)
    .filter((src): src is DatasetDoc => !!src)
    .map(src => DatasetDocSchema.parse(src))

  const total = esTotal(res.aggregations?.uniq_ids?.value ?? 0)

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
  }
}

export const getDataset = async (
  datasetId: string,
  { lang = "en", version }: LangVersionQuery,
): Promise<DatasetDoc | null> => {
  if (version) {
    const id = `${datasetId}-${version}-${lang}`
    const res = await esClient.get<DatasetDoc>({
      index: ES_INDEX.dataset,
      id,
    }, { ignore: [404] })
    return res.found && res._source ? DatasetDocSchema.parse(res._source) : null
  }

  // If the version is not specified, get the latest version
  const { hits } = await esClient.search<DatasetDoc>({
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
  return hit && hit._source ? DatasetDocSchema.parse(hit._source) : null
}

export const listDatasetVersions = async (
  datasetId: string,
  lang: LangType = "en",
): Promise<DatasetVersionItem[]> => {
  const res = await esClient.search<DatasetDoc>({
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
    .filter((d): d is DatasetDoc => !!d)

  return rows.map(d => ({
    version: d.version,
    typeOfData: d.typeOfData ?? null,
    criteria: d.criteria ?? null,
    releaseDate: d.releaseDate ?? null,
  }))
}
