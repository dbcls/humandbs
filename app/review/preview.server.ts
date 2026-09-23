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
 * Every function that takes a token begins by turning it into a draft, and a
 * token that does not open answers as a page that is not there. Nothing else on
 * this path consults the session: signing in only decides what a comment is
 * signed with.
 *
 * **`drawDraft` and `drawDatasetDraft` are the exceptions, and deliberately so.**
 * Drawing a draft as its page is wanted in two places — the share link and the
 * second pane of the editor — and doing it twice would be two answers to the
 * same question. They take a draft rather than a token, so whoever calls them
 * has already settled whether the asker may see it.
 */

import { redirect } from "react-router"

import { changedDatasetFromPublished, changedFromPublished } from "~/admin/changes"
import { humLabelOf } from "~/admin/queries.server"
import { readActor } from "~/auth/actor.server"
import { emptyDatasetContent } from "~/content/empty"
import { publicDataset, publicDatasetContent, publicResearch } from "~/content/public"
import { adminBox, boxRows, fileListOf, readFilePage } from "~/files/listing.server"
import type { DatasetContent, ResearchContent } from "~/content/types"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import {
  controlledAccessUsers,
  loadCatalog,
  publishedDatasetLabels,
} from "~/public/queries.server"
import {
  ACCESS_TYPE_KEY,
  PLATFORM_KEY,
  TYPE_OF_DATA_KEY,
  anchorUnderCode,
  anchoredDatasetView,
  anchoredResearchView,
  researchListRowView,
  type AnchoredValue,
  type CatalogView,
  type DatasetRowInput,
  type DatasetView,
  type ResearchListRowView,
  type ResearchView,
} from "~/public/view.server"

import { sharedDraftByToken, type SharedDraft } from "./access.server"
import { isAnchorPath, type AnchorSubject } from "./anchors"
import {
  checkComment,
  commentsForPage,
  type CommentProblem,
  type CommentView,
} from "./comments"
import {
  acknowledgeDraft,
  readAcknowledgements,
  readComments,
  postAboutDraft,
  postComment,
  type AcknowledgementView,
  type CommentAuthor,
} from "./comments.server"
import { draftDatasetIds } from "~/admin/queries.server"

import { previewDatasets, versionAgainst } from "./queries.server"

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
  /** What this page draws: the draft as a whole and the subjects on it. Never the memo. */
  comments: CommentView[]
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

/**
 * What every preview screen carries.
 *
 * **The comments are narrowed to what this screen draws.** A draft's comments
 * include ones about datasets the version does not list, and the memo, and
 * those are not drawn — but a loader's return value is serialised into the
 * page, so leaving them in would hand their text to anybody holding the share
 * link, and the count of unanswered comments would include places the reader
 * cannot reach.
 */
async function shellOf(
  request: Request,
  locale: Locale,
  draft: SharedDraft,
  publishedNumber: number | null,
  humLabel: string | null,
  drawn: readonly AnchorSubject[],
): Promise<PreviewShell> {
  const db = getDb()
  const [actor, comments, acknowledgements] = await Promise.all([
    readActor(request),
    readComments(db, draft.draftId),
    readAcknowledgements(db, draft.draftId),
  ])
  return {
    locale,
    token: draft.token,
    humLabel,
    signedInName: actor?.name ?? null,
    comments: commentsForPage(comments, drawn),
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

/**
 * A draft drawn as the page it is going to be.
 *
 * **There is one of these, and both the share link and the editor go through
 * it.** The projection, the view builder and the components are the public
 * page's; the one thing that differs is that unsettled values are kept, which
 * is the point of looking at a draft at all. A second way of drawing the same
 * thing would be a second answer to "what will this look like".
 *
 * Nothing here consults the session — who is asking decides whether they may
 * ask, which is the caller's to settle.
 */
export interface DrawnDraft {
  humLabel: string | null
  publishedNumber: number | null
  view: ResearchView
  /**
   * The row the research listing would give this draft. **The short summaries
   * are written for the listing and appear nowhere on the research's own page**,
   * so this is the only place they can be read back before publishing.
   */
  row: ResearchListRowView
  /** Anchors the page draws where the draft and the published version differ. */
  changed: string[]
  /** What the published version says at each of those, and only at those. */
  previous: Record<string, AnchoredValue>
}

/**
 * The terms a draft's datasets hold under one key, each once.
 *
 * **Read off the datasets rather than off the search rows**, which is where the
 * listing reads a published research's: a draft has no search rows, and its
 * datasets are what the rows would be built from once it is published.
 */
function termIdsUnder(
  contents: readonly DatasetContent[],
  catalog: CatalogView,
  code: string,
): string[] {
  const key = catalog.keyByCode.get(code)
  if (key === undefined) return []
  const ids = new Set<string>()
  for (const content of contents) {
    for (const slot of [...content.values, ...content.experiments.flatMap((one) => one.values)]) {
      if (slot.keyId !== key.id) continue
      if (slot.value.kind === "vocabulary" && slot.value.termIds.state === "value") {
        for (const id of slot.value.termIds.value) ids.add(id)
      }
    }
  }
  return [...ids]
}

export async function drawDraft(
  request: Request,
  locale: Locale,
  draft: {
    researchId: string
    draftId: string
    content: ResearchContent
    updating: { versionId: string } | null
  },
): Promise<DrawnDraft> {
  const db = getDb()
  // **What the preview shows is what the next version carries**, which is the
  // research's datasets rather than what the draft's order happens to name
  // (`admin/datasets.ts`).
  const shown = await draftDatasetIds(db, draft.draftId, draft.researchId, draft.content.datasetIds)
  const [humLabel, catalog, datasets, published] = await Promise.all([
    humLabelOf(db, draft.researchId),
    loadCatalog(db),
    previewDatasets(db, draft.draftId, shown),
    versionAgainst(db, draft),
  ])
  const cau = humLabel === null ? [] : await controlledAccessUsers(db, humLabel)
  // Both buckets: at draft time nothing is public yet, and showing only the
  // public side would empty the download list exactly when it is being checked.
  const listing = boxRows(await adminBox(db, draft.researchId, humLabel))

  const projected = publicResearch(draft.content, { cau, files: listing }, PREVIEW)
  const rows: DatasetRowInput[] = datasets.map((row) => {
    const dataset = publicDataset(
      row.content,
      { files: listing, archive: row.archive },
      PREVIEW,
    )
    return {
      id: row.id,
      label: row.label ?? "",
      content: dataset.content,
      datePublished: dataset.dates.datePublished,
    }
  })
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

  const row = researchListRowView({
    humLabel: humLabel ?? "",
    content: projected.content,
    datasetLabels: datasets.flatMap((one) => one.label === null ? [] : [one.label]),
    accessTermIds: termIdsUnder(datasets.map((one) => one.content), catalog, ACCESS_TYPE_KEY),
    platformTermIds: termIdsUnder(datasets.map((one) => one.content), catalog, PLATFORM_KEY),
    // The listing's dates are a published version's; a draft has not been one.
    datePublished: null,
    dateModified: null,
  }, locale, catalog)

  const changed = published === null
    ? []
    : markedAnchors(
        changedFromPublished(published.content, draft.content),
        anchored.byAnchor,
      )

  return {
    humLabel,
    publishedNumber: published?.number ?? null,
    view: anchored.view,
    row,
    changed,
    previous: changed.length === 0 || published === null
      ? {}
      : previousAt(changed, await publishedResearchAnchors(published.content, locale, catalog, humLabel)),
  }
}

export async function previewResearchPage(
  request: Request,
  locale: Locale,
  token: string,
): Promise<PreviewResearchPageView> {
  const db = getDb()
  const draft = await sharedDraftByToken(db, token)
  if (draft === null) notFound()

  const drawn = await drawDraft(request, locale, draft)
  const shown = await draftDatasetIds(db, draft.draftId, draft.researchId, draft.content.datasetIds)
  return {
    ...await shellOf(request, locale, draft, drawn.publishedNumber, drawn.humLabel, [
      { kind: "research" },
      ...shown.map((id) => ({ kind: "dataset" as const, datasetId: id })),
    ]),
    view: drawn.view,
    changed: drawn.changed,
    previous: drawn.previous,
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
    files: { rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 },
  }, locale, catalog).byAnchor
}

/**
 * One dataset of a draft, drawn as the page it is going to be.
 *
 * The research's counterpart is `drawDraft`, and this is the same bargain: one
 * drawing for the share link and for the pane beside the form, so that the two
 * cannot come to disagree about where a value comes out.
 */
export interface DrawnDataset {
  humLabel: string | null
  publishedNumber: number | null
  label: string | null
  view: DatasetView
  accessAnchor: string | null
  typeOfDataAnchor: string | null
  changed: string[]
  previous: Record<string, AnchoredValue>
}

export async function drawDatasetDraft(
  request: Request,
  locale: Locale,
  draft: { researchId: string, draftId: string, updating: { versionId: string } | null },
  datasetId: string,
  /** The content being written, when it is not the one that is filed. */
  content?: DatasetContent,
): Promise<DrawnDataset> {
  const db = getDb()
  const [humLabel, catalog, rows, published] = await Promise.all([
    humLabelOf(db, draft.researchId),
    loadCatalog(db),
    previewDatasets(db, draft.draftId, [datasetId]),
    versionAgainst(db, draft),
  ])
  const row = rows[0]
  if (row === undefined) notFound()
  // What is being written, which is not what is filed while a form is open.
  const writing = content ?? row.content
  const listing = boxRows(await adminBox(db, draft.researchId, humLabel))

  const dataset = publicDataset(
    writing,
    { files: listing, archive: row.archive },
    PREVIEW,
  )
  const anchored = anchoredDatasetView({
    label: row.label ?? "",
    humLabel: humLabel ?? "",
    // A preview reads no upstream cache: what it is showing is a draft, and the
    // cache holds published accessions only (docs/data-model.md の「外部キャッシュ」).
    studyAccession: null,
    content: dataset.content,
    datePublished: dataset.dates.datePublished,
    dateModified: dataset.dates.dateModified,
    files: listing,
  }, locale, catalog)

  const changed = row.published === null
    ? []
    : markedAnchors(
        changedDatasetFromPublished(row.published, writing),
        anchored.byAnchor,
      )

  const previous = row.published === null || changed.length === 0
    ? {}
    : previousAt(changed, anchoredDatasetView({
        label: row.label ?? "",
        humLabel: humLabel ?? "",
        studyAccession: null,
        content: publicDatasetContent(
          row.published,
          { files: listing },
          { keepUnsettled: false },
        ),
        datePublished: null,
        dateModified: null,
        files: listing,
      }, locale, catalog).byAnchor)

  return {
    humLabel,
    publishedNumber: published?.number ?? null,
    label: row.label,
    view: anchored.view,
    accessAnchor: anchorUnderCode(catalog, ACCESS_TYPE_KEY),
    typeOfDataAnchor: anchorUnderCode(catalog, TYPE_OF_DATA_KEY),
    changed,
    previous,
  }
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
  // The preview is the version's face, so it shows what the version carries.
  const shown = await draftDatasetIds(db, draft.draftId, draft.researchId, draft.content.datasetIds)
  if (!shown.includes(datasetId)) notFound()

  const drawn = await drawDatasetDraft(request, locale, draft, datasetId)
  return {
    ...await shellOf(request, locale, draft, drawn.publishedNumber, drawn.humLabel, [
      { kind: "dataset", datasetId },
    ]),
    datasetId,
    datasetLabel: drawn.label,
    view: drawn.view,
    accessAnchor: drawn.accessAnchor,
    typeOfDataAnchor: drawn.typeOfDataAnchor,
    changed: drawn.changed,
    previous: drawn.previous,
  }
}

export interface PreviewActionResult {
  status: "invalid"
  problem: CommentProblem
}

/**
 * Writing from a share link: a comment on a place or on the draft as a whole,
 * or one of the two marks — "I have finished commenting", "nothing to fix".
 *
 * The author is the session when there is one and the typed name when there is
 * not — a data provider is among the intended readers, and requiring an account
 * would put the review out of their reach. What is written is checked against
 * the draft it claims to be about: the path has to lead somewhere in that
 * content, and a dataset has to be one this version lists. **The memo cannot
 * be written from here**: a line of it is not a comment a reader is asked for.
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
    const kind = form.get("kind")
    if (kind !== "commented" && kind !== "approved") badRequest()
    if (author.name === "") return { status: "invalid", problem: "name-required" }
    await acknowledgeDraft(db, { draftId: draft.draftId, kind, actor: author })
    return back
  }

  if (intent !== "comment") badRequest()

  const body = readString(form, "body")
  const problem = checkComment({ name: author.name, body })
  if (problem !== null) return { status: "invalid", problem }

  if (form.get("subject") === "draft") {
    const outcome = await postAboutDraft(db, { draftId: draft.draftId, kind: "draft", author, body })
    if (outcome.status === "gone") notFound()
    return back
  }

  const path = form.get("path")
  if (!isAnchorPath(path)) badRequest()
  const outcome = await postComment(db, {
    about: {
      draftId: draft.draftId,
      content: draft.content,
      // A share link may comment on what the version shows, and nothing else.
      datasetIds: await draftDatasetIds(db, draft.draftId, draft.researchId, draft.content.datasetIds),
    },
    subject,
    path,
    author,
    body,
  })
  if (outcome.status === "no-such-place") badRequest()
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
