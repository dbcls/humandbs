import { Client, HttpConnection } from "@elastic/elasticsearch"

import { type ResearchDoc, ResearchDocSchema, type ResearchesQuery, type ResearchesResponse, type ResearchVersionDoc } from "@/types"

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
      _source: ["humId", "lang", "title", "versions"],
    },
  })

  const ShallowSchema = ResearchDocSchema.pick({
    humId: true,
    lang: true,
    title: true,
    versions: true,
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

  const researches = researchDocs.map(doc => {
    return {
      ...doc,
      versions: doc.versions.map(version => {
        const versionDoc = versionMap.get(version)
        return {
          version: versionDoc?.version ?? "",
          releaseDate: versionDoc?.releaseDate ?? "",
        }
      },
      ),
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
