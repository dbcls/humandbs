/**
 * Counting the facets of a result.
 *
 * Every count is an aggregate over the same `hits` the listing is built from,
 * so a number beside a value is the number of rows clicking it would leave.
 *
 * **A count is taken with the facet's own condition lifted.** Counting under
 * the whole query would put a zero beside every value of a facet as soon as one
 * of them is chosen, and a zero is not shown — which would make a second value
 * of the same facet unreachable and turn every facet into a single choice. The
 * facets nobody has chosen are all counted in one query; the ones that are get
 * one query each, so the work grows with what the reader has selected rather
 * than with the size of the catalog.
 *
 * **Values are counted at the root of their tree.** A flat vocabulary has no
 * ancestors, so the root of a term is the term; a hierarchical one rolls its
 * children up, which is what puts one bucket per 3-character ICD10 code in a
 * panel instead of six hundred. The children are counted separately, and only
 * when the reader opens the facet.
 */

import { sql, type SQL } from "drizzle-orm"

import type { Executor } from "~/db/client.server"

import { hitsCte, type SearchQuery } from "./query.server"

export interface TermCount {
  keyId: string
  termId: string
  code: string
  labelJa: string | null
  labelEn: string
  maker: string | null
  count: number
}

/** A term counted under the root it rolls up into. */
export interface ChildCount extends TermCount {
  rootId: string
}

export interface NumberBounds {
  keyId: string
  min: number
  max: number
}

/**
 * The root of a term's chain. `ancestor_ids` runs from the immediate parent
 * upwards, so the last of them is the root; an empty array indexes to null and
 * the term stands for itself.
 */
const ROOT_ID = sql`coalesce(f.ancestor_ids[array_length(f.ancestor_ids, 1)], f.term_id)`

/** A list of identities as a parenthesised list, which is what `IN` takes. */
function anyOf(ids: readonly string[]): SQL {
  return sql`(${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`
}

interface TermRow extends Record<string, unknown> {
  key_id: string
  term_id: string
  code: string
  label_ja: string | null
  label_en: string
  maker: string | null
  n: number
}

function termCount(row: TermRow): TermCount {
  return {
    keyId: row.key_id,
    termId: row.term_id,
    code: row.code,
    labelJa: row.label_ja,
    labelEn: row.label_en,
    maker: row.maker,
    count: row.n,
  }
}

/** Every value of the given facets that at least one matching row carries. */
export async function countTerms(
  db: Executor,
  query: SearchQuery,
  keyIds: readonly string[],
): Promise<TermCount[]> {
  if (keyIds.length === 0) return []
  const result = await db.execute<TermRow>(sql`
    WITH ${hitsCte(query)}
    SELECT f.key_id, root.id AS term_id, root.code, root.label_ja, root.label_en, root.maker,
           count(DISTINCT f.doc_id)::int AS n
    FROM hits h
    JOIN search_facet_term f ON f.doc_id = h.doc_id
    JOIN vocabulary_term root ON root.id = ${ROOT_ID}
    WHERE f.key_id IN ${anyOf(keyIds)}
    GROUP BY f.key_id, root.id
    ORDER BY n DESC, root.label_en
  `)
  return result.rows.map(termCount)
}

/**
 * The values of one facet counted at their own level, each carrying the root it
 * sits under. For a flat vocabulary this is the same list `countTerms` gives.
 */
export async function countTermChildren(
  db: Executor,
  query: SearchQuery,
  keyId: string,
): Promise<ChildCount[]> {
  const result = await db.execute<TermRow & { root_id: string }>(sql`
    WITH ${hitsCte(query)}
    SELECT f.key_id, ${ROOT_ID} AS root_id, t.id AS term_id, t.code,
           t.label_ja, t.label_en, t.maker, count(DISTINCT f.doc_id)::int AS n
    FROM hits h
    JOIN search_facet_term f ON f.doc_id = h.doc_id
    JOIN vocabulary_term t ON t.id = f.term_id
    WHERE f.key_id = ${keyId}::uuid
    GROUP BY f.key_id, root_id, t.id
    ORDER BY n DESC, t.code
  `)
  return result.rows.map((row) => ({ ...termCount(row), rootId: row.root_id }))
}

/**
 * The span of values present, in each key's canonical unit. It is what the
 * range inputs suggest — a facet whose numbers are all in the hundreds should
 * not invite a reader to type a bound in the millions.
 */
export async function numberBounds(
  db: Executor,
  query: SearchQuery,
  keyIds: readonly string[],
): Promise<NumberBounds[]> {
  if (keyIds.length === 0) return []
  const result = await db.execute<{ key_id: string, lo: number, hi: number }>(sql`
    WITH ${hitsCte(query)}
    SELECT f.key_id, min(f.value)::float8 AS lo, max(f.value)::float8 AS hi
    FROM hits h
    JOIN search_facet_number f ON f.doc_id = h.doc_id
    WHERE f.key_id IN ${anyOf(keyIds)}
    GROUP BY f.key_id
  `)
  return result.rows.map((row) => ({ keyId: row.key_id, min: row.lo, max: row.hi }))
}

export interface DateBounds {
  min: string
  max: string
}

/**
 * The first and last day present in the result, for each of the two dates the
 * panel offers.
 *
 * These are columns of the search row rather than rows of a facet table, so the
 * span comes from the hits themselves and no join is needed. A date the result
 * never carries comes back null, and the panel then has nothing to suggest —
 * which is the honest state while the modification dates are still arriving.
 */
export async function dateBounds(
  db: Executor,
  query: SearchQuery,
): Promise<{ date_published: DateBounds | null, date_modified: DateBounds | null }> {
  const result = await db.execute<{
    pub_lo: string | null
    pub_hi: string | null
    mod_lo: string | null
    mod_hi: string | null
  }>(sql`
    WITH ${hitsCte(query)}
    SELECT min(h.date_published)::text AS pub_lo, max(h.date_published)::text AS pub_hi,
           min(h.date_modified)::text AS mod_lo, max(h.date_modified)::text AS mod_hi
    FROM hits h
  `)
  const [row] = result.rows
  const span = (lo: string | null | undefined, hi: string | null | undefined): DateBounds | null =>
    lo == null || hi == null ? null : { min: lo, max: hi }
  return {
    date_published: span(row?.pub_lo, row?.pub_hi),
    date_modified: span(row?.mod_lo, row?.mod_hi),
  }
}
