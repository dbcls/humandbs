/**
 * Running a query against the published set.
 *
 * The tree compiles to ordinary SQL predicates over `search_doc`, which is why
 * free text needs no special position in it: a full-text match is a boolean
 * condition like any other and composes with `OR` and `NOT` the same way.
 *
 * **The full-text predicate is kept inside a materialised CTE.** Written
 * without one the planner is free to push it down as a per-row filter, which
 * re-evaluates the match once per candidate row instead of once against the
 * index — the difference measured on this corpus was 124 ms against 3.3 ms.
 *
 * `NOT` is made total with `coalesce`. A date comparison against a row with no
 * date is unknown rather than false, and "everything that does not match" has
 * to include the rows that could not answer.
 */

import { sql, type SQL } from "drizzle-orm"

import type { Executor } from "~/db/client.server"

import { OPEN_BOUND, type FieldNode, type QueryNode } from "./dsl"
import type { FacetField, QueryFields } from "./fields"

import { PAGE_SIZE, type PageSize } from "./page-size"
import type { SearchTarget } from "./target"
import type { SortKey, SortOrder } from "./sort"

export type { SearchTarget } from "./target"

export {
  isPageSize,
  PAGE_SIZE,
  PAGE_SIZES,
  type PageSize,
} from "./page-size"

export {
  defaultOrder,
  DEFAULT_SORT,
  isSortKey,
  isSortOrder,
  SORT_KEYS,
  SORT_ORDERS,
  type SortKey,
  type SortOrder,
} from "./sort"

export interface SearchHit {
  targetId: string
  humLabel: string
  datasetLabel: string | null
  datePublished: string | null
  dateModified: string | null
}

/** What a query needs to be answered: the tree, and what its fields mean. */
export interface SearchQuery {
  target: SearchTarget
  ast: QueryNode | null
  fields: QueryFields
}

export interface SearchRequest extends SearchQuery {
  sort: SortKey
  order: SortOrder
  /** 1-based. Out of range gives an empty page rather than an error. */
  page: number
  /**
   * How many rows to answer with. **Left out means the default**, which is what
   * the JSON API leaves it as — a caller that never asks for a size cannot be
   * given a different one by a change here.
   */
  size?: PageSize
}

export interface SearchResult {
  total: number
  page: number
  pageCount: number
  hits: SearchHit[]
}

/** The label a row is addressed by, which is what `id:` names. */
function labelColumn(target: SearchTarget): SQL {
  return target === "research" ? sql`s.hum_label` : sql`s.dataset_label`
}

/**
 * A wildcard value as a LIKE pattern. The characters LIKE gives meaning to are
 * escaped first, so a literal `%` in an accession cannot become a wildcard.
 */
function likePattern(value: string): string {
  return value
    .replace(/[\\%_]/g, (char) => `\\${char}`)
    .replace(/\*/g, "%")
    .replace(/\?/g, "_")
}

/**
 * A facet condition is a row the object has, so it compiles to an existence
 * test rather than to a comparison on the search row.
 *
 * **A term matches its own rows and the rows of everything beneath it.** The
 * ancestors are carried on the facet row, so asking for a 3-character ICD10 code
 * finds the datasets filed under a 4-character one without walking the tree at
 * query time. The chosen term is looked up by its code inside the key's own set,
 * which means a code naming no term matches nothing — the honest answer for a
 * condition nobody can satisfy.
 */
function termPredicate(facet: FacetField, code: string): SQL {
  const chosen = sql`(
    SELECT vt.id FROM vocabulary_term vt
    WHERE vt.set_id = ${facet.setId}::uuid AND vt.code = ${code}
  )`
  return sql`EXISTS (
    SELECT 1 FROM search_facet_term f
    WHERE f.doc_id = s.id AND f.key_id = ${facet.keyId}::uuid
      AND (f.term_id = ${chosen} OR ${chosen} = ANY(f.ancestor_ids))
  )`
}

/**
 * The values are already in the key's canonical unit, so the bounds are read as
 * they are written. An open end is left out of the test rather than filled with
 * an extreme, which keeps `[100 TO *]` meaning "at least 100" whatever is stored.
 */
function numberPredicate(facet: FacetField, node: FieldNode): SQL {
  const value = node.value
  const bounds: SQL[] = []
  if (typeof value === "string") bounds.push(sql`f.value = ${Number(value)}`)
  else {
    if (value.from !== OPEN_BOUND) bounds.push(sql`f.value >= ${Number(value.from)}`)
    if (value.to !== OPEN_BOUND) bounds.push(sql`f.value <= ${Number(value.to)}`)
  }
  const [first, ...rest] = bounds
  const within = first === undefined ? sql`TRUE` : sql.join([first, ...rest], sql` AND `)
  return sql`EXISTS (
    SELECT 1 FROM search_facet_number f
    WHERE f.doc_id = s.id AND f.key_id = ${facet.keyId}::uuid AND ${within}
  )`
}

function compileField(node: FieldNode, query: SearchQuery): SQL {
  const facet = query.fields.facet(node.field)
  if (facet !== undefined) {
    if (facet.kind === "number") return numberPredicate(facet, node)
    // A vocabulary takes no range; the parser has already refused one.
    return typeof node.value === "string" ? termPredicate(facet, node.value) : sql`FALSE`
  }

  const value = node.value
  if (typeof value !== "string") {
    const column = node.field === "date_modified" ? sql`s.date_modified` : sql`s.date_published`
    // An open end is left out of the test rather than filled with an extreme,
    // the same as a number's: `[2020-01-01 TO *]` means "since", whatever the
    // last day in the data happens to be today.
    const ends: SQL[] = []
    if (value.from !== OPEN_BOUND) ends.push(sql`${column} >= ${value.from}::date`)
    if (value.to !== OPEN_BOUND) ends.push(sql`${column} <= ${value.to}::date`)
    const [first, ...rest] = ends
    return first === undefined ? sql`TRUE` : sql.join([first, ...rest], sql` AND `)
  }
  switch (node.field) {
    case "id":
      return node.valueKind === "wildcard"
        ? sql`${labelColumn(query.target)} ILIKE ${likePattern(value)}`
        : sql`lower(${labelColumn(query.target)}) = lower(${value})`
    case "title":
      return node.valueKind === "wildcard"
        ? sql`s.title ILIKE ${likePattern(value)}`
        : sql`s.title &@ ${value}`
    case "date_modified":
      return sql`s.date_modified = ${value}::date`
    default:
      return sql`s.date_published = ${value}::date`
  }
}

function compile(node: QueryNode, query: SearchQuery): SQL {
  if (node.op === "free_text") return sql`s.text_all &@ ${node.value}`
  if (node.op === "field") return compileField(node, query)
  if (node.op === "NOT") {
    const [only] = node.rules
    return only === undefined ? sql`TRUE` : sql`NOT coalesce(${compile(only, query)}, FALSE)`
  }
  const parts = node.rules.map((rule) => compile(rule, query))
  const [first, ...rest] = parts
  if (first === undefined) return sql`TRUE`
  const keyword = node.op === "AND" ? sql` AND ` : sql` OR `
  return sql`(${sql.join([first, ...rest], keyword)})`
}

/**
 * The matching rows, named `hits`. The identity is carried alongside the rest
 * because the facet counts are aggregates over exactly this set — asking twice
 * with two different sets is how a count could disagree with its own listing.
 */
export function hitsCte(query: SearchQuery): SQL {
  const predicate = query.ast === null ? sql`TRUE` : compile(query.ast, query)
  return sql`hits AS MATERIALIZED (
    SELECT s.id AS doc_id, s.target_id, s.hum_label, s.dataset_label,
           s.date_published, s.date_modified,
           pgroonga_score(s.tableoid, s.ctid) AS score
    FROM search_doc s
    WHERE s.target_type = ${query.target}::search_target_type AND (${predicate})
  )`
}

/**
 * The order rows come back in. Every option ends in the label so that equal
 * keys do not reorder between pages — a row that moves while paging is a row
 * seen twice and a row never seen.
 *
 * **A row without a date sits at the end whichever way the dates run.** It is
 * not earlier or later than the rest, it is the one that cannot be placed, and
 * putting it first when the order is reversed would hand the reader a page of
 * blanks for having asked to start at the other end.
 */
function orderBy(sort: SortKey, order: SortOrder, target: SearchTarget): SQL {
  const label = target === "research" ? sql`h.hum_label` : sql`h.dataset_label`
  const direction = order === "asc" ? sql`ASC` : sql`DESC`
  switch (sort) {
    case "dateModified":
      return sql`h.date_modified ${direction} NULLS LAST, ${label} ASC`
    case "datePublished":
      return sql`h.date_published ${direction} NULLS LAST, ${label} ASC`
    case "id":
      return sql`${label} ${direction}`
  }
}

interface HitRow extends Record<string, unknown> {
  target_id: string
  hum_label: string
  dataset_label: string | null
  date_published: string | null
  date_modified: string | null
}

/** How many rows the query matches, without reading any of them. */
export async function countMatches(db: Executor, query: SearchQuery): Promise<number> {
  const result = await db.execute<{ total: number }>(
    sql`WITH ${hitsCte(query)} SELECT count(*)::int AS total FROM hits`,
  )
  return result.rows[0]?.total ?? 0
}

/**
 * **A page past the end is empty, not the last one.** Something reading the
 * search a page at a time stops when a page comes back with nothing in it, and
 * answering the last page over again is an answer that never runs out. A screen
 * that would rather show the last page asks for it (`app/public/lists.server.ts`).
 */
export async function searchDocs(db: Executor, request: SearchRequest): Promise<SearchResult> {
  const total = await countMatches(db, request)
  const size = request.size ?? PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(total / size))
  const page = Math.max(1, request.page)
  if (page > pageCount) return { total, page, pageCount, hits: [] }
  const result = await db.execute<HitRow>(sql`
    WITH ${hitsCte(request)}
    SELECT h.target_id, h.hum_label, h.dataset_label, h.date_published, h.date_modified
    FROM hits h
    ORDER BY ${orderBy(request.sort, request.order, request.target)}
    LIMIT ${size} OFFSET ${(page - 1) * size}
  `)
  return { total, page, pageCount, hits: result.rows.map(hitOf) }
}

/**
 * Every hit at once, which is what handing a search over as a file needs.
 *
 * **No page and no ceiling.** The whole corpus is around two thousand rows, so
 * the largest answer this can give is the corpus itself; a file that stopped at
 * some arbitrary row would be a worse answer than a slow one. The ordering is
 * the screen's, so the file is the listing rather than a second view of it.
 */
export async function searchAllDocs(
  db: Executor,
  request: Omit<SearchRequest, "page">,
): Promise<SearchHit[]> {
  const result = await db.execute<HitRow>(sql`
    WITH ${hitsCte(request)}
    SELECT h.target_id, h.hum_label, h.dataset_label, h.date_published, h.date_modified
    FROM hits h
    ORDER BY ${orderBy(request.sort, request.order, request.target)}
  `)
  return result.rows.map(hitOf)
}

function hitOf(row: HitRow): SearchHit {
  return {
    targetId: row.target_id,
    humLabel: row.hum_label,
    datasetLabel: row.dataset_label,
    datePublished: row.date_published,
    dateModified: row.date_modified,
  }
}
