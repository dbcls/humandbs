/**
 * Reading and writing the labels of a research's files.
 *
 * **A label follows the file by its name**, so whatever changes the name in the
 * store changes the row with it: renaming moves the row and deleting deletes
 * it (`pages.server.ts`). Nothing here reaches the store — which files exist is
 * the store's to answer, and a label is only shown beside a file a listing
 * returned.
 */

import { and, eq, inArray, sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { fileLabel, labelPin } from "~/db/schema"

import type { FileLabel } from "./labels"

/** Every label of one research's files, by the file's name. */
export async function fileLabelsOf(executor: Executor, researchId: string): Promise<Map<string, FileLabel>> {
  const rows = await executor
    .select({ fileName: fileLabel.fileName, ja: fileLabel.labelJa, en: fileLabel.labelEn })
    .from(fileLabel)
    .where(eq(fileLabel.researchId, researchId))
  return new Map(rows.map((row) => [row.fileName, { ja: row.ja, en: row.en }]))
}

/**
 * The labels of several researches' files, by the primary hum label and then
 * the file's name — the key the public prefixes are listed under
 * (`listing.server.ts`). `null` is every research, for the bulk stream.
 */
export async function fileLabelsByHumLabel(
  executor: Executor,
  humLabels: readonly string[] | null,
): Promise<Map<string, Map<string, FileLabel>>> {
  if (humLabels !== null && humLabels.length === 0) return new Map()
  const rows = await executor
    .select({ humLabel: labelPin.label, fileName: fileLabel.fileName, ja: fileLabel.labelJa, en: fileLabel.labelEn })
    .from(fileLabel)
    .innerJoin(labelPin, and(
      eq(labelPin.researchId, fileLabel.researchId),
      eq(labelPin.kind, "hum"),
      eq(labelPin.isPrimary, true),
    ))
    .where(humLabels === null ? undefined : inArray(labelPin.label, [...humLabels]))
  const labels = new Map<string, Map<string, FileLabel>>()
  for (const row of rows) {
    const held = labels.get(row.humLabel) ?? new Map<string, FileLabel>()
    held.set(row.fileName, { ja: row.ja, en: row.en })
    labels.set(row.humLabel, held)
  }
  return labels
}

/**
 * Set one file's label, or delete it for `null`. Answers what it was before,
 * which is what the trail records beside what it became.
 */
export async function writeFileLabel(
  executor: Executor,
  researchId: string,
  fileName: string,
  label: FileLabel | null,
): Promise<FileLabel | null> {
  const [before] = await executor
    .select({ ja: fileLabel.labelJa, en: fileLabel.labelEn })
    .from(fileLabel)
    .where(and(eq(fileLabel.researchId, researchId), eq(fileLabel.fileName, fileName)))
    .for("update")
  if (label === null) {
    await forgetFileLabels(executor, researchId, [fileName])
  } else {
    await executor
      .insert(fileLabel)
      .values({ researchId, fileName, labelJa: label.ja, labelEn: label.en })
      .onConflictDoUpdate({
        target: [fileLabel.researchId, fileLabel.fileName],
        set: { labelJa: label.ja, labelEn: label.en, updatedAt: sql`now()` },
      })
  }
  return before ?? null
}

/**
 * Move a file's label to its new name. A row already under the new name
 * belongs to no file — the rename refuses a name the store holds — so the
 * moved label replaces it.
 */
export async function moveFileLabel(
  executor: Executor,
  researchId: string,
  from: string,
  to: string,
): Promise<void> {
  if (from === to) return
  await forgetFileLabels(executor, researchId, [to])
  await executor
    .update(fileLabel)
    .set({ fileName: to, updatedAt: sql`now()` })
    .where(and(eq(fileLabel.researchId, researchId), eq(fileLabel.fileName, from)))
}

/** Delete the labels of files that are no longer there. */
export async function forgetFileLabels(
  executor: Executor,
  researchId: string,
  fileNames: readonly string[],
): Promise<void> {
  if (fileNames.length === 0) return
  await executor
    .delete(fileLabel)
    .where(and(eq(fileLabel.researchId, researchId), inArray(fileLabel.fileName, [...fileNames])))
}
