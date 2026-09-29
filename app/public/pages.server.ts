/**
 * What each public page loads.
 *
 * The order is the same for all three, and it is the order that keeps the
 * public side honest: resolve the label through the `label_pin` table, ask the
 * published set whether the identity is on it, then read the text. A page that
 * skipped the middle step would render a draft.
 *
 * A label that resolves to an identity through a *secondary* pin redirects to
 * the address built from the primary one, so a page has one address however
 * many labels reach it.
 */

import { redirect } from "react-router"

import { valueOr } from "~/content/empty"
import { publicDatasetContent, publicResearch, PUBLISHED } from "~/content/public"
import { publicListing, publicRows } from "~/files/listing.server"
import { fileListOf } from "~/files/prefix"
import { fileLabelsByHumLabel, fileLabelsOf } from "~/files/labels.server"
import { researchPageFilesOf } from "~/files/research-page.server"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import type { PageSize } from "~/search/page-size"

import { publicCatalog } from "./catalog-cache.server"
import {
  controlledAccessUsers,
  publishedDataset,
  archiveFilesOf,
  citedDatasets,
  publishedDatasetLabels,
  publishedDatasets,
  publishedVersions,
  resolveDatasetLabel,
  resolveHumLabel,
  secondaryLabels,
} from "./queries.server"
import {
  datasetPath,
  href,
  researchPath,
  researchVersionPath,
  researchVersionsPath,
} from "./urls"
import { byNewest, datasetsAddedByVersion, findVersion, latestOf } from "./versions"
import {
  datasetView,
  researchView,
  releaseListView,
  type DatasetRowInput,
  type DatasetView,
  type ReleaseListView,
  type ResearchView,
} from "./view.server"

/** The public side never distinguishes "not published" from "no such label". */
function notFound(): never {
  throw new Response(null, { status: 404, statusText: "Not Found" })
}

export interface ResearchPageRequest {
  locale: Locale
  humId: string
  /** A version number, or the latest published one. */
  wanted: number | "latest"
  /** Which page of the download list. The prefix is the only long thing here. */
  filePage: number
  /** How many rows a page of the download list holds. */
  fileRows: PageSize
}

export async function researchPage(request: ResearchPageRequest): Promise<ResearchView> {
  const db = getDb()
  const resolved = await resolveHumLabel(db, request.humId)
  if (resolved === null) notFound()

  // **Published first, redirected after.** Every spelling of a research that is
  // not published is the same 404 as a label nobody pinned; redirected first,
  // it would show that the research is there and what its primary label is.
  const versions = await publishedVersions(db, resolved.id)
  const latest = latestOf(versions)
  if (latest === null) notFound()

  if (resolved.primaryLabel !== request.humId) {
    const path = request.wanted === "latest"
      ? researchPath(resolved.primaryLabel)
      : researchVersionPath(resolved.primaryLabel, request.wanted)
    throw redirect(href(request.locale, path))
  }

  const version = request.wanted === "latest" ? latest : findVersion(versions, request.wanted)
  if (version === null) notFound()

  const [catalog, cau, labels, onPage] = await Promise.all([
    publicCatalog(db),
    controlledAccessUsers(db, resolved.primaryLabel),
    fileLabelsOf(db, resolved.id),
    researchPageFilesOf(db, resolved.id),
  ])

  // The download list is the public bucket, listed. A store that does not
  // answer leaves the section out rather than losing the page.
  const listing = await publicListing(resolved.primaryLabel)
  const projected = publicResearch(version.content, { cau, files: listing ?? [] }, PUBLISHED)
  const content = projected.content

  const citedIds = content.relatedPublications.flatMap((publication) => valueOr(publication.datasetIds, []))
  const typedIds = [
    ...content.relatedPublications.flatMap((publication) =>
      publication.datasetIds.state === "value" ? publication.externalIds ?? [] : []),
    // The usage records name datasets as upstream wrote them, and upstream
    // keeps a use of one taken off since.
    ...projected.cau.flatMap((usage) => usage.datasetAccessions),
  ]
  const [listed, cited] = await Promise.all([
    publishedDatasets(db, content.datasetIds),
    citedDatasets(db, citedIds, typedIds),
  ])

  const rows: DatasetRowInput[] = content.datasetIds.flatMap((id) => {
    const row = listed.get(id)
    if (row === undefined) return []
    return [{
      id,
      label: row.label,
      content: publicDatasetContent(
        row.content,
        { files: listing ?? [] },
        PUBLISHED,
      ),
      datePublished: row.datePublished,
    }]
  })

  const datasetLabelById = new Map(cited.labelById)
  for (const [id, row] of listed) datasetLabelById.set(id, row.label)

  return researchView({
    humLabel: resolved.primaryLabel,
    versionNumber: version.number,
    releaseDate: version.releaseDate,
    latestVersionNumber: latest.number,
    content,
    datasets: rows,
    datasetLabelById,
    humByLabel: cited.humByLabel,
    cau: projected.cau,
    // The page's own list is the files set to be listed on it; the datasets'
    // selections above are read against the whole prefix.
    files: fileListOf(
      publicRows(listing?.filter((node) => onPage.has(node.name)) ?? null, labels, request.locale),
      request.filePage,
      request.fileRows,
    ),
  }, request.locale, catalog)
}

export async function releaseListPage(
  request: { locale: Locale, humId: string },
): Promise<ReleaseListView> {
  const db = getDb()
  const resolved = await resolveHumLabel(db, request.humId)
  if (resolved === null) notFound()
  // Published first, redirected after (`researchPage`).
  const versions = await publishedVersions(db, resolved.id)
  if (versions.length === 0) notFound()
  if (resolved.primaryLabel !== request.humId) {
    throw redirect(href(request.locale, researchVersionsPath(resolved.primaryLabel)))
  }

  const projected = versions.map((version) => ({
    number: version.number,
    releaseDate: version.releaseDate,
    // The release list draws no download section, so the prefix is not listed for it.
    content: publicResearch(version.content, { cau: [], files: [] }, PUBLISHED).content,
  }))
  const added = datasetsAddedByVersion(
    projected.map((version) => ({ ...version, datasetIds: version.content.datasetIds })),
  )
  const labels = await publishedDatasetLabels(
    db,
    [...new Set(projected.flatMap((version) => version.content.datasetIds))],
  )

  return releaseListView({
    humLabel: resolved.primaryLabel,
    versions: byNewest(projected).map((version) => ({
      ...version,
      addedDatasetIds: added.get(version.number) ?? [],
    })),
    datasetLabelById: labels,
  }, request.locale)
}

export async function datasetPage(
  request: {
    locale: Locale
    datasetId: string
    /** Which page of the files it selects, and how many rows a page holds. */
    filePage: number
    fileRows: PageSize
  },
): Promise<DatasetView> {
  const db = getDb()
  const resolved = await resolveDatasetLabel(db, request.datasetId)
  if (resolved === null) notFound()
  // Published first, redirected after (`researchPage`).
  const row = await publishedDataset(db, resolved.id)
  if (row === null) notFound()
  if (resolved.primaryLabel !== request.datasetId) {
    throw redirect(href(request.locale, datasetPath(resolved.primaryLabel)))
  }

  const [catalog, listing, secondary, labels, archiveFiles] = await Promise.all([
    publicCatalog(db),
    publicListing(row.humLabel),
    secondaryLabels(db, "dataset", resolved.id),
    fileLabelsByHumLabel(db, [row.humLabel]),
    archiveFilesOf(db, row.label),
  ])

  return datasetView({
    label: row.label,
    humLabel: row.humLabel,
    studyAccession: row.studyAccession,
    secondaryLabels: secondary,
    content: publicDatasetContent(
      row.content,
      { files: listing ?? [] },
      PUBLISHED,
    ),
    selection: row.content.fileSelection,
    datePublished: row.datePublished,
    dateModified: row.dateModified,
    files: publicRows(listing, labels.get(row.humLabel) ?? new Map(), request.locale),
    filePage: { page: request.filePage, size: request.fileRows },
    archiveFiles,
  }, request.locale, catalog)
}
