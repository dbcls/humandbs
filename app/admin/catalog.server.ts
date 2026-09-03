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

import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { requireCapability } from "~/auth/actor.server"
import { getDb, type Executor } from "~/db/client.server"
import {
  contentKey,
  datasetContent,
  draftDatasetEntry,
  facetCategory,
  vocabularySet,
  vocabularyTerm,
} from "~/db/schema"
import { ICD10_SET_CODE, icd10Parent } from "~/icd10/codes"
import { lookUpCode, searchDictionary } from "~/icd10/dictionary.server"
import type { Locale } from "~/i18n/locale"
import { readLocale } from "~/public/urls"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { codeProblem, moved, termCodeProblem } from "./catalog"

export interface CatalogKeyRow {
  id: string
  code: string
  scope: "dataset" | "experiment"
  valueType: "text" | "single" | "accession" | "vocabulary" | "number" | "disease"
  labelJa: string
  labelEn: string
  position: number
  vocabularySetCode: string | null
  categoryId: string | null
  showOnPublicPage: boolean
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

export interface CategoryRow {
  id: string
  code: string
  /** Null on a category the panel draws without a heading (`db/schema/catalog.ts`). */
  labelJa: string | null
  labelEn: string | null
  position: number
}

export interface CatalogView {
  locale: Locale
  keys: CatalogKeyRow[]
  vocabularies: VocabularyRow[]
  categories: CategoryRow[]
}

export interface TermRow {
  id: string
  code: string
  labelJa: string | null
  labelEn: string
  parentCode: string | null
  active: boolean
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
  set: VocabularyRow
  terms: TermRow[]
  page: number
  pageCount: number
  find: string
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

const TERMS_PER_PAGE = 50

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
      categoryId: contentKey.facetCategoryId,
      showOnPublicPage: contentKey.showOnPublicPage,
      canonicalUnit: contentKey.canonicalUnit,
    })
    .from(contentKey)
    .leftJoin(vocabularySet, eq(vocabularySet.id, contentKey.vocabularySetId))
    .orderBy(asc(contentKey.scope), asc(contentKey.position), asc(contentKey.code))
}

export async function catalogPage(request: Request): Promise<CatalogView> {
  await requireCapability(request, "manage-catalog")
  const db = getDb()
  const [keys, sets, categories] = await Promise.all([
    keyRows(db),
    db
      .select({
        id: vocabularySet.id,
        code: vocabularySet.code,
        labelJa: vocabularySet.labelJa,
        labelEn: vocabularySet.labelEn,
        hierarchical: vocabularySet.hierarchical,
        terms: sql<number>`count(${vocabularyTerm.id})::int`,
      })
      .from(vocabularySet)
      .leftJoin(vocabularyTerm, eq(vocabularyTerm.setId, vocabularySet.id))
      .groupBy(vocabularySet.id)
      .orderBy(asc(vocabularySet.code)),
    db
      .select({
        id: facetCategory.id,
        code: facetCategory.code,
        labelJa: facetCategory.labelJa,
        labelEn: facetCategory.labelEn,
        position: facetCategory.position,
      })
      .from(facetCategory)
      .orderBy(asc(facetCategory.position), asc(facetCategory.code)),
  ])
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    keys,
    vocabularies: sets,
    categories,
  }
}

export async function vocabularyPage(
  request: Request,
  code: string,
): Promise<VocabularyView | null> {
  await requireCapability(request, "manage-catalog")
  const db = getDb()
  const url = new URL(request.url)
  const find = url.searchParams.get("find") ?? ""
  const lookUp = url.searchParams.get("dictionary") ?? ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1)

  const [set] = await db
    .select({
      id: vocabularySet.id,
      code: vocabularySet.code,
      labelJa: vocabularySet.labelJa,
      labelEn: vocabularySet.labelEn,
      hierarchical: vocabularySet.hierarchical,
    })
    .from(vocabularySet)
    .where(eq(vocabularySet.code, code))
    .limit(1)
  if (set === undefined) return null

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
  const pageCount = Math.max(1, Math.ceil((total?.count ?? 0) / TERMS_PER_PAGE))
  const at = Math.min(page, pageCount)

  const rows = await db
    .select({
      id: vocabularyTerm.id,
      code: vocabularyTerm.code,
      labelJa: vocabularyTerm.labelJa,
      labelEn: vocabularyTerm.labelEn,
      parentCode: parent.code,
      active: vocabularyTerm.active,
    })
    .from(vocabularyTerm)
    .leftJoin(parent, eq(parent.id, vocabularyTerm.parentId))
    .where(and(eq(vocabularyTerm.setId, set.id), matching))
    .orderBy(asc(vocabularyTerm.code))
    .limit(TERMS_PER_PAGE)
    .offset((at - 1) * TERMS_PER_PAGE)

  const used = await usageOfTerms(db, rows.map((row) => row.id))
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    set: { ...set, terms: total?.count ?? 0 },
    terms: rows.map((row) => ({ ...row, used: used.get(row.id) ?? 0 })),
    page: at,
    pageCount,
    find,
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
  const [published] = await db
    .select({ hit: sql<number>`1` })
    .from(datasetContent)
    .where(match)
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

async function termInUse(db: Executor, termId: string): Promise<boolean> {
  const match = sql`jsonb_path_exists(content, '$.**.termIds.value[*] ? (@ == $id)', ${JSON.stringify({ id: termId })}::jsonb)`
  const [published] = await db.select({ hit: sql<number>`1` }).from(datasetContent).where(match).limit(1)
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

export async function catalogAction(request: Request): Promise<CatalogResult> {
  await requireCapability(request, "manage-catalog")
  const form = await request.formData()
  const intent = text(form, "intent")
  const db = getDb()

  return db.transaction(async (tx) => {
    const result = await apply(tx, intent, form)
    // Which catalog changes reach the search rows and which do not is a
    // distinction nobody should have to make at a call site.
    if (result.status === "ok") await rebuildSearchDocs(tx)
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
    case "create-category":
      return createCategory(tx, form)
    case "update-category":
      return updateCategory(tx, form)
    case "move-category-up":
      return moveCategory(tx, form, "up")
    case "move-category-down":
      return moveCategory(tx, form, "down")
    case "delete-category":
      return deleteCategory(tx, form)
    case "create-term":
      return createTerm(tx, form)
    case "update-term":
      return updateTerm(tx, form)
    case "set-term-active":
      return setTermActive(tx, form)
    case "delete-term":
      return deleteTerm(tx, form)
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

async function createKey(db: Executor, form: FormData): Promise<CatalogResult> {
  const code = text(form, "code")
  const labelJa = text(form, "labelJa")
  const labelEn = text(form, "labelEn")
  const scope = text(form, "scope") === "dataset" ? "dataset" : "experiment"
  if (labelJa === "" || labelEn === "") return { status: "missing-label" }
  const problem = await guardCode(db, code)
  if (problem !== null) return { status: problem }

  await db.insert(contentKey).values({
    code,
    scope,
    // An administrator adds free text. A type is what makes a key a facet, and
    // that is a development change.
    valueType: "text",
    labelJa,
    labelEn,
    position: await nextPosition(db, scope),
    showOnPublicPage: form.get("showOnPublicPage") !== null,
  })
  return { status: "ok" }
}

async function updateKey(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "keyId")
  const labelJa = text(form, "labelJa")
  const labelEn = text(form, "labelEn")
  if (labelJa === "" || labelEn === "") return { status: "missing-label" }
  const categoryId = text(form, "categoryId")
  const updated = await db
    .update(contentKey)
    .set({
      labelJa,
      labelEn,
      showOnPublicPage: form.get("showOnPublicPage") !== null,
      facetCategoryId: categoryId === "" ? null : categoryId,
    })
    .where(eq(contentKey.id, id))
    .returning({ id: contentKey.id })
  return updated.length === 0 ? { status: "unknown-target" } : { status: "ok" }
}

/**
 * Writing a reordered list back. **Every sibling is rewritten**, not just the
 * two that swapped: `moved` renumbers from the order, which is what turns a
 * list that arrived with gaps or duplicate positions into a consecutive one.
 */
async function renumber(
  db: Executor,
  rows: readonly { id: string }[],
  id: string,
  direction: "up" | "down",
  write: (id: string, position: number) => Promise<unknown>,
): Promise<CatalogResult> {
  const next = moved(rows, id, direction)
  for (const [at, row] of next.entries()) await write(row.id, at)
  return { status: "ok" }
}

async function moveKey(
  db: Executor,
  form: FormData,
  direction: "up" | "down",
): Promise<CatalogResult> {
  const id = text(form, "keyId")
  const [key] = await db
    .select({ scope: contentKey.scope })
    .from(contentKey)
    .where(eq(contentKey.id, id))
    .limit(1)
  if (key === undefined) return { status: "unknown-target" }

  const siblings = await db
    .select({ id: contentKey.id })
    .from(contentKey)
    .where(eq(contentKey.scope, key.scope))
    .orderBy(asc(contentKey.position), asc(contentKey.code))
  return renumber(db, siblings, id, direction, (each, position) =>
    db.update(contentKey).set({ position }).where(eq(contentKey.id, each)))
}

async function deleteKey(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "keyId")
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
 * The two labels of a facet category, or null for a category drawn without a
 * heading. **Both or neither**: a group headed in one language and silent in
 * the other would change shape when the reader switches
 * (`db/schema/catalog.ts`).
 */
function categoryLabels(
  form: FormData,
): { labelJa: string, labelEn: string } | { labelJa: null, labelEn: null } | null {
  const labelJa = text(form, "labelJa")
  const labelEn = text(form, "labelEn")
  if (labelJa === "" && labelEn === "") return { labelJa: null, labelEn: null }
  if (labelJa === "" || labelEn === "") return null
  return { labelJa, labelEn }
}

async function createCategory(db: Executor, form: FormData): Promise<CatalogResult> {
  const code = text(form, "code")
  const labels = categoryLabels(form)
  if (labels === null) return { status: "missing-label" }
  if (codeProblem(code) === "malformed") return { status: "malformed-code" }
  const [held] = await db
    .select({ id: facetCategory.id })
    .from(facetCategory)
    .where(eq(facetCategory.code, code))
    .limit(1)
  if (held !== undefined) return { status: "duplicate-code" }
  const [last] = await db
    .select({ at: sql<number>`coalesce(max(${facetCategory.position}), -1)::int` })
    .from(facetCategory)
  await db.insert(facetCategory).values({ code, ...labels, position: (last?.at ?? -1) + 1 })
  return { status: "ok" }
}

async function updateCategory(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "categoryId")
  const labels = categoryLabels(form)
  if (labels === null) return { status: "missing-label" }
  const updated = await db
    .update(facetCategory)
    .set(labels)
    .where(eq(facetCategory.id, id))
    .returning({ id: facetCategory.id })
  return updated.length === 0 ? { status: "unknown-target" } : { status: "ok" }
}

async function moveCategory(
  db: Executor,
  form: FormData,
  direction: "up" | "down",
): Promise<CatalogResult> {
  const id = text(form, "categoryId")
  const held = await db
    .select({ id: facetCategory.id })
    .from(facetCategory)
    .orderBy(asc(facetCategory.position), asc(facetCategory.code))
  return renumber(db, held, id, direction, (each, position) =>
    db.update(facetCategory).set({ position }).where(eq(facetCategory.id, each)))
}

async function deleteCategory(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "categoryId")
  const [used] = await db
    .select({ id: contentKey.id })
    .from(contentKey)
    .where(eq(contentKey.facetCategoryId, id))
    .limit(1)
  if (used !== undefined) return { status: "in-use" }
  const removed = await db
    .delete(facetCategory)
    .where(eq(facetCategory.id, id))
    .returning({ id: facetCategory.id })
  return removed.length === 0 ? { status: "unknown-target" } : { status: "ok" }
}

async function createTerm(db: Executor, form: FormData): Promise<CatalogResult> {
  const setId = text(form, "setId")
  const code = text(form, "code")
  const labelEn = text(form, "labelEn")
  const labelJa = text(form, "labelJa")
  if (labelEn === "") return { status: "missing-label" }
  if (termCodeProblem(code) !== null) return { status: "malformed-code" }
  const [set] = await db
    .select({ code: vocabularySet.code })
    .from(vocabularySet)
    .where(eq(vocabularySet.id, setId))
    .limit(1)
  if (set === undefined) return { status: "unknown-target" }
  const [held] = await db
    .select({ id: vocabularyTerm.id })
    .from(vocabularyTerm)
    .where(and(eq(vocabularyTerm.setId, setId), eq(vocabularyTerm.code, code)))
    .limit(1)
  if (held !== undefined) return { status: "duplicate-code" }
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

async function termFor(db: Executor, id: string) {
  const [term] = await db
    .select({ id: vocabularyTerm.id })
    .from(vocabularyTerm)
    .where(eq(vocabularyTerm.id, id))
    .limit(1)
  return term
}

async function updateTerm(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "termId")
  const labelEn = text(form, "labelEn")
  const labelJa = text(form, "labelJa")
  if (labelEn === "") return { status: "missing-label" }
  const term = await termFor(db, id)
  if (term === undefined) return { status: "unknown-target" }
  await db
    .update(vocabularyTerm)
    .set({ labelEn, labelJa: labelJa === "" ? null : labelJa })
    .where(eq(vocabularyTerm.id, id))
  return { status: "ok" }
}

async function setTermActive(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "termId")
  const term = await termFor(db, id)
  if (term === undefined) return { status: "unknown-target" }
  await db
    .update(vocabularyTerm)
    .set({ active: text(form, "active") === "true" })
    .where(eq(vocabularyTerm.id, id))
  return { status: "ok" }
}

async function deleteTerm(db: Executor, form: FormData): Promise<CatalogResult> {
  const id = text(form, "termId")
  const term = await termFor(db, id)
  if (term === undefined) return { status: "unknown-target" }
  if (await termInUse(db, id)) return { status: "in-use" }
  await db.delete(vocabularyTerm).where(eq(vocabularyTerm.id, id))
  return { status: "ok" }
}
