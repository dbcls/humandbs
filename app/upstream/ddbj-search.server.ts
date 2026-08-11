/**
 * Asking DDBJ Search for one entry.
 *
 * This is the whole of the portal's contact with it, and the module tests
 * replace when they exercise the refresh. It answers null for an accession
 * DDBJ Search does not hold and throws for anything else, which is the
 * difference between "upstream does not know this" and "upstream did not
 * answer": the first drops a row, the second fails the source and leaves every
 * previous row in place (docs/data-model.md の「外部キャッシュ」).
 */

const BASE_URL = "https://ddbj.nig.ac.jp/search/api/entries"

export interface ArchiveEntry {
  datePublished?: string | null
  dateModified?: string | null
}

export async function fetchArchiveEntry(
  resource: string,
  accession: string,
): Promise<ArchiveEntry | null> {
  const response = await fetch(`${BASE_URL}/${resource}/${encodeURIComponent(accession)}`, {
    headers: { accept: "application/json" },
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`DDBJ Search answered ${response.status} for ${accession}`)
  }
  return await response.json() as ArchiveEntry
}
