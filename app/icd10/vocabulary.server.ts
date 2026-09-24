/**
 * The ICD10 classification as the disease vocabulary: putting it in, and
 * reading it back by code.
 *
 * **The classification is the vocabulary, all of it**: every three- and
 * four-character code goes in whether or not any dataset names it, so that a
 * code typed into a disease's box is either in the classification or not,
 * with nothing to add in between. **An import upserts by code** — a code
 * already held keeps its identity, so nothing that points at it moves, and
 * takes the classification's titles again; nobody rewords these by hand, so
 * overwriting loses nothing.
 *
 * Three-character codes are roots and four-character ones hang under them
 * (`vocabularySet.hierarchical`); anything longer is not a term. A
 * four-character code whose root neither distribution names gets a root
 * named by its code, so that the facet still counts it by three characters.
 */

import { eq, sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { vocabularySet, vocabularyTerm } from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { ICD10_SET_CODE, ICD10_SET_LABELS, icd10Parent, type Icd10Entry } from "./codes"

const INSERT_CHUNK = 1000

export interface Icd10Import {
  roots: number
  children: number
}

export async function importIcd10Terms(
  db: Executor,
  entries: readonly Icd10Entry[],
): Promise<Icd10Import> {
  const setId = await icd10SetId(db)
  const held = new Map(entries.filter((entry) => entry.code.length <= 4).map((entry) => [entry.code, entry]))
  for (const entry of [...held.values()]) {
    const parent = icd10Parent(entry.code)
    if (parent !== null && !held.has(parent)) held.set(parent, { code: parent, titleEn: null, titleJa: null })
  }
  const roots = [...held.values()].filter((entry) => icd10Parent(entry.code) === null)
  const children = [...held.values()].filter((entry) => icd10Parent(entry.code) !== null)

  await upsert(db, setId, roots.map((entry) => ({ code: entry.code, ...labelsOf(entry), parentId: null })))
  const ids = await icd10TermIds(db)
  await upsert(db, setId, children.map((entry) => ({
    code: entry.code,
    ...labelsOf(entry),
    parentId: ids.get(icd10Parent(entry.code) ?? "") ?? null,
  })))
  // A search row carries the titles of the codes its content points at, so a
  // newer distribution that renames a code would otherwise leave the old name
  // findable and the new one not.
  await rebuildSearchDocs(db)
  return { roots: roots.length, children: children.length }
}

/** English is required of a term, so a code named only in Japanese carries that in both. */
function labelsOf(entry: Icd10Entry): { labelEn: string, labelJa: string | null } {
  return { labelEn: entry.titleEn ?? entry.titleJa ?? entry.code, labelJa: entry.titleJa }
}

async function upsert(
  db: Executor,
  setId: string,
  rows: readonly { code: string, labelEn: string, labelJa: string | null, parentId: string | null }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db
      .insert(vocabularyTerm)
      .values(rows.slice(i, i + INSERT_CHUNK).map((row) => ({ setId, ...row })))
      .onConflictDoUpdate({
        target: [vocabularyTerm.setId, vocabularyTerm.code],
        set: {
          labelEn: sql`excluded.label_en`,
          labelJa: sql`excluded.label_ja`,
          parentId: sql`excluded.parent_id`,
        },
      })
  }
}

/**
 * The vocabulary's identity, made if the catalog has not been seeded yet — the
 * import runs before the dev data load on a fresh database, and on its own on
 * a served one.
 */
async function icd10SetId(db: Executor): Promise<string> {
  const [found] = await db
    .select({ id: vocabularySet.id })
    .from(vocabularySet)
    .where(eq(vocabularySet.code, ICD10_SET_CODE))
    .limit(1)
  if (found !== undefined) return found.id
  const [made] = await db
    .insert(vocabularySet)
    .values({
      code: ICD10_SET_CODE,
      labelJa: ICD10_SET_LABELS.ja,
      labelEn: ICD10_SET_LABELS.en,
      hierarchical: true,
    })
    .returning({ id: vocabularySet.id })
  if (made === undefined) throw new Error("the ICD10 vocabulary could not be made")
  return made.id
}

/** Every code the vocabulary holds, with the identity a value points at it by. */
export async function icd10TermIds(db: Executor): Promise<Map<string, string>> {
  const rows = await db
    .select({ code: vocabularyTerm.code, id: vocabularyTerm.id })
    .from(vocabularyTerm)
    .innerJoin(vocabularySet, eq(vocabularySet.id, vocabularyTerm.setId))
    .where(eq(vocabularySet.code, ICD10_SET_CODE))
  return new Map(rows.map((row) => [row.code, row.id]))
}

/** How much of the classification is in, for the import to report. */
export async function icd10VocabularySize(db: Executor): Promise<{
  roots: number
  children: number
  withJa: number
}> {
  const [row] = await db
    .select({
      roots: sql<number>`count(*) filter (where ${vocabularyTerm.parentId} is null)::int`,
      children: sql<number>`count(*) filter (where ${vocabularyTerm.parentId} is not null)::int`,
      withJa: sql<number>`count(${vocabularyTerm.labelJa})::int`,
    })
    .from(vocabularyTerm)
    .innerJoin(vocabularySet, eq(vocabularySet.id, vocabularyTerm.setId))
    .where(eq(vocabularySet.code, ICD10_SET_CODE))
  return row ?? { roots: 0, children: 0, withJa: 0 }
}
