/**
 * A version as a daily backup has it, written into the live database as a new
 * draft of its research.
 *
 * The backup is a dump restored into a database of its own, and is only read.
 * **The live database gains a draft and nothing else**: what is published
 * changes when an admin imports from that draft into the version's update and
 * publishes it, so the publish check, the events and the search rows are those
 * of any publish.
 */

import { and, eq } from "drizzle-orm"

import type { VersionContent } from "~/content/types"
import type { Database, Executor } from "~/db/client.server"
import { labelPin, researchVersion } from "~/db/schema"

import { draftFromVersion, renameDraft } from "./drafts.server"

export interface BackupVersion {
  /** The research's id in the backup, which is its id in the live database unless it has been deleted since. */
  researchId: string
  content: VersionContent
}

/** The research a hum label is pinned to, as primary or as secondary. */
async function researchLabelled(db: Executor, label: string): Promise<string | null> {
  const [row] = await db
    .select({ researchId: labelPin.researchId })
    .from(labelPin)
    .where(and(eq(labelPin.kind, "hum"), eq(labelPin.label, label)))
    .limit(1)
  return row?.researchId ?? null
}

/** The version under this number of the research the label is pinned to in the backup. Null when there is none. */
export async function readBackupVersion(
  backup: Executor,
  label: string,
  number: number,
): Promise<BackupVersion | null> {
  const researchId = await researchLabelled(backup, label)
  if (researchId === null) return null
  const [version] = await backup
    .select({ content: researchVersion.content })
    .from(researchVersion)
    .where(and(eq(researchVersion.researchId, researchId), eq(researchVersion.number, number)))
    .limit(1)
  return version === undefined ? null : { researchId, content: version.content }
}

export type BackupDraftOutcome
  = | { status: "created", draftId: string }
    /** The label is pinned to another research now, or to none: nothing was written. */
    | { status: "elsewhere" }

/**
 * A new draft of the research, holding the version as the backup has it and
 * called `name`. Datasets deleted since the backup are left out, as they are
 * from any draft copied from a version (`draftFromVersion`).
 *
 * **The label has to be pinned to the same research in both.** The admin asks
 * for a research by its label, and a label moved since would put one research's
 * content into another's draft.
 */
export async function draftFromBackup(
  db: Database,
  label: string,
  version: BackupVersion,
  name: string,
): Promise<BackupDraftOutcome> {
  return db.transaction(async (tx): Promise<BackupDraftOutcome> => {
    if (await researchLabelled(tx, label) !== version.researchId) return { status: "elsewhere" }
    const draftId = await draftFromVersion(tx, version)
    await renameDraft(tx, draftId, name)
    return { status: "created", draftId }
  })
}
