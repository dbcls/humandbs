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
 * Where a research is started from what an approved application already has.
 * It is a fixed segment beside the identities, which is why a research is never
 * addressed by anything that could be the word `upstream`.
 */
export function adminUpstreamResearchPath(): string {
  return "/admin/research/upstream"
}

/** One approval branch: what it brings, and — where the hum names one — the research it is for. */
export function adminUpstreamBranchPath(applicationId: string): string {
  return `${adminUpstreamResearchPath()}/${encodeURIComponent(applicationId)}`
}

export function adminResearchPath(researchId: string): string {
  return `/admin/research/${researchId}`
}

/**
 * The research's prefix. It sits outside any draft: the prefix belongs to the
 * research, holds no versions, and switching a file is a separate operation
 * from publishing one.
 */
export function adminResearchFilesPath(researchId: string): string {
  return `${adminResearchPath(researchId)}/files`
}

/**
 * Where the files screen requests a signature. **It has no language prefix**:
 * nothing it responds with is interface text, and an upload that changed
 * language mid-transfer would otherwise be talking to a second address.
 */
export function fileUploadPath(researchId: string): string {
  return `${adminResearchFilesPath(researchId)}/upload`
}

/**
 * Where a private file of the research is fetched from: a redirect to a signed
 * address of the store. No language prefix, for the reason the upload has none.
 */
export function fileDownloadPath(researchId: string): string {
  return `${adminResearchFilesPath(researchId)}/download`
}

/** The download of one private file. The name goes in the query, so it can hold anything a name can. */
export function fileDownloadHref(researchId: string, name: string): string {
  return `${fileDownloadPath(researchId)}?${new URLSearchParams({ name }).toString()}`
}

/**
 * What a published version lists, for reading. A version is addressed by its
 * number rather than its row: updating one puts a new row under the same
 * number, and the address should still open.
 */
export function adminVersionDatasetsPath(researchId: string, number: number): string {
  return `${adminResearchPath(researchId)}/version/${number}/dataset`
}

export function adminDraftPath(researchId: string, draftId: string): string {
  return `${adminResearchPath(researchId)}/draft/${draftId}`
}

/** Where a source is chosen and imported into the draft. */
export function adminDraftImportPath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/import`
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
 * Where the editing screens post a comment. It responds with the thread rather
 * than with a redirect, because the editor holds unsaved work and must not
 * navigate; the review screen and the preview post to their own pages instead.
 *
 * **No language prefix** (`routes.ts` の `editing`).
 */
export function draftCommentsPath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/comments`
}

/** Where the editing screen sends the draft's name (`routes/admin-draft-name.ts`). */
export function draftNamePath(researchId: string, draftId: string): string {
  return `${adminDraftPath(researchId, draftId)}/name`
}

/**
 * Where the draft is drawn as its page, for the pane beside the form.
 *
 * The language it draws in rides on the address because the pane's language is
 * the reader's choice: the route is registered once and responds with data, so
 * it has no language of its own to take. **Putting a prefix in front of one of
 * these finds no route at all** — the router responds with 405 without a request
 * leaving the browser, and the open editor is replaced by the error page.
 */
export function draftPagePath(researchId: string, draftId: string, locale: string): string {
  return `${adminDraftPath(researchId, draftId)}/page?lang=${locale}`
}

/**
 * Where one dataset of a draft is drawn as its page, for the pane beside the
 * form. **No language prefix**, as above.
 */
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
  applicationId?: string | null
  accession?: string | null
}): string {
  const search = new URLSearchParams()
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
 * What every listing has in its address beside the conditions: the word it
 * was searched by, and how the result is presented.
 */
interface ListingPresentation {
  keyword: string
  page: number
  /** The ordering to keep, or `null` when it is the one the listing opens in. */
  sort: string | null
  /** The direction to keep, or `null` when it is the one the key runs by. */
  order: string | null
  /** The page size to keep, or `null` for the default. */
  size: number | null
}

export interface ListingQuery extends ListingPresentation {
  statuses: readonly string[]
}

/** The listing of approval branches narrows by one axis of its own. */
export interface BranchListingQuery extends ListingPresentation {
  branchStatuses: readonly string[]
}

/**
 * Only what differs from the default is written, so an unfiltered listing is
 * the bare address and the same filter always reads the same way.
 *
 * **The conditions arrive named** rather than as fields of their own, because
 * what differs between two listings is which axes they have — the word, the
 * ordering, the size and the page are written the same way by both, and a
 * second copy of that rule is a second way for two addresses to disagree.
 */
function listingAddress(
  query: ListingPresentation,
  axes: Readonly<Record<string, readonly string[]>>,
): string {
  const search = new URLSearchParams()
  if (query.keyword !== "") search.set("q", query.keyword)
  for (const [name, values] of Object.entries(axes)) {
    for (const value of values) search.append(name, value)
  }
  if (query.sort !== null) search.set("sort", query.sort)
  if (query.order !== null) search.set("order", query.order)
  if (query.size !== null) search.set("size", String(query.size))
  if (query.page > 1) search.set("page", String(query.page))
  const written = search.toString()
  return written === "" ? "" : `?${written}`
}

export function listingQuery(query: ListingQuery): string {
  return listingAddress(query, { status: query.statuses })
}

export function branchListingQuery(query: BranchListingQuery): string {
  return listingAddress(query, {
    status: query.branchStatuses,
  })
}

/**
 * The listing of articles narrows by three axes of its own: whether the article
 * keeps revisions, and what each of the two languages is up to.
 *
 * **It has no ordering.** Articles are listed by slug and nothing else —
 * the order is the address space rather than a presentation of it.
 */
export interface ContentsListingQuery extends ListingPresentation {
  versioning: readonly string[]
  ja: readonly string[]
  en: readonly string[]
}

export function contentsQuery(query: ContentsListingQuery): string {
  return listingAddress(query, { versioning: query.versioning, ja: query.ja, en: query.en })
}

/**
 * The listing of announcements narrows by three axes of its own: whether one
 * has been given its date, and what each of the two languages is up to.
 *
 * **It has an ordering of two keys** — the day it goes out and the title —
 * because an editor looking for one they wrote does not always know its date.
 * Announcements without a day sink to the end of either (`admin/contents.ts` の
 * `sortedNews`).
 */
export interface NewsListingQuery extends ListingPresentation {
  dating: readonly string[]
  ja: readonly string[]
  en: readonly string[]
}

export function newsQuery(query: NewsListingQuery): string {
  return listingAddress(query, { dating: query.dating, ja: query.ja, en: query.en })
}

/**
 * The `common/` prefix narrows by the day a file was written — a range with either
 * end open — beside the words looked for in the slug.
 */
export interface FilesListingQuery extends ListingPresentation {
  from: string | null
  to: string | null
}

export function filesQuery(query: FilesListingQuery): string {
  return listingAddress(query, {
    from: query.from === null ? [] : [query.from],
    to: query.to === null ? [] : [query.to],
  })
}

/**
 * A research's prefix narrows by one axis more than the `common/` prefix: which side
 * of the store a file is on, which that prefix has no second side for.
 */
export interface ResearchFilesQuery extends FilesListingQuery {
  states: readonly string[]
}

export function researchFilesQuery(query: ResearchFilesQuery): string {
  return listingAddress(query, {
    from: query.from === null ? [] : [query.from],
    to: query.to === null ? [] : [query.to],
    state: query.states,
  })
}

/**
 * The fields an analysis method is described under. They hang off `/admin`
 * rather than off a research: a field belongs to the portal, not to one study.
 *
 * **The two fields a dataset has are not here.** What they may hold is
 * settled by what the portal is rather than by what arrives in the data, so
 * the migration puts them in and nothing edits them afterwards.
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
 * 「語彙」 can only ever be met with "which vocabulary?".
 */
export function adminExperimentFieldPath(keyCode: string): string {
  return `${adminExperimentFieldsPath()}/${encodeURIComponent(keyCode)}`
}

/**
 * Site content. Documents are addressed by identity like everything else here:
 * a slug is an address readers hold, it can be corrected, and the screen that
 * corrects it cannot be reached through the value it is about to change.
 */
export function adminDocumentsPath(): string {
  return "/admin/documents"
}

export function adminDocumentPath(documentId: string): string {
  return `${adminDocumentsPath()}/${documentId}`
}

/**
 * A versioned article: the pointer that records which revision is current, and the
 * revisions under it. The listing has one row for the whole series, so this
 * is where everything that acts on the series as a whole is.
 */
export function adminSeriesPath(seriesId: string): string {
  return `${adminDocumentsPath()}/series/${seriesId}`
}

/**
 * The bar shown above every public page.
 *
 * **A screen of its own rather than one under the articles.** The bar lights
 * the entry the reader is under (`navigation.ts` の `isHere`), so an address
 * that sits beneath another screen's lights two names at once — and these three
 * are not parts of the article listing, only neighbours of it.
 */
export function adminAlertPath(): string {
  return "/admin/alert"
}

export function adminNewsListPath(): string {
  return "/admin/news"
}

export function adminNewsPath(newsId: string): string {
  return `${adminNewsListPath()}/${newsId}`
}

/**
 * Where an article's or an announcement's typed body is drawn as its page, for
 * the pane beside the form. **No language prefix and no identity**: nothing it
 * responds with is interface text, and the words come from the form rather than
 * from any row.
 */
export function adminArticlePreviewPath(): string {
  return "/admin/documents/preview"
}

/** The `common/` prefix: the images and PDFs the article bodies link to. */
export function adminFilesPath(): string {
  return "/admin/files"
}

/**
 * Where that files screen requests a signature. **No language prefix**: nothing it
 * responds with is interface text, and an upload that changed language
 * mid-transfer would be talking to a second address.
 */
export function adminFilesUploadPath(): string {
  return `${adminFilesPath()}/upload`
}

/**
 * Where an editing screen looks a vocabulary's candidates up. The catalog does
 * not have the terms, so the box requests the few that match what was typed
 * (`queries.server.ts` の `findTerms`).
 */
export function termsPath(): string {
  return "/admin/terms"
}

/**
 * The assistant that helps read an application. **The screens are here and the
 * service is not** — it runs beside the portal, holds no authorisation of its
 * own, and is only reachable through the address below.
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
