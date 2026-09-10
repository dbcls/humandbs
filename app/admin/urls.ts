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

/**
 * Whether an address belongs to the management area. **Read from the path
 * rather than from what the screen knows about itself**, because the shell is
 * chosen in the document's layout, which sits above the route tree and is drawn
 * for the error boundary too — where no loader has run.
 *
 * The path handed in has already had its language prefix taken off
 * (`public/urls.ts` の `readLocale`).
 */
export function isAdminPath(path: string): boolean {
  return path === adminPath() || path.startsWith(`${adminPath()}/`)
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

export function adminDraftUpstreamPath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/upstream`
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

/**
 * Where the draft is drawn as its page, for the pane beside the form.
 *
 * The language it draws in rides on the address because the pane's language is
 * the reader's choice: the route is registered once and answers with data, so
 * it has no language of its own to take.
 */
export function draftPagePath(researchId: string, draftId: string, locale: string): string {
  return `${adminDraftPath(researchId, draftId)}/page?lang=${locale}`
}

/** Where one dataset of a draft is drawn as its page, for the pane beside the form. */
export function datasetPagePath(
  researchId: string,
  draftId: string,
  datasetId: string,
  locale: string,
): string {
  return `${adminDraftDatasetPath(researchId, draftId, datasetId)}/page?lang=${locale}`
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
  statuses: readonly string[]
  flags: readonly string[]
  page: number
  /** The ordering to keep, or `null` when it is the one the listing opens in. */
  sort: string | null
  /** The direction to keep, or `null` when it is the one the key runs by. */
  order: string | null
  /** The page size to keep, or `null` for the default. */
  size: number | null
}

/**
 * Only what differs from the default is written, so an unfiltered listing is
 * the bare address and the same filter always reads the same way.
 */
export function listingQuery(query: ListingQuery): string {
  const search = new URLSearchParams()
  if (query.keyword !== "") search.set("q", query.keyword)
  for (const status of query.statuses) search.append("status", status)
  for (const flag of query.flags) search.append("flag", flag)
  if (query.sort !== null) search.set("sort", query.sort)
  if (query.order !== null) search.set("order", query.order)
  if (query.size !== null) search.set("size", String(query.size))
  if (query.page > 1) search.set("page", String(query.page))
  const written = search.toString()
  return written === "" ? "" : `?${written}`
}

/**
 * The fields an analysis method is described under. They hang off `/admin`
 * rather than off a research: a field belongs to the portal, not to one study.
 *
 * **The two fields a dataset carries are not here.** What they may hold is
 * settled by what the portal is rather than by what arrives in the data, so the
 * migration puts them in and nothing edits them afterwards (docs/data-model.md
 * の「catalog と語彙」).
 */
export function adminExperimentFieldsPath(): string {
  return "/admin/experiment-fields"
}

/**
 * The terms one field draws its values from.
 *
 * **The address names the field rather than the vocabulary.** Every vocabulary
 * belongs to exactly one field, so reaching the terms through the field is what
 * lets the screen be titled with what they are the terms *of* — a screen called
 * 「語彙」 can only ever be answered with "which vocabulary?".
 */
export function adminExperimentFieldPath(keyCode: string): string {
  return `${adminExperimentFieldsPath()}/${encodeURIComponent(keyCode)}`
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

/** The strip that stands above every public page. */
export function adminAlertPath(): string {
  return `${adminContentsPath()}/alert`
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

/**
 * The assistant that helps read an application. **The screens are here and the
 * service is not** — it runs beside the portal, holds no authorisation of its
 * own, and is only reachable through the address below (docs/assistant.md).
 */
export function adminAssistantPath(): string {
  return `${adminPath()}/assistant`
}

/**
 * The assistant service is accessed through the portal's authorized proxy,
 * never through its private service address.
 */
export function assistantApiPath(rest: string): string {
  return `${adminAssistantPath()}/api/${rest}`
}
