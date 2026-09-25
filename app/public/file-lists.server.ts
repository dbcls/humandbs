/**
 * The URL lists of the public pages: every public file of a research, and
 * every one a dataset selects, as `fileUrlList` writes them.
 *
 * **They respond the way the pages do.** A research or a dataset that is not
 * published is the same 404 as one that does not exist, and a secondary ID
 * redirects to the list of the primary one. **A store that does not respond is a
 * 503**, not an empty list: the page can leave its section out, but a file
 * that listed nothing would read as a research with nothing to fetch.
 */

import { redirect } from "react-router"

import { loadConfig, publicOrigin } from "~/config.server"
import { publicDatasetContent, PUBLISHED } from "~/content/public"
import { getDb } from "~/db/client.server"
import { publicListing } from "~/files/listing.server"
import type { StoredNode } from "~/files/prefix"
import { fileUrlList, fileUrlListResponse } from "~/files/url-list"

import { publishedDataset, publishedVersions, resolveDatasetLabel, resolveHumLabel } from "./queries.server"
import { datasetFileListPath, researchFileListPath } from "./urls"
import { latestOf } from "./versions"

function notFound(): never {
  throw new Response(null, { status: 404, statusText: "Not Found" })
}

function listed(listing: StoredNode[] | null): StoredNode[] {
  if (listing === null) throw new Response(null, { status: 503, statusText: "Service Unavailable" })
  return listing
}

function origin(): string {
  return publicOrigin(loadConfig(process.env).auth)
}

export async function researchUrlList(humId: string): Promise<Response> {
  const db = getDb()
  const resolved = await resolveHumLabel(db, humId)
  if (resolved === null) notFound()
  if (resolved.primaryLabel !== humId) throw redirect(researchFileListPath(resolved.primaryLabel))
  if (latestOf(await publishedVersions(db, resolved.id)) === null) notFound()

  const names = listed(await publicListing(resolved.primaryLabel)).map((node) => node.name)
  return fileUrlListResponse(resolved.primaryLabel, fileUrlList(origin(), resolved.primaryLabel, names))
}

export async function datasetUrlList(datasetId: string): Promise<Response> {
  const db = getDb()
  const resolved = await resolveDatasetLabel(db, datasetId)
  if (resolved === null) notFound()
  if (resolved.primaryLabel !== datasetId) throw redirect(datasetFileListPath(resolved.primaryLabel))
  const row = await publishedDataset(db, resolved.id)
  if (row === null) notFound()

  // The selection the dataset's page lists: what it names and the prefix holds.
  const files = listed(await publicListing(row.humLabel))
  const names = publicDatasetContent(row.content, { files }, PUBLISHED).fileSelection
  return fileUrlListResponse(row.label, fileUrlList(origin(), row.humLabel, names))
}
