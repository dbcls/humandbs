/**
 * The screens that start a draft from what an upstream system already says.
 *
 * Two systems answer here and they are read directly rather than through the
 * caches: those hold what is public, and a draft is written for something that
 * is not published yet (docs/data-model.md の「外部キャッシュ」).
 *
 * **The connection is opened for the request and closed with it.** The daily
 * refresh does the same; holding a connection into another project's production
 * database open to answer a screen somebody opens a few times a month would be
 * paying rent for nothing.
 *
 * **What was looked at and what is created are two separate reads.** The form
 * sends which datasets to make and nothing else, and the values are fetched
 * again. Carrying them through the form would mean writing content the browser
 * handed over rather than content upstream states, and upstream moves on the
 * scale of a day.
 */

import { and, eq, inArray } from "drizzle-orm"
import type { Pool } from "pg"
import { redirect } from "react-router"

import { requireCapability } from "~/auth/actor.server"
import { can, type Actor } from "~/auth/capabilities"
import { loadConfig } from "~/config.server"
import { getDb, type Executor } from "~/db/client.server"
import { dataset, labelPin } from "~/db/schema"
import type { Locale } from "~/i18n/locale"
import { href } from "~/public/urls"
import {
  fetchAccessionBranchId,
  fetchDsBranch,
  fetchJgadRegistrations,
  openApplicationDb,
  searchDsBranches,
  type DsBranchDetail,
  type DsBranchRow,
  type JgadRegistration,
} from "~/upstream/application-db.server"
import { fetchDraSubmission } from "~/upstream/dra.server"

import {
  addDatasetsFromUpstream,
  createResearchFromUpstream,
  type SeededDataset,
} from "./drafts.server"
import { actorOf, badRequest, identity, notFound } from "./pages.server"
import { loadCatalogWithTerms, readDraft, type CatalogWithTerms } from "./queries.server"
import {
  draDatasetSeed,
  jgadDatasetSeed,
  researchContentFrom,
  type DatasetSeed,
  type DroppedValue,
} from "./templates"
import { adminDraftDatasetsPath, adminDraftPath } from "./urls"

/** How many branches a search answers with. */
const BRANCH_LIMIT = 30

/** The two archives a dataset is seeded from. */
const JGAD = /^JGAD\d+$/
const DRA = /^DRA\d+$/

export interface UpstreamBranchView {
  applicationId: string
  humLabel: string | null
  approvedOn: string | null
  titleJa: string
  titleEn: string
  piName: string
  /** The studies and datasets registered under the branch. */
  accessions: string[]
  /** The research whose hum label this already is, when there is one. */
  heldBy: string | null
}

/** A field of the research, and which languages the application filled in. */
export type SeededField = "title" | "aims" | "methods" | "targets" | "provider"

export interface SeededFieldView {
  field: SeededField
  ja: boolean
  en: boolean
}

export interface DatasetChoiceView {
  accession: string
  /** What upstream calls it: its assay, or its title when it states no assay. */
  description: string
  experiments: number
  /** The research already holding this accession, when one does. */
  heldBy: string | null
}

/** What one press would create, shown before anything is written. */
export interface UpstreamChoiceView {
  /** The branch the datasets come from, when they come from one. */
  applicationId: string | null
  fields: SeededFieldView[]
  datasets: DatasetChoiceView[]
  /** What upstream stated that the catalog has no word for. */
  dropped: DroppedValue[]
  /** Experiments DDBJ Search did not answer for, named. */
  unreachable: string[]
}

export interface UpstreamResearchView {
  locale: Locale
  /** False where this deployment cannot reach the application system at all. */
  connected: boolean
  keyword: string
  rows: UpstreamBranchView[]
  /** The branch being looked at, which need not be one of the rows. */
  branch: UpstreamBranchView | null
  chosen: UpstreamChoiceView | null
}

export interface UpstreamDatasetView {
  locale: Locale
  connected: boolean
  researchId: string
  draftId: string
  revision: number
  keyword: string
  accession: string
  rows: UpstreamBranchView[]
  chosen: UpstreamChoiceView | null
  /** An accession that was typed and is not one upstream holds. */
  unknown: string | null
}

/** What either screen answers with when it could not do as it was asked. */
export type UpstreamResult
  = | { status: "taken", label: string }
    | { status: "conflict" }

// === reading the upstream ===

interface Connection {
  pool: Pool
  schema: string
}

/**
 * The application system, for as long as one request needs it.
 *
 * Answering null rather than throwing is what makes a deployment with no
 * connection an ordinary deployment: the screen says it cannot reach the
 * system, and the half of it that reads DDBJ Search still works.
 */
async function withApplicationDb<T>(run: (at: Connection) => Promise<T>): Promise<T | null> {
  const config = loadConfig(process.env).applicationDb
  if (config === null) return null
  const pool = openApplicationDb(config)
  try {
    return await run({ pool, schema: config.schema })
  } finally {
    await pool.end()
  }
}

/** Which research each hum label already names. */
async function humHolders(
  db: Executor,
  labels: readonly string[],
): Promise<Map<string, string>> {
  if (labels.length === 0) return new Map()
  const rows = await db
    .select({ label: labelPin.label, researchId: labelPin.researchId })
    .from(labelPin)
    .where(and(eq(labelPin.kind, "hum"), inArray(labelPin.label, [...labels])))
  return new Map(rows.flatMap((row) => (row.researchId === null ? [] : [[row.label, row.researchId] as const])))
}

/**
 * Which research each dataset accession already belongs to. The pin names a
 * dataset and the dataset names the research, which is what a screen offering
 * to create it has to say.
 */
async function datasetHolders(
  db: Executor,
  labels: readonly string[],
): Promise<Map<string, string>> {
  if (labels.length === 0) return new Map()
  const rows = await db
    .select({ label: labelPin.label, researchId: dataset.researchId })
    .from(labelPin)
    .innerJoin(dataset, eq(dataset.id, labelPin.datasetId))
    .where(and(eq(labelPin.kind, "dataset"), inArray(labelPin.label, [...labels])))
  return new Map(rows.map((row) => [row.label, row.researchId]))
}

async function branchViews(
  db: Executor,
  rows: readonly DsBranchRow[],
): Promise<UpstreamBranchView[]> {
  const held = await humHolders(
    db,
    rows.flatMap((row) => (row.humLabel === null ? [] : [row.humLabel])),
  )
  return rows.map((row) => ({
    applicationId: row.applicationId,
    humLabel: row.humLabel,
    approvedOn: row.approvedOn,
    titleJa: row.titleJa,
    titleEn: row.titleEn,
    piName: row.piNameJa === "" ? row.piNameEn : row.piNameJa,
    accessions: row.accessions,
    heldBy: row.humLabel === null ? null : held.get(row.humLabel) ?? null,
  }))
}

function fieldsOf(branch: DsBranchDetail): SeededFieldView[] {
  return [
    { field: "title", ja: branch.titleJa !== "", en: branch.titleEn !== "" },
    { field: "aims", ja: branch.aimsJa !== "", en: branch.aimsEn !== "" },
    { field: "methods", ja: branch.methodsJa !== "", en: branch.methodsEn !== "" },
    { field: "targets", ja: branch.targetsJa !== "", en: branch.targetsEn !== "" },
    { field: "provider", ja: branch.piNameJa !== "", en: branch.piNameEn !== "" },
  ]
}

/** The JGAD a branch registered, seeded from what the registration system holds. */
async function jgadSeeds(
  at: Connection,
  branch: DsBranchDetail,
  catalog: CatalogWithTerms,
): Promise<DatasetSeed[]> {
  const accessions = branch.accessions.filter((accession) => JGAD.test(accession))
  const registrations = await fetchJgadRegistrations(at.pool, at.schema, accessions)
  const stated = new Map(registrations.map((row) => [row.accession, row]))
  return accessions.map((accession) => {
    const registration: JgadRegistration = stated.get(accession)
      ?? { accession, title: "", datasetType: "" }
    return jgadDatasetSeed(registration, branch, catalog)
  })
}

async function choiceOf(
  db: Executor,
  parts: {
    applicationId: string | null
    branch: DsBranchDetail | null
    seeds: readonly DatasetSeed[]
    unreachable?: readonly string[]
  },
): Promise<UpstreamChoiceView> {
  const held = await datasetHolders(db, parts.seeds.map((seed) => seed.label))
  return {
    applicationId: parts.applicationId,
    fields: parts.branch === null ? [] : fieldsOf(parts.branch),
    datasets: parts.seeds.map((seed) => ({
      accession: seed.label,
      description: describe(seed),
      experiments: seed.content.experiments.length,
      heldBy: held.get(seed.label) ?? null,
    })),
    dropped: dedupe(parts.seeds.flatMap((seed) => seed.dropped)),
    unreachable: [...parts.unreachable ?? []],
  }
}

/** The label of the first experiment: the assay the seed settled on. */
function describe(seed: DatasetSeed): string {
  const first = seed.content.experiments[0]
  return first?.label.state === "value" ? first.label.value : ""
}

function dedupe(dropped: readonly DroppedValue[]): DroppedValue[] {
  const seen = new Set<string>()
  return dropped.filter((value) => {
    const key = `${value.keyCode} ${value.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// === starting a research ===

/**
 * The applications a research can be started from, and the one being looked at.
 *
 * The branch being looked at is carried beside the rows rather than found among
 * them: an address can name a branch the current keyword does not match, and a
 * screen that then showed nothing would lose what was being confirmed.
 */
export async function upstreamResearchPage(
  request: Request,
  locale: Locale,
): Promise<UpstreamResearchView> {
  await requireSeeding(request)
  const db = getDb()
  const url = new URL(request.url)
  const keyword = url.searchParams.get("q") ?? ""
  const applicationId = url.searchParams.get("application")

  const catalog = await loadCatalogWithTerms(db)
  const read = await withApplicationDb(async (at) => {
    const rows = await searchDsBranches(at.pool, at.schema, keyword, BRANCH_LIMIT)
    const branch = applicationId === null
      ? null
      : await fetchDsBranch(at.pool, at.schema, applicationId)
    return { rows, branch, seeds: branch === null ? [] : await jgadSeeds(at, branch, catalog) }
  })

  if (read === null) {
    return { locale, connected: false, keyword, rows: [], branch: null, chosen: null }
  }
  const branch = read.branch
  return {
    locale,
    connected: true,
    keyword,
    rows: await branchViews(db, read.rows),
    branch: branch === null ? null : (await branchViews(db, [branch]))[0] ?? null,
    chosen: branch === null
      ? null
      : await choiceOf(db, { applicationId, branch, seeds: read.seeds }),
  }
}

export async function upstreamResearchAction(
  request: Request,
  locale: Locale,
): Promise<Response | UpstreamResult> {
  const actor = await requireSeeding(request)
  const db = getDb()
  const form = await request.formData()
  const applicationId = readString(form, "application")
  if (applicationId === null) badRequest()
  const wanted = accessionsIn(form)

  const catalog = await loadCatalogWithTerms(db)
  const read = await withApplicationDb(async (at) => {
    const branch = await fetchDsBranch(at.pool, at.schema, applicationId)
    return branch === null ? null : { branch, seeds: await jgadSeeds(at, branch, catalog) }
  })
  if (read == null) notFound()

  const outcome = await createResearchFromUpstream(
    db,
    {
      humLabel: read.branch.humLabel,
      content: researchContentFrom(read.branch),
      datasets: chosen(read.seeds, wanted),
    },
    actorOf(actor),
  )
  if (outcome.status === "taken") return outcome
  return redirect(href(locale, adminDraftPath(outcome.researchId, outcome.draftId)))
}

// === adding datasets to a draft ===

/**
 * What can be added to a draft: the branches of the application system, and
 * whatever a typed accession turns out to be.
 *
 * A DRA accession is answered without the application system, which is why the
 * two halves are read apart — a deployment that cannot reach the application
 * system can still seed from DDBJ Search.
 */
export async function upstreamDatasetPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<UpstreamDatasetView> {
  await requireSeeding(request)
  const db = getDb()
  const at = await draftAt(db, params)

  const url = new URL(request.url)
  const keyword = url.searchParams.get("q") ?? ""
  const applicationId = url.searchParams.get("application")
  const accession = url.searchParams.get("accession") ?? ""
  const catalog = await loadCatalogWithTerms(db)

  const rows = await withApplicationDb((connection) =>
    searchDsBranches(connection.pool, connection.schema, keyword, BRANCH_LIMIT))
  const listing = {
    ...at,
    locale,
    connected: rows !== null,
    keyword,
    accession,
    rows: rows === null ? [] : await branchViews(db, rows),
  }

  if (DRA.test(accession)) {
    const submission = await fetchDraSubmission(accession)
    if (submission === null) return { ...listing, chosen: null, unknown: accession }
    const seed = draDatasetSeed(submission, null, catalog)
    return {
      ...listing,
      chosen: await choiceOf(db, {
        applicationId: null,
        branch: null,
        seeds: [seed],
        unreachable: submission.unreachable,
      }),
      unknown: null,
    }
  }

  const asked = applicationId !== null || accession !== ""
  if (!asked) return { ...listing, chosen: null, unknown: null }

  const read = await withApplicationDb(async (connection) => {
    const named = applicationId
      ?? (JGAD.test(accession)
        ? await fetchAccessionBranchId(connection.pool, connection.schema, accession)
        : null)
    const branch = named === null
      ? null
      : await fetchDsBranch(connection.pool, connection.schema, named)
    if (branch === null) return null
    const seeds = await jgadSeeds(connection, branch, catalog)
    // A typed accession takes only itself; a chosen branch takes all it holds.
    return {
      branch,
      seeds: accession === "" ? seeds : seeds.filter((seed) => seed.label === accession),
    }
  })

  if (read == null || read.seeds.length === 0) {
    return { ...listing, chosen: null, unknown: accession === "" ? null : accession }
  }
  return {
    ...listing,
    chosen: await choiceOf(db, {
      applicationId: read.branch.applicationId,
      branch: null,
      seeds: read.seeds,
    }),
    unknown: null,
  }
}

export async function upstreamDatasetAction(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<Response | UpstreamResult> {
  const actor = await requireSeeding(request)
  const db = getDb()
  const { researchId, draftId } = await draftAt(db, params)

  const form = await request.formData()
  const revision = Number(form.get("revision"))
  if (!Number.isInteger(revision)) badRequest()
  const applicationId = readString(form, "application")
  const wanted = accessionsIn(form)
  if (wanted.size === 0) badRequest()

  const catalog = await loadCatalogWithTerms(db)
  const seeds: DatasetSeed[] = []

  for (const accession of [...wanted].filter((value) => DRA.test(value))) {
    const submission = await fetchDraSubmission(accession)
    if (submission === null) notFound()
    seeds.push(draDatasetSeed(submission, null, catalog))
  }

  const jga = [...wanted].filter((value) => JGAD.test(value))
  if (jga.length > 0) {
    const read = await withApplicationDb(async (connection) => {
      const named = applicationId
        ?? await fetchAccessionBranchId(connection.pool, connection.schema, jga[0] ?? "")
      const branch = named === null
        ? null
        : await fetchDsBranch(connection.pool, connection.schema, named)
      return branch === null ? null : jgadSeeds(connection, branch, catalog)
    })
    if (read == null) notFound()
    seeds.push(...read.filter((seed) => wanted.has(seed.label)))
  }

  // An accession neither archive answered for is not something to create.
  if (seeds.length !== wanted.size) notFound()

  const outcome = await addDatasetsFromUpstream(
    db,
    { draftId, revision },
    { researchId, datasets: seeds.map((seed) => ({ label: seed.label, content: seed.content })) },
    actorOf(actor),
  )
  if (outcome.status === "gone") notFound()
  if (outcome.status !== "added") return outcome
  return redirect(href(locale, adminDraftDatasetsPath(researchId, draftId)))
}

// === shared ===

/**
 * Seeding writes content and pins labels, so it asks for both. Asking once here
 * rather than at each write is what keeps a screen from offering a button that
 * would be refused halfway through.
 */
async function requireSeeding(request: Request): Promise<Actor> {
  const actor = await requireCapability(request, "edit-content")
  if (!can(actor, "manage-labels")) {
    throw new Response(null, { status: 403, statusText: "Forbidden" })
  }
  return actor
}

async function draftAt(
  db: Executor,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<{ researchId: string, draftId: string, revision: number }> {
  const researchId = identity(params.researchId)
  const draftId = identity(params.draftId)
  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== researchId) notFound()
  return { researchId, draftId, revision: draft.revision }
}

function accessionsIn(form: FormData): Set<string> {
  return new Set(
    form.getAll("accession").filter((value): value is string => typeof value === "string"),
  )
}

function chosen(seeds: readonly DatasetSeed[], wanted: ReadonlySet<string>): SeededDataset[] {
  return seeds
    .filter((seed) => wanted.has(seed.label))
    .map((seed) => ({ label: seed.label, content: seed.content }))
}

function readString(form: FormData, name: string): string | null {
  const value = form.get(name)
  return typeof value === "string" && value !== "" ? value : null
}
