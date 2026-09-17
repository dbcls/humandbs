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

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import type { Pool } from "pg"
import { redirect } from "react-router"

import { requireCapability } from "~/auth/actor.server"
import { can, type Actor } from "~/auth/capabilities"
import { loadConfig } from "~/config.server"
import { getDb, type Executor } from "~/db/client.server"
import { dataset, labelPin, researchDraft, researchVersion } from "~/db/schema"
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
  draftToTakeInto,
  type SeededDataset,
} from "./drafts.server"
import {
  axisCounts,
  BRANCH_REGISTRATIONS,
  BRANCH_SORT,
  BRANCH_STANDINGS,
  branchOrder,
  branchStanding,
  filterBranchRows,
  isBranchRegistration,
  isBranchSortKey,
  isBranchStanding,
  pageOf,
  sortBranchRows,
  type BranchRegistration,
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
  contentWithUpstream,
  draDatasetSeed,
  jgadDatasetSeed,
  MERGE_FIELDS,
  mergeRows,
  researchContentFrom,
  upstreamProvider,
  type DatasetSeed,
  type DroppedValue,
  type MergeRow,
} from "./templates"
import {
  adminDraftDatasetsPath,
  adminDraftPath,
  adminDraftUpstreamPath,
  adminUpstreamResearchPath,
  upstreamQuery,
} from "./urls"

/** What a draft's identity looks like, so an address naming anything else names no draft. */
const DRAFT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  registrations: BranchRegistration[]
  /**
   * How many branches each choice of the pane would leave, counted the way the
   * public panel counts (`app/admin/listing.ts` の `axisCounts`).
   */
  counts: {
    standings: Record<BranchStanding, number>
    registrations: Record<BranchRegistration, number>
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
  /** The draft the branches are being chosen for, when the listing was opened from one. */
  target: UpstreamTargetView | null
}

/**
 * The draft a branch is being chosen for.
 *
 * **Opened from a draft, the question is only which branch** — where it goes is
 * already answered, so the listing says so and the branch screen offers that
 * draft and nothing else (`docs/editing.md` の「行き先」).
 */
export interface UpstreamTargetView {
  researchId: string
  draftId: string
  humLabel: string | null
}

/** The research a branch's hum label already names, and what it holds. */
export interface UpstreamHolderView {
  researchId: string
  humLabel: string
  /** The newest published version, when the research has one. */
  latestNumber: number | null
  drafts: {
    draftId: string
    copiedFromNumber: number | null
    takenBranches: string[]
    updatedAt: string
  }[]
}

/** One branch: what taking it would bring, and where it can go. */
export interface UpstreamBranchPageView {
  locale: Locale
  connected: boolean
  applicationId: string
  branch: UpstreamBranchView | null
  chosen: UpstreamChoiceView | null
  holder: UpstreamHolderView | null
  target: UpstreamTargetView | null
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
 * upstream.** Two of the three things a curator narrows by — whether the portal
 * already holds the hum label, and whether anything has been registered — are
 * the portal's own answer about the branch, which the application system has no
 * way to know. Reading all of them costs what reading thirty costs
 * (`upstream/application-db.server.ts`).
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
    registrations: url.searchParams.getAll("registered").filter(isBranchRegistration),
  }
  const askedSort = url.searchParams.get("sort")
  const sort = isBranchSortKey(askedSort) ? askedSort : BRANCH_SORT
  const askedOrder = url.searchParams.get("order")
  const order = isSortOrder(askedOrder) ? askedOrder : branchOrder(sort)
  const askedSize = Number(url.searchParams.get("size") ?? "")
  const size: PageSize = isPageSize(askedSize) ? askedSize : PAGE_SIZE
  const presented = { ...filter, keyword, sort, order, size, target: await targetOf(db, url) }

  const rows = await withApplicationDb((at) =>
    searchDsBranches(at.pool, at.schema, keyword, null))
  if (rows === null) {
    return {
      locale,
      connected: false,
      ...presented,
      counts: {
        standings: axisCounts([], BRANCH_STANDINGS, () => false),
        registrations: axisCounts([], BRANCH_REGISTRATIONS, () => false),
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
  // Each axis is counted over the branches the *other* axis leaves, so that a
  // second standing is still reachable after the first has been ticked.
  const counts = {
    standings: axisCounts(
      filterBranchRows(found, { ...filter, standings: [] }),
      BRANCH_STANDINGS,
      (row, standing) => branchStanding(row) === standing,
    ),
    registrations: axisCounts(
      filterBranchRows(found, { ...filter, registrations: [] }),
      BRANCH_REGISTRATIONS,
      (row, registration) => (row.datasets.length === 0 ? "none" : "some") === registration,
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
 * One branch: what it would bring, and every draft it could be brought into.
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
  const target = await targetOf(db, new URL(request.url))
  if (read === null) {
    return { locale, connected: false, applicationId, branch: null, chosen: null, holder: null, target }
  }
  if (read.branch === null) notFound()

  const [view] = await branchViews(db, [read.branch])
  return {
    locale,
    connected: true,
    applicationId,
    target,
    branch: view ?? null,
    chosen: await choiceOf(db, { applicationId, branch: read.branch, seeds: read.seeds }),
    holder: view?.heldBy === undefined || view.heldBy === null || view.humLabel === null
      ? null
      : await holderView(db, view.heldBy, view.humLabel),
  }
}

/**
 * Where the branch goes.
 *
 * **Only the new research is written here.** It has nothing to be put beside,
 * so the choice on this screen is already the whole of it. The other three
 * arrive at a draft and the taking happens there, which is why they answer with
 * a redirect and no write of their own — except the draft that has to exist
 * first, which is made as a copy of the newest version.
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
  const into = readString(form, "into")

  if (into?.startsWith("draft:") === true) {
    const draftId = identity(into.slice("draft:".length))
    const draft = await readDraft(db, draftId)
    if (draft === null) notFound()
    return redirect(takingInto(locale, draft.researchId, draftId, applicationId))
  }

  if (into === "replacement" || into === "next-version") {
    const researchId = identity(readString(form, "research") ?? undefined)
    const draftId = await draftToTakeInto(db, researchId, into)
    if (draftId === null) notFound()
    return redirect(takingInto(locale, researchId, draftId, applicationId))
  }

  if (into !== "new") badRequest()
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
      applicationId,
      content: researchContentFrom(read.branch),
      datasets: chosen(read.seeds, accessionsIn(form)),
    },
    actorOf(actor),
  )
  if (outcome.status === "taken") return outcome
  return redirect(href(locale, adminDraftPath(outcome.researchId, outcome.draftId)))
}

function takingInto(
  locale: Locale,
  researchId: string,
  draftId: string,
  applicationId: string,
): string {
  return href(
    locale,
    adminDraftUpstreamPath(researchId, draftId) + upstreamQuery({ applicationId }),
  )
}

/** The versions and drafts of the research a branch's hum names. */
async function holderView(
  db: Executor,
  researchId: string,
  humLabel: string,
): Promise<UpstreamHolderView> {
  const [versions, drafts] = await Promise.all([
    db
      .select({ number: researchVersion.number })
      .from(researchVersion)
      .where(eq(researchVersion.researchId, researchId))
      .orderBy(desc(researchVersion.number))
      .limit(1),
    db
      .select({
        draftId: researchDraft.id,
        copiedFromNumber: researchDraft.copiedFromNumber,
        takenBranches: researchDraft.takenBranches,
        updatedAt: researchDraft.updatedAt,
      })
      .from(researchDraft)
      .where(eq(researchDraft.researchId, researchId))
      .orderBy(asc(researchDraft.createdAt)),
  ])
  return {
    researchId,
    humLabel,
    latestNumber: versions[0]?.number ?? null,
    drafts: drafts.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
  }
}

// === adding datasets to a draft ===

/**
 * What a typed accession can add to a draft. **Branches are not chosen here** —
 * the listing of branches is the one place a branch is chosen, and a draft opens
 * it aimed at itself (`upstreamResearchPage`'s `target`).
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
    { researchId, datasets: seeds.map((seed) => ({ label: seed.label, content: seed.content })) },
    actorOf(actor),
  )
  if (outcome.status === "gone") notFound()
  if (outcome.status !== "added") return outcome
  return redirect(href(locale, adminDraftDatasetsPath(researchId, draftId)))
}

/** The provider an application states, as one line per language. */
export interface UpstreamProviderView {
  nameJa: string
  nameEn: string
  affiliationJa: string
  affiliationEn: string
}

export interface UpstreamDraftView {
  locale: Locale
  connected: boolean
  researchId: string
  draftId: string
  revision: number
  humLabel: string | null
  /** The branch being taken in. */
  branch: UpstreamBranchView | null
  /** The draft and the application, field by field. */
  merge: MergeRow[] | null
  /** Offered whole, and only when the draft does not already name this person. */
  provider: UpstreamProviderView | null
  datasets: DatasetChoiceView[]
  dropped: DroppedValue[]
  unreachable: string[]
}

/**
 * Taking an application into a draft that exists.
 *
 * **A branch is always named on the way in.** Which branch to take is settled
 * one screen back, on the branch's own; a second list here would be a second
 * place to answer the same question.
 */
export async function upstreamDraftPage(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<UpstreamDraftView> {
  await requireSeeding(request)
  const db = getDb()
  const at = await draftAt(db, params)
  const draft = await readDraft(db, at.draftId)
  if (draft === null) notFound()

  const applicationId = new URL(request.url).searchParams.get("application")
  if (applicationId === null) throw redirect(href(locale, adminUpstreamResearchPath()))

  const nothing = {
    ...at,
    locale,
    connected: false,
    branch: null,
    merge: null,
    provider: null,
    datasets: [],
    dropped: [],
    unreachable: [],
  }

  const catalog = await loadCatalogWithTerms(db)
  const read = await withApplicationDb(async (connection) => {
    const branch = await fetchDsBranch(connection.pool, connection.schema, applicationId)
    if (branch === null) return null
    return { branch, seeds: await jgadSeeds(connection, branch, catalog) }
  })
  if (read == null) return nothing

  const choice = await choiceOf(db, {
    applicationId,
    branch: read.branch,
    seeds: read.seeds,
    unreachable: [],
  })
  const [view] = await branchViews(db, [read.branch])
  return {
    ...nothing,
    connected: true,
    branch: view ?? null,
    merge: mergeRows(draft.content, read.branch),
    provider: providerView(read.branch),
    datasets: choice.datasets,
    dropped: choice.dropped,
    unreachable: choice.unreachable,
  }
}

/**
 * Writing what the curator decided.
 *
 * **Nothing is merged here.** The boxes arrive holding the answer, so this puts
 * them into the content and appends whichever datasets were ticked
 * (`docs/editing.md` の「下書きを外から作る」).
 */
export async function upstreamDraftAction(
  request: Request,
  locale: Locale,
  params: { researchId: string | undefined, draftId: string | undefined },
): Promise<Response | UpstreamResult> {
  const actor = await requireSeeding(request)
  const db = getDb()
  const { researchId, draftId } = await draftAt(db, params)
  const draft = await readDraft(db, draftId)
  if (draft === null) notFound()

  const form = await request.formData()
  const revision = Number(form.get("revision"))
  if (!Number.isInteger(revision)) badRequest()
  const applicationId = readString(form, "application")
  if (applicationId === null) badRequest()

  const written = new Map<string, string>()
  for (const field of MERGE_FIELDS) {
    for (const language of ["ja", "en"] as const) {
      const at = `${field}.${language}`
      written.set(at, readString(form, at) ?? "")
    }
  }
  const wanted = accessionsIn(form)
  const withProvider = form.get("provider") !== null

  const catalog = await loadCatalogWithTerms(db)
  const read = await withApplicationDb(async (connection) => {
    const branch = await fetchDsBranch(connection.pool, connection.schema, applicationId)
    if (branch === null) return null
    return { branch, seeds: await jgadSeeds(connection, branch, catalog) }
  })
  if (read == null) notFound()

  const written_ = contentWithUpstream(draft.content, written)
  const provider = withProvider ? upstreamProvider(read.branch) : null
  const content = provider === null
    ? written_
    : { ...written_, dataProviders: [...written_.dataProviders, provider] }

  const outcome = await applyUpstreamToDraft(
    db,
    { draftId, revision },
    {
      researchId,
      applicationId,
      content,
      datasets: chosen(read.seeds, wanted),
    },
    actorOf(actor),
  )
  if (outcome.status === "gone") notFound()
  if (outcome.status !== "added") return outcome
  return redirect(href(locale, adminDraftPath(researchId, draftId)))
}

function providerView(branch: DsBranchDetail): UpstreamProviderView | null {
  if (branch.piNameJa === "" && branch.piNameEn === "") return null
  return {
    nameJa: branch.piNameJa,
    nameEn: branch.piNameEn,
    affiliationJa: branch.affiliationJa,
    affiliationEn: branch.affiliationEn,
  }
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

/**
 * The draft the branch screens are choosing for, when the address names one.
 *
 * **A draft that cannot be read is no draft.** An address outlives the draft it
 * was copied from, and answering 404 for it would take the listing away along
 * with the aim — so the listing opens as it does from the bar.
 */
async function targetOf(db: Executor, url: URL): Promise<UpstreamTargetView | null> {
  const asked = url.searchParams.get("draft")
  if (asked === null || !DRAFT_ID.test(asked)) return null
  const draft = await readDraft(db, asked)
  if (draft === null) return null
  return { researchId: draft.researchId, draftId: asked, humLabel: await humLabelOf(db, draft.researchId) }
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
    .map((seed) => ({ label: seed.label, content: seed.content }))
}

function readString(form: FormData, name: string): string | null {
  const value = form.get(name)
  return typeof value === "string" && value !== "" ? value : null
}
