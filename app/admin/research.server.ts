/**
 * Deleting a research.
 *
 * **Composition all the way down.** A dataset belongs to exactly one research,
 * so the datasets, their published descriptions, every draft and everything
 * hanging off one go with it. The label pins go too, which is what frees the
 * hum label and the dataset ids to be pinned again. The search rows are cascaded
 * as well, so there is nothing to rebuild — the research simply stops being
 * anywhere.
 *
 * **What survives is the event**, which is why it has no foreign key. The
 * labels are written into its detail before the rows go: afterwards nothing
 * else can report which hum this was.
 *
 * **A research whose prefixes hold files is not deleted.** The files are defined in the
 * store, which no cascade reaches: the public ones would keep responding at
 * `/files/hum…/`, and whichever research is given that number next would list
 * them as its own. Each file is deleted from the files screen first, where
 * deleting one is confirmed on its own. The prefixes are read before the
 * transaction opens, so a store that does not respond deletes nothing.
 */

import { eq } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import type { Executor } from "~/db/client.server"
import { labelPin, research, researchVersion } from "~/db/schema"
import { researchHoldsFiles } from "~/files/jobs.server"

import { lockResearch } from "./locks.server"

export type DeleteResearchResult
  = | { status: "deleted" }
    /** A prefix of the research still holds a file. */
    | { status: "files-remain" }
    | { status: "gone" }

export async function deleteResearch(
  db: Executor,
  researchId: string,
  actor: EventActor,
): Promise<DeleteResearchResult> {
  if (await researchHoldsFiles(db, researchId)) return { status: "files-remain" }
  return db.transaction(async (tx): Promise<DeleteResearchResult> => {
    // Locked before anything else, so that a publish or an edit of this research
    // waits here rather than holding a draft the cascade below has to delete.
    if (!await lockResearch(tx, researchId, "update")) return { status: "gone" }

    // Only hum labels hang off a research; a dataset id hangs off its dataset.
    // **One at a time**: a transaction is one connection, so requesting both at
    // once wins nothing and requests the driver to run a query on a busy client.
    const pins = await tx
      .select({ label: labelPin.label })
      .from(labelPin)
      .where(eq(labelPin.researchId, researchId))
    const versions = await tx
      .select({ number: researchVersion.number })
      .from(researchVersion)
      .where(eq(researchVersion.researchId, researchId))

    await recordEvent(tx, {
      actor,
      action: "delete-research",
      subjectType: "research",
      subjectId: researchId,
      detail: {
        humLabels: pins.map((pin) => pin.label),
        publishedVersions: versions.map((version) => version.number),
      },
    })

    await tx.delete(research).where(eq(research.id, researchId))
    return { status: "deleted" }
  })
}
