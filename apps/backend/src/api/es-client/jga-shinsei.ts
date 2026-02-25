/**
 * JGA Shinsei ES query functions
 *
 * DS / DU 申請データの read-only クエリ。
 * admin 認証前提で全フィールドをそのまま返す。
 */
import { ES_INDEX, esClient } from "@/api/es-client/client"
import { esTotal } from "@/api/es-client/utils"
import { NotFoundError } from "@/api/routes/errors"

// === DS Applications ===

export const listDsApplications = async (page: number, limit: number) => {
  const from = (page - 1) * limit
  const res = await esClient.search({
    index: ES_INDEX.jgaShinseiDs,
    body: {
      query: { match_all: {} },
      sort: [{ jdsId: "asc" }],
      from,
      size: limit,
    },
  })
  const total = esTotal(res.hits.total)
  const hits = res.hits.hits.map((h) => h._source as Record<string, unknown>)
  return { hits, total }
}

export const getDsApplication = async (jdsId: string) => {
  try {
    const res = await esClient.get({
      index: ES_INDEX.jgaShinseiDs,
      id: jdsId,
    })
    return res._source as Record<string, unknown>
  } catch (error) {
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 404) {
        throw NotFoundError.forResource("DS Application", jdsId)
      }
    }
    throw error
  }
}

// === DU Applications ===

export const listDuApplications = async (page: number, limit: number) => {
  const from = (page - 1) * limit
  const res = await esClient.search({
    index: ES_INDEX.jgaShinseiDu,
    body: {
      query: { match_all: {} },
      sort: [{ jduId: "asc" }],
      from,
      size: limit,
    },
  })
  const total = esTotal(res.hits.total)
  const hits = res.hits.hits.map((h) => h._source as Record<string, unknown>)
  return { hits, total }
}

export const getDuApplication = async (jduId: string) => {
  try {
    const res = await esClient.get({
      index: ES_INDEX.jgaShinseiDu,
      id: jduId,
    })
    return res._source as Record<string, unknown>
  } catch (error) {
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 404) {
        throw NotFoundError.forResource("DU Application", jduId)
      }
    }
    throw error
  }
}
