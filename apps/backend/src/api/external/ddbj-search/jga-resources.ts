/**
 * JGAD → parent JGAS accession lookup.
 *
 * Uses DDBJ Search API `/dblink/jga-dataset/{id}?target=jga-study` (via the
 * shared `fetchDblink` client) to pull just the parent JGA Study accession
 * from the JGAD's dbXrefs graph. Results are cached in-process per-datasetId
 * with the JGA_PARENT_STUDY TTL. Errors from `fetchDblink` propagate — the
 * route-side `getParentJgaStudyIdSafe` wraps this in a try/catch and returns
 * `null` on failure so the dataset response itself never fails on this.
 */
import { CACHE_TTL } from "@/api/constants"

import { TtlMapCache } from "../../utils/ttl-cache"

import {
  DblinkAccessionType,
  fetchDblink,
} from "./dblink"

const parentStudyCache = new TtlMapCache<string | null>(CACHE_TTL.JGA_PARENT_STUDY)

interface FetchOptions {
  requestId?: string
}

/**
 * Fetch the parent JGA Study accession for a JGAD id.
 *
 * - Returns the first `dbXrefs[type === "jga-study"].identifier`, or `null`
 *   when the dataset isn't linked to a study (or the dataset is unknown to
 *   DDBJ Search — `fetchDblink` returns `null` on 404).
 * - Errors propagate as `DdbjSearchApiError` from the underlying client.
 * - Cached in-process by TTL. `null` results are cached to avoid repeated
 *   dead lookups. Errors are NOT cached so transient DDBJ hiccups retry.
 */
export const fetchJgaParentStudyId = async (
  datasetId: string,
  opts: FetchOptions = {},
): Promise<string | null> => {
  const cached = parentStudyCache.get(datasetId)
  if (cached !== undefined) {
    return cached
  }

  const dblink = await fetchDblink(
    DblinkAccessionType.JGA_DATASET,
    datasetId,
    opts.requestId,
  )
  const parent = dblink?.dbXrefs.find((x) => x.type === "jga-study")?.identifier ?? null
  parentStudyCache.set(datasetId, parent)
  return parent
}

export { parentStudyCache }
