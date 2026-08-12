/**
 * The box: where a research's files live, and how the two buckets are read as
 * one list.
 *
 * **A box is a prefix, and the prefix differs between the buckets.** The private
 * one is keyed by the research identity because files start arriving before a
 * hum number has been issued; the public one is keyed by the hum label so that
 * `/files/hum0009/hum0009.v1.CpG.v1.zip` resolves without anything having to be
 * looked up (docs/files.md).
 *
 * **The file name is the same on both sides**, which is what lets an
 * administrator see one list rather than two, and what makes the correspondence
 * between the buckets solvable from `(researchId, humLabel)` alone.
 *
 * Nothing here reaches the store. What a bucket holds is the store's to say;
 * this module only says what the answer means.
 */

export const PUBLIC_BUCKET = "files"
export const PRIVATE_BUCKET = "private"

/** Files a reader gets one page of. Most boxes hold fewer than this in total. */
export const BOX_PAGE_SIZE = 100

/** Above this a single PUT is a bad bet, and the upload is cut into parts. */
export const MULTIPART_THRESHOLD = 64 * 1024 * 1024

/** What each part of a multipart upload carries. Also the store's own minimum. */
export const MULTIPART_PART_SIZE = 64 * 1024 * 1024

/** How many parts are in flight at once. Measured throughput flattens here. */
export const MULTIPART_CONCURRENCY = 4

/** One node of a listed bucket, as the store reports it. */
export interface StoredNode {
  name: string
  size: number
  /** When the object was last written, as an ISO instant. */
  updatedAt: string
}

export type SwitchAction = "publish" | "unpublish"

/** One line of the box as an administrator sees it: both buckets, merged. */
export interface BoxEntry {
  name: string
  size: number
  updatedAt: string
  /**
   * Whether a reader can fetch it. A file caught in both buckets counts as
   * public: the public copy is the one that answers, and the invariant that
   * resolves the situation keeps that copy.
   */
  isPublic: boolean
  /** A switch that has not finished, and why the last attempt failed if it did. */
  pending: { action: SwitchAction, failed: boolean, lastError: string | null } | null
}

export interface PendingSwitch {
  fileName: string
  action: SwitchAction
  failed: boolean
  /**
   * What the store said when the last attempt failed. Shown as it is: a copy
   * that keeps failing is fixed by reading the reason, and "it failed" on its
   * own sends an administrator to the logs of a process nobody is watching.
   */
  lastError: string | null
}

export function privatePrefix(researchId: string): string {
  return `${researchId}/`
}

export function publicPrefix(humLabel: string): string {
  return `${humLabel}/`
}

/**
 * The box the article assets live in — the images and PDFs a document body
 * links to. It belongs to no research, so it has no private counterpart: it is
 * **public bucket only**, and what is put there is public from that moment
 * (docs/files.md).
 */
export const COMMON_BOX = "common"

export function commonPrefix(): string {
  return `${COMMON_BOX}/`
}

/**
 * A name the screen is allowed to create.
 *
 * A key is the prefix followed by the name, so a name carrying a separator
 * would put the object somewhere else in the bucket. Listings tolerate one —
 * `common/dac/DAC_summary-1.pdf` is a real key and the box shows it — but
 * nothing on the screen makes a directory, so nothing may ask for one.
 */
export function isUploadableName(name: string): boolean {
  if (name === "" || name.length > 255) return false
  if (name === "." || name === "..") return false
  if (name.includes("/") || name.includes("\\")) return false
  // A control character survives the signature and comes back out in a header.
  // Code units are the right unit: a control character is one of them, and
  // splitting the name into graphemes would say nothing more.
  for (let at = 0; at < name.length; at += 1) {
    const code = name.charCodeAt(at)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

/**
 * The two buckets as one list, in name order.
 *
 * A name in both buckets is a switch that did not finish rather than two files,
 * so it appears once. Its size comes from the public side, which is the copy a
 * reader would get.
 */
export function composeBox(
  publicNodes: readonly StoredNode[],
  privateNodes: readonly StoredNode[],
  pending: readonly PendingSwitch[],
): BoxEntry[] {
  const queued = new Map(pending.map((row) => [row.fileName, row]))
  const entries = new Map<string, BoxEntry>()

  for (const node of privateNodes) {
    entries.set(node.name, { ...node, isPublic: false, pending: null })
  }
  // Public second so that a name held by both is reported as public.
  for (const node of publicNodes) {
    entries.set(node.name, { ...node, isPublic: true, pending: null })
  }

  for (const entry of entries.values()) {
    const row = queued.get(entry.name)
    if (row !== undefined) {
      entry.pending = { action: row.action, failed: row.failed, lastError: row.lastError }
    }
  }

  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export interface BoxPage<T> {
  rows: T[]
  total: number
  page: number
  pageCount: number
}

/**
 * One page of a listing. **The cut happens on the server** because the pages a
 * reader sees have to work without JavaScript, and because the largest box
 * would otherwise be a megabyte of HTML that nobody reads to the end of.
 */
export function pageOfBox<T>(rows: readonly T[], page: number, size = BOX_PAGE_SIZE): BoxPage<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const wanted = Math.min(Math.max(page, 1), pageCount)
  const from = (wanted - 1) * size
  return { rows: rows.slice(from, from + size), total: rows.length, page: wanted, pageCount }
}

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

/**
 * A size as a reader reads it. Powers of 1000 rather than 1024: the number
 * beside a download is compared against what a browser will report, and that is
 * what browsers show.
 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-"
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  // One decimal until the number is three digits: 78.9 MB says something 79 MB
  // does not, while 157.0 GB says nothing 157 GB does not.
  const shown = unit === 0 ? String(Math.round(value)) : value.toFixed(value < 100 ? 1 : 0)
  return `${shown} ${UNITS[unit]}`
}

/**
 * The selection a dataset holds, in the order it holds it, keeping only what
 * the listing has. The same rule the public projection applies, needed here as
 * well because the editor offers a picker over the same listing.
 */
export function selectedFrom(
  selection: readonly string[],
  listing: readonly BoxEntry[],
): BoxEntry[] {
  const byName = new Map(listing.map((entry) => [entry.name, entry]))
  return selection.flatMap((name) => {
    const entry = byName.get(name)
    return entry === undefined ? [] : [entry]
  })
}
