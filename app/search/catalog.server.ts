/**
 * Reading the catalog as the search sees it.
 *
 * **A key typed as a vocabulary, a number or a disease is a facet, and nothing
 * else is.** That one rule is why there is no list of facets anywhere: this
 * query is the list, and adding to it is a change of type on a key. Everything the panel and
 * the query language need — the field name, what its values are drawn from,
 * where it sits on the screen — is on the key or on the set it points at.
 *
 * Terms are not read wholesale. A vocabulary can hold ten values or twelve
 * thousand, so labels are resolved for the values actually shown: the counts
 * bring their own, and a chosen value that no longer matches anything is looked
 * up by the code the address carries.
 */

import { and, asc, eq, inArray, or, sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { contentKey, facetCategory, vocabularyTerm } from "~/db/schema"

import { ROOT_ID } from "./counts.server"
import type { FacetField } from "./fields"

export interface FacetDefinition {
  field: FacetField
  labelJa: string
  labelEn: string
  /** Null when the key has been given no category; those come last, unheaded. */
  categoryCode: string | null
  /** Null on a category drawn without a heading, and then both are null. */
  categoryLabelJa: string | null
  categoryLabelEn: string | null
  /** Set for a number key: the unit its stored values are in. */
  canonicalUnit: string | null
  /**
   * Whether an object carrying this key says so. **A key can be filtered on
   * without being shown** — thirteen of them are, and they are the ones the
   * panel offers as questions rather than as descriptions.
   */
  showOnPublicPage: boolean
}

interface FacetRow extends Record<string, unknown> {
  id: string
  code: string
  valueType: "vocabulary" | "number" | "disease"
  labelJa: string
  labelEn: string
  setId: string | null
  canonicalUnit: string | null
  categoryCode: string | null
  categoryLabelJa: string | null
  categoryLabelEn: string | null
  showOnPublicPage: boolean
}

/**
 * The facets, in the order they are shown: by category, then by the position
 * the catalog gives the key. A key with no category sorts after the ones that
 * have one, because a heading cannot come after what it heads.
 *
 * **The catalog's order, not the code's.** Sorting by code would put the panel
 * in the alphabetical order of the English slugs, which is no order at all to a
 * reader of the Japanese side — and the position is the one place the order is
 * a decision somebody made rather than a side effect of how a key is spelled.
 */
export async function loadFacetDefinitions(db: Executor): Promise<FacetDefinition[]> {
  const rows = await db
    .select({
      id: contentKey.id,
      code: contentKey.code,
      valueType: contentKey.valueType,
      labelJa: contentKey.labelJa,
      labelEn: contentKey.labelEn,
      setId: contentKey.vocabularySetId,
      canonicalUnit: contentKey.canonicalUnit,
      showOnPublicPage: contentKey.showOnPublicPage,
      categoryCode: facetCategory.code,
      categoryLabelJa: facetCategory.labelJa,
      categoryLabelEn: facetCategory.labelEn,
    })
    .from(contentKey)
    .leftJoin(facetCategory, eq(facetCategory.id, contentKey.facetCategoryId))
    .where(or(
      eq(contentKey.valueType, "vocabulary"),
      eq(contentKey.valueType, "number"),
      eq(contentKey.valueType, "disease"),
    ))
    .orderBy(
      sql`${facetCategory.position} NULLS LAST`,
      asc(facetCategory.code),
      asc(contentKey.position),
      asc(contentKey.code),
    )

  return (rows as FacetRow[]).map((row) => ({
    field: {
      code: row.code,
      keyId: row.id,
      kind: row.valueType,
      setId: row.setId,
    },
    labelJa: row.labelJa,
    labelEn: row.labelEn,
    categoryCode: row.categoryCode,
    categoryLabelJa: row.categoryLabelJa,
    categoryLabelEn: row.categoryLabelEn,
    canonicalUnit: row.canonicalUnit,
    showOnPublicPage: row.showOnPublicPage,
  }))
}

export interface ResolvedTerm {
  setId: string
  code: string
  labelJa: string | null
  labelEn: string
  maker: string | null
}

/**
 * Labels for values named by code. Used for what a count cannot supply: a value
 * the reader has chosen that nothing in the result carries any more, which has
 * to keep its label so that it can be recognised and taken off again.
 */
export async function resolveTerms(
  db: Executor,
  wanted: readonly { setId: string, code: string }[],
): Promise<ResolvedTerm[]> {
  if (wanted.length === 0) return []
  const setIds = [...new Set(wanted.map((one) => one.setId))]
  const codes = [...new Set(wanted.map((one) => one.code))]
  const rows = await db
    .select({
      setId: vocabularyTerm.setId,
      code: vocabularyTerm.code,
      labelJa: vocabularyTerm.labelJa,
      labelEn: vocabularyTerm.labelEn,
      maker: vocabularyTerm.maker,
    })
    .from(vocabularyTerm)
    .where(and(inArray(vocabularyTerm.setId, setIds), inArray(vocabularyTerm.code, codes)))
  const asked = new Set(wanted.map((one) => `${one.setId}/${one.code}`))
  return rows.filter((row) => asked.has(`${row.setId}/${row.code}`))
}

export interface FacetValue {
  keyId: string
  code: string
  labelJa: string | null
  labelEn: string
}

/**
 * Every value the published set actually carries, by key.
 *
 * **Rolled up to the root of its tree**, because the root is the only level a
 * query can name (`./counts.server.ts`). **Read off the facet rows rather than
 * the vocabulary**, so that a value nothing carries is not offered: the set
 * behind `disease` holds every ICD10 code there is, and all but a few hundred
 * of them would match nothing.
 *
 * **No counts.** How many rows a value would leave is a question about a
 * result; this is the list of what may be asked.
 */
export async function publishedFacetValues(db: Executor): Promise<FacetValue[]> {
  const result = await db.execute<{
    key_id: string
    code: string
    label_ja: string | null
    label_en: string
  }>(sql`
    SELECT DISTINCT f.key_id, root.code, root.label_ja, root.label_en
    FROM search_facet_term f
    JOIN vocabulary_term root ON root.id = ${ROOT_ID}
    ORDER BY root.code
  `)
  return result.rows.map((row) => ({
    keyId: row.key_id,
    code: row.code,
    labelJa: row.label_ja,
    labelEn: row.label_en,
  }))
}
