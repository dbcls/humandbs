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

/**
 * Where a research is started from what an approved application already says.
 * It is a fixed segment beside the identities, which is why a research is never
 * addressed by anything that could be the word `upstream`.
 */
export function adminUpstreamResearchPath(): string {
  return "/admin/research/upstream"
}

export function adminResearchPath(researchId: string): string {
  return `/admin/research/${researchId}`
}

/**
 * The research's box. It sits outside any draft: the box belongs to the
 * research, holds no versions, and switching a file is a separate operation
 * from publishing one (docs/files.md の「画面」).
 */
export function adminResearchFilesPath(researchId: string): string {
  return `${adminResearchPath(researchId)}/files`
}

/**
 * Where the box screen asks for a signature. **It carries no language prefix**:
 * nothing it answers with is interface text, and an upload that changed
 * language mid-transfer would otherwise be talking to a second address.
 */
export function fileUploadPath(researchId: string): string {
  return `${adminResearchFilesPath(researchId)}/upload`
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

/** The share link, what has been said about the draft, and what is unresolved. */
export function adminDraftReviewPath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/review`
}

/**
 * Where the editing screens post a comment. It answers with the thread rather
 * than with a redirect, because the editor holds unsaved work and must not
 * navigate; the review screen and the preview post to their own pages instead.
 */
export function draftCommentsPath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/comments`
}

/** Where datasets are added to a draft from what an archive already holds. */
export function adminUpstreamDatasetPath(researchId: string, draftId: string): string {
  return `${adminDraftDatasetsPath(researchId, draftId)}/upstream`
}

/** What an upstream screen was looking at, kept so the address can be shared. */
export function upstreamQuery(query: {
  keyword?: string
  applicationId?: string | null
  accession?: string | null
}): string {
  const search = new URLSearchParams()
  if (query.keyword !== undefined && query.keyword !== "") search.set("q", query.keyword)
  if (query.applicationId != null && query.applicationId !== "") {
    search.set("application", query.applicationId)
  }
  if (query.accession != null && query.accession !== "") search.set("accession", query.accession)
  const written = search.toString()
  return written === "" ? "" : `?${written}`
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

/**
 * The catalog. It hangs off `/admin` rather than off a research: a key and a
 * vocabulary belong to the portal, not to one study.
 */
export function adminCatalogPath(): string {
  return "/admin/catalog"
}

export function adminVocabularyPath(code: string): string {
  return `${adminCatalogPath()}/vocabulary/${encodeURIComponent(code)}`
}

/**
 * Site content. Documents are addressed by identity like everything else here:
 * a slug is an address readers hold, it can be corrected, and the screen that
 * corrects it cannot be reached through the value it is about to change.
 */
export function adminContentsPath(): string {
  return "/admin/contents"
}

export function adminDocumentPath(documentId: string): string {
  return `${adminContentsPath()}/document/${documentId}`
}

export function adminNewsListPath(): string {
  return `${adminContentsPath()}/news`
}

export function adminNewsPath(newsId: string): string {
  return `${adminNewsListPath()}/${newsId}`
}

/** The `common/` box: the images and PDFs the article bodies link to. */
export function adminContentFilesPath(): string {
  return `${adminContentsPath()}/files`
}

/**
 * Where that box asks for a signature. **No language prefix**: nothing it
 * answers with is interface text, and an upload that changed language
 * mid-transfer would be talking to a second address.
 */
export function contentFileUploadPath(): string {
  return `${adminContentFilesPath()}/upload`
}

/**
 * Where an editing screen looks a vocabulary's candidates up. The catalog does
 * not carry the terms, so the box asks for the few that match what was typed
 * (`queries.server.ts` の `findTerms`).
 */
export function termsPath(): string {
  return "/admin/terms"
}
