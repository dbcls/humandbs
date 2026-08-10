/**
 * What each public page loads.
 *
 * The order is the same for all three, and it is the order that keeps the
 * public side honest: resolve the label through the pin ledger, ask the
 * published set whether the identity is on it, then read the text. A page that
 * skipped the middle step would render a draft.
 *
 * A label that resolves to an identity through a *secondary* pin redirects to
 * the address built from the primary one, so a page has one address however
 * many labels reach it.
 */

import { redirect } from "react-router"

import { publicDatasetContent, publicResearch } from "~/content/public"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"

import {
  controlledAccessUsers,
  loadCatalog,
  publishedDataset,
  publishedDatasetLabels,
  publishedDatasets,
  publishedVersions,
  resolveDatasetLabel,
  resolveHumLabel,
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

/** Nothing on a public page is ever rendered with unsettled values kept. */
const PUBLISHED = { keepUnsettled: false }

export interface ResearchPageRequest {
  locale: Locale
  humId: string
  /** A version number, or the latest published one. */
  wanted: number | "latest"
}

export async function researchPage(request: ResearchPageRequest): Promise<ResearchView> {
  const db = getDb()
  const resolved = await resolveHumLabel(db, request.humId)
  if (resolved === null) notFound()

  if (resolved.primaryLabel !== request.humId) {
    const path = request.wanted === "latest"
      ? researchPath(resolved.primaryLabel)
      : researchVersionPath(resolved.primaryLabel, request.wanted)
    throw redirect(href(request.locale, path))
  }

  const versions = await publishedVersions(db, resolved.id)
  const latest = latestOf(versions)
  if (latest === null) notFound()
  const version = request.wanted === "latest" ? latest : findVersion(versions, request.wanted)
  if (version === null) notFound()

  const [catalog, cau] = await Promise.all([
    loadCatalog(db),
    controlledAccessUsers(db, resolved.primaryLabel),
  ])

  // The bucket listing is not wired up yet, so nothing is offered for download
  // and every file selection drops out of the projection.
  const projected = publicResearch(version.content, { cau, files: [] }, PUBLISHED)
  const content = projected.content

  const citedIds = content.relatedPublications.flatMap((publication) => publication.datasetIds)
  const [listed, citedLabels] = await Promise.all([
    publishedDatasets(db, content.datasetIds),
    publishedDatasetLabels(db, citedIds),
  ])

  const rows: DatasetRowInput[] = content.datasetIds.flatMap((id) => {
    const row = listed.get(id)
    if (row === undefined) return []
    return [{
      id,
      label: row.label,
      content: publicDatasetContent(row.content, { keys: catalog.keyById, files: [] }, PUBLISHED),
      datePublished: row.datePublished,
    }]
  })

  const datasetLabelById = new Map(citedLabels)
  for (const [id, row] of listed) datasetLabelById.set(id, row.label)

  return researchView({
    humLabel: resolved.primaryLabel,
    versionNumber: version.number,
    releaseDate: version.releaseDate,
    latestVersionNumber: latest.number,
    content,
    datasets: rows,
    datasetLabelById,
    cau: projected.cau,
  }, request.locale, catalog)
}

export async function releaseListPage(
  request: { locale: Locale, humId: string },
): Promise<ReleaseListView> {
  const db = getDb()
  const resolved = await resolveHumLabel(db, request.humId)
  if (resolved === null) notFound()
  if (resolved.primaryLabel !== request.humId) {
    throw redirect(href(request.locale, researchVersionsPath(resolved.primaryLabel)))
  }

  const versions = await publishedVersions(db, resolved.id)
  if (versions.length === 0) notFound()

  const projected = versions.map((version) => ({
    number: version.number,
    releaseDate: version.releaseDate,
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
  request: { locale: Locale, datasetId: string },
): Promise<DatasetView> {
  const db = getDb()
  const resolved = await resolveDatasetLabel(db, request.datasetId)
  if (resolved === null) notFound()
  if (resolved.primaryLabel !== request.datasetId) {
    throw redirect(href(request.locale, datasetPath(resolved.primaryLabel)))
  }

  const row = await publishedDataset(db, resolved.id)
  if (row === null) notFound()
  const catalog = await loadCatalog(db)

  return datasetView({
    label: row.label,
    humLabel: row.humLabel,
    content: publicDatasetContent(row.content, { keys: catalog.keyById, files: [] }, PUBLISHED),
    datePublished: row.datePublished,
    dateModified: row.dateModified,
  }, request.locale, catalog)
}
