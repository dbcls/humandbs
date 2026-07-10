/**
 * DDBJ Search "resources" wrapper for the JGA parent-study lookup.
 *
 * Distinct from `client.ts` (which targets the `/search/api` base) because JGA
 * relations live under a different base path — `/search/resources/jga-dataset/
 * _doc/{JGAD}` — and speak a different envelope (Elasticsearch `_doc` with
 * `found` + `_source.dbXrefs`). Returns the parent JGAS accession identifier
 * or `null`; throws `DdbjSearchApiError` on network / 5xx / timeout so the
 * safe wrapper can null-coalesce.
 */
import { CACHE_TTL } from "@/api/constants"
import { logger } from "@/api/logger"

import { TtlMapCache } from "../../utils/ttl-cache"

import { DdbjSearchApiError } from "./client"

const RESOURCES_BASE_URL =
  process.env.HUMANDBS_DDBJ_SEARCH_RESOURCES_BASE_URL ??
  "https://ddbj.nig.ac.jp/search/resources"

const DEFAULT_TIMEOUT_MS = 3000
const TIMEOUT_MS = (() => {
  const raw = process.env.HUMANDBS_DDBJ_SEARCH_RESOURCES_TIMEOUT_MS
  if (!raw) return DEFAULT_TIMEOUT_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
})()

interface JgadDbXref {
  identifier: string
  type: string
  url?: string
}

interface JgadDocResponse {
  found: boolean
  _source?: {
    dbXrefs?: JgadDbXref[]
  }
}

const parentStudyCache = new TtlMapCache<string | null>(CACHE_TTL.JGA_PARENT_STUDY)

interface FetchOptions {
  requestId?: string
}

/**
 * Fetch the parent JGA Study accession for a JGA Dataset ID from DDBJ Search.
 *
 * - Returns the first `dbXrefs[type === "jga-study"].identifier`, or `null`
 *   when the dataset isn't found or has no linked study.
 * - Throws `DdbjSearchApiError` on network error / non-404 non-2xx / timeout /
 *   invalid JSON. Callers should catch and null-coalesce (`getParentJgaStudyIdSafe`).
 * - Cached in-process by TTL. `null` results are cached too so that "no
 *   parent" datasets don't re-hit DDBJ per request. Errors are NOT cached
 *   so a transient DDBJ hiccup naturally retries on the next request.
 */
export const fetchJgaParentStudyId = async (
  datasetId: string,
  opts: FetchOptions = {},
): Promise<string | null> => {
  const cached = parentStudyCache.get(datasetId)
  if (cached !== undefined) {
    return cached
  }

  const url = `${RESOURCES_BASE_URL}/jga-dataset/_doc/${encodeURIComponent(datasetId)}`
  const headers: Record<string, string> = {
    Accept: "application/json",
  }
  if (opts.requestId) {
    headers["X-Request-ID"] = opts.requestId
  }

  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    logger.warn("DDBJ Search resources network error", {
      url,
      error: err instanceof Error ? err.message : String(err),
    })
    throw new DdbjSearchApiError(
      `DDBJ Search resources network error: ${url}`,
      502,
    )
  }

  if (res.status === 404) {
    parentStudyCache.set(datasetId, null)
    return null
  }
  if (!res.ok) {
    logger.warn("DDBJ Search resources error response", {
      url,
      status: res.status,
    })
    throw new DdbjSearchApiError(
      `DDBJ Search resources returned ${res.status} for ${url}`,
      res.status,
    )
  }

  let body: JgadDocResponse
  try {
    body = (await res.json()) as JgadDocResponse
  } catch (err) {
    logger.warn("DDBJ Search resources JSON parse error", {
      url,
      error: err instanceof Error ? err.message : String(err),
    })
    throw new DdbjSearchApiError(
      `DDBJ Search resources returned invalid JSON: ${url}`,
      502,
    )
  }

  if (!body.found) {
    parentStudyCache.set(datasetId, null)
    return null
  }

  const parent = body._source?.dbXrefs?.find((x) => x.type === "jga-study")?.identifier ?? null
  parentStudyCache.set(datasetId, parent)
  return parent
}

export { parentStudyCache }
