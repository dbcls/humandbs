/**
 * What the management screens load, and what their forms do.
 *
 * The order is always the same: establish who is asking and what they may do,
 * then read. Nothing here is reachable without a capability, and the two that
 * only read ask for `view-unpublished` while everything that writes asks for
 * `edit-content` — the operation names itself rather than saying "an
 * administrator did it", so a later role would need no new shape.
 *
 * The save path is the one worth reading twice. It refuses in three different
 * ways and they are not interchangeable:
 *
 * - a payload that does not fit the schema is a fault in the client: **400**
 * - prose holding a construct the tree cannot express is the author's to fix:
 *   **422**, with the problems attached to the fields they were written in
 * - a revision that no longer matches is somebody else's edit: **409**, with
 *   their version attached so the editor can say which fields moved
 *
 * In all three the answer carries no new content for the form. **What was typed
 * stays typed** — the screen decides what to take from the other version, one
 * field at a time. Which fields the other version moved is worked out on the
 * screen rather than here, because the comparison is against what the screen
 * was handed when it opened, and only the screen still has that.
 *
 * A research and a dataset are saved separately, because they are separate
 * identities with separate revisions: a research with two hundred datasets is
 * not one screenful, and a conflict over one of them is not a conflict over the
 * rest.
 */

import { redirect } from "react-router"

import { requireCapability } from "~/auth/actor.server"
import { emptyDatasetContent } from "~/content/empty"
import { convertible } from "~/content/units"
import type { DatasetContent, ResearchContent, TranslatedText } from "~/content/types"
import type { EventActor } from "~/auth/events.server"
import { getDb, type Executor } from "~/db/client.server"
import type { BoxEntry } from "~/files/box"
import { adminBox } from "~/files/listing.server"
import { privateNames, switchFiles } from "~/files/jobs.server"
import { wakeFileRunner } from "~/files/runner.server"
import { resolveText, type Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import { isPageSize, PAGE_SIZE, type PageSize } from "~/search/page-size"
import {
  DEFAULT_SORT,
  defaultOrder,
  isSortKey,
  isSortOrder,
  type SortKey,
  type SortOrder,
} from "~/search/sort"

import {
  changedDatasetFromPublished,
  changedFromPublished,
  describedDataset,
  describedResearch,
  type ShownLine,
} from "./changes"
import { today } from "~/dates"
import { datasetContentInput, type DatasetContentInput } from "./dataset-form"
import { datasetContentOf, saveDatasetSchema, widthsOrdered } from "./dataset-form.server"
import {
  changeListing,
  createDatasetInDraft,
  createEmptyDraft,
  createResearchWithDraft,
  deleteDraftDataset,
  discardDraft,
  draftCopiedFrom,
  draftUpdating,
  saveDatasetEntry,
  saveDraftContent,
  touchPresence,
  type ListingChange,
} from "./drafts.server"
import { researchContentInput, type DraftInput } from "./form"
import { researchContentOf, saveDraftSchema, type FieldProblem } from "./form.server"
import {
  GATE_FINDING_KINDS,
  type GateBlock,
  type GateFinding,
  type GateFindingKind,
} from "./gate"
import { isHumLabel, proposeDatasetId } from "./labels"
import { pinLabel, promotePin, unpinLabel } from "./labels.server"
import { compareDataset, compareResearch, isEmptyComparison } from "./merge"
import { publishDraft, publishPreview, withdrawVersion } from "./publish.server"
import { draftSteps, researchDraftSteps, type DraftStepsView } from "./steps.server"
import {
  activePresence,
  adminResearch,
  adminResearchIndex,
  draftDatasetRows,
  humLabelOf,
  loadEditableCatalog,
  termsByIds,
  readDatasetEntry,
  readDraft,
  readPublishedDataset,
  researchDatasets,
  comparableVersion,
  type AdminDraftRow,
  type AdminVersionRow,
  type DraftDatasetRow,
  type EditableCatalog,
  type EditableTerm,
  type PresenceRow,
  type ResearchDatasetRow,
} from "./queries.server"
import {
  ADMIN_FLAG_KEYS,
  ADMIN_STATUSES,
  axisCounts,
  filterResearchRows,
  isAdminFlagKey,
  isAdminStatus,
  pageOf,
  sortResearchRows,
  type AdminFlagKey,
  type AdminFlags,
  type AdminStatus,
} from "./listing"
import { deleteResearch } from "./research.server"
import {
  adminDraftDatasetPath,
  adminDraftDatasetsPath,
  adminDraftPath,
  adminDraftPublishPath,
  adminResearchListPath,
  adminResearchPath,
} from "./urls"

import type { CommentView } from "~/review/comments"
import { readComments } from "~/review/comments.server"
import { drawDatasetDraft, drawDraft, type DrawnDataset, type DrawnDraft } from "~/review/preview.server"
import {
  draftReviewSummaries,
  versionAgainst,
  type DraftReviewSummary,
} from "~/review/queries.server"

export function notFound(): never {
  throw new Response(null, { status: 404, statusText: "Not Found" })
}

export function badRequest(): never {
  throw new Response(null, { status: 400, statusText: "Bad Request" })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An address that cannot name a row answers as a row that is not there. */
export function identity(value: string | undefined): string {
  if (value === undefined || !UUID.test(value)) notFound()
  return value
}

export function actorOf(actor: { sub: string, name: string }): EventActor {
  return { sub: actor.sub, name: actor.name }
}

export interface AdminListRowView {
  researchId: string
  humLabel: string | null
  title: string
  /** Every dataset the research holds, in the order the listing prints them. */
  datasetLabels: string[]
  status: AdminStatus
  publishedVersions: number
  draftCount: number
  flags: AdminFlags
  /** The day of the most recent change; the hour is noise in a listing. */
  updatedOn: string
  /** The day the latest version that is out was released, or `null`. */
  publishedOn: string | null
}

/**
 * How many rows each choice of the pane would leave, counted the way the public
 * panel counts (`app/admin/listing.ts` の `axisCounts`).
 */
export interface AdminListCounts {
  statuses: Record<AdminStatus, number>
  flags: Record<AdminFlagKey, number>
}

export interface AdminListView {
  locale: Locale
  keyword: string
  statuses: AdminStatus[]
  flags: AdminFlagKey[]
  counts: AdminListCounts
  sort: SortKey
  order: SortOrder
  size: PageSize
  rows: AdminListRowView[]
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole result. */
  rangeFrom: number
  rangeTo: number
}

/** The page asked for, or the first one when the address says nothing sensible. */
export function readPage(value: string | null): number {
  const page = Number(value ?? "1")
  return Number.isInteger(page) && page >= 1 ? page : 1
}

export async function researchListPage(
  request: Request,
  locale: Locale,
): Promise<AdminListView> {
  await requireCapability(request, "view-unpublished")

  const url = new URL(request.url)
  const filter = {
    keyword: url.searchParams.get("q") ?? "",
    statuses: url.searchParams.getAll("status").filter(isAdminStatus),
    flags: url.searchParams.getAll("flag").filter(isAdminFlagKey),
  }

  // An ordering or a size that is not one of the offered ones is read as none
  // asked for, the way the public listings read theirs: an address arriving
  // from somewhere else should answer rather than refuse.
  const askedSort = url.searchParams.get("sort")
  const sort = isSortKey(askedSort) ? askedSort : DEFAULT_SORT
  const askedOrder = url.searchParams.get("order")
  const order = isSortOrder(askedOrder) ? askedOrder : defaultOrder(sort)
  const askedSize = Number(url.searchParams.get("size") ?? "")
  const size: PageSize = isPageSize(askedSize) ? askedSize : PAGE_SIZE

  const all = await adminResearchIndex(getDb())
  const page = pageOf(
    sortResearchRows(filterResearchRows(all, filter), sort, order),
    readPage(url.searchParams.get("page")),
    size,
  )

  // Each axis is counted over the rows the *other* conditions leave, so that a
  // second status is still reachable after the first has been ticked.
  const counts: AdminListCounts = {
    statuses: axisCounts(
      filterResearchRows(all, { ...filter, statuses: [] }),
      ADMIN_STATUSES,
      (row, status) => row.status === status,
    ),
    flags: axisCounts(
      filterResearchRows(all, { ...filter, flags: [] }),
      ADMIN_FLAG_KEYS,
      (row, flag) => row.flags[flag],
    ),
  }

  return {
    locale,
    keyword: filter.keyword,
    statuses: filter.statuses,
    flags: filter.flags,
    counts,
    sort,
    order,
    size,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    rangeFrom: page.rangeFrom,
    rangeTo: page.rangeTo,
    rows: page.rows.map((row) => ({
      researchId: row.researchId,
      humLabel: row.humLabel,
      title: resolved(row.title, locale),
      datasetLabels: row.datasetLabels,
      status: row.status,
      publishedVersions: row.publishedVersions,
      draftCount: row.draftCount,
      flags: row.flags,
      updatedOn: row.updatedAt.slice(0, 10),
      publishedOn: row.publishedOn,
    })),
  }
}

function resolved(pair: TranslatedText, locale: Locale): string {
  const value = resolveText(pair, locale)
  return value.state === "value" ? value.value : ""
}

/**
 * A version, with what only the research screen's table needs beside it:
 * how many datasets it lists. **Read once here rather than carried on
 * `AdminVersionRow`** — every other screen that touches a version already has
 * its content for its own reasons, and this is the one that does not.
 */
export interface AdminResearchVersionRow extends AdminVersionRow {
  datasets: number
}

/**
 * A draft's review, widened with what the research screen's table draws
 * beside it: how many datasets it lists and what the publish gate would say.
 * **The share and the threads stay a `DraftReviewSummary`** — this only adds
 * to it, the way the table only adds two columns to what the row already
 * shows.
 */
export interface AdminDraftReviewRow extends DraftReviewSummary {
  datasets: number
  /** What the publish gate would stop. */
  blocks: number
  /** What the publish gate would ask to confirm. */
  findings: number
}

export interface AdminResearchPageView {
  locale: Locale
  researchId: string
  humLabel: string | null
  labels: { id: string, label: string, isPrimary: boolean }[]
  versions: AdminResearchVersionRow[]
  drafts: AdminDraftRow[]
  /** Whether a link is out there for each draft, what is unanswered, and what its gate says. */
  reviews: AdminDraftReviewRow[]
  /** What the box holds. Null when the store did not answer. */
  box: { count: number, bytes: number } | null
}

export async function researchDetailPage(
  request: Request,
  locale: Locale,
  researchId: string | undefined,
): Promise<AdminResearchPageView> {
  await requireCapability(request, "view-unpublished")

  const id = identity(researchId)
  const db = getDb()
  const view = await adminResearch(db, id)
  if (view === null) notFound()

  const humLabel = view.labels.find((label) => label.isPrimary)?.label ?? null

  // A version being updated carries its draft's row rather than one of its
  // own (docs/editing.md の「draft」), so the table's facts for it come from
  // the same draft this gathers for every other one.
  const draftIds = [
    ...view.drafts.map((row) => row.id),
    ...view.versions.flatMap((row) => row.updating === null ? [] : [row.updating.id]),
  ]

  const [box, reviews, draftRecords, versionContents] = await Promise.all([
    adminBox(db, id, humLabel),
    draftReviewSummaries(db, id),
    Promise.all(draftIds.map((draftId) => readDraft(db, draftId))),
    Promise.all(view.versions.map((row) => comparableVersion(db, id, row.number))),
  ])

  const drafts = draftRecords.flatMap((record) =>
    record === null ? [] : [{ id: record.id, content: record.content }])
  const steps = await researchDraftSteps(db, id, drafts, reviews)

  return {
    locale,
    researchId: id,
    reviews: reviews.map((row) => {
      const found = steps.get(row.draftId)
      return { ...row, datasets: found?.datasets ?? 0, blocks: found?.blocks ?? 0, findings: found?.findings ?? 0 }
    }),
    box: box === null
      ? null
      : { count: box.length, bytes: box.reduce((sum, entry) => sum + entry.size, 0) },
    humLabel,
    labels: view.labels,
    versions: view.versions.map((row, at) => ({
      ...row,
      datasets: versionContents[at]?.content.datasetIds.length ?? 0,
    })),
    drafts: view.drafts,
  }
}

/**
 * The published description as it stands now, and how it stands against this
 * draft. **Taking it is an edit like any other** — it goes into the form, and
 * saving puts it into the draft through the same revision check. Publishing
 * does not merge, because the draft is what a share link shows.
 */
export interface UpstreamView<T> {
  /** What the version being compared against holds. */
  theirs: T
  /** Where the two disagree. Taking one replaces the value held here. */
  differing: string[]
  /** The number of the version compared against, for the screen to name it. */
  number: number
}

/**
 * What the review layer adds to an editing screen: where the draft differs from
 * what a reader sees now, and what has been said about the draft. Both are
 * carried by path, in the same vocabulary as everything else the screen marks.
 */
export interface ReviewMarksView {
  changed: string[]
  previous: Record<string, ShownLine[]>
  /** Everything said about the draft, the memo included: the screen picks what it draws. */
  comments: CommentView[]
  /** The version being compared against; null when nothing is published. */
  publishedNumber: number | null
  /** The name the reader's own comments will be signed with. */
  signedInName: string
}

export interface AdminDraftPageView {
  locale: Locale
  researchId: string
  draftId: string
  humLabel: string | null
  revision: number
  input: DraftInput
  datasets: ResearchDatasetRow[]
  /** Who else has this draft open, and what there is to go back to. */
  presence: PresenceView[]
  upstream: UpstreamView<DraftInput> | null
  review: ReviewMarksView
  /**
   * The draft drawn as the page it is going to be, which the editor stands
   * beside the form. It is the same drawing the share link shows, so that the
   * question "where does this value come out" has one answer.
   */
  page: DrawnDraft
  /**
   * The number of the version this draft is the update of, when it is one.
   * The screen names the draft after it and offers the update where a draft
   * of its own is offered the publish (docs/editing.md の「draft」).
   */
  updating: number | null
  /** Where the draft stands on each of its steps (`DraftSteps`). */
  steps: DraftStepsView
}

/**
 * The draft this screen is for, refused when it is reached under the wrong
 * research: a draft belongs to one, and an address that names another is not
 * an address for it.
 */
async function draftOf(
  request: Request,
  params: { researchId: string | undefined, draftId: string | undefined },
) {
  const actor = await requireCapability(request, "edit-content")

  const researchId = identity(params.researchId)
  const draftId = identity(params.draftId)
  const db = getDb()
  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== researchId) notFound()
  return { db, actor, researchId, draftId, draft }
}

/**
 * Who has the draft open, as a screen says it. The rows are named rather than
 * counted, and the reader's own session is marked rather than dropped here:
 * "somebody else is editing this" is what the line means, and only the request
 * knows which of the sessions is the one asking.
 */
export interface PresenceView {
  name: string
  isSelf: boolean
}

function presenceView(rows: PresenceRow[], sessionId: string): PresenceView[] {
  return rows.map((row) => ({ name: row.displayName, isSelf: row.sessionId === sessionId }))
}

export async function draftEditorPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<AdminDraftPageView> {
  const { db, actor, researchId, draftId, draft } = await draftOf(request, params)

  // Every reading of "what differs" on this screen is against the same
  // version: the one the draft updates, or else the newest out.
  const published = await versionAgainst(db, draft)
  const [humLabel, datasets, presence, moved, comments, page, steps] = await Promise.all([
    humLabelOf(db, researchId),
    researchDatasets(db, researchId),
    activePresence(db, draftId),
    comparableVersion(db, researchId, published?.number ?? null),
    readComments(db, draftId),
    drawDraft(request, locale, { researchId, draftId, content: draft.content, updating: draft.updating }),
    draftSteps(db, researchId, draftId, draft.content),
  ])

  const input = { content: researchContentInput(draft.content) }
  const changed = published === null
    ? []
    : changedFromPublished(published.content, draft.content)

  return {
    locale,
    researchId,
    draftId,
    humLabel,
    revision: draft.revision,
    input,
    datasets,
    presence: presenceView(presence, actor.sessionId),
    upstream: moved === null ? null : researchUpstream(moved, input),
    review: {
      changed,
      previous: published === null ? {} : describedResearch(published.content, changed),
      comments,
      publishedNumber: published?.number ?? null,
      signedInName: actor.name,
    },
    page,
    updating: draft.updating?.number ?? null,
    steps,
  }
}

function researchUpstream(
  against: { number: number, content: ResearchContent },
  mine: DraftInput,
): UpstreamView<DraftInput> | null {
  const theirs = researchContentInput(against.content)
  const compared = compareResearch(theirs, mine.content)
  if (isEmptyComparison(compared)) return null
  // The memo is the draft's own and is never what the version holds.
  return {
    theirs: { content: theirs },
    differing: compared.differing,
    number: against.number,
  }
}

export interface DraftDatasetListView {
  locale: Locale
  researchId: string
  draftId: string
  humLabel: string | null
  /** The draft's revision, which every change to the listing moves. */
  revision: number
  rows: DraftDatasetRow[]
  /** What the version lists, in its order — the order the rows are shown in. */
  listedIds: string[]
  presence: PresenceView[]
  /** The number of the version the draft updates, which names the last step. */
  updating: number | null
  steps: DraftStepsView
}

export async function draftDatasetListPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<DraftDatasetListView> {
  const { db, actor, researchId, draftId, draft } = await draftOf(request, params)

  const [humLabel, rows, presence, steps] = await Promise.all([
    humLabelOf(db, researchId),
    draftDatasetRows(db, draftId, researchId, draft.content.datasetIds),
    activePresence(db, draftId),
    draftSteps(db, researchId, draftId, draft.content),
  ])

  return {
    locale,
    researchId,
    draftId,
    humLabel,
    revision: draft.revision,
    rows,
    listedIds: draft.content.datasetIds,
    presence: presenceView(presence, actor.sessionId),
    updating: draft.updating?.number ?? null,
    steps,
  }
}

/** The answers that are neither a redirect nor a thrown response. */
export interface DatasetListRefusal {
  status: "conflict" | "refused"
}

/**
 * Making a dataset, destroying one this draft made, and deciding which
 * datasets the version lists and in what order. All change the draft's
 * content, so all carry its revision.
 */
export async function draftDatasetListAction(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<Response | DatasetListRefusal> {
  const { db, researchId, draftId } = await draftOf(request, params)

  const form = await request.formData()
  const intent = form.get("intent")
  const revision = Number(form.get("revision"))
  if (!Number.isInteger(revision)) badRequest()

  if (intent === "create-dataset") {
    const outcome = await createDatasetInDraft(db, { draftId, revision }, researchId)
    if (outcome.status === "gone") notFound()
    if (outcome.status === "conflict") return { status: "conflict" }
    return redirect(
      href(locale, adminDraftDatasetPath(researchId, draftId, outcome.datasetId)),
    )
  }

  const named = form.get("datasetId")
  const datasetId = identity(typeof named === "string" ? named : undefined)
  const listing = redirect(href(locale, adminDraftDatasetsPath(researchId, draftId)))

  const change = listingChange(intent, datasetId, form.get("by"))
  if (change !== null) {
    const outcome = await changeListing(db, { draftId, revision }, researchId, change)
    if (outcome.status === "gone") notFound()
    if (outcome.status === "refused") badRequest()
    if (outcome.status === "conflict") return { status: "conflict" }
    return listing
  }

  if (intent !== "delete-dataset") badRequest()
  const outcome = await deleteDraftDataset(db, { draftId, revision }, datasetId)
  if (outcome.status === "gone") notFound()
  if (outcome.status !== "deleted") return { status: outcome.status }
  return listing
}

/** The listing change a form asked for, or null for a form that asked something else. */
function listingChange(
  intent: FormDataEntryValue | null,
  datasetId: string,
  by: FormDataEntryValue | null,
): ListingChange | null {
  if (intent === "list-dataset") return { kind: "list", datasetId }
  if (intent === "unlist-dataset") return { kind: "unlist", datasetId }
  if (intent !== "move-dataset") return null
  if (by !== "-1" && by !== "1") badRequest()
  return { kind: "move", datasetId, by: by === "-1" ? -1 : 1 }
}

export interface DatasetEditorView {
  locale: Locale
  researchId: string
  draftId: string
  datasetId: string
  humLabel: string | null
  /** Where the draft stands on each of its steps (`DraftSteps`). */
  steps: DraftStepsView
  datasetLabel: string | null
  /** The ledger row behind the label, which is what unpinning names. */
  datasetPinId: string | null
  /** What the portal would propose as its id, while it has none. */
  datasetIdSuggestion: string | null
  published: boolean
  /** The number of the version this draft is the update of, when it is one. */
  updating: number | null
  /**
   * Null when this draft has not written anything for the dataset yet, which is
   * what makes the first save an insert rather than an update.
   */
  revision: number | null
  input: DatasetContentInput
  /**
   * The dataset drawn as the page it is going to be, which the editor stands
   * beside the form. It is the same drawing the share link shows.
   */
  page: DrawnDataset
  catalog: EditableCatalog
  /**
   * The terms this document names, and only those. The catalog carries none, so
   * a chosen value is resolved by identity and everything else is searched for
   * (`findTerms`).
   */
  terms: EditableTerm[]
  presence: PresenceView[]
  upstream: UpstreamView<DatasetContentInput> | null
  review: ReviewMarksView
  /**
   * The research's box, both buckets merged, which the file selection is chosen
   * from. Null when the store did not answer — the editor then offers nothing
   * rather than pretending the box is empty.
   */
  box: BoxEntry[] | null
  /**
   * Whether this dataset may carry a file selection at all, read off its id
   * (docs/files.md). An archive's dataset is distributed by
   * the archive, so the screen does not offer the picker and the save refuses
   * a selection.
   */
  portalIssued: boolean
}

/**
 * One dataset, as this draft has it. What is shown is the draft's own entry if
 * there is one, the published description if there is not, and an empty one for
 * a dataset nobody has described yet — copy-on-write seen from the reading end.
 */
export async function datasetEditorPage(
  request: Request,
  locale: Locale,
  params: {
    researchId: string | undefined
    draftId: string | undefined
    datasetId: string | undefined
  },
): Promise<DatasetEditorView> {
  const { db, actor, researchId, draftId, draft } = await draftOf(request, params)
  const datasetId = identity(params.datasetId)

  const rows = await draftDatasetRows(db, draftId, researchId, draft.content.datasetIds)
  const row = rows.find((candidate) => candidate.id === datasetId)
  // A dataset belongs to exactly one research, so one of another research is
  // not a dataset this draft could be editing.
  if (row === undefined) notFound()

  const [entry, published, humLabel, catalog, presence, comments, steps] = await Promise.all([
    readDatasetEntry(db, draftId, datasetId),
    readPublishedDataset(db, researchId, datasetId, draft.updating?.versionId ?? null),
    humLabelOf(db, researchId),
    loadEditableCatalog(db),
    activePresence(db, draftId),
    readComments(db, draftId),
    draftSteps(db, researchId, draftId, draft.content),
  ])
  const box = await adminBox(db, researchId, humLabel)

  const content = entry?.content ?? published?.content ?? emptyDatasetContent()
  const input = datasetContentInput(content)
  const changed = published === null
    ? []
    : changedDatasetFromPublished(published.content, content)
  // What is published is resolved too: the review marks show the value a field
  // held before, and a term dropped from the draft still has to be named there.
  const terms = await termsByIds(db, [
    ...namedTerms(content),
    ...(published === null ? [] : namedTerms(published.content)),
  ])
  const page = await drawDatasetDraft(
    request,
    locale,
    { researchId, draftId, updating: draft.updating },
    datasetId,
  )

  return {
    locale,
    researchId,
    draftId,
    datasetId,
    humLabel,
    datasetLabel: row.label,
    datasetPinId: row.pinId,
    datasetIdSuggestion: humLabel === null || row.label !== null
      ? null
      : proposeDatasetId(humLabel, rows.flatMap((one) => one.label === null ? [] : [one.label])),
    published: row.published,
    updating: draft.updating?.number ?? null,
    steps,
    revision: entry?.revision ?? null,
    input,
    page,
    catalog,
    terms,
    presence: presenceView(presence, actor.sessionId),
    upstream: datasetUpstream(published, input),
    review: {
      changed,
      previous: published === null ? {} : describedDataset(published.content, changed),
      comments,
      publishedNumber: published?.number ?? null,
      signedInName: actor.name,
    },
    box,
    portalIssued: row.portalIssued,
  }
}

/**
 * Where this draft's description of a dataset differs from the one the newest
 * version gives it. A dataset no version lists has nothing to compare against.
 */
function datasetUpstream(
  against: { number: number, content: DatasetContent } | null,
  mine: DatasetContentInput,
): UpstreamView<DatasetContentInput> | null {
  if (against === null) return null
  const theirs = datasetContentInput(against.content)
  const compared = compareDataset(theirs, mine)
  return isEmptyComparison(compared)
    ? null
    : { theirs, differing: compared.differing, number: against.number }
}

export type SaveDatasetResult
  = | { status: "saved", revision: number }
    | { status: "invalid", problems: FieldProblem[] }
    | {
      status: "conflict"
      revision: number
      /** What the entry holds now, for the screen to compare against its own. */
      current: DatasetContentInput
    }

/**
 * Whether the catalog would recognise every value in a payload.
 *
 * A key it does not know, a key used at the wrong level, a value whose kind
 * disagrees with the key's type, a term from another vocabulary, or a second
 * term under a key that takes one — none of these are things the form offers,
 * so none of them are things an author can fix. They are answered as a bad
 * request rather than as a problem against a field.
 */
/**
 * Every vocabulary value a dataset's description names. **A disease names them
 * too** — one per classification that holds it — and the screen has to resolve
 * those labels the same way.
 */
function namedTerms(content: DatasetContent): string[] {
  return [...content.values, ...content.experiments.flatMap((e) => e.values)]
    .flatMap((slot) => {
      const value = slot.value
      if (value.kind === "vocabulary" && value.termIds.state === "value") return value.termIds.value
      if (value.kind === "disease" && value.diseases.state === "value") {
        return value.diseases.value.flatMap((one) => one.termIds)
      }
      return []
    })
}

async function catalogAccepts(
  db: Executor,
  input: DatasetContentInput,
  catalog: EditableCatalog,
): Promise<boolean> {
  const keyById = new Map(catalog.keys.map((key) => [key.id, key]))
  // Only the terms the payload names, because the catalog no longer carries
  // all of them; an identity that resolves to nothing fails the test below.
  const named = [
    ...input.values,
    ...input.experiments.flatMap((experiment) => experiment.values),
  ].flatMap((slot) => {
    if (slot.value.kind === "vocabulary") return slot.value.termIds
    if (slot.value.kind === "disease") return slot.value.diseases.flatMap((one) => one.termIds)
    return []
  })
  const setOfTerm = new Map((await termsByIds(db, named)).map((term) => [term.id, term.setId]))

  const accepts = (
    values: DatasetContentInput["values"],
    scope: "dataset" | "experiment",
  ): boolean =>
    values.every((slot) => {
      const key = keyById.get(slot.keyId)
      if (key?.scope !== scope) return false
      if (key.valueType !== slot.value.kind) return false
      if (slot.value.kind === "number") {
        // A unit the key does not offer is a form that was gone around; a value
        // the catalog cannot convert would be stored in nobody's unit.
        if (slot.value.state !== "value") return true
        return slot.value.rows.every((row) => row.unit === null
          || ((key.inputUnits ?? []).includes(row.unit) && convertible(row.unit, key.canonicalUnit)))
      }
      if (slot.value.kind === "disease") {
        // A row may name several terms — one classification each — so what the
        // key's `multiple` counts is the diseases, not the identities in one.
        if (!key.multiple && slot.value.diseases.length > 1) return false
        return slot.value.diseases.every((one) =>
          one.termIds.every((id) => setOfTerm.get(id) === key.vocabularySetId))
      }
      if (slot.value.kind !== "vocabulary") return true
      if (!key.multiple && slot.value.termIds.length > 1) return false
      return slot.value.termIds.every((id) => setOfTerm.get(id) === key.vocabularySetId)
    })

  return accepts(input.values, "dataset")
    && input.experiments.every((experiment) => accepts(experiment.values, "experiment"))
}

/** What pinning a dataset's id answers. */
export interface DatasetLabelResult {
  status: "pinned" | "unpinned" | "taken"
}

/**
 * Attaching a dataset's id, or taking it off, from the screen the dataset is
 * written on. **A form post beside a JSON save**: the id is not part of the
 * description and goes into the ledger the moment it is pinned, so it neither
 * waits for a save nor moves the entry's revision
 * (docs/publishing.md の「ラベルを pin する」). **Nothing is redirected** — the
 * screen posts through a fetcher so that what is typed around the id is not
 * lost, and reads its listing again once the ledger has moved.
 */
export async function datasetLabelAction(
  request: Request,
  params: {
    researchId: string | undefined
    draftId: string | undefined
    datasetId: string | undefined
  },
): Promise<DatasetLabelResult> {
  const { db, actor, researchId, draftId, draft } = await draftOf(request, params)
  await requireCapability(request, "manage-labels")
  const datasetId = identity(params.datasetId)

  const rows = await draftDatasetRows(db, draftId, researchId, draft.content.datasetIds)
  const row = rows.find((candidate) => candidate.id === datasetId)
  if (row === undefined) notFound()

  const form = await request.formData()
  const intent = form.get("intent")

  if (intent === "unpin") {
    const pinId = identity(readString(form, "pinId"))
    // Only this dataset's own row: the id of another dataset is not an input
    // this screen offered.
    if (row.pinId !== pinId) notFound()
    const outcome = await unpinLabel(db, pinId, actorOf(actor))
    if (outcome.status === "gone") notFound()
    return { status: "unpinned" }
  }

  if (intent !== "pin") badRequest()
  const label = form.get("label")
  if (typeof label !== "string") badRequest()
  const outcome = await pinLabel(
    db,
    { kind: "dataset", label, subjectId: datasetId, isPrimary: true },
    actorOf(actor),
  )
  if (outcome.status === "gone") notFound()
  return { status: outcome.status === "taken" ? "taken" : "pinned" }
}

export async function saveDatasetAction(
  request: Request,
  params: {
    researchId: string | undefined
    draftId: string | undefined
    datasetId: string | undefined
  },
): Promise<SaveDatasetResult> {
  const { db, researchId, draftId, draft } = await draftOf(request, params)
  const datasetId = identity(params.datasetId)

  const payload = saveDatasetSchema.safeParse(await request.json())
  if (!payload.success) badRequest()
  // The screen marks a disordered width `aria-invalid` the moment it is typed
  // (`dataset-editor.tsx` の `NumberField`), so a save still carrying one went
  // around the form. Checked here rather than in the schema itself — the draw
  // preview below parses the same schema from content that is still being
  // typed, where a width caught mid-edit is ordinary
  // (`app/admin/dataset-form.server.ts` の `widthsOrdered`).
  if (!widthsOrdered(payload.data.content)) badRequest()

  const rows = await draftDatasetRows(db, draftId, researchId, draft.content.datasetIds)
  const row = rows.find((candidate) => candidate.id === datasetId)
  if (row === undefined) notFound()
  // The picker is not drawn for an archive's dataset, so a selection on one is
  // an input the form never offered.
  if (!row.portalIssued && payload.data.content.fileSelection.length > 0) badRequest()

  const catalog = await loadEditableCatalog(db)
  if (!await catalogAccepts(db, payload.data.content, catalog)) badRequest()

  const unitOf = new Map(catalog.keys.map((key) => [key.id, key.canonicalUnit]))
  const content = datasetContentOf(payload.data.content, (keyId) => unitOf.get(keyId) ?? null)
  if (!content.ok) return { status: "invalid", problems: content.problems }

  const outcome = await saveDatasetEntry(
    db,
    { draftId, datasetId, revision: payload.data.revision },
    content.content,
  )
  if (outcome.status === "saved") return { status: "saved", revision: outcome.revision }
  if (outcome.status === "gone") notFound()

  const current = await readDatasetEntry(db, draftId, datasetId)
  if (current === null) notFound()
  return {
    status: "conflict",
    revision: current.revision,
    current: datasetContentInput(current.content),
  }
}

/**
 * Saying that somebody still has this draft open, and answering with who else
 * does. The two go together so that an open editor learns of a colleague by
 * the same request that announces itself.
 */
export async function presenceAction(
  request: Request,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<{ present: PresenceView[] }> {
  const { db, actor, draftId } = await draftOf(request, params)

  await touchPresence(db, {
    draftId,
    sessionId: actor.sessionId,
    actorSub: actor.sub,
    displayName: actor.name,
  })
  return { present: presenceView(await activePresence(db, draftId), actor.sessionId) }
}

/**
 * A new research is created together with the draft it will be written in.
 *
 * **It lands on the research, not in the draft.** What was made is a research,
 * and its screen is where drafts are made and opened from; landing in the form
 * hides that the research exists until the way back is pressed. The one thing
 * to press there is the draft's row. A research made from an application is
 * different (`templates.server.ts`): its draft already holds values, and what
 * comes next is checking them.
 */
export async function createResearchAction(request: Request, locale: Locale): Promise<Response> {
  await requireCapability(request, "edit-content")
  const created = await createResearchWithDraft(getDb())
  return redirect(href(locale, adminResearchPath(created.researchId)))
}

/** The answers the research screen has that are not a redirect. */
export type ResearchDetailResult
  = | { status: "conflict" }
    /** The version is being updated; stopping the update comes first. */
    | { status: "updating" }
    /** The label already names something. */
    | { status: "taken" }
    /** A research ID was typed in a shape no address could be made from. */
    | { status: "malformed" }

/**
 * Everything the research screen does: open an empty draft or a copy of a
 * version, throw one away, take a version out of sight, and attach, promote
 * or remove a research ID. They are ordinary form posts told apart by what
 * the form says it is.
 *
 * The capability is asked for per operation rather than once at the top, so
 * that what each one requires is written where it is done.
 */
export async function researchDetailAction(
  request: Request,
  locale: Locale,
  researchId: string | undefined,
): Promise<Response | ResearchDetailResult> {
  const id = identity(researchId)
  const db = getDb()
  if (await adminResearch(db, id) === null) notFound()

  const form = await request.formData()
  const intent = form.get("intent")
  const back = redirect(href(locale, adminResearchPath(id)))

  if (intent === "withdraw-version") {
    const actor = await requireCapability(request, "withdraw")
    const outcome = await withdrawVersion(
      db,
      identity(readString(form, "versionId")),
      actorOf(actor),
    )
    if (outcome.status === "gone") notFound()
    if (outcome.status === "updating") return { status: "updating" }
    return back
  }

  if (intent === "pin" || intent === "unpin" || intent === "make-primary") {
    const actor = await requireCapability(request, "manage-labels")
    if (intent === "unpin") {
      const outcome = await unpinLabel(db, identity(readString(form, "pinId")), actorOf(actor))
      if (outcome.status === "gone") notFound()
      return back
    }
    if (intent === "make-primary") {
      const outcome = await promotePin(db, identity(readString(form, "pinId")), actorOf(actor))
      if (outcome.status === "gone") notFound()
      return back
    }
    // Only the research's own ID is pinned here; a dataset's is pinned where
    // the dataset is written (`datasetLabelAction`).
    const label = form.get("label")
    if (typeof label !== "string") badRequest()
    if (!isHumLabel(label.trim())) return { status: "malformed" }
    const outcome = await pinLabel(
      db,
      { kind: "hum", label, subjectId: id, isPrimary: form.get("isPrimary") === "on" },
      actorOf(actor),
    )
    if (outcome.status === "gone") notFound()
    return outcome.status === "taken" ? { status: "taken" } : back
  }

  if (intent === "delete-research") {
    const actor = await requireCapability(request, "delete-research")
    const outcome = await deleteResearch(db, id, actorOf(actor))
    if (outcome.status === "gone") notFound()
    return redirect(href(locale, adminResearchListPath()))
  }

  const actor = await requireCapability(request, "edit-content")

  if (intent === "create-draft") {
    const draftId = await createEmptyDraft(db, id)
    return redirect(href(locale, adminDraftPath(id, draftId)))
  }

  // Editing a version is opening the draft it is updated in, made now if none
  // is open. The version itself is not touched (docs/editing.md の「draft」).
  if (intent === "edit-version") {
    const outcome = await draftUpdating(db, id, identity(readString(form, "versionId")))
    if (outcome.status === "gone") notFound()
    return redirect(href(locale, adminDraftPath(id, outcome.draftId)))
  }

  // A copy of a version: a draft like any other, opened for editing
  // (docs/editing.md の「draft」).
  if (intent === "copy-version") {
    const number = Number(form.get("number"))
    if (!Number.isInteger(number)) badRequest()
    const draftId = await draftCopiedFrom(db, id, number)
    if (draftId === null) notFound()
    return redirect(href(locale, adminDraftPath(id, draftId)))
  }

  if (intent !== "discard-draft") badRequest()

  const draftId = identity(readString(form, "draftId"))
  const revision = Number(form.get("revision"))
  if (!Number.isInteger(revision)) badRequest()

  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== id) notFound()

  const outcome = await discardDraft(db, { draftId, revision }, actorOf(actor))
  if (outcome.status === "gone") notFound()
  if (outcome.status === "conflict") return { status: "conflict" }
  return back
}

export interface PublishPlaceView {
  /** What it is about: the research itself, or a dataset by its id. */
  label: string
  /** Where it can be dealt with, when there is such a screen. */
  href: string | null
  count: number
  /** A second line where the count alone does not say enough. */
  note: string | null
}

export interface PublishGroupView {
  kind: GateFindingKind
  count: number
  places: PublishPlaceView[]
  /**
   * The files this group is about, for the one group that offers to act:
   * listing the private ones is also the way to make them public. Empty for
   * every other kind.
   */
  fileNames: string[]
}

export interface PublishBlockView {
  kind: GateBlock["kind"]
  /** Set for a missing dataset id, which is pinned from this screen. */
  datasetId: string | null
  label: string | null
  /** What the pin form starts with, when the portal has something to propose. */
  suggestion: string | null
}

export interface PublishDatasetChangeView {
  datasetId: string
  label: string | null
  fields: number
  isNew: boolean
  href: string
}

export interface PublishPageView {
  locale: Locale
  researchId: string
  draftId: string
  humLabel: string | null
  /** Where the draft stands on each of its steps (`DraftSteps`); the gate is this screen's own. */
  steps: DraftStepsView
  revision: number
  /** The number offered first: one past the highest a version holds. */
  nextNumber: number
  /** The numbers versions hold now, newest first — the ones the field refuses. */
  heldNumbers: number[]
  /** The day offered as the release date: today, or for an update the day its version went out. */
  releaseDate: string
  /** The version this draft updates, when it is an update: what the screen names instead of a number. */
  updating: { number: number } | null
  blocks: PublishBlockView[]
  groups: PublishGroupView[]
  findingCount: number
  researchFields: number | null
  datasetChanges: PublishDatasetChangeView[]
  listingAdded: string[]
  listingRemoved: string[]
}

/**
 * The last screen before a version exists.
 *
 * It reads rather than decides: the same gate runs again inside the publish,
 * under a lock, and that run is the one that is allowed to refuse. What is
 * shown here is what the administrator is being asked to look at.
 */
export async function publishPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<PublishPageView> {
  const { db, researchId, draftId, draft } = await draftOf(request, params)

  const preview = await publishPreview(db, draftId, await privateNames(researchId))
  if (preview === null) notFound()
  const steps = await draftSteps(db, researchId, draftId, draft.content, { gate: preview.gate })

  const labelOf = new Map(preview.datasetLabels.map((row) => [row.datasetId, row.label]))
  const naming = (datasetId: string): string =>
    labelOf.get(datasetId) ?? messagesFor(locale).admin.editor.unpinnedDataset
  const datasetHref = (datasetId: string): string =>
    href(locale, adminDraftDatasetPath(researchId, draftId, datasetId))

  const taken = preview.datasetLabels.flatMap((row) => row.label === null ? [] : [row.label])

  return {
    locale,
    researchId,
    draftId,
    humLabel: preview.humLabel,
    revision: preview.revision,
    nextNumber: preview.nextNumber,
    heldNumbers: preview.heldNumbers,
    releaseDate: preview.updating?.releaseDate ?? today(),
    updating: preview.updating === null ? null : { number: preview.updating.number },
    blocks: preview.gate.blocks.map((block) => ({
      kind: block.kind,
      datasetId: block.kind === "dataset-id-missing" ? block.datasetId : null,
      label: null,
      suggestion: block.kind === "dataset-id-missing" && preview.humLabel !== null
        ? proposeDatasetId(preview.humLabel, taken)
        : null,
    })),
    groups: groupFindings(preview.gate.findings, locale, {
      researchHref: href(locale, adminDraftPath(researchId, draftId)),
      datasetHref,
      naming,
    }),
    findingCount: preview.gate.findings.length,
    steps,
    researchFields: preview.researchFields,
    datasetChanges: preview.datasetChanges.map((change) => ({
      ...change,
      label: labelOf.get(change.datasetId) ?? null,
      href: datasetHref(change.datasetId),
    })),
    listingAdded: preview.listingAdded.map(naming),
    listingRemoved: preview.listingRemoved.map(naming),
  }
}

/**
 * The findings, gathered by kind and then by the screen that can deal with
 * them. A gate that listed twelve unsettled values one line each would be a
 * list nobody reads; what is wanted is which screens to open.
 */
function groupFindings(
  findings: readonly GateFinding[],
  locale: Locale,
  into: {
    researchHref: string
    datasetHref: (datasetId: string) => string
    naming: (datasetId: string) => string
  },
): PublishGroupView[] {
  const t = messagesFor(locale).admin.publish
  const groups = new Map<GateFindingKind, Map<string, PublishPlaceView>>()
  // One file can be selected by several datasets, and it is switched once.
  const files = new Set<string>()

  const place = (kind: GateFindingKind, key: string, view: () => PublishPlaceView): void => {
    const held = groups.get(kind) ?? new Map<string, PublishPlaceView>()
    groups.set(kind, held)
    const found = held.get(key)
    if (found === undefined) held.set(key, view())
    else found.count += 1
  }

  for (const finding of findings) {
    if (finding.kind === "unsettled" || finding.kind === "untranslated") {
      const subject = finding.subject
      const key = subject.kind === "research" ? "research" : subject.datasetId
      place(finding.kind, key, () => ({
        label: subject.kind === "research" ? t.research : into.naming(subject.datasetId),
        href: subject.kind === "research" ? into.researchHref : into.datasetHref(subject.datasetId),
        count: 1,
        note: null,
      }))
      continue
    }
    if (finding.kind === "pin-disagrees-upstream") {
      place(finding.kind, finding.datasetId, () => ({
        label: finding.label,
        href: null,
        count: 1,
        note: t.upstreamSays(finding.upstreamHumLabel),
      }))
      continue
    }
    if (finding.kind === "pin-unknown-upstream") {
      place(finding.kind, finding.datasetId, () => ({
        label: finding.label,
        href: null,
        count: 1,
        note: null,
      }))
      continue
    }
    if (finding.kind === "private-file") {
      files.add(finding.fileName)
      place(finding.kind, finding.datasetId, () => ({
        label: into.naming(finding.datasetId),
        href: into.datasetHref(finding.datasetId),
        count: 1,
        note: null,
      }))
      continue
    }
    place(finding.kind, finding.datasetId, () => ({
      label: into.naming(finding.datasetId),
      href: finding.kind === "empty-dataset" ? into.datasetHref(finding.datasetId) : null,
      count: 1,
      note: null,
    }))
  }

  return GATE_FINDING_KINDS.flatMap((kind) => {
    const held = groups.get(kind)
    if (held === undefined) return []
    const places = [...held.values()]
    return [{
      kind,
      count: places.reduce((total, row) => total + row.count, 0),
      places,
      fileNames: kind === "private-file" ? [...files] : [],
    }]
  })
}

export type PublishResult
  = | { status: "blocked" }
    | { status: "unacknowledged" }
    | { status: "conflict" }
    /** The number was taken from a screen drawn before a version moved. */
    | { status: "number-unavailable" }
    /**
     * The draft is not there any more — somebody discarded it, or published it
     * from another screen. Answered on the page rather than as a 404: the
     * screen was reached legitimately, and what happened to the draft is the
     * answer.
     */
    | { status: "gone" }
    /** A pin was refused because the label already names something. */
    | { status: "taken" }
    /** A research ID was typed in a shape no address could be made from. */
    | { status: "malformed" }

/**
 * Publishing, and pinning the labels that stop it. The pin is here because the
 * screen is where the missing label is noticed, and because a publish that
 * cannot proceed for want of one is not worth a detour.
 */
export async function publishAction(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<Response | PublishResult> {
  const { db, actor, researchId, draftId } = await draftOf(request, params)

  const form = await request.formData()
  const intent = form.get("intent")

  if (intent === "pin") {
    await requireCapability(request, "manage-labels")
    const kind = form.get("kind")
    if (kind !== "hum" && kind !== "dataset") badRequest()
    const label = form.get("label")
    if (typeof label !== "string") badRequest()
    if (kind === "hum" && !isHumLabel(label.trim())) return { status: "malformed" }
    const subjectId = kind === "hum" ? researchId : identity(readString(form, "datasetId"))

    const outcome = await pinLabel(db, { kind, label, subjectId, isPrimary: true }, actorOf(actor))
    if (outcome.status === "gone") notFound()
    if (outcome.status === "taken") return { status: "taken" }
    return redirect(href(locale, adminDraftPublishPath(researchId, draftId)))
  }

  if (intent === "publish-files") {
    await requireCapability(request, "manage-files")
    const names = form.getAll("fileName")
      .flatMap((value) => typeof value === "string" ? [value] : [])
    await switchFiles(
      db,
      names.map((fileName) => ({ researchId, fileName, action: "publish" as const })),
      actorOf(actor),
    )
    wakeFileRunner()
    return redirect(href(locale, adminDraftPublishPath(researchId, draftId)))
  }

  if (intent !== "publish") badRequest()
  await requireCapability(request, "publish")

  const revision = Number(form.get("revision"))
  if (!Number.isInteger(revision)) badRequest()
  // An update carries its version's number, and the screen asks for none.
  const numberField = form.get("number")
  const number = numberField === null ? null : Number(numberField)
  if (number !== null && (!Number.isInteger(number) || number < 1)) badRequest()
  const releaseDate = readString(form, "releaseDate") ?? ""
  if (!RELEASE_DATE.test(releaseDate)) badRequest()

  const outcome = await publishDraft(db, {
    at: { draftId, revision },
    number,
    releaseDate,
    acknowledged: form.get("acknowledged") === "on",
    privateFiles: await privateNames(researchId),
  }, actorOf(actor))

  if (outcome.status === "published") return redirect(href(locale, adminResearchPath(researchId)))
  if (outcome.status === "blocked") return { status: "blocked" }
  if (outcome.status === "unacknowledged") return { status: "unacknowledged" }
  return { status: outcome.status }
}

const RELEASE_DATE = /^\d{4}-\d{2}-\d{2}$/

function readString(form: FormData, name: string): string | undefined {
  const value = form.get(name)
  return typeof value === "string" ? value : undefined
}

export type SaveResult
  = | { status: "saved", revision: number }
    | { status: "invalid", problems: FieldProblem[] }
    | {
      status: "conflict"
      /** What the draft holds now, for the screen to compare against its own. */
      revision: number
      current: DraftInput
    }

export async function saveDraftAction(
  request: Request,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<SaveResult> {
  await requireCapability(request, "edit-content")

  const researchId = identity(params.researchId)
  const draftId = identity(params.draftId)

  const payload = saveDraftSchema.safeParse(await request.json())
  if (!payload.success) badRequest()

  const db = getDb()
  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== researchId) notFound()

  // A dataset belongs to exactly one research, so a version may only list this
  // research's own. The picker offers nothing else; anything else is a client
  // that went around it.
  const datasets = await researchDatasets(db, researchId)
  const known = new Set(datasets.map((row) => row.id))
  const listed = [
    ...payload.data.content.datasetIds,
    ...payload.data.content.relatedPublications.flatMap((row) => row.datasetIds),
  ]
  if (listed.some((id) => !known.has(id))) badRequest()

  const content = researchContentOf(payload.data.content)
  if (!content.ok) return { status: "invalid", problems: content.problems }

  const outcome = await saveDraftContent(
    db,
    { draftId, revision: payload.data.revision },
    { content: content.content },
  )
  if (outcome.status === "saved") return { status: "saved", revision: outcome.revision }
  if (outcome.status === "gone") notFound()

  const current = await readDraft(db, draftId)
  if (current === null) notFound()
  return {
    status: "conflict",
    revision: current.revision,
    current: { content: researchContentInput(current.content) },
  }
}

/**
 * The draft drawn from content that has not been saved yet.
 *
 * **The pane beside the form has to show what is being typed, not what is
 * filed.** The projection and the view builder are pure, so the drawing can be
 * made from a posted content without anything being written down; the same
 * function draws it as the share link uses, so the two cannot disagree.
 *
 * **Prose the tree cannot keep is not an error here.** Refusing markup is the
 * save's job and it says where the problem is; a pane that answered 422 would
 * empty itself in the middle of a sentence. It answers with nothing instead and
 * the pane keeps the last drawing it had.
 */
export async function draftPageAction(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<DrawnDraft | null> {
  await requireCapability(request, "edit-content")

  const researchId = identity(params.researchId)
  const draftId = identity(params.draftId)

  const payload = saveDraftSchema.safeParse(await request.json())
  if (!payload.success) badRequest()

  const db = getDb()
  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== researchId) notFound()

  const content = researchContentOf(payload.data.content)
  if (!content.ok) return null
  return drawDraft(request, locale, {
    researchId,
    draftId,
    content: content.content,
    updating: draft.updating,
  })
}

/**
 * One dataset of a draft, drawn from content that has not been saved yet.
 *
 * The research's counterpart is `draftPageAction`, and the same two things hold:
 * the drawing is made without writing anything, and prose the tree cannot keep
 * answers with nothing rather than with half a page.
 */
export async function datasetPageAction(
  request: Request,
  locale: Locale,
  params: {
    researchId: string | undefined
    draftId: string | undefined
    datasetId: string | undefined
  },
): Promise<DrawnDataset | null> {
  const { db, researchId, draftId, draft } = await draftOf(request, params)
  const datasetId = identity(params.datasetId)

  const payload = saveDatasetSchema.safeParse(await request.json())
  if (!payload.success) badRequest()

  const catalog = await loadEditableCatalog(db)
  const unitOf = new Map(catalog.keys.map((key) => [key.id, key.canonicalUnit]))
  const content = datasetContentOf(payload.data.content, (keyId) => unitOf.get(keyId) ?? null)
  if (!content.ok) return null
  return drawDatasetDraft(
    request,
    locale,
    { researchId, draftId, updating: draft.updating },
    datasetId,
    content.content,
  )
}
