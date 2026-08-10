/**
 * What a preview reads.
 *
 * A preview shows the draft, so every dataset comes out of the draft's own
 * entry when there is one and out of the published description when there is
 * not — copy-on-write seen from the reading end, the same resolution the
 * dataset editor does. The published description is carried alongside because
 * the preview marks what would change, and that is the thing it changes from.
 *
 * Dates resolve exactly as they do on the public side: an NHA ID carries its
 * own, and an external accession takes the archive cache's. A preview that
 * resolved them differently would not be showing the page that is about to be
 * published.
 */

import { and, count, desc, eq, inArray } from "drizzle-orm"

import { emptyDatasetContent } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import type { Executor } from "~/db/client.server"
import {
  accessionDate,
  commentThread,
  contentSnapshot,
  datasetContent,
  draftDatasetEntry,
  labelPin,
  researchDraft,
  researchVersion,
} from "~/db/schema"

import { pathExists, type AnchorSubject } from "./anchors"
import { isShareExpired, isShareOpen } from "./share"

export interface PreviewDatasetRow {
  id: string
  /** Null until an id is pinned; a dataset a draft has just made has none. */
  label: string | null
  content: DatasetContent
  /** What is published for it now, or null if it has never been published. */
  published: DatasetContent | null
  datePublished: string | null
  dateModified: string | null
}

export async function previewDatasets(
  db: Executor,
  draftId: string,
  listedIds: readonly string[],
): Promise<PreviewDatasetRow[]> {
  if (listedIds.length === 0) return []
  const ids = [...listedIds]

  const [entries, published, labels] = await Promise.all([
    db
      .select({ datasetId: draftDatasetEntry.datasetId, content: draftDatasetEntry.content })
      .from(draftDatasetEntry)
      .where(eq(draftDatasetEntry.draftId, draftId)),
    db
      .select({ datasetId: datasetContent.datasetId, content: datasetContent.content })
      .from(datasetContent)
      .where(inArray(datasetContent.datasetId, ids)),
    db
      .select({ datasetId: labelPin.datasetId, label: labelPin.label })
      .from(labelPin)
      .where(and(
        eq(labelPin.kind, "dataset"),
        eq(labelPin.isPrimary, true),
        inArray(labelPin.datasetId, ids),
      )),
  ])

  const entryOf = new Map(entries.map((row) => [row.datasetId, row.content]))
  const publishedOf = new Map(published.map((row) => [row.datasetId, row.content]))
  const labelOf = new Map(labels.flatMap((row) =>
    row.datasetId === null ? [] : [[row.datasetId, row.label] as const]))

  const accessions = [...labelOf.values()]
  const dates = accessions.length === 0
    ? []
    : await db
        .select({
          accession: accessionDate.accession,
          datePublished: accessionDate.datePublished,
          dateModified: accessionDate.dateModified,
        })
        .from(accessionDate)
        .where(inArray(accessionDate.accession, accessions))
  const datesOf = new Map(dates.map((row) => [row.accession, row]))

  return ids.map((id) => {
    const content = entryOf.get(id) ?? publishedOf.get(id) ?? emptyDatasetContent()
    const label = labelOf.get(id) ?? null
    const archive = label === null ? undefined : datesOf.get(label)
    return {
      id,
      label,
      content,
      published: publishedOf.get(id) ?? null,
      datePublished: content.releaseDate ?? archive?.datePublished ?? null,
      dateModified: archive?.dateModified ?? null,
    }
  })
}

/**
 * Whether an anchor names a place that exists.
 *
 * The path has to lead somewhere in the content it claims to be about, and the
 * dataset has to be one the caller allows — the version's list for a share
 * link, the research's own datasets for an administrator, who can also be
 * looking at one this version does not list.
 */
export async function anchorExists(
  db: Executor,
  draft: { draftId: string, content: ResearchContent, datasetIds: readonly string[] },
  subject: AnchorSubject,
  path: string,
): Promise<boolean> {
  if (subject.kind === "research") return pathExists(draft.content, path)
  if (!draft.datasetIds.includes(subject.datasetId)) return false
  const [row] = await previewDatasets(db, draft.draftId, [subject.datasetId])
  return row !== undefined && pathExists(row.content, path)
}

export interface ShareRecord {
  token: string
  enabled: boolean
  expiresAt: Date | null
}

export async function readShare(db: Executor, draftId: string): Promise<ShareRecord | null> {
  const [row] = await db
    .select({
      token: researchDraft.shareToken,
      enabled: researchDraft.shareEnabled,
      expiresAt: researchDraft.shareExpiresAt,
    })
    .from(researchDraft)
    .where(eq(researchDraft.id, draftId))
    .limit(1)
  return row ?? null
}

export interface DraftReviewSummary {
  draftId: string
  shared: boolean
  expired: boolean
  unresolved: number
}

/**
 * What the research screen says about each of its drafts: whether a link is out
 * there, and whether anybody is waiting for an answer.
 */
export async function draftReviewSummaries(
  db: Executor,
  researchId: string,
): Promise<DraftReviewSummary[]> {
  const [drafts, open] = await Promise.all([
    db
      .select({
        id: researchDraft.id,
        enabled: researchDraft.shareEnabled,
        expiresAt: researchDraft.shareExpiresAt,
      })
      .from(researchDraft)
      .where(eq(researchDraft.researchId, researchId)),
    db
      .select({ draftId: commentThread.draftId, count: count() })
      .from(commentThread)
      .innerJoin(researchDraft, eq(researchDraft.id, commentThread.draftId))
      .where(and(eq(researchDraft.researchId, researchId), eq(commentThread.resolved, false)))
      .groupBy(commentThread.draftId),
  ])

  const now = new Date()
  const unresolvedOf = new Map(open.map((row) => [row.draftId, row.count]))
  return drafts.map((row) => {
    const policy = { enabled: row.enabled, expiresAt: row.expiresAt }
    return {
      draftId: row.id,
      shared: isShareOpen(policy, now),
      expired: isShareExpired(policy, now),
      unresolved: unresolvedOf.get(row.id) ?? 0,
    }
  })
}

export interface PublishedVersion {
  number: number
  content: ResearchContent
}

/** The version a reader would see now, which is what a preview is measured against. */
export async function latestPublishedVersion(
  db: Executor,
  researchId: string,
): Promise<PublishedVersion | null> {
  const [row] = await db
    .select({ number: researchVersion.number, content: contentSnapshot.content })
    .from(researchVersion)
    .innerJoin(contentSnapshot, eq(contentSnapshot.id, researchVersion.snapshotId))
    .where(and(eq(researchVersion.researchId, researchId), eq(researchVersion.published, true)))
    .orderBy(desc(researchVersion.number))
    .limit(1)
  return row ?? null
}
