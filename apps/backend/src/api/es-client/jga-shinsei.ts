/**
 * JGA Shinsei ES query functions
 *
 * DS / DU 申請データの read-only クエリ。
 * admin 認証前提で全フィールドをそのまま返す。
 */
import type { z } from "zod"

import { ES_INDEX, esClient } from "@/api/es-client/client"
import { esTotal } from "@/api/es-client/utils"
import { NotFoundError } from "@/api/routes/errors"
import {
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
} from "@/api/types"
import type { DsApplicationTransformed, DuApplicationTransformed } from "@/api/types"

// === Generic Helpers ===

const listApplications = async <T>(
  index: string,
  sortField: string,
  schema: z.ZodType<T>,
  page: number,
  limit: number,
): Promise<{ hits: T[]; total: number }> => {
  const from = (page - 1) * limit
  const res = await esClient.search({
    index,
    query: { match_all: {} },
    sort: [{ [sortField]: "asc" }],
    from,
    size: limit,
  })
  const total = esTotal(res.hits.total)
  const hits = res.hits.hits
    .filter((h) => h._source != null)
    .map((h) => schema.parse(h._source))
  return { hits, total }
}

const getApplication = async <T>(
  index: string,
  id: string,
  schema: z.ZodType<T>,
  resourceName: string,
): Promise<T> => {
  const res = await esClient.get({ index, id }, { ignore: [404] })
  if (!res.found || !res._source) {
    throw NotFoundError.forResource(resourceName, id)
  }
  return schema.parse(res._source)
}

// === DS Applications ===

export const listDsApplications = (page: number, limit: number) =>
  listApplications<DsApplicationTransformed>(
    ES_INDEX.jgaShinseiDs, "jdsId", DsApplicationTransformedSchema, page, limit,
  )

export const getDsApplication = (jdsId: string) =>
  getApplication<DsApplicationTransformed>(
    ES_INDEX.jgaShinseiDs, jdsId, DsApplicationTransformedSchema, "DS Application",
  )

// === DU Applications ===

export const listDuApplications = (page: number, limit: number) =>
  listApplications<DuApplicationTransformed>(
    ES_INDEX.jgaShinseiDu, "jduId", DuApplicationTransformedSchema, page, limit,
  )

export const getDuApplication = (jduId: string) =>
  getApplication<DuApplicationTransformed>(
    ES_INDEX.jgaShinseiDu, jduId, DuApplicationTransformedSchema, "DU Application",
  )
