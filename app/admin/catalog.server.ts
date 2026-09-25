/**
 * The catalog screens: what they read, and what their forms do.
 *
 * Everything here requests `manage-catalog`. Nothing here is written to the
 * event log — what that records is the operations that changed what is
 * published, and a catalog entry is a definition rather than a publication.
 *
 * **Every write rebuilds the search rows.** Some catalog changes reach them and
 * some do not — renaming a term does not, because labels are joined at query
 * time — but working out which is which at each call site is how the two
 * would come apart. A full rebuild is a few seconds on this corpus and is
 * meant to be ordinary.
 *
 * **What is in use cannot be removed.** A key is in use when a dataset holds a
 * value under it, published or in a draft; a term is in use when a value names
 * it. A term that has served its purpose is merged into another instead, which
 * rewrites everything that identifies it and then removes it.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import { requireCapability } from "~/auth/actor.server"
import { getDb, type Executor } from "~/db/client.server"
import {
  contentKey,
  draftDatasetEntry,
  researchVersion,
  searchDoc,
  vocabularySet,
  vocabularyTerm,
} from "~/db/schema"
import { versionWithTermMerged } from "~/content/terms"
import { pageRange } from "~/paging"
import type { Locale } from "~/i18n/locale"
import { readLocale } from "~/public/urls"
import { isPageSize, PAGE_SIZE, type PageSize } from "~/search/page-size"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import {
  codeFrom,
  codeProblem,
  filterKeyRows,
  freeCode,
  freeKeyCode,
  isKeyValueType,
  KEY_VALUE_TYPES,
  moved,
  movedTo,
  SETTLED_VOCABULARIES,
  termCodeProblem,
  TERM_SORT,
  TERM_SORT_KEYS,
  type KeyFilter,
  type KeyValueType,
  type TermSortKey,
} from "./catalog"
import { mergeTermInDrafts } from "./drafts.server"
import { lockAllResearches } from "./locks.server"
import { axisCounts } from "./listing"

export interface CatalogKeyRow {
  id: string
  code: string
  scope: "dataset" | "experiment"
  valueType: "text" | "single" | "accession" | "vocabulary" | "number" | "disease"
  labelJa: string
  labelEn: string
  position: number
  vocabularySetCode: string | null
  /** How many terms the field draws from, or null when it draws from none. */
  terms: number | null
  canonicalUnit: string | null
  /** How many published datasets hold a value under the key (`publishedDatasetsByKey`). */
  used: number
  /**
   * Whether a published or drafted description holds a value under the key —
   * the same question `deleteKey` checks, answered up front so the screen can report
   * why the key cannot go rather than letting the press find out. Not `used > 0`:
   * a draft holds a key without any dataset being published under it.
   */
  inUse: boolean
}

export interface VocabularyRow {
  id: string
  code: string
  labelJa: string
  labelEn: string
  hierarchical: boolean
  terms: number
}

/**
 * The fields screen.
 *
 * **Only the fields an analysis method has are here.** The two a dataset
 * has hold what the portal is rather than what the data brings, so the
 * migration puts them in and nothing edits them afterwards.
 *
 * **The vocabularies are not a list of their own.** Each belongs to exactly one
 * field, so the field's row has how many terms it draws from and the way to
 * open them — a list called 「語彙」 beside the fields could only be read as a
 * second, unrelated thing.
 */
export interface CatalogView {
  locale: Locale
  /** The fields the conditions leave, in the order the public table has them. */
  keys: CatalogKeyRow[]
  /** The conditions in force, as the address has them. */
  keyword: string
  types: KeyValueType[]
  /**
   * How many fields each choice of the pane would leave, counted the way the
   * other listings count (`app/admin/listing.ts` の `axisCounts`).
   */
  counts: {
    types: Record<KeyValueType, number>
  }
}

export interface TermRow {
  id: string
  code: string
  labelJa: string | null
  labelEn: string
  /** How many published datasets have this value (`usageOfTerms`). */
  used: number
  /**
   * Whether a published or drafted value points at the term. Not the same
   * question as `used`: a draft holds the term without any dataset being
   * published under it, and that is enough to keep it from being deleted.
   */
  inUse: boolean
}

export interface VocabularyView {
  locale: Locale
  sort: TermSortKey
  order: "asc" | "desc"
  size: PageSize
  /** The field the terms belong to. **Its label is what the screen is called.** */
  field: { code: string, labelJa: string, labelEn: string }
  set: VocabularyRow
  terms: TermRow[]
  page: number
  pageCount: number
  /** 1-based positions of the shown terms within what the box matched. */
  rangeFrom: number
  rangeTo: number
  find: string
  /**
   * Whether this vocabulary is the administrator's to change. A settled one is
   * read here and edited nowhere, so the screen opens with nothing to press
   * rather than refusing to open.
   */
  editable: boolean
  /**
   * The term a merge is being aimed from, when the address names one.
   *
   * **Choosing where to merge a term into is choosing a row of this listing.** A
   * vocabulary runs to a few hundred values, so a panel holding them all would
   * be a select of every term on every row; putting the choice back into the
   * listing gives it the box and the pages that are already there.
   */
  mergeFrom: TermRow | null
}

/** What a form did, when it did not simply work. */
export type CatalogProblem
  = | "no-code"
    | "duplicate-code"
    | "missing-label"
    | "in-use"
    | "not-editable"
    | "unknown-target"

/** Everything the screens may request of the catalog, by the name the form sends. */
export type CatalogIntent
  = | "create-key"
    | "update-key"
    | "move-key-up"
    | "move-key-down"
    | "move-key-to"
    | "delete-key"
    | "create-term"
    | "update-term"
    | "delete-term"
    | "merge-term"

const INTENTS: ReadonlySet<string> = new Set<CatalogIntent>([
  "create-key", "update-key", "move-key-up", "move-key-down", "move-key-to", "delete-key",
  "create-term", "update-term", "delete-term", "merge-term",
])

function isIntent(intent: string): intent is CatalogIntent {
  return INTENTS.has(intent)
}

/** Where a row went: its place before and after, 0-based, out of how many. */
export interface Moved {
  id: string
  from: number
  to: number
  of: number
}

/** What one operation came to, before the action reports which operation it was. */
type Outcome = { status: "ok", moved?: Moved } | { status: CatalogProblem }

/**
 * What the form did.
 *
 * **The answer names the action** (`did`), so that the screen can report "key を
 * 作成しました" rather than "保存しました" for everything, and a move reports
 * where the row went (`moved`) — which is also what taking it back needs.
 */
export type CatalogResult
  = | { status: "ok", did: CatalogIntent, moved?: Moved }
    | { status: CatalogProblem }

/**
 * **A total order.** Labels repeat where codes cannot, so the code decides
 * between two rows sharing one: a pair left unordered swaps between requests
 * and is read twice or missed altogether across a page boundary.
 */
function termOrder(sort: TermSortKey, order: "asc" | "desc") {
  const direction = order === "asc" ? asc : desc
  return sort === "label"
    ? [direction(vocabularyTerm.labelEn), asc(vocabularyTerm.code)]
    : [direction(vocabularyTerm.code)]
}

async function keyRows(db: Executor): Promise<Omit<CatalogKeyRow, "inUse" | "used">[]> {
  return db
    .select({
      id: contentKey.id,
      code: contentKey.code,
      scope: contentKey.scope,
      valueType: contentKey.valueType,
      labelJa: contentKey.labelJa,
      labelEn: contentKey.labelEn,
      position: contentKey.position,
      vocabularySetCode: vocabularySet.code,
      // Null rather than zero on a field that draws from no vocabulary at all:
      // "no terms yet" and "not that kind of field" are different answers.
      terms: sql<number | null>`case when ${vocabularySet.id} is null then null
        else count(${vocabularyTerm.id})::int end`,
      canonicalUnit: contentKey.canonicalUnit,
    })
    .from(contentKey)
    .leftJoin(vocabularySet, eq(vocabularySet.id, contentKey.vocabularySetId))
    .leftJoin(vocabularyTerm, eq(vocabularyTerm.setId, vocabularySet.id))
    .groupBy(contentKey.id, vocabularySet.id, vocabularySet.code)
    .orderBy(asc(contentKey.scope), asc(contentKey.position), asc(contentKey.code))
}

export async function catalogPage(request: Request): Promise<CatalogView> {
  await requireCapability(request, "manage-catalog")
  const db = getDb()
  const url = new URL(request.url)
  const used = await publishedDatasetsByKey(db)
  const drafted = await draftedKeyIds(db)
  const fields = (await keyRows(db))
    .filter((key) => key.scope === "experiment")
    .map((key) => {
      const count = used.get(key.id) ?? 0
      return { ...key, used: count, inUse: count > 0 || drafted.has(key.id) }
    })

  const types = url.searchParams.getAll("type").filter(isKeyValueType)
  const filter: KeyFilter = {
    keyword: url.searchParams.get("q") ?? "",
    types,
  }

  // Each axis is counted over the fields the *other* conditions leave, so that
  // a second value of an axis is still reachable after the first is ticked.
  const counts = {
    types: axisCounts(
      filterKeyRows(fields, { ...filter, types: [] }),
      KEY_VALUE_TYPES,
      (row, value) => row.valueType === value,
    ),
  }

  return {
    locale: readLocale(url.pathname).locale,
    keys: filterKeyRows(fields, filter),
    keyword: filter.keyword,
    types,
    counts,
  }
}

/**
 * The terms one field draws its values from.
 *
 * **It is addressed by the field, not by the vocabulary**, which is what lets
 * the screen be titled with what the terms are the terms *of* (`admin/urls.ts`).
 *
 * **A settled vocabulary has no screen here at all.** What it may hold is fixed
 * by what the portal is, so there would be nothing on it to do, and a screen
 * that can only refuse is worse than no screen
 * (`admin/catalog.ts` の `SETTLED_VOCABULARIES`).
 */
export async function fieldTermsPage(
  request: Request,
  keyCode: string,
): Promise<VocabularyView | null> {
  await requireCapability(request, "manage-catalog")
  const db = getDb()
  const url = new URL(request.url)
  const find = url.searchParams.get("find") ?? ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1)
  const asked = url.searchParams.get("sort")
  const sort = TERM_SORT_KEYS.find((one) => one === asked) ?? TERM_SORT
  const order = url.searchParams.get("order") === "desc" ? "desc" : "asc"
  const askedSize = Number(url.searchParams.get("size") ?? "")
  const size: PageSize = isPageSize(askedSize) ? askedSize : PAGE_SIZE

  const [found] = await db
    .select({
      keyCode: contentKey.code,
      keyLabelJa: contentKey.labelJa,
      keyLabelEn: contentKey.labelEn,
      id: vocabularySet.id,
      code: vocabularySet.code,
      labelJa: vocabularySet.labelJa,
      labelEn: vocabularySet.labelEn,
      hierarchical: vocabularySet.hierarchical,
    })
    .from(contentKey)
    .innerJoin(vocabularySet, eq(vocabularySet.id, contentKey.vocabularySetId))
    .where(and(eq(contentKey.code, keyCode), eq(contentKey.scope, "experiment")))
    .limit(1)
  if (found === undefined) return null
  // **A settled vocabulary opens; it just offers nothing to press.** What it
  // holds is part of what the portal is rather than of what the data brings, so
  // reading it is an ordinary thing to want, and every write path already
  // refuses it (`refusedTerm`, `createTerm`). Answering 404 left the table's
  // column of values leading nowhere for 8 of the 20 vocabularies.
  const editable = !SETTLED_VOCABULARIES.has(found.code)
  const { keyCode: fieldCode, keyLabelJa, keyLabelEn, ...set } = found
  const field = { code: fieldCode, labelJa: keyLabelJa, labelEn: keyLabelEn }

  const matching = find === ""
    ? sql`TRUE`
    : sql`(${vocabularyTerm.code} ILIKE ${`%${find}%`}
        OR ${vocabularyTerm.labelEn} ILIKE ${`%${find}%`}
        OR coalesce(${vocabularyTerm.labelJa}, '') ILIKE ${`%${find}%`})`

  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vocabularyTerm)
    .where(and(eq(vocabularyTerm.setId, set.id), matching))
  const pageCount = Math.max(1, Math.ceil((total?.count ?? 0) / size))
  const at = Math.min(page, pageCount)

  const rows = await db
    .select({
      id: vocabularyTerm.id,
      code: vocabularyTerm.code,
      labelJa: vocabularyTerm.labelJa,
      labelEn: vocabularyTerm.labelEn,
    })
    .from(vocabularyTerm)
    .where(and(eq(vocabularyTerm.setId, set.id), matching))
    .orderBy(...termOrder(sort, order))
    .limit(size)
    .offset((at - 1) * size)

  const used = await usageOfTerms(db, rows.map((row) => row.id))
  const held = await usedTermIds(db)

  // Read on its own rather than found among the rows: the term being merged is
  // named by the address, and the page it sits on is not the page being read.
  const aimedFrom = url.searchParams.get("mergeFrom") ?? ""
  const [aimed] = aimedFrom === ""
    ? []
    : await db
        .select({
          id: vocabularyTerm.id,
          code: vocabularyTerm.code,
          labelJa: vocabularyTerm.labelJa,
          labelEn: vocabularyTerm.labelEn,
        })
        .from(vocabularyTerm)
        // Compared as text: the address has whatever was typed, and a
        // uuid column refuses anything that is not one.
        .where(and(
          eq(vocabularyTerm.setId, set.id),
          sql`${vocabularyTerm.id}::text = ${aimedFrom}`,
        ))
        .limit(1)
  const aimedUsed = aimed === undefined ? new Map() : await usageOfTerms(db, [aimed.id])

  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    sort,
    order,
    size,
    field,
    set: { ...set, terms: total?.count ?? 0 },
    terms: rows.map((row) => ({ ...row, used: used.get(row.id) ?? 0, inUse: held.has(row.id) })),
    page: at,
    pageCount,
    ...pageRange(at, size, total?.count ?? 0),
    find,
    editable,
    mergeFrom: aimed === undefined
      ? null
      : { ...aimed, used: (aimedUsed.get(aimed.id) ?? 0) as number, inUse: held.has(aimed.id) },
  }
}

/**
 * Whether anything holds a value under this key. The published content and the
 * drafts are both asked: a key that only a draft uses is still one whose removal
 * would leave a value nobody can render.
 */
async function keyInUse(db: Executor, keyId: string): Promise<boolean> {
  const match = sql`jsonb_path_exists(content, '$.**.keyId ? (@ == $id)', ${JSON.stringify({ id: keyId })}::jsonb)`
  // Every published description is in the rows the public side reads, which is
  // one place to request rather than one version row per version.
  const [published] = await db
    .select({ hit: sql<number>`1` })
    .from(searchDoc)
    .where(and(eq(searchDoc.targetType, "dataset"), match))
    .limit(1)
  if (published !== undefined) return true
  const [drafted] = await db
    .select({ hit: sql<number>`1` })
    .from(draftDatasetEntry)
    .where(match)
    .limit(1)
  return drafted !== undefined
}

/**
 * How many published datasets hold a value under each key.
 *
 * **One question for the whole table**, asked the way `keyInUse` checks it for one
 * key: the listing needs the answer for every row, and a path query per row
 * over every description is the same work done eighty times. Datasets only,
 * for the reason `usageOfTerms` gives.
 */
async function publishedDatasetsByKey(db: Executor): Promise<Map<string, number>> {
  const rows = await db.execute<{ id: string, n: number }>(sql`
    SELECT held #>> '{}' AS id, count(DISTINCT doc.id)::int AS n
    FROM search_doc AS doc, jsonb_path_query(doc.content, '$.**.keyId') AS held
    WHERE doc.target_type = 'dataset'
    GROUP BY 1
  `)
  return new Map(rows.rows.map((row) => [row.id, row.n]))
}

/** Every key a draft holds a value under: the other half of what `keyInUse` checks. */
async function draftedKeyIds(db: Executor): Promise<Set<string>> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT held #>> '{}' AS id
    FROM draft_dataset_entry, jsonb_path_query(content, '$.**.keyId') AS held
  `)
  return new Set(rows.rows.map((row) => row.id))
}

/**
 * Every term a published or drafted value points at, from both of the shapes
 * `pointingAt` reads (a vocabulary slot, and the diseases inside a disease
 * slot). The set-valued form of `termInUse`, for the reason `usedKeyIds` gives.
 */
async function usedTermIds(db: Executor): Promise<Set<string>> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT held #>> '{}' AS id FROM (
      SELECT jsonb_path_query(content, '$.**.termIds.value[*]') AS held
      FROM search_doc WHERE target_type = 'dataset'
      UNION ALL
      SELECT jsonb_path_query(content, '$.**.diseases.value[*].termIds[*]')
      FROM search_doc WHERE target_type = 'dataset'
      UNION ALL
      SELECT jsonb_path_query(content, '$.**.termIds.value[*]') FROM draft_dataset_entry
      UNION ALL
      SELECT jsonb_path_query(content, '$.**.diseases.value[*].termIds[*]') FROM draft_dataset_entry
    ) AS q
  `)
  return new Set(rows.rows.map((row) => row.id))
}

/**
 * How many published datasets have each of the given terms.
 *
 * **Datasets only.** A research row has every term its datasets do, so
 * counting both kinds of row reports 22 where the public listing the count leads
 * to (`datasetsUsing`) shows 12 — and a number that does not match what it
 * opens is worse than none. Drafts are not counted either: the count is what
 * a reader of the site can find.
 */
async function usageOfTerms(
  db: Executor,
  termIds: readonly string[],
): Promise<Map<string, number>> {
  if (termIds.length === 0) return new Map()
  const rows = await db.execute<{ term_id: string, n: number }>(sql`
    SELECT term_id, count(DISTINCT doc_id)::int AS n
    FROM search_facet_term
    JOIN search_doc ON search_doc.id = search_facet_term.doc_id
      AND search_doc.target_type = 'dataset'
    WHERE term_id IN (${sql.join(termIds.map((id) => sql`${id}::uuid`), sql`, `)})
    GROUP BY term_id
  `)
  return new Map(rows.rows.map((row) => [row.term_id, row.n]))
}

/**
 * **Two shapes hold identities.** A vocabulary value keeps them in its own slot;
 * a disease keeps them inside each disease of its slot, so a path written for
 * one reads nothing of the other and a term nothing but diseases name would
 * look free to delete.
 */
function pointingAt(termId: string) {
  const id = JSON.stringify({ id: termId })
  return sql`(
    jsonb_path_exists(content, '$.**.termIds.value[*] ? (@ == $id)', ${id}::jsonb)
    OR jsonb_path_exists(content, '$.**.diseases.value[*].termIds[*] ? (@ == $id)', ${id}::jsonb)
  )`
}

async function termInUse(db: Executor, termId: string): Promise<boolean> {
  const match = pointingAt(termId)
  const [published] = await db
    .select({ hit: sql<number>`1` })
    .from(searchDoc)
    .where(and(eq(searchDoc.targetType, "dataset"), match))
    .limit(1)
  if (published !== undefined) return true
  const [drafted] = await db
    .select({ hit: sql<number>`1` })
    .from(draftDatasetEntry)
    .where(match)
    .limit(1)
  return drafted !== undefined
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value.trim() : ""
}

/** A new entry goes last in whatever it belongs to. */
async function nextPosition(db: Executor, scope: "dataset" | "experiment"): Promise<number> {
  const [row] = await db
    .select({ last: sql<number>`coalesce(max(${contentKey.position}), -1)::int` })
    .from(contentKey)
    .where(eq(contentKey.scope, scope))
  return (row?.last ?? -1) + 1
}

/**
 * **The catalogue is written and the search rows are made again.** Which change
 * could reach a row is not worked out operation by operation — doing that is
 * how the one that does reach a row ends up not indicating so.
 *
 * **Where a key is placed is the exception.** The refinement panel is ordered by
 * `position` as each page is asked for, so rebuilding every document to move
 * one row rewrites the same documents it started with.
 */
const ORDER_ONLY: ReadonlySet<CatalogIntent> = new Set<CatalogIntent>(["move-key-up", "move-key-down", "move-key-to"])

export async function catalogAction(request: Request): Promise<CatalogResult> {
  await requireCapability(request, "manage-catalog")
  const form = await request.formData()
  const intent = text(form, "intent")
  if (!isIntent(intent)) return { status: "unknown-target" }
  const db = getDb()

  return db.transaction(async (tx) => {
    // A change that reaches the search rows rewrites them for every research, and
    // merging a term rewrites versions and drafts of any of them: all research
    // rows are locked before those rows (`locks.server.ts`).
    if (!ORDER_ONLY.has(intent)) await lockAllResearches(tx, "key share")
    const result = await apply(tx, intent, form)
    if (result.status !== "ok") return result
    // Which catalog changes reach the search rows and which do not is a
    // distinction nobody should have to make at a call site.
    if (!ORDER_ONLY.has(intent)) await rebuildSearchDocs(tx)
    return { ...result, did: intent }
  })
}

async function apply(tx: Executor, intent: CatalogIntent, form: FormData): Promise<Outcome> {
  switch (intent) {
    case "create-key":
      return createKey(tx, form)
    case "update-key":
      return updateKey(tx, form)
    // The direction is part of the operation rather than a field: a form holds
    // one value per name, and a row offers both directions at once.
    case "move-key-up":
      return moveKey(tx, form, "up")
    case "move-key-down":
      return moveKey(tx, form, "down")
    // Where a dropped row landed, as the place it was let go over.
    case "move-key-to":
      return moveKeyTo(tx, form)
    case "delete-key":
      return deleteKey(tx, form)
    // The facet categories are not here. What the refinement panel groups its
    // axes into is settled by what the portal is, so the migration puts the
    // groups in and nothing edits them afterwards.
    case "create-term":
      return createTerm(tx, form)
    case "update-term":
      return updateTerm(tx, form)
    case "delete-term":
      return deleteTerm(tx, form)
    case "merge-term":
      return mergeTerm(tx, form)
  }
}

/**
 * Why a field cannot be changed here, or null when it can.
 *
 * **The two a dataset has are refused as well as undrawn.** The screen does
 * not offer them, but a form is reachable by anybody who can post one, and a
 * screen is not a check (`admin/catalog.ts`).
 */
async function refusedKey(db: Executor, id: string): Promise<Outcome | null> {
  const [key] = await db
    .select({ scope: contentKey.scope })
    .from(contentKey)
    .where(eq(contentKey.id, id))
    .limit(1)
  if (key === undefined) return { status: "unknown-target" }
  return key.scope === "dataset" ? { status: "not-editable" } : null
}

async function createKey(db: Executor, form: FormData): Promise<Outcome> {
  const labelJa = text(form, "labelJa")
  const labelEn = text(form, "labelEn")
  if (labelJa === "" || labelEn === "") return { status: "missing-label" }
  // The code is made from the English label and never typed (`catalog.ts` の
  // `codeFrom`), so a label with nothing a code can hold is the one refusal
  // left; a spelling already taken moves on to the next free one instead.
  const wanted = codeFrom(labelEn)
  if (codeProblem(wanted) === "malformed") return { status: "no-code" }
  const code = freeKeyCode(wanted, (await db
    .select({ code: contentKey.code })
    .from(contentKey)).map((one) => one.code))

  await db.insert(contentKey).values({
    code,
    // Always on the analysis method: what a dataset is described by is settled
    // by what the portal is, so nothing adds to it.
    scope: "experiment",
    // An administrator adds free text. A type is what makes a key a facet, and
    // that is a development change.
    valueType: "text",
    labelJa,
    labelEn,
    position: await nextPosition(db, "experiment"),
  })
  return { status: "ok" }
}

async function updateKey(db: Executor, form: FormData): Promise<Outcome> {
  const id = text(form, "keyId")
  const labelJa = text(form, "labelJa")
  const labelEn = text(form, "labelEn")
  if (labelJa === "" || labelEn === "") return { status: "missing-label" }
  const refused = await refusedKey(db, id)
  if (refused !== null) return refused
  /*
    **Which box a field's facet sits in is not edited here.** The panel's groups
    are part of what the portal is rather than of what the data brings, so the
    catalogue has the placement and no screen offers it — a form that does
    not hand it over cannot be made to.
  */
  const updated = await db
    .update(contentKey)
    .set({
      labelJa,
      labelEn,
    })
    .where(eq(contentKey.id, id))
    .returning({ id: contentKey.id })
  return updated.length === 0 ? { status: "unknown-target" } : { status: "ok" }
}

/**
 * Writing a reordered list back. **Every sibling is rewritten**, not just the
 * two that swapped: `moved` renumbers from the order, which is what turns a
 * list that arrived with gaps or duplicate positions into a consecutive one.
 *
 * **The whole list is written in one statement.** A row at a time costs a round
 * trip for every sibling, and the press that moves one row is held open for all
 * of them.
 */
async function renumber(
  before: readonly { id: string }[],
  ordered: readonly { id: string }[],
  id: string,
  write: (ordered: readonly { id: string }[]) => Promise<unknown>,
): Promise<Outcome> {
  await write(ordered)
  const from = before.findIndex((row) => row.id === id)
  const to = ordered.findIndex((row) => row.id === id)
  // A row that stayed where it was (an end, or a place that was not there)
  // has nowhere to be taken back to.
  return from === to || from === -1 ? { status: "ok" } : { status: "ok", moved: { id, from, to, of: ordered.length } }
}

/**
 * The new position of every row, as one `case` over the rows being written.
 *
 * **Each branch reports what type it is.** A bare parameter reaches Postgres as
 * `unknown`, and a `case` whose every branch is unknown has no type to write
 * into an integer column.
 */
function positions(ordered: readonly { id: string }[], column: PgColumn) {
  const branches = ordered.map((row, at) => sql`when ${row.id} then ${at}::int`)
  return sql`case ${column} ${sql.join(branches, sql` `)} end`
}

/**
 * The keys of the analysis method in their order, reordered by `reorder` and
 * written back — the one path both ways of moving a row go down.
 */
async function reorderKeys(
  db: Executor,
  id: string,
  reorder: (siblings: readonly { id: string }[]) => readonly { id: string }[],
): Promise<Outcome> {
  const refused = await refusedKey(db, id)
  if (refused !== null) return refused
  const key = { scope: "experiment" } as const

  const siblings = await db
    .select({ id: contentKey.id })
    .from(contentKey)
    .where(eq(contentKey.scope, key.scope))
    .orderBy(asc(contentKey.position), asc(contentKey.code))
  return renumber(siblings, reorder(siblings), id, (ordered) =>
    db
      .update(contentKey)
      .set({ position: positions(ordered, contentKey.id) })
      .where(inArray(contentKey.id, ordered.map((row) => row.id))))
}

async function moveKey(
  db: Executor,
  form: FormData,
  direction: "up" | "down",
): Promise<Outcome> {
  const id = text(form, "keyId")
  return reorderKeys(db, id, (siblings) => moved(siblings, id, direction))
}

async function moveKeyTo(db: Executor, form: FormData): Promise<Outcome> {
  const id = text(form, "keyId")
  const to = Number(text(form, "to"))
  // A place that is not a whole number was never on the screen that asked.
  if (!Number.isInteger(to)) return { status: "unknown-target" }
  return reorderKeys(db, id, (siblings) => movedTo(siblings, id, to))
}

async function deleteKey(db: Executor, form: FormData): Promise<Outcome> {
  const id = text(form, "keyId")
  const refused = await refusedKey(db, id)
  if (refused !== null) return refused
  const [key] = await db
    .select({ valueType: contentKey.valueType })
    .from(contentKey)
    .where(eq(contentKey.id, id))
    .limit(1)
  if (key === undefined) return { status: "unknown-target" }
  // A typed key is a facet, and taking one away is the same kind of change as
  // adding one: a development change.
  if (key.valueType !== "text") return { status: "not-editable" }
  if (await keyInUse(db, id)) return { status: "in-use" }
  await db.delete(contentKey).where(eq(contentKey.id, id))
  return { status: "ok" }
}

/** The first code this vocabulary does not already hold (`catalog.ts` の `freeCode`). */
async function freeTermCode(db: Executor, setId: string, wanted: string): Promise<string> {
  const taken = new Set((await db
    .select({ code: vocabularyTerm.code })
    .from(vocabularyTerm)
    .where(eq(vocabularyTerm.setId, setId))).map((one) => one.code))
  return freeCode(wanted, taken)
}

async function createTerm(db: Executor, form: FormData): Promise<Outcome> {
  const setId = text(form, "setId")
  const labelEn = text(form, "labelEn")
  const labelJa = text(form, "labelJa")
  if (labelEn === "") return { status: "missing-label" }
  const [set] = await db
    .select({ code: vocabularySet.code })
    .from(vocabularySet)
    .where(eq(vocabularySet.id, setId))
    .limit(1)
  if (set === undefined) return { status: "unknown-target" }
  if (SETTLED_VOCABULARIES.has(set.code)) return { status: "not-editable" }
  // The code is made from the label (`catalog.ts` の `codeFrom`): it is an
  // address the public side has rather than a name to choose. The one
  // vocabulary whose codes are its own, ICD10, is settled and never made here.
  const asked = codeFrom(labelEn)
  if (termCodeProblem(asked) !== null) return { status: "no-code" }
  const code = await freeTermCode(db, setId, asked)
  await db.insert(vocabularyTerm).values({
    setId,
    code,
    labelEn,
    // English is required and Japanese is not: whether a concept is written in
    // Japanese varies inside one vocabulary, so an empty one is not a gap.
    labelJa: labelJa === "" ? null : labelJa,
    // Every vocabulary an administrator adds to is flat; the one tree is ICD10's.
    parentId: null,
  })
  return { status: "ok" }
}

/**
 * Why a term cannot be changed here, or null when it can.
 *
 * **A term of a settled vocabulary is refused as well as unreachable.** The
 * screen offers no button for it, but a form is reachable by anybody who can post one
 * (`admin/catalog.ts` の `SETTLED_VOCABULARIES`).
 */
async function refusedTerm(db: Executor, id: string): Promise<Outcome | null> {
  const [term] = await db
    .select({ setCode: vocabularySet.code })
    .from(vocabularyTerm)
    .innerJoin(vocabularySet, eq(vocabularySet.id, vocabularyTerm.setId))
    .where(eq(vocabularyTerm.id, id))
    .limit(1)
  if (term === undefined) return { status: "unknown-target" }
  return SETTLED_VOCABULARIES.has(term.setCode) ? { status: "not-editable" } : null
}

/** The labels a term is offered under, settled together as the one panel that holds them. */
async function updateTerm(db: Executor, form: FormData): Promise<Outcome> {
  const id = text(form, "termId")
  const labelEn = text(form, "labelEn")
  const labelJa = text(form, "labelJa")
  if (labelEn === "") return { status: "missing-label" }
  const refused = await refusedTerm(db, id)
  if (refused !== null) return refused
  await db
    .update(vocabularyTerm)
    .set({
      labelEn,
      labelJa: labelJa === "" ? null : labelJa,
    })
    .where(eq(vocabularyTerm.id, id))
  return { status: "ok" }
}

async function deleteTerm(db: Executor, form: FormData): Promise<Outcome> {
  const id = text(form, "termId")
  const refused = await refusedTerm(db, id)
  if (refused !== null) return refused
  if (await termInUse(db, id)) return { status: "in-use" }
  await db.delete(vocabularyTerm).where(eq(vocabularyTerm.id, id))
  return { status: "ok" }
}

/**
 * Merging one term into another: every description pointing at it is rewritten
 * to point at the survivor, and the merged term goes.
 *
 * **This is what answers "still used, but should not be chosen again".**
 * Turning a term off reports only that it will not be offered; a merge also reports
 * what to read instead, which is the half the data needs.
 *
 * **Only within one vocabulary.** Two terms of different sets are values of
 * different axes, and merging across would change what a refinement means
 * rather than tidy a spelling.
 *
 * **The draft rows move their revision on.** An editor holding one open is
 * looking at a description that no longer reports what the row has, so the next
 * save has to be refused the same way any other outside change refuses it.
 */
async function mergeTerm(db: Executor, form: FormData): Promise<Outcome> {
  const from = text(form, "termId")
  const into = text(form, "intoId")
  // Merging a term into itself is not an operation; it would only delete it.
  if (from === "" || from === into) return { status: "unknown-target" }

  const refused = await refusedTerm(db, from)
  if (refused !== null) return refused

  const ends = await db
    .select({ setId: vocabularyTerm.setId })
    .from(vocabularyTerm)
    .where(inArray(vocabularyTerm.id, [from, into]))
  // Both have to exist, and both have to be values of the same axis.
  const sets = new Set(ends.map((end) => end.setId))
  if (ends.length !== 2 || sets.size !== 1) return { status: "unknown-target" }

  const match = pointingAt(from)

  // Read, merge, write back — row by row, because what has to change is inside
  // a JSONB document rather than in a column the database can update in place.
  const versions = await db
    .select({ id: researchVersion.id, content: researchVersion.content })
    .from(researchVersion)
    .where(match)
    .orderBy(asc(researchVersion.id))
  for (const version of versions) {
    await db
      .update(researchVersion)
      .set({ content: versionWithTermMerged(version.content, from, into) })
      .where(eq(researchVersion.id, version.id))
  }

  // **Drafts are written in one module and nowhere else** — that is what lets
  // every write to one have a revision (`drafts.test.ts`).
  await mergeTermInDrafts(db, match, from, into)

  await db.delete(vocabularyTerm).where(eq(vocabularyTerm.id, from))
  return { status: "ok" }
}
