/**
 * The catalog screens: what they read, and what their forms do.
 *
 * Everything here asks for `manage-catalog`. Nothing here is written to the
 * event log — what that records is the operations that changed what is
 * published (docs/publishing.md の「証跡」), and a catalog entry is a definition
 * rather than a publication.
 *
 * **Every write rebuilds the search rows.** Some catalog changes reach them and
 * some do not — hiding a key changes the text a row is derived from, renaming a
 * term does not, because labels are joined at query time — but working out
 * which is which at each call site is how the two would come apart. A full
 * rebuild is a few seconds on this corpus and is meant to be ordinary
 * (docs/data-model.md の「検索用の行」).
 *
 * **What is in use cannot be removed.** A key is in use when a dataset holds a
 * value under it, published or in a draft; a term is in use when a value names
 * it. A term that has served its purpose is deactivated instead, which takes it
 * out of the input control while leaving it resolvable for the data that
 * already points at it.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { alias, type PgColumn } from "drizzle-orm/pg-core"

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
import { ICD10_SET_CODE, icd10Parent } from "~/icd10/codes"
import { pageRange } from "~/paging"
import { lookUpCode, searchDictionary } from "~/icd10/dictionary.server"
import type { Locale } from "~/i18n/locale"
import { readLocale } from "~/public/urls"
import { isPageSize, PAGE_SIZE, type PageSize } from "~/search/page-size"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import {
  codeProblem,
  filterKeyRows,
  isKeyValueType,
  KEY_VALUE_TYPES,
  moved,
  SETTLED_VOCABULARIES,
  termCodeFrom,
  termCodeProblem,
  TERM_SORT,
  TERM_SORT_KEYS,
  type KeyFilter,
  type KeyValueType,
  type TermSortKey,
} from "./catalog"
import { mergeTermInDrafts } from "./drafts.server"
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
 * **Only the fields an analysis method carries are here.** The two a dataset
 * carries hold what the portal is rather than what the data brings, so the
 * migration puts them in and nothing edits them afterwards
 * (docs/data-model.md の「catalog と語彙」).
 *
 * **The vocabularies are not a list of their own.** Each belongs to exactly one
 * field, so the field's row carries how many terms it draws from and the way to
 * open them — a list called 「語彙」 beside the fields could only be read as a
 * second, unrelated thing.
 */
export interface CatalogView {
  locale: Locale
  /** The fields the conditions leave, in the order the public table has them. */
  keys: CatalogKeyRow[]
  /** Every field there is, which is what the name of the screen counts. */
  total: number
  /** The conditions in force, as the address carries them. */
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
  parentCode: string | null
  /** How many published objects carry this value. */
  used: number
}

/** One candidate of the ICD10 dictionary, and whether the vocabulary has it. */
export interface DictionaryRow {
  code: string
  titleEn: string | null
  titleJa: string | null
  held: boolean
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
   * read here and edited nowhere (`docs/data-model.md` の「catalog と語彙」), so
   * the screen opens with nothing to press rather than refusing to open.
   */
  editable: boolean
  /**
   * The term a merge is being aimed from, when the address names one.
   *
   * **Choosing where to fold a term into is choosing a row of this listing.** A
   * vocabulary runs to a few hundred values, so a panel holding them all would
   * be a select of every term on every row; putting the choice back into the
   * listing gives it the box and the pages that are already there.
   */
  mergeFrom: TermRow | null
  /**
   * Set on the ICD10 vocabulary: what was typed into the dictionary's box and
   * what it answered. The dictionary is where a new term's labels come from, so
   * that a code is never filed under a name somebody invented at the keyboard
   * (docs/data-model.md の「ICD10」).
   */
  dictionary: { find: string, rows: DictionaryRow[] } | null
}

/** What a form did, when it did not simply work. */
export type CatalogProblem
  = | "malformed-code"
    | "reserved-code"
    | "duplicate-code"
    | "missing-label"
    | "in-use"
    | "not-editable"
    | "unknown-target"

export type CatalogResult = { status: "ok" } | { status: CatalogProblem }

/**
 * **A total order.** Labels repeat where codes cannot, so the code decides
 * between two rows sharing one: a pair left unordered swaps between requests
 * and is read twice or missed altogether across a page boundary.
 */
function termOrder(sort: TermSortKey, order: "asc" | "desc") {
  const way = order === "asc" ? asc : desc
  return sort === "label"
    ? [way(vocabularyTerm.labelEn), asc(vocabularyTerm.code)]
    : [way(vocabularyTerm.code)]
}

/** How many codes one search of the dictionary answers with. */
const DICTIONARY_CANDIDATES = 20

async function keyRows(db: Executor): Promise<CatalogKeyRow[]> {
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
  const fields = (await keyRows(db)).filter((key) => key.scope === "experiment")

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
    total: fields.length,
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
  const lookUp = url.searchParams.get("dictionary") ?? ""
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

  const parent = alias(vocabularyTerm, "parent")
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
      parentCode: parent.code,
    })
    .from(vocabularyTerm)
    .leftJoin(parent, eq(parent.id, vocabularyTerm.parentId))
    .where(and(eq(vocabularyTerm.setId, set.id), matching))
    .orderBy(...termOrder(sort, order))
    .limit(size)
    .offset((at - 1) * size)

  const used = await usageOfTerms(db, rows.map((row) => row.id))

  // Read on its own rather than found among the rows: the term being folded is
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
          parentCode: parent.code,
        })
        .from(vocabularyTerm)
        .leftJoin(parent, eq(parent.id, vocabularyTerm.parentId))
        // Compared as text: the address carries whatever was typed, and a
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
    terms: rows.map((row) => ({ ...row, used: used.get(row.id) ?? 0 })),
    page: at,
    pageCount,
    ...pageRange(at, size, total?.count ?? 0),
    find,
    editable,
    mergeFrom: aimed === undefined
      ? null
      : { ...aimed, used: (aimedUsed.get(aimed.id) ?? 0) as number },
    dictionary: set.code === ICD10_SET_CODE
      ? { find: lookUp, rows: await dictionaryRows(db, set.id, lookUp) }
      : null,
  }
}

/** What the dictionary offers for what was typed, minus nothing: a code the
 * vocabulary already holds is shown as held rather than hidden, because that is
 * the answer to "is this one in?". */
async function dictionaryRows(
  db: Executor,
  setId: string,
  find: string,
): Promise<DictionaryRow[]> {
  const entries = await searchDictionary(db, find, DICTIONARY_CANDIDATES)
  if (entries.length === 0) return []
  const held = new Set((await db
    .select({ code: vocabularyTerm.code })
    .from(vocabularyTerm)
    .where(and(
      eq(vocabularyTerm.setId, setId),
      inArray(vocabularyTerm.code, entries.map((entry) => entry.code)),
    )))
    .map((row) => row.code))
  return entries.map((entry) => ({ ...entry, held: held.has(entry.code) }))
}

/**
 * Whether anything holds a value under this key. The published content and the
 * drafts are both asked: a key that only a draft uses is still one whose removal
 * would leave a value nobody can render.
 */
async function keyInUse(db: Executor, keyId: string): Promise<boolean> {
  const match = sql`jsonb_path_exists(content, '$.**.keyId ? (@ == $id)', ${JSON.stringify({ id: keyId })}::jsonb)`
  // Every published description is in the rows the public side reads, which is
  // one place to ask rather than one version row per version.
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

/** How many published objects carry each of the given terms. */
async function usageOfTerms(
  db: Executor,
  termIds: readonly string[],
): Promise<Map<string, number>> {
  if (termIds.length === 0) return new Map()
  const rows = await db.execute<{ term_id: string, n: number }>(sql`
    SELECT term_id, count(DISTINCT doc_id)::int AS n
    FROM search_facet_term
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
 * how the one that does reach a row ends up not saying so
 * (`docs/data-model.md` の「catalog と語彙」).
 *
 * **Where a key stands is the exception.** The refinement panel is ordered by
 * `position` as each page is asked for, so rebuilding every document to move
 * one row rewrites the same documents it started with.
 */
const ORDER_ONLY = new Set(["move-key-up", "move-key-down"])

export async function catalogAction(request: Request): Promise<CatalogResult> {
  await requireCapability(request, "manage-catalog")
  const form = await request.formData()
  const intent = text(form, "intent")
  const db = getDb()

  return db.transaction(async (tx) => {
    const result = await apply(tx, intent, form)
    // Which catalog changes reach the search rows and which do not is a
    // distinction nobody should have to make at a call site.
    if (result.status === "ok" && !ORDER_ONLY.has(intent)) await rebuildSearchDocs(tx)
    return result
  })
}

async function apply(tx: Executor, intent: string, form: FormData): Promise<CatalogResult> {
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
    case "delete-key":
      return deleteKey(tx, form)
    // The facet categories are not here. What the refinement panel groups its
    // axes into is settled by what the portal is, so the migration puts the
    // groups in and nothing edits them afterwards
    // (docs/data-model.md の「catalog と語彙」).
    case "create-term":
      return createTerm(tx, form)
    case "update-term":
      return updateTerm(tx, form)
    case "delete-term":
      return deleteTerm(tx, form)
    case "merge-term":
      return mergeTerm(tx, form)
    default:
      return { status: "unknown-target" }
  }
}

/** A code the table already holds comes back as a refusal rather than a crash. */
async function guardCode(db: Executor, code: string): Promise<CatalogProblem | null> {
  const problem = codeProblem(code)
  if (problem !== null) return problem === "malformed" ? "malformed-code" : "reserved-code"
  const [held] = await db
    .select({ id: contentKey.id })
    .from(contentKey)
    .where(eq(contentKey.code, code))
    .limit(1)
  return held === undefined ? null : "duplicate-code"
}

/**
 * Why a field cannot be changed here, or null when it can.
 *
 * **The two a dataset carries are refused as well as undrawn.** The screen does
 * not offer them, but a form is reachable by anybody who can post one, and a
 * screen is not a check (`admin/catalog.ts`).
 */
async function refusedKey(db: Executor, id: string): Promise<CatalogResult | null> {
  const [key] = await db
    .select({ scope: contentKey.scope })
    .from(contentKey)
    .where(eq(contentKey.id, id))
    .limit(1)
  if (key === undefined) return { status: "unknown-target" }
  return key.scope === "dataset" ? { status: "not-editable" } : null
}

async function createKey(db: Executor, form: FormData): Promise<CatalogResult> {
  const code = text(form, "code")
  const labelJa = text(form, "labelJa")
  const labelEn = text(form, "labelEn")
  if (labelJa === "" || labelEn === "") return { status: "missing-label" }
  const problem = await guardCode(db, code)
  if (problem !== null) return { status: problem }

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

async function updateKey(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "keyId")
  const labelJa = text(form, "labelJa")
  const labelEn = text(form, "labelEn")
  if (labelJa === "" || labelEn === "") return { status: "missing-label" }
  const refused = await refusedKey(db, id)
  if (refused !== null) return refused
  /*
    **Which box a field's facet sits in is not edited here.** The panel's groups
    are part of what the portal is rather than of what the data brings, so the
    catalogue carries the placement and no screen offers it — a form that does
    not hand it over cannot be made to (`docs/editing.md` の「編集フォーム」).
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
  rows: readonly { id: string }[],
  id: string,
  direction: "up" | "down",
  write: (ordered: readonly { id: string }[]) => Promise<unknown>,
): Promise<CatalogResult> {
  await write(moved(rows, id, direction))
  return { status: "ok" }
}

/**
 * The new position of every row, as one `case` over the rows being written.
 *
 * **Each branch says what type it is.** A bare parameter reaches Postgres as
 * `unknown`, and a `case` whose every branch is unknown has no type to write
 * into an integer column.
 */
function positions(ordered: readonly { id: string }[], column: PgColumn) {
  const branches = ordered.map((row, at) => sql`when ${row.id} then ${at}::int`)
  return sql`case ${column} ${sql.join(branches, sql` `)} end`
}

async function moveKey(
  db: Executor,
  form: FormData,
  direction: "up" | "down",
): Promise<CatalogResult> {
  const id = text(form, "keyId")
  const refused = await refusedKey(db, id)
  if (refused !== null) return refused
  const key = { scope: "experiment" } as const

  const siblings = await db
    .select({ id: contentKey.id })
    .from(contentKey)
    .where(eq(contentKey.scope, key.scope))
    .orderBy(asc(contentKey.position), asc(contentKey.code))
  return renumber(siblings, id, direction, (ordered) =>
    db
      .update(contentKey)
      .set({ position: positions(ordered, contentKey.id) })
      .where(inArray(contentKey.id, ordered.map((row) => row.id))))
}

async function deleteKey(db: Executor, form: FormData): Promise<CatalogResult> {
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

/**
 * The first code this vocabulary does not already hold, counting up from the
 * one the label made. **A generated code cannot refuse the value** — two terms
 * may honestly read the same in English, and the curator who typed the second
 * one has no code to correct.
 */
async function freeCode(db: Executor, setId: string, wanted: string): Promise<string> {
  const taken = new Set((await db
    .select({ code: vocabularyTerm.code })
    .from(vocabularyTerm)
    .where(eq(vocabularyTerm.setId, setId))).map((one) => one.code))
  if (!taken.has(wanted)) return wanted
  for (let n = 2; ; n++) {
    const next = `${wanted}-${n}`
    if (!taken.has(next)) return next
  }
}

async function createTerm(db: Executor, form: FormData): Promise<CatalogResult> {
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
  // The standard's own spelling is what the dictionary and the data already
  // carry; everywhere else the label says it (`catalog.ts` の `termCodeFrom`).
  const brought = set.code === ICD10_SET_CODE
  const asked = brought ? text(form, "code") : termCodeFrom(labelEn)
  if (termCodeProblem(asked) !== null) return { status: "malformed-code" }
  const code = brought ? asked : await freeCode(db, setId, asked)
  if (brought) {
    const [held] = await db
      .select({ id: vocabularyTerm.id })
      .from(vocabularyTerm)
      .where(and(eq(vocabularyTerm.setId, setId), eq(vocabularyTerm.code, code)))
      .limit(1)
    if (held !== undefined) return { status: "duplicate-code" }
  }
  await db.insert(vocabularyTerm).values({
    setId,
    code,
    labelEn,
    // English is required and Japanese is not: whether a concept is written in
    // Japanese varies inside one vocabulary, so an empty one is not a gap.
    labelJa: labelJa === "" ? null : labelJa,
    parentId: set.code === ICD10_SET_CODE ? await icd10Root(db, setId, code) : null,
  })
  return { status: "ok" }
}

/**
 * The three-character term a longer ICD10 code hangs under, made if it is not
 * there yet.
 *
 * **A four-character code without its root would count as a root itself**, and
 * the rule that the disease facet is counted by three characters would quietly
 * stop holding for it. The root is named from the dictionary, so nothing is
 * invented by making it.
 */
async function icd10Root(
  db: Executor,
  setId: string,
  code: string,
): Promise<string | null> {
  const parent = icd10Parent(code)
  if (parent === null) return null
  const [held] = await db
    .select({ id: vocabularyTerm.id })
    .from(vocabularyTerm)
    .where(and(eq(vocabularyTerm.setId, setId), eq(vocabularyTerm.code, parent)))
    .limit(1)
  if (held !== undefined) return held.id
  const entry = await lookUpCode(db, parent)
  const [made] = await db
    .insert(vocabularyTerm)
    .values({
      setId,
      code: parent,
      labelEn: entry?.titleEn ?? entry?.titleJa ?? parent,
      labelJa: entry?.titleJa ?? null,
    })
    .returning({ id: vocabularyTerm.id })
  return made?.id ?? null
}

/**
 * Why a term cannot be changed here, or null when it can.
 *
 * **A term of a settled vocabulary is refused as well as unreachable.** The
 * screen offers no way in, but a form is reachable by anybody who can post one
 * (`admin/catalog.ts` の `SETTLED_VOCABULARIES`).
 */
async function refusedTerm(db: Executor, id: string): Promise<CatalogResult | null> {
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
async function updateTerm(db: Executor, form: FormData): Promise<CatalogResult> {
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

async function deleteTerm(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "termId")
  const refused = await refusedTerm(db, id)
  if (refused !== null) return refused
  if (await termInUse(db, id)) return { status: "in-use" }
  await db.delete(vocabularyTerm).where(eq(vocabularyTerm.id, id))
  return { status: "ok" }
}

/**
 * Folding one term into another: every description pointing at it is rewritten
 * to point at the survivor, and the folded term goes.
 *
 * **This is what answers "still used, but should not be chosen again".**
 * Turning a term off says only that it will not be offered; a merge also says
 * what to read instead, which is the half the data needs
 * (`docs/data-model.md` の「catalog と語彙」).
 *
 * **Only within one vocabulary.** Two terms of different sets are values of
 * different axes, and folding across would change what a refinement means
 * rather than tidy a spelling.
 *
 * **The draft rows move their revision on.** An editor holding one open is
 * looking at a description that no longer says what the row says, so the next
 * save has to be refused the way any other outside change refuses it
 * (`docs/editing.md` の「サイトコンテンツ」の revision 照合と同じ線).
 */
async function mergeTerm(db: Executor, form: FormData): Promise<CatalogResult> {
  const from = text(form, "termId")
  const into = text(form, "intoId")
  // Folding a term into itself is not an operation; it would only delete it.
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

  // Read, fold, write back — row by row, because what has to change is inside
  // a JSONB document rather than in a column the database can update in place.
  const versions = await db
    .select({ id: researchVersion.id, content: researchVersion.content })
    .from(researchVersion)
    .where(match)
  for (const version of versions) {
    await db
      .update(researchVersion)
      .set({ content: versionWithTermMerged(version.content, from, into) })
      .where(eq(researchVersion.id, version.id))
  }

  // **Drafts are written in one module and nowhere else** — that is what lets
  // every write to one carry a revision (`drafts.test.ts`).
  await mergeTermInDrafts(db, match, from, into)

  await db.delete(vocabularyTerm).where(eq(vocabularyTerm.id, from))
  return { status: "ok" }
}
