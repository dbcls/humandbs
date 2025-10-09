import { Client, HttpConnection } from "@elastic/elasticsearch"

import { type DatasetDoc, type ResearchDoc, ResearchDocSchema, type ResearchesQuery, type ResearchesResponse, type ResearchVersionDoc } from "@/types"

const createEsClient = () => {
  const ES_HOST = "http://humandbs-elasticsearch-dev:9200" // TODO: use env variable
  const esClient = new Client({
    node: ES_HOST,
    Connection: HttpConnection,
  })

  return esClient
}

const esClient = createEsClient()

export const searchResearches = async (params: ResearchesQuery): Promise<ResearchesResponse> => {
  const { page, limit, lang, sort, order } = params
  const from = (page - 1) * limit

  const must = [
    { term: { lang } }, // Filter by language
  ]

  let sortConfig = {}
  switch (sort) {
    case "humId":
      sortConfig = { humId: { order } }
      break
    case "title":
      sortConfig = { "title.kw": { order } }
      break
    default:
      sortConfig = { humId: { order } }
  }

  const response = await esClient.search<ResearchDoc>({
    index: "research",
    body: {
      query: {
        bool: { must },
      },
      sort: [sortConfig],
      from,
      size: limit,
      _source: ["humId", "lang", "title", "versions", "dataProvider", "summary"],
    },
  })

  const ShallowSchema = ResearchDocSchema.pick({
    humId: true,
    lang: true,
    title: true,
    versions: true,
    dataProvider: true,
    summary: true,
  })
  const researchDocs = response.hits.hits.map(hit => {
    return ShallowSchema.parse(hit._source)
  })

  const total = typeof response.hits.total === "number"
    ? response.hits.total
    : response.hits.total?.value ?? 0
  const totalPages = Math.ceil(total / limit)

  // Bulk get version details using mget
  const allResearchVersionIds = researchDocs.flatMap(doc => doc.versions.map(v => v))
  const versionMap = new Map<string, ResearchVersionDoc>()
  if (allResearchVersionIds.length > 0) {
    const versionResponse = await esClient.mget<ResearchVersionDoc>({
      index: "research-version",
      body: {
        ids: allResearchVersionIds,
      },
    })
    versionResponse.docs.forEach(doc => {
      if (doc.found && doc._source) { // TODO: fix here
        versionMap.set(doc._id, doc._source as ResearchVersionDoc) // TODO: fix here
      }
    })
  }

  const allDatasetDocIds = new Set<string>()
  for (const researchVersion of versionMap.values()) {
    for (const datasetDocId of researchVersion.datasets) {
      allDatasetDocIds.add(datasetDocId)
    }
  }

  const datasetMap = new Map<string, DatasetDoc>()
  if (allDatasetDocIds.size > 0) {
    const datasetResponse = await esClient.mget<DatasetDoc>({
      index: "dataset",
      body: {
        ids: Array.from(allDatasetDocIds),
      },
    })
    datasetResponse.docs.forEach(doc => {
      if (doc.found && doc._source) { // TODO: fix here
        datasetMap.set(doc._id, doc._source as DatasetDoc) // TODO: fix here
      }
    })
  }

  const researches = researchDocs.map(doc => {
    const versionDocs = doc.versions.map(v => versionMap.get(v)).filter((v): v is ResearchVersionDoc => v !== undefined)
    const datasetDocs = versionDocs.flatMap(v => v.datasets.map(d => datasetMap.get(d))).filter((d): d is DatasetDoc => d !== undefined)

    const versions = versionDocs.map(v => ({
      version: v.version,
      releaseDate: v.releaseDate,
    }))
    const methods = doc.summary?.methods ?? ""
    const datasetIds = Array.from(new Set(datasetDocs.map(d => d.datasetId)))
    const typeOfData = Array.from(
      new Set(datasetDocs.flatMap(d => d.typeOfData ?? []).filter(Boolean)),
    ) as string[]
    const platforms = Array.from(
      new Set(
        datasetDocs
          .flatMap(d => d.experiments.map(e => e.data.Platform))
          .filter((p): p is string => !!p),
      ),
    )
    const targets = doc.summary?.targets ?? ""
    const dataProvider = Array.from(
      new Set((doc.dataProvider ?? []).map(dp => dp.name).filter(Boolean)),
    ) as string[]
    const criteria =
      Array.from(
        new Set(datasetDocs.flatMap(d => d.criteria ?? []).filter(Boolean)),
      )[0] ?? ""

    return {
      humId: doc.humId,
      lang: doc.lang,
      title: doc.title,
      versions,
      methods,
      datasetIds,
      typeOfData,
      platforms,
      targets,
      dataProvider,
      criteria,
    }
  })

  return {
    data: researches,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: from + limit < total,
      hasPrev: from > 0,
    },
  }
}

export const getDatasetById = async (datasetId: string, lang: string, version: number) => {
  const response = await esClient.get<DatasetDoc>({
    index: "dataset",
    id: `${datasetId}-${version}-${lang}`,
  }, {
    ignore: [404],
  })
  if (!response.found) {
    return null
  }
  return response._source as DatasetDoc
}
