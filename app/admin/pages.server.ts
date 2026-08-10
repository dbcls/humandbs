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
import type { DatasetContent, DraftSnapshot, ResearchContent, TranslatedText } from "~/content/types"
import type { EventActor } from "~/auth/events.server"
import { getDb } from "~/db/client.server"
import { resolveText, type Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { datasetContentInput, type DatasetContentInput } from "./dataset-form"
import { datasetContentOf, saveDatasetSchema } from "./dataset-form.server"
import {
  createDatasetInDraft,
  createDraft,
  createResearchWithDraft,
  deleteDraftDataset,
  discardDraft,
  saveDatasetEntry,
  saveDraftContent,
  touchPresence,
} from "./drafts.server"
import { researchContentInput, type DraftInput } from "./form"
import { researchContentOf, saveDraftSchema, type FieldProblem } from "./form.server"
import {
  GATE_FINDING_KINDS,
  type GateBlock,
  type GateFinding,
  type GateFindingKind,
} from "./gate"
import { proposeDatasetId } from "./labels"
import { pinLabel, unpinLabel } from "./labels.server"
import { isEmptyThreeWay, threeWayDataset, threeWayResearch } from "./merge"
import { publishDraft, publishPreview, republishVersion, withdrawVersion } from "./publish.server"
import {
  activePresence,
  adminResearch,
  adminResearchIndex,
  draftDatasetRows,
  humLabelOf,
  loadEditableCatalog,
  readDatasetEntry,
  readDraft,
  readPublishedDataset,
  readUndoSnapshot,
  readUndoStack,
  researchDatasets,
  upstreamResearch,
  type AdminDraftRow,
  type AdminVersionRow,
  type DraftDatasetRow,
  type EditableCatalog,
  type PresenceRow,
  type ResearchDatasetRow,
  type UndoEntryRow,
} from "./queries.server"
import {
  filterResearchRows,
  isAdminFlagKey,
  isAdminStatus,
  pageOf,
  sortResearchRows,
  type AdminFlagKey,
  type AdminFlags,
  type AdminStatus,
} from "./listing"
import {
  adminDraftDatasetPath,
  adminDraftDatasetsPath,
  adminDraftPath,
  adminDraftPublishPath,
  adminResearchPath,
} from "./urls"

function notFound(): never {
  throw new Response(null, { status: 404, statusText: "Not Found" })
}

function badRequest(): never {
  throw new Response(null, { status: 400, statusText: "Bad Request" })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An address that cannot name a row answers as a row that is not there. */
function identity(value: string | undefined): string {
  if (value === undefined || !UUID.test(value)) notFound()
  return value
}

function actorOf(actor: { sub: string, name: string }): EventActor {
  return { sub: actor.sub, name: actor.name }
}

export interface AdminListRowView {
  researchId: string
  humLabel: string | null
  title: string
  datasetCount: number
  status: AdminStatus
  publishedVersions: number
  draftCount: number
  flags: AdminFlags
  /** The day of the most recent change; the hour is noise in a listing. */
  updatedOn: string
}

export interface AdminListView {
  locale: Locale
  keyword: string
  status: AdminStatus | null
  flags: AdminFlagKey[]
  rows: AdminListRowView[]
  total: number
  page: number
  pageCount: number
}

function readPage(value: string | null): number {
  const page = Number(value ?? "1")
  return Number.isInteger(page) && page >= 1 ? page : 1
}

export async function researchListPage(
  request: Request,
  locale: Locale,
): Promise<AdminListView> {
  await requireCapability(request, "view-unpublished")

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const filter = {
    keyword: url.searchParams.get("q") ?? "",
    status: isAdminStatus(status) ? status : null,
    flags: url.searchParams.getAll("flag").filter(isAdminFlagKey),
  }

  const all = await adminResearchIndex(getDb())
  const page = pageOf(sortResearchRows(filterResearchRows(all, filter)), readPage(url.searchParams.get("page")))

  return {
    locale,
    keyword: filter.keyword,
    status: filter.status,
    flags: filter.flags,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    rows: page.rows.map((row) => ({
      researchId: row.researchId,
      humLabel: row.humLabel,
      title: resolved(row.title, locale),
      datasetCount: row.datasetLabels.length,
      status: row.status,
      publishedVersions: row.publishedVersions,
      draftCount: row.draftCount,
      flags: row.flags,
      updatedOn: row.updatedAt.slice(0, 10),
    })),
  }
}

function resolved(pair: TranslatedText, locale: Locale): string {
  const value = resolveText(pair, locale)
  return value.state === "value" ? value.value : ""
}

export interface AdminResearchPageView {
  locale: Locale
  researchId: string
  humLabel: string | null
  labels: { id: string, label: string, isPrimary: boolean }[]
  versions: AdminVersionRow[]
  drafts: AdminDraftRow[]
  datasets: ResearchDatasetRow[]
  /**
   * Something has been published under this research, which is what makes
   * moving a label to another identity worth warning about.
   */
  everPublished: boolean
  /** What the portal would propose for a dataset with no id yet. */
  datasetIdSuggestion: string | null
}

export async function researchDetailPage(
  request: Request,
  locale: Locale,
  researchId: string | undefined,
): Promise<AdminResearchPageView> {
  await requireCapability(request, "view-unpublished")

  const id = identity(researchId)
  const view = await adminResearch(getDb(), id)
  if (view === null) notFound()

  const humLabel = view.labels.find((label) => label.isPrimary)?.label ?? null
  const taken = view.datasets.flatMap((row) => row.label === null ? [] : [row.label])

  return {
    locale,
    researchId: id,
    humLabel,
    labels: view.labels,
    versions: view.versions,
    drafts: view.drafts,
    datasets: view.datasets,
    everPublished: view.versions.length > 0,
    datasetIdSuggestion: humLabel === null ? null : proposeDatasetId(humLabel, taken),
  }
}

/**
 * The published description as it stands now, and how it stands against this
 * draft. **Taking it is an edit like any other** — it goes into the form, and
 * saving puts it into the draft through the same revision check. Publishing
 * does not merge, because the draft is what a share link shows.
 */
export interface UpstreamView<T> {
  theirs: T
  /** Only they changed these, so taking them costs nothing held here. */
  only: string[]
  /** Both sides changed these; taking one replaces the value held here. */
  both: string[]
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
  undo: UndoEntryRow[]
  upstream: UpstreamView<DraftInput> | null
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

  const [humLabel, datasets, presence, undo, moved] = await Promise.all([
    humLabelOf(db, researchId),
    researchDatasets(db, researchId),
    activePresence(db, draftId),
    readUndoStack(db, draftId),
    upstreamResearch(db, researchId, draft.parentSnapshotId),
  ])

  const input = { note: draft.note, content: researchContentInput(draft.content) }

  return {
    locale,
    researchId,
    draftId,
    humLabel,
    revision: draft.revision,
    input,
    datasets,
    presence: presenceView(presence, actor.sessionId),
    undo,
    upstream: moved === null ? null : researchUpstream(moved, input),
  }
}

function researchUpstream(
  moved: { base: ResearchContent, theirs: ResearchContent },
  mine: DraftInput,
): UpstreamView<DraftInput> | null {
  const base = researchContentInput(moved.base)
  const theirs = researchContentInput(moved.theirs)
  const compared = threeWayResearch(base, theirs, mine.content)
  if (isEmptyThreeWay(compared)) return null
  // The memo is the draft's own and is never what upstream holds.
  return { theirs: { note: mine.note, content: theirs }, only: compared.theirs, both: compared.both }
}

export interface DraftDatasetListView {
  locale: Locale
  researchId: string
  draftId: string
  humLabel: string | null
  /** The draft's revision, which creating and destroying a dataset both move. */
  revision: number
  rows: DraftDatasetRow[]
  presence: PresenceView[]
}

export async function draftDatasetListPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<DraftDatasetListView> {
  const { db, actor, researchId, draftId, draft } = await draftOf(request, params)

  const [humLabel, rows, presence] = await Promise.all([
    humLabelOf(db, researchId),
    draftDatasetRows(db, draftId, researchId, draft.content.datasetIds),
    activePresence(db, draftId),
  ])

  return {
    locale,
    researchId,
    draftId,
    humLabel,
    revision: draft.revision,
    rows,
    presence: presenceView(presence, actor.sessionId),
  }
}

/** The answers that are neither a redirect nor a thrown response. */
export interface DatasetListRefusal {
  status: "conflict" | "refused"
}

/**
 * Making a dataset, and destroying one this draft made. Both change what the
 * version lists, so both carry the draft's revision.
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

  if (intent !== "delete-dataset") badRequest()

  const named = form.get("datasetId")
  const datasetId = identity(typeof named === "string" ? named : undefined)
  const outcome = await deleteDraftDataset(db, { draftId, revision }, datasetId)
  if (outcome.status === "gone") notFound()
  if (outcome.status !== "deleted") return { status: outcome.status }
  return redirect(href(locale, adminDraftDatasetsPath(researchId, draftId)))
}

export interface DatasetEditorView {
  locale: Locale
  researchId: string
  draftId: string
  datasetId: string
  humLabel: string | null
  datasetLabel: string | null
  published: boolean
  /**
   * Null when this draft has not written anything for the dataset yet, which is
   * what makes the first save an insert rather than an update.
   */
  revision: number | null
  input: DatasetContentInput
  catalog: EditableCatalog
  presence: PresenceView[]
  undo: UndoEntryRow[]
  upstream: UpstreamView<DatasetContentInput> | null
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

  const [entry, published, humLabel, catalog, presence, undo] = await Promise.all([
    readDatasetEntry(db, draftId, datasetId),
    readPublishedDataset(db, datasetId),
    humLabelOf(db, researchId),
    loadEditableCatalog(db),
    activePresence(db, draftId),
    readUndoStack(db, draftId),
  ])

  const input = datasetContentInput(entry?.content ?? published ?? emptyDatasetContent())

  return {
    locale,
    researchId,
    draftId,
    datasetId,
    humLabel,
    datasetLabel: row.label,
    published: row.published,
    revision: entry?.revision ?? null,
    input,
    catalog,
    presence: presenceView(presence, actor.sessionId),
    undo,
    upstream: datasetUpstream(entry?.baseContent ?? null, published, input),
  }
}

/**
 * Where the published description has moved since this draft copied it. A draft
 * that has not written anything yet is showing the published description, so
 * there is nothing to have moved away from.
 */
function datasetUpstream(
  base: DatasetContent | null,
  published: DatasetContent | null,
  mine: DatasetContentInput,
): UpstreamView<DatasetContentInput> | null {
  if (base === null || published === null) return null
  const theirs = datasetContentInput(published)
  const compared = threeWayDataset(datasetContentInput(base), theirs, mine)
  return isEmptyThreeWay(compared)
    ? null
    : { theirs, only: compared.theirs, both: compared.both }
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
function catalogAccepts(input: DatasetContentInput, catalog: EditableCatalog): boolean {
  const keyById = new Map(catalog.keys.map((key) => [key.id, key]))
  const setOfTerm = new Map(catalog.terms.map((term) => [term.id, term.setId]))

  const accepts = (
    values: DatasetContentInput["values"],
    scope: "dataset" | "experiment",
  ): boolean =>
    values.every((slot) => {
      const key = keyById.get(slot.keyId)
      if (key?.scope !== scope) return false
      if (key.valueType !== slot.value.kind) return false
      if (slot.value.kind !== "vocabulary") return true
      if (!key.multiple && slot.value.termIds.length > 1) return false
      return slot.value.termIds.every((id) => setOfTerm.get(id) === key.vocabularySetId)
    })

  return accepts(input.values, "dataset")
    && input.experiments.every((experiment) => accepts(experiment.values, "experiment"))
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

  const rows = await draftDatasetRows(db, draftId, researchId, draft.content.datasetIds)
  if (!rows.some((row) => row.id === datasetId)) notFound()

  const catalog = await loadEditableCatalog(db)
  if (!catalogAccepts(payload.data.content, catalog)) badRequest()

  const content = datasetContentOf(payload.data.content)
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
 * One entry of the undo stack, for the screen to put back into its form. It is
 * handed over rather than written: **restoring is an ordinary save**, so it
 * goes through the same revision check as anything else the author does.
 */
export async function undoSnapshotLoader(
  request: Request,
  params: {
    researchId: string | undefined
    draftId: string | undefined
    undoId: string | undefined
  },
): Promise<DraftSnapshot> {
  const { db, draftId } = await draftOf(request, params)
  const undoId = identity(params.undoId)

  const found = await readUndoSnapshot(db, draftId, undoId)
  if (found === null) notFound()
  return found
}

/** A new research is created together with the draft it will be written in. */
export async function createResearchAction(request: Request, locale: Locale): Promise<Response> {
  await requireCapability(request, "edit-content")
  const created = await createResearchWithDraft(getDb())
  return redirect(href(locale, adminDraftPath(created.researchId, created.draftId)))
}

/** The answers the research screen has that are not a redirect. */
export type ResearchDetailResult
  = | { status: "conflict" }
    | { status: "taken" }

/**
 * Everything the research screen does: open a draft, throw one away, take a
 * version out of sight or put it back, and attach or remove a label. They are
 * ordinary form posts told apart by what the form says it is.
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

  if (intent === "withdraw-version" || intent === "republish-version") {
    const actor = await requireCapability(request, "withdraw")
    const versionId = identity(readString(form, "versionId"))
    const outcome = intent === "withdraw-version"
      ? await withdrawVersion(db, versionId, actorOf(actor))
      : await republishVersion(db, versionId, actorOf(actor))
    if (outcome.status === "gone") notFound()
    return back
  }

  if (intent === "pin" || intent === "unpin") {
    const actor = await requireCapability(request, "manage-labels")
    if (intent === "unpin") {
      const outcome = await unpinLabel(db, identity(readString(form, "pinId")), actorOf(actor))
      if (outcome.status === "gone") notFound()
      return back
    }
    const kind = form.get("kind")
    if (kind !== "hum" && kind !== "dataset") badRequest()
    const label = form.get("label")
    if (typeof label !== "string") badRequest()
    const subjectId = kind === "hum" ? id : identity(readString(form, "datasetId"))
    const outcome = await pinLabel(
      db,
      { kind, label, subjectId, isPrimary: form.get("isPrimary") === "on" },
      actorOf(actor),
    )
    if (outcome.status === "gone") notFound()
    return outcome.status === "taken" ? { status: "taken" } : back
  }

  const actor = await requireCapability(request, "edit-content")

  if (intent === "create-draft") {
    const draftId = await createDraft(db, id)
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
  affects: number
  affectsIfFix: number | null
  isNew: boolean
  href: string
}

export interface PublishPageView {
  locale: Locale
  researchId: string
  draftId: string
  humLabel: string | null
  revision: number
  nextNumber: number
  /** The version a fix would replace. Null hides the choice. */
  fixNumber: number | null
  /** The version that is out there now, when it is not what this draft came from. */
  staleAgainst: number | null
  today: string
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
  const { db, researchId, draftId } = await draftOf(request, params)

  const preview = await publishPreview(db, draftId)
  if (preview === null) notFound()

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
    fixNumber: preview.fixes?.number ?? null,
    staleAgainst: preview.stale?.number ?? null,
    today: new Date().toISOString().slice(0, 10),
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
    if (finding.kind === "upstream-edited") {
      place(finding.kind, finding.datasetId, () => ({
        label: into.naming(finding.datasetId),
        href: into.datasetHref(finding.datasetId),
        count: 1,
        note: t.overwrites(finding.theirs, finding.both),
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
    return [{ kind, count: places.reduce((total, row) => total + row.count, 0), places }]
  })
}

export type PublishResult
  = | { status: "blocked" }
    | { status: "unacknowledged" }
    | { status: "conflict" }
    | { status: "no-parent" }
    /** A pin was refused because the label already names something. */
    | { status: "taken" }

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
    const subjectId = kind === "hum" ? researchId : identity(readString(form, "datasetId"))

    const outcome = await pinLabel(db, { kind, label, subjectId, isPrimary: true }, actorOf(actor))
    if (outcome.status === "gone") notFound()
    if (outcome.status === "taken") return { status: "taken" }
    return redirect(href(locale, adminDraftPublishPath(researchId, draftId)))
  }

  if (intent !== "publish") badRequest()
  await requireCapability(request, "publish")

  const revision = Number(form.get("revision"))
  if (!Number.isInteger(revision)) badRequest()
  const asFix = form.get("mode") === "fix"
  const releaseDate = readString(form, "releaseDate") ?? ""
  if (!asFix && !RELEASE_DATE.test(releaseDate)) badRequest()

  const outcome = await publishDraft(db, {
    at: { draftId, revision },
    mode: asFix ? { kind: "fix" } : { kind: "version", releaseDate },
    acknowledged: form.get("acknowledged") === "on",
  }, actorOf(actor))

  if (outcome.status === "published") return redirect(href(locale, adminResearchPath(researchId)))
  if (outcome.status === "gone") notFound()
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
    { note: payload.data.note, content: content.content },
  )
  if (outcome.status === "saved") return { status: "saved", revision: outcome.revision }
  if (outcome.status === "gone") notFound()

  const current = await readDraft(db, draftId)
  if (current === null) notFound()
  return {
    status: "conflict",
    revision: current.revision,
    current: { note: current.note, content: researchContentInput(current.content) },
  }
}
