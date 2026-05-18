/**
 * DDBJ Search API entry detail wrappers
 *
 * Only the resource types and fields required for the template endpoints are
 * exposed here. The shape is intentionally narrow: each fetcher returns just
 * the subset of fields that the mapping layer needs.
 */
import { fetchJson } from "./client"

export interface SraExperimentDetail {
  identifier: string
  title?: string | null
  description?: string | null
  datePublished?: string | null
  libraryStrategy?: string[] | null
  librarySource?: string[] | null
  librarySelection?: string[] | null
  libraryLayout?: string | null
  libraryName?: string | null
  libraryConstructionProtocol?: string | null
  platform?: string | null
  instrumentModel?: string[] | null
}

export interface SraSampleDetail {
  identifier: string
  title?: string | null
  description?: string | null
  organism?: { identifier?: string | null; name?: string | null } | null
}

export interface SraSubmissionDetail {
  identifier: string
  title?: string | null
  description?: string | null
  datePublished?: string | null
}

export interface BiosampleDetail {
  identifier: string
  title?: string | null
  description?: string | null
  organism?: { identifier?: string | null; name?: string | null } | null
  // properties は xmltodict 出力なので構造に揺れがある。raw として保持し、
  // attribute parser がここから harmonized_name / attribute_name を取り出す。
  properties?: unknown
}

const fetchEntry = async <T>(
  resource: string,
  id: string,
  requestId?: string,
): Promise<T | null> =>
  fetchJson<T>(`/entries/${resource}/${encodeURIComponent(id)}`, { requestId })

export const fetchSraSubmission = (
  accession: string,
  requestId?: string,
): Promise<SraSubmissionDetail | null> =>
  fetchEntry<SraSubmissionDetail>("sra-submission", accession, requestId)

export const fetchSraExperiment = (
  accession: string,
  requestId?: string,
): Promise<SraExperimentDetail | null> =>
  fetchEntry<SraExperimentDetail>("sra-experiment", accession, requestId)

export const fetchSraSample = (
  accession: string,
  requestId?: string,
): Promise<SraSampleDetail | null> =>
  fetchEntry<SraSampleDetail>("sra-sample", accession, requestId)

export const fetchBiosample = (
  accession: string,
  requestId?: string,
): Promise<BiosampleDetail | null> =>
  fetchEntry<BiosampleDetail>("biosample", accession, requestId)
