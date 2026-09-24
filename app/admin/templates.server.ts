/**
 * The screens that start a draft from what an upstream system already says.
 *
 * Two systems answer here and they are read directly rather than through the
 * caches: those hold what is public, and a draft is written for something that
 * is not published yet.
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
import type { ResearchContent } from "~/content/types"
import { getDb, type Executor } from "~/db/client.server"
import { dataset, labelPin } from "~/db/schema"
import type { Locale } from "~/i18n/locale"
import { href } from "~/public/urls"
import { isPageSize, PAGE_SIZE, type PageSize } from "~/search/page-size"
import { isSortOrder, type SortOrder } from "~/search/sort"
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
  applyUpstreamToDraft,
  createResearchFromUpstream,
  type SeededDataset,
} from "./drafts.server"
import {
  axisCounts,
  BRANCH_SORT,
  BRANCH_STANDINGS,
  branchOrder,
  branchStanding,
  filterBranchRows,
  isBranchSortKey,
  isBranchStanding,
  pageOf,
  sortBranchRows,
  type BranchSortKey,
  type BranchStanding,
} from "./listing"
import { actorOf, badRequest, identity, notFound, readPage } from "./pages.server"
import {
  humLabelOf,
  loadCatalogWithTerms,
  readDraft,
  type CatalogWithTerms,
} from "./queries.server"
import {
  draDatasetSeed,
  jgadDatasetSeed,
  researchContentFrom,
  type DatasetSeed,
  type DroppedValue,
} from "./templates"
import { adminDraftDatasetsPath, adminDraftPath } from "./urls"

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
  /**
   * The datasets registered under the branch.
   *
   * **The study accession is not among them.** A branch that registered one has
   * always registered datasets under it as well, so nothing about the branch is
   * read from it, and the portal seeds a dataset from each JGAD and nothing
   * from the study.
   */
  datasets: string[]
  /** The research whose hum label this already is, when there is one. */
  heldBy: string | null
}

/** A field of the research, as the application states it in each language. */
export type SeededField = "title" | "aims" | "methods" | "targets" | "provider"

/**
 * **The value itself rather than whether there is one.** This is read before
 * anything is written, and "ja あり" answers a question nobody has — what a
 * curator is deciding is whether these words belong in the research, which
 * cannot be told from their presence.
 */
export interface SeededFieldView {
  field: SeededField
  ja: string
  en: string
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
  standings: BranchStanding[]
  /**
   * How many branches each choice of the pane would leave, counted the way the
   * public panel counts (`app/admin/listing.ts` の `axisCounts`).
   */
  counts: {
    standings: Record<BranchStanding, number>
  }
  sort: BranchSortKey
  order: SortOrder
  size: PageSize
  rows: UpstreamBranchView[]
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole result. */
  rangeFrom: number
  rangeTo: number
}

/** The research a branch's hum label already names. */
export interface UpstreamHolderView {
  researchId: string
  humLabel: string
}

/**
 * One branch: what taking it would bring, and — where the hum already names a
 * research — the way there. **Only a new research is written from here**;
 * taking the branch into a research that exists is done from that research's
 * own draft.
 */
export interface UpstreamBranchPageView {
  locale: Locale
  connected: boolean
  applicationId: string
  branch: UpstreamBranchView | null
  chosen: UpstreamChoiceView | null
  holder: UpstreamHolderView | null
}

export interface UpstreamDatasetView {
  locale: Locale
  researchId: string
  draftId: string
  revision: number
  accession: string
  chosen: UpstreamChoiceView | null
  /** An accession that was typed and is not one upstream holds. */
  unknown: string | null
  /** What the research is called on the way here, for the trail. */
  humLabel: string | null
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
    datasets: row.accessions.filter((accession) => JGAD.test(accession)),
    heldBy: row.humLabel === null ? null : held.get(row.humLabel) ?? null,
  }))
}

function fieldsOf(branch: DsBranchDetail): SeededFieldView[] {
  return [
    { field: "title", ja: branch.titleJa, en: branch.titleEn },
    { field: "aims", ja: branch.aimsJa, en: branch.aimsEn },
    { field: "methods", ja: branch.methodsJa, en: branch.methodsEn },
    { field: "targets", ja: branch.targetsJa, en: branch.targetsEn },
    { field: "provider", ja: branch.piNameJa, en: branch.piNameEn },
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
 * The applications a draft can be taken from, newest approval first.
 *
 * **Every branch the word matched is read, and the page is cut here rather than
 * upstream.** One of the two things a curator narrows by — whether the portal
 * already holds the hum label — is the portal's own answer about the branch,
 * which the application system has no way to know. Reading all of them costs
 * what reading thirty costs (`upstream/application-db.server.ts`).
 *
 * An ordering or a size that is not one of the offered ones is read as none
 * asked for, the way every other listing reads its address.
 */
export async function upstreamResearchPage(
  request: Request,
  locale: Locale,
): Promise<UpstreamResearchView> {
  await requireSeeding(request)
  const db = getDb()
  const url = new URL(request.url)
  const keyword = url.searchParams.get("q") ?? ""
  const filter = {
    standings: url.searchParams.getAll("standing").filter(isBranchStanding),
  }
  const askedSort = url.searchParams.get("sort")
  const sort = isBranchSortKey(askedSort) ? askedSort : BRANCH_SORT
  const askedOrder = url.searchParams.get("order")
  const order = isSortOrder(askedOrder) ? askedOrder : branchOrder(sort)
  const askedSize = Number(url.searchParams.get("size") ?? "")
  const size: PageSize = isPageSize(askedSize) ? askedSize : PAGE_SIZE
  const presented = { ...filter, keyword, sort, order, size }

  const rows = await withApplicationDb((at) =>
    searchDsBranches(at.pool, at.schema, keyword, null))
  if (rows === null) {
    return {
      locale,
      connected: false,
      ...presented,
      counts: {
        standings: axisCounts([], BRANCH_STANDINGS, () => false),
      },
      rows: [],
      total: 0,
      page: 1,
      pageCount: 1,
      rangeFrom: 0,
      rangeTo: 0,
    }
  }

  const found = await branchViews(db, rows)
  const page = pageOf(
    sortBranchRows(filterBranchRows(found, filter), sort, order),
    readPage(url.searchParams.get("page")),
    size,
  )
  // The axis is counted with its own condition lifted, so that a second
  // standing is still reachable after the first has been ticked.
  const counts = {
    standings: axisCounts(
      filterBranchRows(found, { ...filter, standings: [] }),
      BRANCH_STANDINGS,
      (row, standing) => branchStanding(row) === standing,
    ),
  }
  return {
    locale,
    connected: true,
    ...presented,
    counts,
    rows: page.rows,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    rangeFrom: page.rangeFrom,
    rangeTo: page.rangeTo,
  }
}

/**
 * One branch: what it would bring, and — where the hum already names a
 * research — the way there.
 *
 * **The branch is read whether or not a keyword would find it.** An address
 * naming a branch is followed on its own, so a screen reached from elsewhere
 * still answers for the branch it names.
 */
export async function upstreamBranchPage(
  request: Request,
  locale: Locale,
  params: { applicationId: string | undefined },
): Promise<UpstreamBranchPageView> {
  await requireSeeding(request)
  const db = getDb()
  const applicationId = params.applicationId
  if (applicationId === undefined || applicationId === "") notFound()

  const catalog = await loadCatalogWithTerms(db)
  const read = await withApplicationDb(async (at) => {
    const branch = await fetchDsBranch(at.pool, at.schema, applicationId)
    return { branch, seeds: branch === null ? [] : await jgadSeeds(at, branch, catalog) }
  })
  if (read === null) {
    return { locale, connected: false, applicationId, branch: null, chosen: null, holder: null }
  }
  if (read.branch === null) notFound()

  const [view] = await branchViews(db, [read.branch])
  const holder = view?.heldBy == null || view.humLabel === null
    ? null
    : { researchId: view.heldBy, humLabel: view.humLabel }
  return {
    locale,
    connected: true,
    applicationId,
    branch: view ?? null,
    chosen: await choiceOf(db, { applicationId, branch: read.branch, seeds: read.seeds }),
    holder,
  }
}

/**
 * Starting a research from a branch.
 *
 * **The only thing written here.** Where the hum already names a research,
 * this screen offers no form at all — taking the branch into that research's
 * own draft is done from there.
 */
export async function upstreamBranchAction(
  request: Request,
  locale: Locale,
  params: { applicationId: string | undefined },
): Promise<Response | UpstreamResult> {
  const actor = await requireSeeding(request)
  const db = getDb()
  const applicationId = params.applicationId
  if (applicationId === undefined || applicationId === "") notFound()

  const form = await request.formData()
  if (readString(form, "into") !== "new") badRequest()

  const catalog = await loadCatalogWithTerms(db)
  const read = await withApplicationDb(async (at) => {
    const branch = await fetchDsBranch(at.pool, at.schema, applicationId)
    return branch === null ? null : { branch, seeds: await jgadSeeds(at, branch, catalog) }
  })
  if (read == null) notFound()

  // **Every dataset the application registered is made with the research,
  // except one a research already holds** — there is nothing to choose: a
  // dataset the branch registered belongs to the research it describes, and
  // pinning a held one again would refuse the whole creation. What the form
  // sends besides `into` is not read.
  const held = await datasetHolders(db, read.seeds.map((seed) => seed.label))
  const outcome = await createResearchFromUpstream(
    db,
    {
      humLabel: read.branch.humLabel,
      content: researchContentFrom(read.branch),
      datasets: read.seeds
        .filter((seed) => !held.has(seed.label))
        .map((seed) => ({ label: seed.label, content: seed.content, dropped: seed.dropped })),
    },
    actorOf(actor),
  )
  if (outcome.status === "taken") return outcome
  return redirect(href(locale, adminDraftPath(outcome.researchId, outcome.draftId)))
}

// === adding datasets to a draft ===

/**
 * What a typed accession can add to a draft. **A branch is not chosen here** —
 * a whole application goes in through the table of this research's own
 * branches, on the screen that takes an application in
 * (`upstreamDraftPage`).
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
  const accession = url.searchParams.get("accession") ?? ""
  const catalog = await loadCatalogWithTerms(db)
  const listing = { ...at, locale, accession }

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

  if (accession === "") return { ...listing, chosen: null, unknown: null }

  const read = await withApplicationDb(async (connection) => {
    const named = JGAD.test(accession)
      ? await fetchAccessionBranchId(connection.pool, connection.schema, accession)
      : null
    const branch = named === null
      ? null
      : await fetchDsBranch(connection.pool, connection.schema, named)
    if (branch === null) return null
    // A typed accession takes only itself, not the rest of the branch it came in.
    const seeds = await jgadSeeds(connection, branch, catalog)
    return { branch, seeds: seeds.filter((seed) => seed.label === accession) }
  })

  if (read == null || read.seeds.length === 0) return { ...listing, chosen: null, unknown: accession }
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

  // Each submission is a round trip to another service, and a curator can tick
  // several at once, so they are asked for together rather than in turn.
  const dra = await Promise.all([...wanted]
    .filter((value) => DRA.test(value))
    .map((accession) => fetchDraSubmission(accession)))
  for (const submission of dra) {
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
    { researchId, datasets: seeds.map((seed) => ({ label: seed.label, content: seed.content, dropped: seed.dropped })) },
    actorOf(actor),
  )
  if (outcome.status === "gone") notFound()
  if (outcome.status !== "added") return outcome
  return redirect(href(locale, adminDraftDatasetsPath(researchId, draftId)))
}

/**
 * This research's own branches, newest approval first, for the take-in
 * screen's table. Null where the application system cannot be reached.
 */
export async function applicationBranches(
  db: Executor,
  humLabel: string | null,
): Promise<UpstreamBranchView[] | null> {
  const rows = await withApplicationDb((connection) =>
    humLabel === null
      ? Promise.resolve([])
      : searchDsBranches(connection.pool, connection.schema, humLabel, null))
  if (rows === null) return null

  const matched = humLabel === null ? [] : rows.filter((row) => row.humLabel === humLabel)
  return branchViews(db, matched)
}

/** One branch as a source, with the datasets it registered. */
export type ApplicationRead
  = | { status: "unconnected" }
    | { status: "unknown" }
    | {
      status: "found"
      branch: DsBranchDetail
      view: UpstreamBranchView
      choice: UpstreamChoiceView
    }

export async function readApplication(db: Executor, applicationId: string): Promise<ApplicationRead> {
  const catalog = await loadCatalogWithTerms(db)
  const read = await withApplicationDb(async (connection) => {
    const branch = await fetchDsBranch(connection.pool, connection.schema, applicationId)
    return { branch, seeds: branch === null ? [] : await jgadSeeds(connection, branch, catalog) }
  })
  if (read === null) return { status: "unconnected" }
  if (read.branch === null) return { status: "unknown" }

  const choice = await choiceOf(db, { applicationId, branch: read.branch, seeds: read.seeds })
  const [view] = await branchViews(db, [read.branch])
  if (view === undefined) return { status: "unknown" }
  return { status: "found", branch: read.branch, view, choice }
}

/**
 * Writing what the curator decided for a branch: the content as written on the
 * face, and the datasets ticked, in one transaction (`applyUpstreamToDraft`).
 *
 * **The datasets are read again**; the form sends which accessions to create
 * and nothing else (the header of this file).
 */
export async function takeApplication(
  db: Parameters<typeof applyUpstreamToDraft>[0],
  at: { draftId: string, revision: number },
  seed: { researchId: string, applicationId: string, content: ResearchContent, accessions: ReadonlySet<string> },
  actor: Actor,
): Promise<{ status: "gone" } | { status: "added" } | UpstreamResult> {
  const catalog = await loadCatalogWithTerms(db)
  const read = await withApplicationDb(async (connection) => {
    const branch = await fetchDsBranch(connection.pool, connection.schema, seed.applicationId)
    if (branch === null) return null
    return { branch, seeds: await jgadSeeds(connection, branch, catalog) }
  })
  if (read == null) return { status: "gone" }

  const outcome = await applyUpstreamToDraft(
    db,
    at,
    {
      researchId: seed.researchId,
      content: seed.content,
      datasets: chosen(read.seeds, seed.accessions),
    },
    actorOf(actor),
  )
  if (outcome.status === "added") return { status: "added" }
  return outcome
}

// === shared ===

/**
 * Seeding writes content and pins labels, so it asks for both. Asking once here
 * rather than at each write is what keeps a screen from offering a button that
 * would be refused halfway through.
 */
export async function requireSeeding(request: Request): Promise<Actor> {
  const actor = await requireCapability(request, "edit-content")
  if (!can(actor, "manage-labels")) {
    throw new Response(null, { status: 403, statusText: "Forbidden" })
  }
  return actor
}

async function draftAt(
  db: Executor,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<{ researchId: string, draftId: string, revision: number, humLabel: string | null }> {
  const researchId = identity(params.researchId)
  const draftId = identity(params.draftId)
  const draft = await readDraft(db, draftId)
  if (draft?.researchId !== researchId) notFound()
  return { researchId, draftId, revision: draft.revision, humLabel: await humLabelOf(db, researchId) }
}

function accessionsIn(form: FormData): Set<string> {
  return new Set(
    form.getAll("accession").filter((value): value is string => typeof value === "string"),
  )
}

function chosen(seeds: readonly DatasetSeed[], wanted: ReadonlySet<string>): SeededDataset[] {
  return seeds
    .filter((seed) => wanted.has(seed.label))
    .map((seed) => ({ label: seed.label, content: seed.content, dropped: seed.dropped }))
}

function readString(form: FormData, name: string): string | null {
  const value = form.get(name)
  return typeof value === "string" && value !== "" ? value : null
}
