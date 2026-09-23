/**
 * Where a draft stands on each of its steps, for the strip every screen of a
 * draft carries (docs/editing.md の「draft」).
 *
 * **The states are facts the screens already know how to find**, gathered in
 * one place so that the four screens say the same thing: the listing's
 * length, the share and the threads the review screen reads, and the gate the
 * confirmation screen runs. A screen that has some of them already hands them
 * in rather than reading them twice.
 */

import type { ResearchContent } from "~/content/types"
import type { Database } from "~/db/client.server"
import { privateNames } from "~/files/jobs.server"
import { unresolvedCount } from "~/review/comments"
import { readComments } from "~/review/comments.server"
import { readShare, type DraftReviewSummary } from "~/review/queries.server"
import { isShareOpen } from "~/review/share"

import type { PublishGate } from "./gate"
import { draftGate } from "./publish.server"

export interface DraftStepsView {
  /** How many datasets the version would list. */
  datasets: number
  /** Whether the share link answers right now. */
  shared: boolean
  /** Comments nobody has closed. The memo is not counted: it is a note, not a question. */
  unresolved: number
  /** What would stop a publish. */
  blocks: number
  /** What a publish would have to confirm. */
  findings: number
}

export function stepsView(input: {
  datasetIds: readonly string[]
  shared: boolean
  unresolved: number
  gate: PublishGate | null
}): DraftStepsView {
  return {
    datasets: input.datasetIds.length,
    shared: input.shared,
    unresolved: input.unresolved,
    blocks: input.gate?.blocks.length ?? 0,
    findings: input.gate?.findings.length ?? 0,
  }
}

export async function draftSteps(
  db: Database,
  researchId: string,
  draftId: string,
  content: ResearchContent,
  known: { gate?: PublishGate, shared?: boolean, unresolved?: number } = {},
): Promise<DraftStepsView> {
  const [shared, unresolved, gate] = await Promise.all([
    known.shared ?? sharedNow(db, draftId),
    known.unresolved ?? unresolvedNow(db, draftId),
    known.gate ?? gateNow(db, researchId, draftId),
  ])
  return stepsView({ datasetIds: content.datasetIds, shared, unresolved, gate })
}

/**
 * Where every draft of a research stands, read once for the whole research
 * rather than once per draft — the research screen's table, which shows every
 * draft's steps at the same time.
 *
 * **The private bucket is asked once and given to all**, the way
 * `draftReviewSummaries` asks the comment table once for every draft rather
 * than once per draft: a research with six drafts asking the file store six
 * times for the same listing would be five wasted round trips. The gate
 * itself still runs once per draft — it is read under that draft's own row —
 * but it no longer reads the store to do it.
 */
export async function researchDraftSteps(
  db: Database,
  researchId: string,
  drafts: readonly { id: string, content: ResearchContent }[],
  reviews: readonly DraftReviewSummary[],
): Promise<Map<string, DraftStepsView>> {
  const privateFiles = await privateNames(researchId).catch(() => new Set<string>())
  const reviewOf = new Map(reviews.map((row) => [row.draftId, row]))
  const gates = await Promise.all(drafts.map((draft) => draftGate(db, draft.id, privateFiles)))
  return new Map(drafts.map((draft, at) => {
    const review = reviewOf.get(draft.id)
    return [draft.id, stepsView({
      datasetIds: draft.content.datasetIds,
      shared: review?.shared ?? false,
      unresolved: review?.unresolved ?? 0,
      gate: gates[at] ?? null,
    })]
  }))
}

async function sharedNow(db: Database, draftId: string): Promise<boolean> {
  const share = await readShare(db, draftId)
  return share !== null && isShareOpen({ enabled: share.enabled, expiresAt: share.expiresAt }, new Date())
}

async function unresolvedNow(db: Database, draftId: string): Promise<number> {
  return unresolvedCount(await readComments(db, draftId))
}

/**
 * The gate as the strip counts it.
 *
 * **The store not answering is not a reason to leave every screen of the
 * draft without its strip.** The file finding is then left out of the count;
 * the confirmation screen, which cannot do without it, asks the store itself.
 */
async function gateNow(db: Database, researchId: string, draftId: string): Promise<PublishGate | null> {
  const privateFiles = await privateNames(researchId).catch(() => new Set<string>())
  return draftGate(db, draftId, privateFiles)
}
