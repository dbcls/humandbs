/**
 * DDBJ Search API dblink wrapper
 *
 * GET /dblink/{type}/{id} returns the cross-references for an accession in
 * { identifier, type, dbXrefs: [{ identifier, type, url }] } form. The full
 * dblink graph (21 accession types) is provided via DuckDB by the server; we
 * only need a filtered view here, so we fetch all and let the caller pick by
 * target type.
 */
import { fetchJson } from "./client"

export interface DbXref {
  identifier: string
  type: string
  url?: string
}

export interface DblinkResponse {
  identifier: string
  type: string
  dbXrefs: DbXref[]
}

export const DblinkAccessionType = {
  SRA_SUBMISSION: "sra-submission",
  SRA_STUDY: "sra-study",
  SRA_EXPERIMENT: "sra-experiment",
  SRA_RUN: "sra-run",
  SRA_SAMPLE: "sra-sample",
  SRA_ANALYSIS: "sra-analysis",
  JGA_STUDY: "jga-study",
  JGA_DATASET: "jga-dataset",
  JGA_DAC: "jga-dac",
  JGA_POLICY: "jga-policy",
  BIOPROJECT: "bioproject",
  BIOSAMPLE: "biosample",
  HUMANDBS: "humandbs",
  // JGAS dblink exposes pubmed IDs for the study's reference paper.
  PUBMED: "pubmed",
} as const

export type DblinkAccessionType =
  (typeof DblinkAccessionType)[keyof typeof DblinkAccessionType]

/**
 * Fetch the full dblink response. Returns null if the source accession is
 * unknown to DDBJ (404). Other errors propagate as DdbjSearchApiError.
 *
 * NOTE: The /dblink endpoint streams JSON; the body is still a single JSON
 * object and `fetch().json()` buffers it. For our usage (1 hop per call,
 * dozens of links each), buffering is fine.
 */
export const fetchDblink = async (
  type: DblinkAccessionType,
  id: string,
  requestId?: string,
): Promise<DblinkResponse | null> =>
  fetchJson<DblinkResponse>(
    `/dblink/${type}/${encodeURIComponent(id)}`,
    { requestId },
  )

/**
 * Convenience: return only linked identifiers of a specific target type.
 */
export const fetchDblinkTargets = async (
  type: DblinkAccessionType,
  id: string,
  target: DblinkAccessionType,
  requestId?: string,
): Promise<string[]> => {
  const res = await fetchDblink(type, id, requestId)
  if (!res) return []
  return res.dbXrefs
    .filter((x) => x.type === target)
    .map((x) => x.identifier)
}
