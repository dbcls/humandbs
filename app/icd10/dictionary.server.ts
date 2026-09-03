/**
 * The ICD10 dictionary: getting it, replacing it, and the three questions it
 * answers.
 *
 * **The dictionary never writes the vocabulary.** An import replaces this one
 * table and touches nothing else, which is what lets every term stay editable —
 * a label a curator corrected cannot disappear at the next import
 * (docs/data-model.md の「ICD10」).
 *
 * The public side reads it for one thing only: telling a code that does not
 * exist from one that exists but that no published data carries. Titles are
 * read on the editing side, where they seed a new term's labels.
 */

import { asc, eq, inArray, or, sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { icd10Reference } from "~/db/schema"

import { type Icd10Entry } from "./codes"

/** Where each distribution comes from, and what it is called once fetched. */
export const WHO_META_URL = "https://icdcdn.who.int/icd10/meta/icd102019enMeta.zip"
export const WHO_META_MEMBER = "icd102019syst_codes.txt"
export const WHO_LOCAL_NAME = "icd10-who-2019.txt"

export const ESTAT_CSV_URL = [
  "https://www.e-stat.go.jp/term/download?bKbn=40&kaiteiCode=03&charset=UTF-8&bom=false",
  "&searchMethod=keyword&searchWord=&komokuSearchFlg=1",
  "&info1SearchFlg=&info2SearchFlg=&info3SearchFlg=&info4SearchFlg=&info5SearchFlg=&info6SearchFlg=",
].join("")
export const ESTAT_LOCAL_NAME = "icd10-estat-2013.csv"

const INSERT_CHUNK = 1000

/**
 * Replaces the dictionary with what was fetched. **All of it or none of it** —
 * a half-written dictionary would report codes as nonexistent.
 */
export async function replaceDictionary(db: Executor, entries: Icd10Entry[]): Promise<number> {
  await db.delete(icd10Reference)
  for (let i = 0; i < entries.length; i += INSERT_CHUNK) {
    await db.insert(icd10Reference).values(entries.slice(i, i + INSERT_CHUNK))
  }
  return entries.length
}

/** How many codes the dictionary holds, and how many carry each title. */
export async function dictionarySize(db: Executor): Promise<{
  codes: number
  withEn: number
  withJa: number
}> {
  const [row] = await db
    .select({
      codes: sql<number>`count(*)::int`,
      withEn: sql<number>`count(${icd10Reference.titleEn})::int`,
      withJa: sql<number>`count(${icd10Reference.titleJa})::int`,
    })
    .from(icd10Reference)
  return row ?? { codes: 0, withEn: 0, withJa: 0 }
}

/** One code, or null when the classification does not hold it. */
export async function lookUpCode(db: Executor, code: string): Promise<Icd10Entry | null> {
  const [row] = await db
    .select()
    .from(icd10Reference)
    .where(eq(icd10Reference.code, code))
    .limit(1)
  return row ?? null
}

/**
 * Every code the classification holds. **Read whole**: the migration asks it
 * once per code it meets, and the table is 15,217 rows.
 */
export async function knownCodes(db: Executor): Promise<Set<string>> {
  const rows = await db.select({ code: icd10Reference.code }).from(icd10Reference)
  return new Set(rows.map((row) => row.code))
}

/** The dictionary entries for these codes, by code. */
export async function titlesOf(
  db: Executor,
  codes: readonly string[],
): Promise<Map<string, Icd10Entry>> {
  if (codes.length === 0) return new Map()
  const rows = await db
    .select()
    .from(icd10Reference)
    .where(inArray(icd10Reference.code, [...new Set(codes)]))
  return new Map(rows.map((row) => [row.code, row]))
}

/**
 * Codes matching what was typed, by code or by either title. Ordered by code so
 * that a three-character root comes before what rolls up into it.
 */
export async function searchDictionary(
  db: Executor,
  needle: string,
  limit: number,
): Promise<Icd10Entry[]> {
  const find = needle.trim()
  if (find === "") return []
  const like = `%${find}%`
  return db
    .select()
    .from(icd10Reference)
    .where(or(
      sql`${icd10Reference.code} ILIKE ${like}`,
      sql`coalesce(${icd10Reference.titleEn}, '') ILIKE ${like}`,
      sql`coalesce(${icd10Reference.titleJa}, '') ILIKE ${like}`,
    ))
    .orderBy(asc(icd10Reference.code))
    .limit(limit)
}
