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
 * **What survives is the event**, which is why it carries no foreign key
 * ([publishing.md](../../docs/publishing.md) の「証跡」). The labels are written
 * into its detail before the rows go: afterwards nothing else can say which hum
 * this was.
 */

import { eq } from "drizzle-orm"

import { recordEvent, type EventActor } from "~/auth/events.server"
import type { Executor } from "~/db/client.server"
import { labelPin, research, researchVersion } from "~/db/schema"

export type DeleteResearchResult
  = | { status: "deleted" }
    | { status: "gone" }

export async function deleteResearch(
  db: Executor,
  researchId: string,
  actor: EventActor,
): Promise<DeleteResearchResult> {
  return db.transaction(async (tx) => {
    const [held] = await tx
      .select({ id: research.id })
      .from(research)
      .where(eq(research.id, researchId))
      .limit(1)
    if (held === undefined) return { status: "gone" }

    // Only hum labels hang off a research; a dataset id hangs off its dataset.
    const [pins, versions] = await Promise.all([
      tx
        .select({ label: labelPin.label })
        .from(labelPin)
        .where(eq(labelPin.researchId, researchId)),
      tx
        .select({ number: researchVersion.number, published: researchVersion.published })
        .from(researchVersion)
        .where(eq(researchVersion.researchId, researchId)),
    ])

    await recordEvent(tx, {
      actor,
      action: "delete-research",
      subjectType: "research",
      subjectId: researchId,
      detail: {
        humLabels: pins.map((pin) => pin.label),
        publishedVersions: versions.filter((version) => version.published).map((v) => v.number),
        withdrawnVersions: versions.filter((version) => !version.published).map((v) => v.number),
      },
    })

    await tx.delete(research).where(eq(research.id, researchId))
    return { status: "deleted" }
  })
}
