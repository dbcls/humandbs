/**
 * Reading what the public side is allowed to show.
 *
 * **The set comes from `search_doc` and from nowhere else.** Every function
 * here starts by querying that table for whether the object is published and only
 * then joins the text out of `content_snapshot` or `dataset_content`. Those two
 * tables gain rows on publish alone, so the two rules together are what keeps
 * a draft off a public page even though drafts are kept in the same database.
 *
 * Resolving a label is a separate step from deciding it is published: the
 * `label_pin` table records which identity a label names — including a secondary label, which
 * is how a superseded dataset id keeps resolving — and `search_doc` records
 * whether that identity is on the public side. Doing it the other way round
 * would make an unpublished research indistinguishable from a mistyped label,
 * which is the answer we want anyway, but it would also lose the redirect from
 * a secondary label to its primary one.
 */

import { and, eq, inArray, sql } from "drizzle-orm"

import type { CauUsage } from "~/content/public"
import type { DatasetContent, ResearchContent } from "~/content/types"
import type { Executor } from "~/db/client.server"
import {
  cauEntry,
  contentKey,
  document,
  humAccession,
  labelPin,
  researchVersion,
  searchDoc,
  vocabularyTerm,
} from "~/db/schema"

import type { CatalogView } from "./view.server"

export interface ResolvedLabel {
  /** The identity the label names. */
  id: string
  /** The label the page is addressed by; differs when a secondary was used. */
  primaryLabel: string
}

/**
 * **A label is found whatever case it is written in**, and the page it identifies is
 * then addressed by the pinned spelling — the same as a secondary label, the
 * page redirects and the API responds under the pinned one. Readers copy
 * `JGAD000001` and `hum0001` out of papers in whatever case the paper used, and
 * the search already matches `id:` without regard to case.
 *
 * The exact spelling wins when it is pinned. A spelling that only matches in
 * another case is taken when it matches one pin and no more; the pin table is
 * unique on the exact spelling, so two pins differing only in case name no
 * page rather than one picked arbitrarily.
 */
async function resolveLabel(
  db: Executor,
  kind: "hum" | "dataset",
  label: string,
): Promise<ResolvedLabel | null> {
  const subject = kind === "hum" ? labelPin.researchId : labelPin.datasetId

  const pins = await db
    .select({ subject, label: labelPin.label, isPrimary: labelPin.isPrimary })
    .from(labelPin)
    .where(and(eq(labelPin.kind, kind), sql`lower(${labelPin.label}) = lower(${label})`))
    .limit(3)
  const exact = pins.find((one) => one.label === label)
  const pin = exact ?? (pins.length === 1 ? pins[0] : undefined)
  const subjectId = pin?.subject
  if (subjectId === undefined || subjectId === null) return null
  if (pin?.isPrimary === true) return { id: subjectId, primaryLabel: pin.label }

  const [primary] = await db
    .select({ label: labelPin.label })
    .from(labelPin)
    .where(and(eq(labelPin.kind, kind), eq(labelPin.isPrimary, true), eq(subject, subjectId)))
    .limit(1)
  // A secondary label with no primary alongside it cannot address a page:
  // every page is addressed by the primary label.
  return primary === undefined ? null : { id: subjectId, primaryLabel: primary.label }
}

/**
 * The labels a research or a dataset holds besides its primary one, in label
 * order: the ids it was known by before, which old papers and addresses still
 * name (`label_pin`).
 */
export async function secondaryLabels(
  db: Executor,
  kind: "hum" | "dataset",
  subjectId: string,
): Promise<string[]> {
  const subject = kind === "hum" ? labelPin.researchId : labelPin.datasetId
  const rows = await db
    .select({ label: labelPin.label })
    .from(labelPin)
    .where(and(eq(labelPin.kind, kind), eq(labelPin.isPrimary, false), eq(subject, subjectId)))
    .orderBy(labelPin.label)
  return rows.map((row) => row.label)
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
      // The row is filtered to `research-version`, which is what guarantees the
      // column holds a body rather than a description.
      content: sql<ResearchContent>`${searchDoc.content}`,
    })
    .from(searchDoc)
    .innerJoin(researchVersion, eq(researchVersion.id, searchDoc.targetId))
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
      content: sql<DatasetContent>`${searchDoc.content}`,
    })
    .from(searchDoc)
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
  /** The study this sits under, from the upstream cache (`hum_accession`). */
  studyAccession: string | null
}

/**
 * The dates are read off the search row rather than resolved here. Whether the
 * content's own release date or the archive's cache applies is decided where
 * those rows are derived, so a page, a listing and the JSON API cannot
 * disagree — and a cache refresh reaches all three at once because it
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
      content: sql<DatasetContent>`${searchDoc.content}`,
      studyAccession: humAccession.study,
    })
    .from(searchDoc)
    // The cache is keyed by the accession, which is what the label is for a
    // dataset registered in JGA; for anything else the join simply finds nothing.
    .leftJoin(humAccession, eq(humAccession.accession, searchDoc.datasetLabel))
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

/**
 * The published datasets of a research that select each file of its prefix, by
 * the file's name, in label order. **Only what is published counts** — the
 * same descriptions the research's page reads — so a file a draft has chosen
 * but nobody has published is selected by nothing yet.
 */
export async function publishedFileSelections(
  db: Executor,
  researchId: string,
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({
      label: searchDoc.datasetLabel,
      selection: sql<string[]>`coalesce(${searchDoc.content} -> 'fileSelection', '[]'::jsonb)`,
    })
    .from(searchDoc)
    .where(and(eq(searchDoc.targetType, "dataset"), eq(searchDoc.researchId, researchId)))
  const byFile = new Map<string, string[]>()
  for (const row of rows.toSorted((a, b) => (a.label ?? "").localeCompare(b.label ?? ""))) {
    if (row.label === null) continue
    for (const name of row.selection) byFile.set(name, [...(byFile.get(name) ?? []), row.label])
  }
  return byFile
}

/**
 * What the portal's `label_pin` table has of the datasets a research's publications
 * cite: the one chosen by identity and the one typed as an ID. **Only a
 * published dataset counts** — a pinned ID whose dataset is not out yet would
 * otherwise tell a reader of this page that a research exists before it is
 * published — so an ID the `label_pin` table does not hold, or holds for nothing public,
 * is drawn as it was written.
 *
 * `labelById` names each cited identity by its primary ID; `humByLabel` gives,
 * for every ID either way (as typed, and as the primary ID), the research the
 * dataset belongs to.
 */
export async function citedDatasets(
  db: Executor,
  ids: readonly string[],
  typed: readonly string[],
): Promise<{ labelById: Map<string, string>, humByLabel: Map<string, string> }> {
  const labelById = new Map<string, string>()
  const humByLabel = new Map<string, string>()
  const [byId, byLabel] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({ datasetId: searchDoc.targetId, label: searchDoc.datasetLabel, humLabel: searchDoc.humLabel })
          .from(searchDoc)
          .where(and(eq(searchDoc.targetType, "dataset"), inArray(searchDoc.targetId, [...ids]))),
    typed.length === 0
      ? []
      : db
          .select({ typed: labelPin.label, label: searchDoc.datasetLabel, humLabel: searchDoc.humLabel })
          .from(labelPin)
          .innerJoin(searchDoc, and(eq(searchDoc.targetType, "dataset"), eq(searchDoc.targetId, labelPin.datasetId)))
          .where(and(eq(labelPin.kind, "dataset"), inArray(labelPin.label, [...typed]))),
  ])
  for (const row of byId) {
    if (row.label === null) continue
    labelById.set(row.datasetId, row.label)
    humByLabel.set(row.label, row.humLabel)
  }
  for (const row of byLabel) {
    humByLabel.set(row.typed, row.humLabel)
    if (row.label !== null) humByLabel.set(row.label, row.humLabel)
  }
  return { labelById, humByLabel }
}

/**
 * The usage records of one research, in the order upstream's project numbering
 * puts them. `applicationId` orders the rows and never leaves this function:
 * the column exists to match a cached row to upstream, and the pages and the
 * JSON API show what a reader is meant to see.
 */
export async function controlledAccessUsers(db: Executor, humLabel: string): Promise<CauUsage[]> {
  const rows = await db
    .select()
    .from(cauEntry)
    .where(eq(cauEntry.humLabel, humLabel))
    .orderBy(cauEntry.applicationId)
  return rows.map((row) => ({
    principalInvestigator: { ja: row.piNameJa, en: row.piNameEn },
    affiliation: { ja: row.affiliationJa, en: row.affiliationEn },
    country: { ja: row.countryJa, en: row.countryEn },
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
    })
    .from(contentKey)
  const terms = await db
    .select({
      id: vocabularyTerm.id,
      code: vocabularyTerm.code,
      labelJa: vocabularyTerm.labelJa,
      labelEn: vocabularyTerm.labelEn,
      maker: vocabularyTerm.maker,
      position: vocabularyTerm.position,
      documentSlug: document.slug,
    })
    .from(vocabularyTerm)
    .leftJoin(document, eq(document.id, vocabularyTerm.documentId))

  return {
    keyById: new Map(keys.map((key) => [key.id, key])),
    keyByCode: new Map(keys.map((key) => [key.code, key])),
    termById: new Map(terms.map((term) => [term.id, term])),
  }
}
