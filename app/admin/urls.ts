/**
 * The addresses of the management screens.
 *
 * They sit under `/admin`, which `SCREEN_PATHS` already reserves, and they take
 * a language prefix like every other page — the interface is translated even
 * though what it manages is not addressed by language. A research is addressed
 * by its identity rather than by its hum label: the label is a pin that may not
 * exist yet, and creating a research before a number has been issued is the
 * ordinary case.
 */

export function adminPath(): string {
  return "/admin"
}

export function adminResearchListPath(): string {
  return "/admin/research"
}

export function adminResearchPath(researchId: string): string {
  return `/admin/research/${researchId}`
}

export function adminDraftPath(researchId: string, draftId: string): string {
  return `${adminResearchPath(researchId)}/draft/${draftId}`
}

export function adminDraftDatasetsPath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/dataset`
}

/** Where a draft is looked over one last time and turned into a version. */
export function adminDraftPublishPath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/publish`
}

export function adminDraftDatasetPath(
  researchId: string,
  draftId: string,
  datasetId: string,
): string {
  return `${adminDraftDatasetsPath(researchId, draftId)}/${datasetId}`
}

/**
 * The two addresses an open editor talks to rather than navigates to. **They
 * carry no language prefix**: nothing they return is interface text, and a page
 * that changed language mid-edit would otherwise heartbeat to a second address.
 */
export function draftPresencePath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/presence`
}

export function draftUndoPath(researchId: string, draftId: string, undoId: string): string {
  return `${adminDraftPath(researchId, draftId)}/undo/${undoId}`
}

export interface ListingQuery {
  keyword: string
  status: string | null
  flags: readonly string[]
  page: number
}

/**
 * Only what differs from the default is written, so an unfiltered listing is
 * the bare address and the same filter always reads the same way.
 */
export function listingQuery(query: ListingQuery): string {
  const search = new URLSearchParams()
  if (query.keyword !== "") search.set("q", query.keyword)
  if (query.status !== null) search.set("status", query.status)
  for (const flag of query.flags) search.append("flag", flag)
  if (query.page > 1) search.set("page", String(query.page))
  const written = search.toString()
  return written === "" ? "" : `?${written}`
}
