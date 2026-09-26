/**
 * The import screen: a source chosen, then the three-row import form that settles
 * what goes into the draft.
 *
 * **Every source arrives as the draft's own shape** — a version and another
 * draft already are one, and an application is laid over this draft
 * (`templates.ts` の `applicationInput`) — so the form and the write are one
 * path for all three. Only an application also creates datasets, and only it
 * requires the right to pin their labels.
 */

import { redirect } from "react-router"

import { requireCapability } from "~/auth/actor.server"
import { can } from "~/auth/capabilities"
import { getDb, type Executor } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import type { DatasetRowView } from "~/public/view.server"
import { href } from "~/public/urls"
import { draftDatasetRowViews } from "~/review/preview.server"

import { saveDraftContent } from "./drafts.server"
import { researchContentInput, type DraftInput } from "./form"
import { researchContentOf, saveDraftSchema } from "./form.server"
import { badRequest, identity, notFound } from "./pages.server"
import {
  adminResearch,
  comparableVersion,
  draftDatasetIds,
  humLabelOf,
  readDraft,
  researchDatasets,
  type ResearchDatasetRow,
} from "./queries.server"
import { applicationInput } from "./templates"
import {
  applicationBranches,
  readApplication,
  requireSeeding,
  importApplication,
  type UpstreamBranchView,
  type UpstreamChoiceView,
  type UpstreamResult,
} from "./templates.server"
import { adminDraftPath } from "./urls"

/**
 * A row of the table of versions and drafts: the same row the research's own
 * screen draws.
 *
 * **A draft that updates a version is that version's row**, as it is on the
 * research's screen: the row shows that the version is being updated and has the
 * draft's time, and choosing it imports what the update has written (`update`).
 * So every draft row is a draft that updates nothing.
 */
export type ImportSourceRow
  = | { kind: "draft", id: string, name: string, updatedAt: string }
    | {
      kind: "version"
      number: number
      updatedAt: string
      releaseDate: string
      update: { id: string, updatedAt: string } | null
    }

export type ImportSource
  = | { kind: "version", number: number }
    /** A draft, or — where it updates a version — the update, named by that version (`ImportSourceRow`). */
    | { kind: "draft", id: string, name: string, updatedAt: string, updating: number | null }
    | { kind: "application", applicationId: string, branch: UpstreamBranchView, choice: UpstreamChoiceView }

export interface ImportView {
  locale: Locale
  researchId: string
  draftId: string
  revision: number
  humLabel: string | null
  /**
   * Drafts first, newest writing first; then versions, newest number first.
   * **This draft is among them, and cannot be chosen** — left out, the two
   * rows reading 「下書き」 would not say which of them is the one being
   * written, and importing a draft into itself would offer back what is already
   * there (`SourceTable`).
   */
  rows: ImportSourceRow[]
  application: {
    /** Importing an application in pins dataset labels, which not everybody may. */
    allowed: boolean
    /** False where the application system cannot be reached from here. */
    connected: boolean
    branches: UpstreamBranchView[]
    /** An application ID that was typed and identifies no branch. */
    unknown: string | null
  }
  /** The source chosen, and the two readings the form sets side by side. */
  chosen: {
    source: ImportSource
    mine: DraftInput
    theirs: DraftInput
    /** This research's datasets, which a publication's cited list chooses from. */
    datasets: ResearchDatasetRow[]
    /** The same datasets as the public table draws them, in the order this draft lists them. */
    citable: DatasetRowView[]
  } | null
}

async function draftAt(
  db: Executor,
  params: { researchId: string | undefined, draftId: string | undefined },
) {
  const researchId = identity(params.researchId)
  const draftId = identity(params.draftId)
  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== researchId) notFound()
  return { researchId, draftId, draft }
}

/**
 * A cited dataset the research no longer holds is dropped from a source's
 * reading: a version written before a dataset was deleted still identifies it, and
 * the save refuses a list naming what the research does not hold.
 */
function citingOnly(input: DraftInput, held: ReadonlySet<string>): DraftInput {
  return {
    ...input,
    content: {
      ...input.content,
      relatedPublications: input.content.relatedPublications.map((row) => ({
        ...row,
        datasetIds: { ...row.datasetIds, ids: row.datasetIds.ids.filter((id) => held.has(id)) },
      })),
    },
  }
}

export async function importPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<ImportView> {
  const actor = await requireCapability(request, "edit-content")
  const allowed = can(actor, "manage-labels")
  const db = getDb()
  const { researchId, draftId, draft } = await draftAt(db, params)
  const [research, humLabel, datasets] = await Promise.all([
    adminResearch(db, researchId),
    humLabelOf(db, researchId),
    researchDatasets(db, researchId),
  ])
  if (research === null) notFound()

  const rows: ImportSourceRow[] = [
    ...research.drafts
      .map((row) => ({ kind: "draft" as const, id: row.id, name: row.name, updatedAt: row.updatedAt }))
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    ...research.versions.map((version) => ({
      kind: "version" as const,
      number: version.number,
      updatedAt: version.updatedAt,
      releaseDate: version.releaseDate,
      update: version.updating === null
        ? null
        : { id: version.updating.id, updatedAt: version.updating.updatedAt },
    })),
  ]

  const query = new URL(request.url).searchParams
  const applicationId = query.get("application")
  const branches = allowed ? await applicationBranches(db, humLabel) : []
  const application = {
    allowed,
    connected: branches !== null,
    branches: branches ?? [],
    unknown: null as string | null,
  }
  const view = {
    locale,
    researchId,
    draftId,
    revision: draft.revision,
    humLabel,
    rows,
    application,
    chosen: null,
  }

  const mine: DraftInput = { content: researchContentInput(draft.content) }
  const held = new Set(datasets.map((row) => row.id))
  const listed = await draftDatasetIds(db, draftId, researchId, draft.content.datasetIds)
  const shown = await draftDatasetRowViews(db, draftId, listed, locale)
  const citable = listed.flatMap((id) => {
    const row = shown.get(id)
    return row === undefined ? [] : [row]
  })
  const chosen = (source: ImportSource, theirs: DraftInput): ImportView => ({
    ...view,
    chosen: { source, mine, theirs: citingOnly(theirs, held), datasets, citable },
  })

  const version = query.get("version")
  if (version !== null) {
    const number = Number(version)
    if (!Number.isInteger(number)) notFound()
    const found = await comparableVersion(db, researchId, number)
    if (found?.number !== number) notFound()
    return chosen({ kind: "version", number }, { content: researchContentInput(found.content) })
  }

  const other = query.get("draft")
  if (other !== null) {
    const found = await readDraft(db, identity(other))
    if (found?.researchId !== researchId || found.id === draftId) notFound()
    // **An update is found on its version's row**, not among the drafts: the
    // table merges it there, and the time it is named by is the one that row shows.
    const own = rows.find((one) => one.kind === "draft" && one.id === found.id)
    const merged = rows.find((one) => one.kind === "version" && one.update?.id === found.id)
    const updatedAt = own?.updatedAt ?? (merged?.kind === "version" ? merged.update?.updatedAt : undefined)
    if (updatedAt === undefined) notFound()
    return chosen(
      { kind: "draft", id: found.id, name: found.name, updatedAt, updating: found.updating?.number ?? null },
      { content: researchContentInput(found.content) },
    )
  }

  if (applicationId !== null && applicationId !== "") {
    if (!allowed) throw new Response(null, { status: 403, statusText: "Forbidden" })
    const read = await readApplication(db, applicationId)
    if (read.status === "unconnected") return { ...view, application: { ...application, connected: false } }
    if (read.status === "unknown") return { ...view, application: { ...application, unknown: applicationId } }
    return chosen(
      { kind: "application", applicationId, branch: read.view, choice: read.choice },
      applicationInput(mine, read.branch),
    )
  }

  return view
}

export type ImportResult = UpstreamResult

/**
 * Writing what the form holds.
 *
 * **The content arrives decided**, as the editor would post it, and goes
 * through the same checks and the same revision as a save. The dataset list is
 * the draft's own and is kept from the draft, whatever arrives: the form does
 * not offer it (`import.ts` の `RESEARCH_IMPORT`).
 */
export async function importAction(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<Response | ImportResult> {
  await requireCapability(request, "edit-content")
  const db = getDb()
  const { researchId, draftId, draft } = await draftAt(db, params)

  const form = await request.formData()
  const revision = Number(form.get("revision"))
  if (!Number.isInteger(revision)) badRequest()
  const written = form.get("content")
  if (typeof written !== "string") badRequest()
  let parsed: unknown
  try {
    parsed = JSON.parse(written)
  } catch {
    badRequest()
  }
  const payload = saveDraftSchema.shape.content.safeParse(parsed)
  if (!payload.success) badRequest()

  const datasets = await researchDatasets(db, researchId)
  const known = new Set(datasets.map((row) => row.id))
  if (payload.data.relatedPublications.some((row) => row.datasetIds.ids.some((id) => !known.has(id)))) badRequest()
  const content = researchContentOf({ ...payload.data, datasetIds: draft.content.datasetIds })

  const applicationId = form.get("application")
  if (typeof applicationId === "string" && applicationId !== "") {
    const seeding = await requireSeeding(request)
    const accessions = new Set(form.getAll("accession").filter((one): one is string => typeof one === "string"))
    const outcome = await importApplication(
      db,
      { draftId, revision },
      { researchId, applicationId, content, accessions },
      seeding,
    )
    if (outcome.status === "gone") notFound()
    if (outcome.status !== "added") return outcome
  } else {
    const outcome = await saveDraftContent(db, { draftId, revision }, { content })
    if (outcome.status === "gone") notFound()
    if (outcome.status === "conflict") return { status: "conflict" }
  }
  return redirect(href(locale, adminDraftPath(researchId, draftId)))
}
