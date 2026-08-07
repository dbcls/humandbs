/**
 * What the three management screens load, and what their forms do.
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
 */

import { redirect } from "react-router"

import { requireCapability } from "~/auth/actor.server"
import type { TranslatedText } from "~/content/types"
import type { EventActor } from "~/auth/events.server"
import { getDb } from "~/db/client.server"
import { resolveText, type Locale } from "~/i18n/locale"
import { href } from "~/public/urls"

import {
  createDraft,
  createResearchWithDraft,
  discardDraft,
  saveDraftContent,
} from "./drafts.server"
import { researchContentInput, type DraftInput } from "./form"
import { researchContentOf, saveDraftSchema, type FieldProblem } from "./form.server"
import {
  adminResearch,
  adminResearchIndex,
  humLabelOf,
  readDraft,
  researchDatasets,
  type AdminDraftRow,
  type AdminVersionRow,
  type ResearchDatasetRow,
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
import { adminDraftPath, adminResearchPath } from "./urls"

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
  labels: { label: string, isPrimary: boolean }[]
  versions: AdminVersionRow[]
  drafts: AdminDraftRow[]
  datasets: ResearchDatasetRow[]
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

  return {
    locale,
    researchId: id,
    humLabel: view.labels.find((label) => label.isPrimary)?.label ?? null,
    labels: view.labels,
    versions: view.versions,
    drafts: view.drafts,
    datasets: view.datasets,
  }
}

export interface AdminDraftPageView {
  locale: Locale
  researchId: string
  draftId: string
  humLabel: string | null
  revision: number
  input: DraftInput
  datasets: ResearchDatasetRow[]
}

export async function draftEditorPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<AdminDraftPageView> {
  await requireCapability(request, "edit-content")

  const researchId = identity(params.researchId)
  const draftId = identity(params.draftId)
  const db = getDb()
  const draft = await readDraft(db, draftId)
  // A draft reached under the wrong research is not a draft of that research.
  if (draft?.researchId !== researchId) notFound()

  const [humLabel, datasets] = await Promise.all([
    humLabelOf(db, researchId),
    researchDatasets(db, researchId),
  ])

  return {
    locale,
    researchId,
    draftId,
    humLabel,
    revision: draft.revision,
    input: { note: draft.note, content: researchContentInput(draft.content) },
    datasets,
  }
}

/** A new research is created together with the draft it will be written in. */
export async function createResearchAction(request: Request, locale: Locale): Promise<Response> {
  await requireCapability(request, "edit-content")
  const created = await createResearchWithDraft(getDb())
  return redirect(href(locale, adminDraftPath(created.researchId, created.draftId)))
}

/** The one answer a discard has that is not a redirect or a thrown response. */
export interface DiscardConflict {
  status: "conflict"
}

/**
 * The two things the research screen does: open a new draft, and throw one
 * away. Both are ordinary form posts, so they are told apart by what the form
 * says it is.
 */
export async function researchDetailAction(
  request: Request,
  locale: Locale,
  researchId: string | undefined,
): Promise<Response | DiscardConflict> {
  const actor = await requireCapability(request, "edit-content")

  const id = identity(researchId)
  const db = getDb()
  if (await adminResearch(db, id) === null) notFound()

  const form = await request.formData()
  const intent = form.get("intent")

  if (intent === "create-draft") {
    const draftId = await createDraft(db, id)
    return redirect(href(locale, adminDraftPath(id, draftId)))
  }

  if (intent !== "discard-draft") badRequest()

  const named = form.get("draftId")
  const draftId = identity(typeof named === "string" ? named : undefined)
  const revision = Number(form.get("revision"))
  if (!Number.isInteger(revision)) badRequest()

  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== id) notFound()

  const outcome = await discardDraft(db, { draftId, revision }, actorOf(actor))
  if (outcome.status === "gone") notFound()
  if (outcome.status === "conflict") return { status: "conflict" }
  return redirect(href(locale, adminResearchPath(id)))
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
