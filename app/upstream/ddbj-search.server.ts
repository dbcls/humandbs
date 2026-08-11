/**
 * Asking DDBJ Search for one entry.
 *
 * This is the whole of the portal's contact with it, and the module tests
 * replace when they exercise the refresh or a draft seeded from DRA. It answers
 * null for an accession DDBJ Search does not hold and throws for anything else,
 * which is the difference between "upstream does not know this" and "upstream
 * did not answer": the first drops a row, the second fails the source and leaves
 * every previous row in place (docs/data-model.md の「外部キャッシュ」).
 */

const BASE_URL = "https://ddbj.nig.ac.jp/search/api"

export interface ArchiveEntry {
  datePublished?: string | null
  dateModified?: string | null
}

/**
 * What an SRA entry says about the library it came from, narrowed to what a
 * draft reads. Every field is optional because the same shape answers for a
 * submission, which carries none of them, and for an experiment, which carries
 * most.
 */
export interface SraEntry {
  identifier?: string | null
  title?: string | null
  description?: string | null
  libraryStrategy?: string[] | null
  libraryLayout?: string | null
  instrumentModel?: string[] | null
  /** The submitted XML as JSON. Read only for the spot length. */
  properties?: unknown
}

/** One edge of the cross-reference graph. */
export interface DbXref {
  type: string
  identifier: string
}

async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${BASE_URL}/${path}`, { headers: { accept: "application/json" } })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`DDBJ Search answered ${response.status} for ${path}`)
  }
  return await response.json() as T
}

export async function fetchArchiveEntry(
  resource: string,
  accession: string,
): Promise<ArchiveEntry | null> {
  return getJson<ArchiveEntry>(`entries/${resource}/${encodeURIComponent(accession)}`)
}

export async function fetchSraEntry(
  resource: string,
  accession: string,
): Promise<SraEntry | null> {
  return getJson<SraEntry>(`entries/${resource}/${encodeURIComponent(accession)}`)
}

/**
 * Everything an accession is linked to.
 *
 * **The cross-references on the entry itself are cut off at a hundred per kind**
 * while this endpoint returns them all, which is the difference between seeing a
 * submission's hundred and fiftieth experiment and silently not seeing it.
 */
export async function fetchDbXrefs(resource: string, accession: string): Promise<DbXref[]> {
  const answer = await getJson<{ dbXrefs?: DbXref[] | null }>(
    `dblink/${resource}/${encodeURIComponent(accession)}`,
  )
  return answer?.dbXrefs ?? []
}
