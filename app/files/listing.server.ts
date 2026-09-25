/**
 * Reading a research's prefix.
 *
 * There are two answers and they are not the same list. **A reader gets the
 * public bucket alone**; an administrator, and the preview a share link shows,
 * get both merged by name — at draft time nothing has been made public yet, so
 * showing only the public side would empty the download list exactly when it is
 * being checked.
 *
 * **A store that does not respond is not an error here.** The download section
 * is left out rather than the page being lost: what the prefix holds is outside
 * the portal, and the rest of the page does not depend on it.
 */

import type { Executor } from "~/db/client.server"
import type { FileListView, FileRowView } from "~/public/view.server"

import {
  commonPrefix,
  composeListing,
  pageOfFiles,
  privatePrefix,
  PRIVATE_BUCKET,
  publicPrefix,
  PUBLIC_BUCKET,
  type ListedFile,
  type StoredNode,
} from "./prefix"
import { pendingSwitches } from "./jobs.server"
import { listPrefix } from "./store.server"

async function tolerantly<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (error) {
    console.error("the file store did not answer", error)
    return null
  }
}

/**
 * What a reader can download. Null when the store did not respond, which the
 * page shows as no download section rather than as a failure.
 */
export async function publicListing(humLabel: string | null): Promise<StoredNode[] | null> {
  if (humLabel === null) return []
  return tolerantly(() => listPrefix(PUBLIC_BUCKET, publicPrefix(humLabel)))
}

/**
 * The public prefixes of a known set of researches.
 *
 * One listing per prefix, which is right while the set is bounded — a page of
 * search results is twenty at most. For every research at once there is
 * `everyPublicListing`.
 */
export async function publicListingsOf(
  humLabels: readonly string[],
): Promise<Map<string, StoredNode[]>> {
  const wanted = [...new Set(humLabels)]
  const listings = await Promise.all(wanted.map((label) => publicListing(label)))
  return new Map(wanted.map((label, at) => [label, listings[at] ?? []]))
}

/**
 * Every public prefix at once, keyed by the hum label that identifies it.
 *
 * One listing of the whole bucket rather than one per research: the bulk stream
 * answers for every published research, and querying the store several hundred
 * times to build one answer would make an endpoint nobody has to authenticate
 * for expensive to call.
 */
export async function everyPublicListing(): Promise<Map<string, StoredNode[]>> {
  const nodes = await tolerantly(() => listPrefix(PUBLIC_BUCKET, ""))
  const listings = new Map<string, StoredNode[]>()
  if (nodes === null) return listings

  for (const node of nodes) {
    // The whole bucket is listed, so a name here is still a full key. The first
    // separator divides the listing from the file; anything after that belongs to
    // the name, the same as when one listing is listed on its own.
    const at = node.name.indexOf("/")
    if (at <= 0) continue
    const name = node.name.slice(at + 1)
    if (name === "") continue
    const listing = node.name.slice(0, at)
    const held = listings.get(listing) ?? []
    held.push({ ...node, name })
    listings.set(listing, held)
  }
  return listings
}

/**
 * The article assets. One bucket rather than two, because this prefix has no
 * private side: a file put here is public from that moment.
 */
export async function commonListing(): Promise<StoredNode[] | null> {
  return tolerantly(() => listPrefix(PUBLIC_BUCKET, commonPrefix()))
}

/**
 * Both buckets as one list, with whatever switch has not finished marked on the
 * lines it applies to.
 */
export async function adminListing(
  executor: Executor,
  researchId: string,
  humLabel: string | null,
): Promise<ListedFile[] | null> {
  const [publicNodes, privateNodes, pending] = await Promise.all([
    publicListing(humLabel),
    tolerantly(() => listPrefix(PRIVATE_BUCKET, privatePrefix(researchId))),
    pendingSwitches(executor, researchId),
  ])
  if (publicNodes === null || privateNodes === null) return null
  return composeListing(publicNodes, privateNodes, pending)
}

/** What a prefix holds, in two numbers. */
export interface ListingSummary {
  count: number
  bytes: number
}

/**
 * What each research's prefix holds, for a page of the admin listing.
 *
 * **Both buckets, counted the way the research's own screen counts.** A
 * curator reading the listing wants to know how much has been put in, not how much
 * is out, and a research still being written has everything on the private
 * side. A name held by both buckets — a switch half done — is one file, which
 * is what `composeListing` settles; which side it is on does not change the count,
 * so the pending switches are not read.
 *
 * **One pair of listings per row**, bounded by the page size the way
 * `publicListingsOf` is. A row whose store did not respond is `null` and the others
 * are kept, so one refusal does not blank the column.
 */
export async function listingSummariesOf(
  rows: readonly { researchId: string, humLabel: string | null }[],
): Promise<Map<string, ListingSummary | null>> {
  const summaries = await Promise.all(rows.map(async (row) => {
    const [publicNodes, privateNodes] = await Promise.all([
      publicListing(row.humLabel),
      tolerantly(() => listPrefix(PRIVATE_BUCKET, privatePrefix(row.researchId))),
    ])
    if (publicNodes === null || privateNodes === null) return null
    const listing = composeListing(publicNodes, privateNodes, [])
    return { count: listing.length, bytes: listing.reduce((sum, entry) => sum + entry.size, 0) }
  }))
  return new Map(rows.map((row, at) => [row.researchId, summaries[at] ?? null]))
}

/**
 * A listed bucket as download rows. Everything in the public bucket is by
 * definition fetchable, so the flag is settled by which listing this came from.
 */
export function publicRows(nodes: readonly StoredNode[] | null): FileRowView[] {
  return (nodes ?? []).map((node) => ({ name: node.name, size: node.size, isPublic: true }))
}

/** The merged listing as download rows, keeping which side each name came from. */
export function listingRows(entries: readonly ListedFile[] | null): FileRowView[] {
  return (entries ?? []).map((entry) => ({
    name: entry.name,
    size: entry.size,
    isPublic: entry.isPublic,
  }))
}

/**
 * One page of the download list. A store that did not respond arrives here as an
 * empty listing, which the page draws as no download section — the same as a
 * prefix that holds nothing, and the honest answer in both cases.
 */
export function fileListOf(rows: readonly FileRowView[], page: number): FileListView {
  const paged = pageOfFiles(rows, page)
  return {
    rows: paged.rows,
    total: paged.total,
    page: paged.page,
    pageCount: paged.pageCount,
    rangeFrom: paged.rangeFrom,
    rangeTo: paged.rangeTo,
  }
}

/** The page a `?files=` parameter requests. Anything unreadable is the first. */
export function readFilePage(url: URL): number {
  const wanted = Number(url.searchParams.get("files") ?? "1")
  return Number.isInteger(wanted) && wanted >= 1 ? wanted : 1
}
