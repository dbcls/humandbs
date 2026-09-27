/**
 * Keeping the terms of the `file-type` vocabulary the same as the list of formats.
 *
 * The list is in the code (`formats.ts`) and the terms are in the database,
 * because the search rows point at terms by ID. Adding a format is a change to
 * the code, and this is how the change reaches the terms: the refresh of the
 * dataset files runs it before it writes, and so does the migration.
 *
 * **Only the migration removes the terms the list does not have.** A database
 * migrated before the formats were read from the files still has a `file-type`
 * key whose values point at the terms made from the articles, and a refresh
 * that removed them would leave the search rows pointing at nothing. The
 * migration removes them once it has taken that key out.
 */

import { and, eq, notInArray, sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { vocabularySet, vocabularyTerm } from "~/db/schema"

import { FILE_FORMAT_SET, FILE_FORMATS } from "./formats"

export async function syncFileFormatTerms(tx: Executor, { removeUnlisted }: { removeUnlisted: boolean }): Promise<void> {
  await tx
    .insert(vocabularySet)
    .values({ ...FILE_FORMAT_SET, hierarchical: false })
    .onConflictDoNothing({ target: vocabularySet.code })
  const [set] = await tx
    .select({ id: vocabularySet.id })
    .from(vocabularySet)
    .where(eq(vocabularySet.code, FILE_FORMAT_SET.code))
  if (set === undefined) throw new Error(`the vocabulary ${FILE_FORMAT_SET.code} could not be made`)

  if (removeUnlisted) {
    await tx.delete(vocabularyTerm).where(and(
      eq(vocabularyTerm.setId, set.id),
      notInArray(vocabularyTerm.code, FILE_FORMATS.map((one) => one.code)),
    ))
  }
  await tx
    .insert(vocabularyTerm)
    .values(FILE_FORMATS.map((one, position) => ({
      setId: set.id,
      code: one.code,
      labelEn: one.label,
      labelJa: null,
      maker: null,
      parentId: null,
      documentId: null,
      position,
    })))
    .onConflictDoUpdate({
      target: [vocabularyTerm.setId, vocabularyTerm.code],
      set: {
        labelEn: sql`excluded.label_en`,
        labelJa: null,
        maker: null,
        parentId: null,
        documentId: null,
        position: sql`excluded.position`,
      },
    })
}
