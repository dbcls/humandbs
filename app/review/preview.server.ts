/**
 * What a share link shows, and what it lets a reader write.
 *
 * The preview is the published face of a draft: the same projection, the same
 * view builder and the same components as the public page, with one argument
 * different — unsettled values are kept. That is not a detail of the rendering;
 * it is the whole point of the link. The first thing a data provider is asked
 * is to fill in exactly those, and a preview that showed the published face
 * would hide the question.
 *
 * Every function here begins by turning the token into a draft, and a token
 * that does not open answers as a page that is not there. Nothing else on this
 * path consults the session: signing in only decides what a comment is signed
 * with.
 */

import { redirect } from "react-router"

import { changedDatasetFromPublished, changedFromPublished } from "~/admin/changes"
import { humLabelOf } from "~/admin/queries.server"
import { readActor } from "~/auth/actor.server"
import { emptyDatasetContent } from "~/content/empty"
import { publicDatasetContent, publicResearch } from "~/content/public"
import { adminBox, boxRows, fileListOf, readFilePage } from "~/files/listing.server"
import type { ResearchContent } from "~/content/types"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import {
  controlledAccessUsers,
  loadCatalog,
  publishedDatasetLabels,
} from "~/public/queries.server"
import {
  ACCESS_TYPE_KEY,
  TYPE_OF_DATA_KEY,
  anchorUnderCode,
  anchoredDatasetView,
  anchoredResearchView,
  type AnchoredValue,
  type CatalogView,
  type DatasetRowInput,
  type DatasetView,
  type ResearchView,
} from "~/public/view.server"

import { sharedDraftByToken, type SharedDraft } from "./access.server"
import { anchorOf, isAnchorPath, type AnchorSubject } from "./anchors"
import { checkComment, type CommentProblem, type ThreadView } from "./comments"
import {
  acknowledgeDraft,
  readAcknowledgements,
  readThreads,
  replyToThread,
  startThread,
  type AcknowledgementView,
  type CommentAuthor,
} from "./comments.server"
import { anchorExists, latestPublishedVersion, previewDatasets } from "./queries.server"

/** A preview keeps what has not been settled. No public route can ask for this. */
const PREVIEW = { keepUnsettled: true }

function notFound(): never {
  throw new Response(null, { status: 404, statusText: "Not Found" })
}

function badRequest(): never {
  throw new Response(null, { status: 400, statusText: "Bad Request" })
}

/**
 * The response headers a preview answers with.
 *
 * Unpublished content is being served at an address that carries its own
 * credential, so it must not be indexed, and following a link out of the page
 * must not hand the token to whoever is at the other end.
 */
export const PREVIEW_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
}

export interface PreviewShell {
  locale: Locale
  token: string
  humLabel: string | null
  /** The name comments will be signed with, when the reader is signed in. */
  signedInName: string | null
  threads: ThreadView[]
  acknowledgements: AcknowledgementView[]
  /** The version a reader sees now, which is what the marks are measured against. */
  publishedNumber: number | null
}

export interface PreviewResearchPageView extends PreviewShell {
  view: ResearchView
  /** Anchors the page draws where the draft and the published version differ. */
  changed: string[]
  /** What the published version says at each of those, and only at those. */
  previous: Record<string, AnchoredValue>
}

export interface PreviewDatasetPageView extends PreviewShell {
  datasetId: string
  datasetLabel: string | null
  view: DatasetView
  accessAnchor: string | null
  typeOfDataAnchor: string | null
  changed: string[]
  previous: Record<string, AnchoredValue>
}

async function shellOf(
  request: Request,
  locale: Locale,
  draft: SharedDraft,
  publishedNumber: number | null,
  humLabel: string | null,
): Promise<PreviewShell> {
  const db = getDb()
  const [actor, threads, acknowledgements] = await Promise.all([
    readActor(request),
    readThreads(db, draft.draftId),
    readAcknowledgements(db, draft.draftId),
  ])
  return {
    locale,
    token: draft.token,
    humLabel,
    signedInName: actor?.name ?? null,
    threads,
    acknowledgements,
    publishedNumber,
  }
}

/** Only the anchors the page actually draws, and only where they differ. */
function markedAnchors(changed: readonly string[], drawn: Record<string, AnchoredValue>): string[] {
  return changed.filter((path) => path in drawn)
}

function previousAt(
  changed: readonly string[],
  previous: Record<string, AnchoredValue>,
): Record<string, AnchoredValue> {
  const held: Record<string, AnchoredValue> = {}
  for (const path of changed) {
    const value = previous[path]
    if (value !== undefined) held[path] = value
  }
  return held
}

export async function previewResearchPage(
  request: Request,
  locale: Locale,
  token: string,
): Promise<PreviewResearchPageView> {
  const db = getDb()
  const draft = await sharedDraftByToken(db, token)
  if (draft === null) notFound()

  const [humLabel, catalog, datasets, published] = await Promise.all([
    humLabelOf(db, draft.researchId),
    loadCatalog(db),
    previewDatasets(db, draft.draftId, draft.content.datasetIds),
    latestPublishedVersion(db, draft.researchId),
  ])
  const cau = humLabel === null ? [] : await controlledAccessUsers(db, humLabel)
  // Both buckets: at draft time nothing is public yet, and showing only the
  // public side would empty the download list exactly when it is being checked.
  const listing = boxRows(await adminBox(db, draft.researchId, humLabel))

  const projected = publicResearch(draft.content, { cau, files: listing }, PREVIEW)
  const rows: DatasetRowInput[] = datasets.map((row) => ({
    id: row.id,
    label: row.label ?? "",
    content: publicDatasetContent(
      row.content,
      { keys: catalog.keyById, files: listing },
      PREVIEW,
    ),
    datePublished: row.datePublished,
  }))
  const nextNumber = (published?.number ?? 0) + 1

  const anchored = anchoredResearchView({
    humLabel: humLabel ?? "",
    versionNumber: nextNumber,
    releaseDate: "",
    latestVersionNumber: nextNumber,
    content: projected.content,
    datasets: rows,
    datasetLabelById: new Map(datasets.flatMap((row) =>
      row.label === null ? [] : [[row.id, row.label] as const])),
    cau: projected.cau,
    files: fileListOf(listing, readFilePage(new URL(request.url))),
  }, locale, catalog)

  const changed = published === null
    ? []
    : markedAnchors(
        changedFromPublished(published.content, draft.content),
        anchored.byAnchor,
      )

  return {
    ...await shellOf(request, locale, draft, published?.number ?? null, humLabel),
    view: anchored.view,
    changed,
    previous: changed.length === 0 || published === null
      ? {}
      : previousAt(changed, await publishedResearchAnchors(published.content, locale, catalog, humLabel)),
  }
}

/**
 * The published version drawn the same way, so that "what it says here now" can
 * be read off it. Its datasets are resolved to labels only: the one anchor a
 * row takes part in is the list of them.
 */
async function publishedResearchAnchors(
  content: ResearchContent,
  locale: Locale,
  catalog: CatalogView,
  humLabel: string | null,
): Promise<Record<string, AnchoredValue>> {
  const labels = await publishedDatasetLabels(getDb(), content.datasetIds)
  const labelOf = new Map(labels)
  const projected = publicResearch(content, { cau: [], files: [] }, { keepUnsettled: false })

  return anchoredResearchView({
    humLabel: humLabel ?? "",
    versionNumber: 0,
    releaseDate: "",
    latestVersionNumber: 0,
    content: projected.content,
    datasets: content.datasetIds.map((id) => ({
      id,
      label: labelOf.get(id) ?? "",
      content: emptyDatasetContent(),
      datePublished: null,
    })),
    datasetLabelById: labelOf,
    cau: [],
    // Only the anchors of this are read, and no file carries one.
    files: { rows: [], total: 0, page: 1, pageCount: 1 },
  }, locale, catalog).byAnchor
}

export async function previewDatasetPage(
  request: Request,
  locale: Locale,
  token: string,
  datasetId: string,
): Promise<PreviewDatasetPageView> {
  const db = getDb()
  const draft = await sharedDraftByToken(db, token)
  if (draft === null) notFound()
  // The preview is the version's face, so it shows what the version lists.
  if (!draft.content.datasetIds.includes(datasetId)) notFound()

  const [humLabel, catalog, rows, published] = await Promise.all([
    humLabelOf(db, draft.researchId),
    loadCatalog(db),
    previewDatasets(db, draft.draftId, [datasetId]),
    latestPublishedVersion(db, draft.researchId),
  ])
  const row = rows[0]
  if (row === undefined) notFound()
  const listing = boxRows(await adminBox(db, draft.researchId, humLabel))

  const anchored = anchoredDatasetView({
    label: row.label ?? "",
    humLabel: humLabel ?? "",
    content: publicDatasetContent(
      row.content,
      { keys: catalog.keyById, files: listing },
      PREVIEW,
    ),
    datePublished: row.datePublished,
    dateModified: row.dateModified,
    files: listing,
  }, locale, catalog)

  const changed = row.published === null
    ? []
    : markedAnchors(
        changedDatasetFromPublished(row.published, row.content),
        anchored.byAnchor,
      )

  const previous = row.published === null || changed.length === 0
    ? {}
    : previousAt(changed, anchoredDatasetView({
        label: row.label ?? "",
        humLabel: humLabel ?? "",
        content: publicDatasetContent(
          row.published,
          { keys: catalog.keyById, files: listing },
          { keepUnsettled: false },
        ),
        datePublished: null,
        dateModified: null,
        files: listing,
      }, locale, catalog).byAnchor)

  return {
    ...await shellOf(request, locale, draft, published?.number ?? null, humLabel),
    datasetId,
    datasetLabel: row.label,
    view: anchored.view,
    accessAnchor: anchorUnderCode(catalog, ACCESS_TYPE_KEY),
    typeOfDataAnchor: anchorUnderCode(catalog, TYPE_OF_DATA_KEY),
    changed,
    previous,
  }
}

export interface PreviewActionResult {
  status: "invalid"
  problem: CommentProblem
}

/**
 * Writing from a share link: a comment, a reply, or "I have looked at this".
 *
 * The author is the session when there is one and the typed name when there is
 * not — a data provider is among the intended readers, and requiring an account
 * would put the review out of their reach. What is written is checked against
 * the draft it claims to be about: the path has to lead somewhere in that
 * content, and a dataset has to be one this version lists.
 */
export async function previewAction(
  request: Request,
  token: string,
  subject: AnchorSubject,
): Promise<Response | PreviewActionResult> {
  const db = getDb()
  const draft = await sharedDraftByToken(db, token)
  if (draft === null) notFound()

  const form = await request.formData()
  const intent = form.get("intent")
  const actor = await readActor(request)
  const author: CommentAuthor = actor === null
    ? { sub: null, name: readString(form, "name").trim() }
    : { sub: actor.sub, name: actor.name }

  const back = redirect(backTo(request, readString(form, "at")))

  if (intent === "acknowledge") {
    if (author.name === "") return { status: "invalid", problem: "name-required" }
    await acknowledgeDraft(db, { draftId: draft.draftId, actor: author })
    return back
  }

  const body = readString(form, "body")
  const problem = checkComment({ name: author.name, body })
  if (problem !== null) return { status: "invalid", problem }

  if (intent === "reply") {
    const threadId = readString(form, "threadId")
    if (threadId === "") badRequest()
    const outcome = await replyToThread(db, {
      draftId: draft.draftId,
      threadId,
      author,
      body: body.trim(),
    })
    if (outcome.status === "gone") notFound()
    return back
  }

  if (intent !== "comment") badRequest()

  const path = form.get("path")
  if (!isAnchorPath(path)) badRequest()
  const about = {
    draftId: draft.draftId,
    content: draft.content,
    // A share link may comment on what the version shows, and nothing else.
    datasetIds: draft.content.datasetIds,
  }
  if (!(await anchorExists(db, about, subject, path))) badRequest()

  const outcome = await startThread(db, {
    draftId: draft.draftId,
    anchor: anchorOf(subject, path),
    author,
    body: body.trim(),
  })
  if (outcome.status === "gone") notFound()
  return back
}

/** Back to the page that was posted from, at the place that was posted about. */
function backTo(request: Request, at: string): string {
  const url = new URL(request.url)
  const hash = at === "" ? "" : `#${encodeURIComponent(at)}`
  return `${url.pathname}${url.search}${hash}`
}

function readString(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}
