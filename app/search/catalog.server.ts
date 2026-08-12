/**
 * Reading the catalog as the search sees it.
 *
 * **A key typed as a vocabulary or a number is a facet, and nothing else is.**
 * That one rule is why there is no list of facets anywhere: this query is the
 * list, and adding to it is a change of type on a key. Everything the panel and
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
import { contentKey, facetCategory, vocabularySet, vocabularyTerm } from "~/db/schema"

import type { FacetField } from "./fields"

export interface FacetDefinition {
  field: FacetField
  labelJa: string
  labelEn: string
  /** Null when the key has been given no category; those come last, unheaded. */
  categoryCode: string | null
  categoryLabelJa: string | null
  categoryLabelEn: string | null
  /** Set for a number key: the unit its stored values are in. */
  canonicalUnit: string | null
  /** Whether the values roll up. Only ICD10 does. */
  hierarchical: boolean
  /** The vocabulary the values are drawn from; null for a number key. */
  setCode: string | null
}

interface FacetRow extends Record<string, unknown> {
  id: string
  code: string
  valueType: "vocabulary" | "number"
  labelJa: string
  labelEn: string
  setId: string | null
  setCode: string | null
  canonicalUnit: string | null
  hierarchical: boolean | null
  categoryCode: string | null
  categoryLabelJa: string | null
  categoryLabelEn: string | null
}

/**
 * The facets, in the order they are shown: by category, then by the position
 * the catalog gives the key inside it. A key with no category sorts after the
 * ones that have one, because a heading cannot come after what it heads.
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
      setCode: vocabularySet.code,
      canonicalUnit: contentKey.canonicalUnit,
      hierarchical: vocabularySet.hierarchical,
      categoryCode: facetCategory.code,
      categoryLabelJa: facetCategory.labelJa,
      categoryLabelEn: facetCategory.labelEn,
    })
    .from(contentKey)
    .leftJoin(vocabularySet, eq(vocabularySet.id, contentKey.vocabularySetId))
    .leftJoin(facetCategory, eq(facetCategory.id, contentKey.facetCategoryId))
    .where(or(eq(contentKey.valueType, "vocabulary"), eq(contentKey.valueType, "number")))
    .orderBy(
      sql`${facetCategory.position} NULLS LAST`,
      asc(facetCategory.code),
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
    hierarchical: row.hierarchical ?? false,
    setCode: row.setCode,
  }))
}

export interface ResolvedTerm {
  setId: string
  code: string
  labelJa: string | null
  labelEn: string
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
    })
    .from(vocabularyTerm)
    .where(and(inArray(vocabularyTerm.setId, setIds), inArray(vocabularyTerm.code, codes)))
  const asked = new Set(wanted.map((one) => `${one.setId}/${one.code}`))
  return rows.filter((row) => asked.has(`${row.setId}/${row.code}`))
}
