/**
 * A draft's progress on each of its steps, for the step indicator every screen of a
 * draft has.
 *
 * **The states are facts the screens already know how to find**, gathered in
 * one place so that the four screens say the same thing: the listing's
 * length, the share and the threads the review screen reads, and the publish check the
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

import { draftDatasets } from "./datasets"
import type { PublishCheck } from "./publish-check"
import { draftPublishCheck } from "./publish.server"
import { draftDatasetIds, ownedDatasets } from "./queries.server"

export interface DraftStepsView {
  /** How many datasets the version would list. */
  datasets: number
  /** Whether the share link works right now. */
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
  publishCheck: PublishCheck | null
}): DraftStepsView {
  return {
    datasets: input.datasetIds.length,
    shared: input.shared,
    unresolved: input.unresolved,
    blocks: input.publishCheck?.blocks.length ?? 0,
    findings: input.publishCheck?.findings.length ?? 0,
  }
}

export async function draftSteps(
  db: Database,
  researchId: string,
  draftId: string,
  content: ResearchContent,
  known: { publishCheck?: PublishCheck, shared?: boolean, unresolved?: number } = {},
): Promise<DraftStepsView> {
  const [shared, unresolved, publishCheck] = await Promise.all([
    known.shared ?? sharedNow(db, draftId),
    known.unresolved ?? unresolvedNow(db, draftId),
    known.publishCheck ?? publishCheckNow(db, researchId, draftId),
  ])
  return stepsView({
    datasetIds: await draftDatasetIds(db, draftId, researchId, content.datasetIds),
    shared,
    unresolved,
    publishCheck,
  })
}

/**
 * The progress of every draft of a research, read once for the whole research
 * rather than once per draft — the research screen's table, which shows every
 * draft's steps at the same time.
 *
 * **The private bucket is asked once and given to all**, the way
 * `draftReviewSummaries` queries the comment table once for every draft rather
 * than once per draft: a research with six drafts querying the file store six
 * times for the same listing would be five wasted round trips. The publish check
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
  // The research's datasets are read once for every draft: each draft
  // publishes all of them but what another draft made (`admin/datasets.ts`).
  const owned = await ownedDatasets(db, researchId)
  const publishChecks = await Promise.all(drafts.map((draft) => draftPublishCheck(db, draft.id, privateFiles)))
  return new Map(drafts.map((draft, at) => {
    const review = reviewOf.get(draft.id)
    return [draft.id, stepsView({
      datasetIds: draftDatasets(owned, draft.id, draft.content.datasetIds).map((row) => row.id),
      shared: review?.shared ?? false,
      unresolved: review?.unresolved ?? 0,
      publishCheck: publishChecks[at] ?? null,
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
 * The publish check as the step indicator counts it.
 *
 * **The store not responding is not a reason to leave every screen of the
 * draft without its step indicator.** The file finding is then left out of the count;
 * the confirmation screen, which cannot do without it, queries the store itself.
 */
async function publishCheckNow(db: Database, researchId: string, draftId: string): Promise<PublishCheck | null> {
  const privateFiles = await privateNames(researchId).catch(() => new Set<string>())
  return draftPublishCheck(db, draftId, privateFiles)
}
