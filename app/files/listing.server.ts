/**
 * Reading a research's box.
 *
 * There are two answers and they are not the same list. **A reader gets the
 * public bucket alone**; an administrator, and the preview a share link shows,
 * get both merged by name — at draft time nothing has been made public yet, so
 * showing only the public side would empty the download list exactly when it is
 * being checked (docs/data-model.md の「ファイル」).
 *
 * **A store that does not answer is not an error here.** The download section
 * is left out rather than the page being lost: what the box holds is outside
 * the portal, and the rest of the page does not depend on it.
 */

import type { Executor } from "~/db/client.server"
import type { FileListView, FileRowView } from "~/public/view.server"

import {
  commonPrefix,
  composeBox,
  pageOfBox,
  privatePrefix,
  PRIVATE_BUCKET,
  publicPrefix,
  PUBLIC_BUCKET,
  type BoxEntry,
  type StoredNode,
} from "./box"
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
 * What a reader can download. Null when the store did not answer, which the
 * page shows as no download section rather than as a failure.
 */
export async function publicBox(humLabel: string | null): Promise<StoredNode[] | null> {
  if (humLabel === null) return []
  return tolerantly(() => listPrefix(PUBLIC_BUCKET, publicPrefix(humLabel)))
}

/**
 * The public boxes of a known set of researches.
 *
 * One listing per prefix, which is right while the set is bounded — a page of
 * search results is twenty at most. For every research at once there is
 * `everyPublicBox`.
 */
export async function publicBoxesOf(
  humLabels: readonly string[],
): Promise<Map<string, StoredNode[]>> {
  const wanted = [...new Set(humLabels)]
  const listings = await Promise.all(wanted.map((label) => publicBox(label)))
  return new Map(wanted.map((label, at) => [label, listings[at] ?? []]))
}

/**
 * Every public box at once, keyed by the hum label that names it.
 *
 * One listing of the whole bucket rather than one per research: the bulk stream
 * answers for every published research, and asking the store several hundred
 * times to build one answer would make an endpoint nobody has to authenticate
 * for expensive to call.
 */
export async function everyPublicBox(): Promise<Map<string, StoredNode[]>> {
  const nodes = await tolerantly(() => listPrefix(PUBLIC_BUCKET, ""))
  const boxes = new Map<string, StoredNode[]>()
  if (nodes === null) return boxes

  for (const node of nodes) {
    // The whole bucket is listed, so a name here is still a full key. The first
    // separator divides the box from the file; anything after that belongs to
    // the name, the same as when one box is listed on its own.
    const at = node.name.indexOf("/")
    if (at <= 0) continue
    const name = node.name.slice(at + 1)
    if (name === "") continue
    const box = node.name.slice(0, at)
    const held = boxes.get(box) ?? []
    held.push({ ...node, name })
    boxes.set(box, held)
  }
  return boxes
}

/**
 * The article assets. One bucket rather than two, because this box has no
 * private side: a file put here is public from that moment.
 */
export async function commonBox(): Promise<StoredNode[] | null> {
  return tolerantly(() => listPrefix(PUBLIC_BUCKET, commonPrefix()))
}

/**
 * Both buckets as one list, with whatever switch has not finished marked on the
 * lines it applies to.
 */
export async function adminBox(
  executor: Executor,
  researchId: string,
  humLabel: string | null,
): Promise<BoxEntry[] | null> {
  const [publicNodes, privateNodes, pending] = await Promise.all([
    publicBox(humLabel),
    tolerantly(() => listPrefix(PRIVATE_BUCKET, privatePrefix(researchId))),
    pendingSwitches(executor, researchId),
  ])
  if (publicNodes === null || privateNodes === null) return null
  return composeBox(publicNodes, privateNodes, pending)
}

/**
 * A listed bucket as download rows. Everything in the public bucket is by
 * definition fetchable, so the flag is settled by which listing this came from.
 */
export function publicRows(nodes: readonly StoredNode[] | null): FileRowView[] {
  return (nodes ?? []).map((node) => ({ name: node.name, size: node.size, isPublic: true }))
}

/** The merged listing as download rows, keeping which side each name came from. */
export function boxRows(entries: readonly BoxEntry[] | null): FileRowView[] {
  return (entries ?? []).map((entry) => ({
    name: entry.name,
    size: entry.size,
    isPublic: entry.isPublic,
  }))
}

/**
 * One page of the download list. A store that did not answer arrives here as an
 * empty listing, which the page draws as no download section — the same as a
 * box that holds nothing, and the honest answer in both cases.
 */
export function fileListOf(rows: readonly FileRowView[], page: number): FileListView {
  const cut = pageOfBox(rows, page)
  return { rows: cut.rows, total: cut.total, page: cut.page, pageCount: cut.pageCount }
}

/** The page a `?files=` parameter asks for. Anything unreadable is the first. */
export function readFilePage(url: URL): number {
  const wanted = Number(url.searchParams.get("files") ?? "1")
  return Number.isInteger(wanted) && wanted >= 1 ? wanted : 1
}
