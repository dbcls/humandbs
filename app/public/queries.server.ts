/**
 * Reading what the public side is allowed to show.
 *
 * **The set comes from `search_doc` and from nowhere else.** Every function
 * here starts by asking that table whether the object is published and only
 * then joins the text out of `content_snapshot` or `dataset_content`. Those two
 * tables gain rows on publish alone, so the two rules together are what keeps
 * a draft off a public page even though drafts live in the same database.
 *
 * Resolving a label is a separate step from deciding it is published: the pin
 * ledger says which identity a label names — including a secondary label, which
 * is how a superseded dataset id keeps resolving — and `search_doc` says
 * whether that identity is on the public side. Doing it the other way round
 * would make an unpublished research indistinguishable from a mistyped label,
 * which is the answer we want anyway, but it would also lose the redirect from
 * a secondary label to its primary one.
 */

import { and, eq, inArray } from "drizzle-orm"

import type { DatasetContent, ResearchContent } from "~/content/types"
import type { Executor } from "~/db/client.server"
import {
  cauEntry,
  contentKey,
  contentSnapshot,
  datasetContent,
  labelPin,
  researchVersion,
  searchDoc,
  vocabularyTerm,
} from "~/db/schema"

import type { CatalogView, CauInput } from "./view.server"

export interface ResolvedLabel {
  /** The identity the label names. */
  id: string
  /** The label the page is addressed by; differs when a secondary was used. */
  primaryLabel: string
}

async function resolveLabel(
  db: Executor,
  kind: "hum" | "dataset",
  label: string,
): Promise<ResolvedLabel | null> {
  const subject = kind === "hum" ? labelPin.researchId : labelPin.datasetId

  const [pin] = await db
    .select({ subject, isPrimary: labelPin.isPrimary })
    .from(labelPin)
    .where(and(eq(labelPin.kind, kind), eq(labelPin.label, label)))
    .limit(1)
  const subjectId = pin?.subject
  if (subjectId === undefined || subjectId === null) return null
  if (pin?.isPrimary === true) return { id: subjectId, primaryLabel: label }

  const [primary] = await db
    .select({ label: labelPin.label })
    .from(labelPin)
    .where(and(eq(labelPin.kind, kind), eq(labelPin.isPrimary, true), eq(subject, subjectId)))
    .limit(1)
  // A secondary label with no primary alongside it cannot address a page:
  // every page is addressed by the primary label.
  return primary === undefined ? null : { id: subjectId, primaryLabel: primary.label }
}

export function resolveHumLabel(db: Executor, label: string): Promise<ResolvedLabel | null> {
  return resolveLabel(db, "hum", label)
}

export function resolveDatasetLabel(db: Executor, label: string): Promise<ResolvedLabel | null> {
  return resolveLabel(db, "dataset", label)
}

export interface PublishedVersionRow {
  versionId: string
  number: number
  releaseDate: string
  content: ResearchContent
}

/**
 * Every published version of a research, in no particular order. The set is
 * `search_doc`'s; the numbers are only used to order and address what is
 * already in it.
 */
export async function publishedVersions(
  db: Executor,
  researchId: string,
): Promise<PublishedVersionRow[]> {
  const rows = await db
    .select({
      versionId: researchVersion.id,
      number: researchVersion.number,
      releaseDate: researchVersion.releaseDate,
      content: contentSnapshot.content,
    })
    .from(searchDoc)
    .innerJoin(researchVersion, eq(researchVersion.id, searchDoc.targetId))
    .innerJoin(contentSnapshot, eq(contentSnapshot.id, researchVersion.snapshotId))
    .where(and(
      eq(searchDoc.targetType, "research-version"),
      eq(searchDoc.researchId, researchId),
    ))
  return rows
}

export interface PublishedDatasetRow {
  datasetId: string
  label: string
  content: DatasetContent
  datePublished: string | null
}

/**
 * The published datasets among the given identities. A version can list an
 * identity that is no longer on the public side, and the listing simply does
 * not show it — the set of published objects is not something a snapshot gets
 * to disagree with.
 */
export async function publishedDatasets(
  db: Executor,
  datasetIds: readonly string[],
): Promise<Map<string, PublishedDatasetRow>> {
  if (datasetIds.length === 0) return new Map()
  const rows = await db
    .select({
      datasetId: searchDoc.targetId,
      label: searchDoc.datasetLabel,
      datePublished: searchDoc.datePublished,
      content: datasetContent.content,
    })
    .from(searchDoc)
    .innerJoin(datasetContent, eq(datasetContent.datasetId, searchDoc.targetId))
    .where(and(
      eq(searchDoc.targetType, "dataset"),
      inArray(searchDoc.targetId, [...datasetIds]),
    ))
  return new Map(
    rows.flatMap((row) => row.label === null
      ? []
      : [[row.datasetId, { ...row, label: row.label }] as const]),
  )
}

export interface PublishedDatasetPage extends PublishedDatasetRow {
  humLabel: string
  dateModified: string | null
}

/**
 * The dates are read off the search row rather than resolved here. Whether the
 * content's own release date or the archive's cache applies is decided where
 * those rows are derived, so a page, a listing and the JSON API cannot answer
 * differently — and a cache refresh reaches all three at once because it
 * rebuilds the rows in the same transaction.
 */
export async function publishedDataset(
  db: Executor,
  datasetId: string,
): Promise<PublishedDatasetPage | null> {
  const [row] = await db
    .select({
      datasetId: searchDoc.targetId,
      label: searchDoc.datasetLabel,
      humLabel: searchDoc.humLabel,
      datePublished: searchDoc.datePublished,
      dateModified: searchDoc.dateModified,
      content: datasetContent.content,
    })
    .from(searchDoc)
    .innerJoin(datasetContent, eq(datasetContent.datasetId, searchDoc.targetId))
    .where(and(eq(searchDoc.targetType, "dataset"), eq(searchDoc.targetId, datasetId)))
    .limit(1)
  const label = row?.label
  if (row === undefined || label === null || label === undefined) return null
  return { ...row, label }
}

/**
 * Labels for the published datasets among the given identities. Only labels: a
 * release list and a publication's citation name datasets without describing
 * them, and a research can list hundreds.
 */
export async function publishedDatasetLabels(
  db: Executor,
  datasetIds: readonly string[],
): Promise<Map<string, string>> {
  if (datasetIds.length === 0) return new Map()
  const rows = await db
    .select({ datasetId: searchDoc.targetId, label: searchDoc.datasetLabel })
    .from(searchDoc)
    .where(and(
      eq(searchDoc.targetType, "dataset"),
      inArray(searchDoc.targetId, [...datasetIds]),
    ))
  return new Map(rows.flatMap((row) => row.label === null ? [] : [[row.datasetId, row.label]]))
}

export async function controlledAccessUsers(db: Executor, humLabel: string): Promise<CauInput[]> {
  const rows = await db
    .select()
    .from(cauEntry)
    .where(eq(cauEntry.humLabel, humLabel))
  return rows.map((row) => ({
    applicationId: row.applicationId,
    principalInvestigator: { ja: row.piNameJa, en: row.piNameEn },
    affiliation: { ja: row.affiliationJa, en: row.affiliationEn },
    country: row.country,
    researchTitle: { ja: row.researchTitleJa, en: row.researchTitleEn },
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    datasetAccessions: row.datasetAccessions,
  }))
}

/**
 * The whole catalog. It is a few dozen rows and every page needs most of it, so
 * it is read in one go rather than joined per value.
 */
export async function loadCatalog(db: Executor): Promise<CatalogView> {
  const keys = await db
    .select({
      id: contentKey.id,
      code: contentKey.code,
      labelJa: contentKey.labelJa,
      labelEn: contentKey.labelEn,
      position: contentKey.position,
      showOnPublicPage: contentKey.showOnPublicPage,
    })
    .from(contentKey)
  const terms = await db
    .select({
      id: vocabularyTerm.id,
      code: vocabularyTerm.code,
      labelJa: vocabularyTerm.labelJa,
      labelEn: vocabularyTerm.labelEn,
    })
    .from(vocabularyTerm)

  return {
    keyById: new Map(keys.map((key) => [key.id, key])),
    keyByCode: new Map(keys.map((key) => [key.code, key])),
    termById: new Map(terms.map((term) => [term.id, term])),
  }
}
