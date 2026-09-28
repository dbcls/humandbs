/**
 * Which files of a research's prefix its public page lists.
 *
 * **The setting follows the file by its name**, as a label does
 * (`labels.server.ts`): renaming moves the row and deleting deletes it
 * (`pages.server.ts`). Nothing here reaches the store — a row for a file the
 * listing does not return lists nothing.
 */

import { and, eq, inArray } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { researchPageFile } from "~/db/schema"

/** The names of the files one research's page lists. */
export async function researchPageFilesOf(executor: Executor, researchId: string): Promise<Set<string>> {
  const rows = await executor
    .select({ fileName: researchPageFile.fileName })
    .from(researchPageFile)
    .where(eq(researchPageFile.researchId, researchId))
  return new Set(rows.map((row) => row.fileName))
}

/**
 * The names of the files several researches' pages list, by the research's
 * identity. `null` is every research, for the bulk stream.
 */
export async function researchPageFilesByResearch(
  executor: Executor,
  researchIds: readonly string[] | null,
): Promise<Map<string, Set<string>>> {
  if (researchIds !== null && researchIds.length === 0) return new Map()
  const rows = await executor
    .select({ researchId: researchPageFile.researchId, fileName: researchPageFile.fileName })
    .from(researchPageFile)
    .where(researchIds === null ? undefined : inArray(researchPageFile.researchId, [...researchIds]))
  const listed = new Map<string, Set<string>>()
  for (const row of rows) {
    const names = listed.get(row.researchId) ?? new Set<string>()
    names.add(row.fileName)
    listed.set(row.researchId, names)
  }
  return listed
}

/**
 * List one file on the research's page, or stop listing it. Answers whether it
 * was listed before, so that a press that changes nothing is not recorded.
 */
export async function writeResearchPageFile(
  executor: Executor,
  researchId: string,
  fileName: string,
  listed: boolean,
): Promise<boolean> {
  const [before] = await executor
    .select({ id: researchPageFile.id })
    .from(researchPageFile)
    .where(and(eq(researchPageFile.researchId, researchId), eq(researchPageFile.fileName, fileName)))
    .for("update")
  if (listed) {
    await executor.insert(researchPageFile).values({ researchId, fileName }).onConflictDoNothing()
  } else {
    await forgetResearchPageFiles(executor, researchId, [fileName])
  }
  return before !== undefined
}

/**
 * Move the setting to the file's new name. A row already under the new name
 * belongs to no file — the rename refuses a name the store holds — so the
 * moved one replaces it.
 */
export async function moveResearchPageFile(
  executor: Executor,
  researchId: string,
  from: string,
  to: string,
): Promise<void> {
  if (from === to) return
  await forgetResearchPageFiles(executor, researchId, [to])
  await executor
    .update(researchPageFile)
    .set({ fileName: to })
    .where(and(eq(researchPageFile.researchId, researchId), eq(researchPageFile.fileName, from)))
}

/** Delete the setting of files that are no longer there. */
export async function forgetResearchPageFiles(
  executor: Executor,
  researchId: string,
  fileNames: readonly string[],
): Promise<void> {
  if (fileNames.length === 0) return
  await executor
    .delete(researchPageFile)
    .where(and(eq(researchPageFile.researchId, researchId), inArray(researchPageFile.fileName, [...fileNames])))
}
