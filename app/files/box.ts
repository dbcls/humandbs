/**
 * The box: where a research's files live, and how the two buckets are read as
 * one list.
 *
 * **A box is a prefix, and the prefix differs between the buckets.** The private
 * one is keyed by the research identity because files start arriving before a
 * hum number has been issued; the public one is keyed by the hum label so that
 * `/files/hum0009/hum0009.v1.CpG.v1.zip` resolves without anything having to be
 * looked up.
 *
 * **The file name is the same on both sides**, which is what lets an
 * administrator see one list rather than two, and what makes the correspondence
 * between the buckets solvable from `(researchId, humLabel)` alone.
 *
 * Nothing here reaches the store. What a bucket holds is the store's to say;
 * this module only says what the answer means.
 */

export const PUBLIC_BUCKET = "files"
import { dayInJst } from "~/dates"
import { pageRange } from "~/paging"

export const PRIVATE_BUCKET = "private"

/**
 * Files a reader gets one page of — the public download list and a dataset's
 * files. Most boxes hold fewer than this in total, and a list that fits on one
 * page draws neither a count nor page steps (`components/files.tsx` の
 * `Downloads`).
 */
export const BOX_PAGE_SIZE = 20

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
 * **public bucket only**, and what is put there is public from that moment.
 */
export const COMMON_BOX = "common"

export function commonPrefix(): string {
  return `${COMMON_BOX}/`
}

/**
 * A name a file may answer under, once it is in a box.
 *
 * **It may carry `/`.** The `common/` box keeps the article assets under the
 * shape they already had (`/files/common/dac/DAC_summary-1.pdf`), so a slug
 * there is a path rather than a word — which is also what lets one be moved
 * from one folder to another without leaving the box.
 *
 * What it may not be is anything that would name a different object than it
 * reads as: an empty segment, a `.` or a `..` walking out of the prefix, or a
 * control character, which survives the signature and comes back out in a
 * header. Code units are the right unit for that last one — a control
 * character is one of them, and splitting the name into graphemes would say
 * nothing more.
 */
export function isFileSlug(slug: string): boolean {
  if (slug === "" || slug.length > 255) return false
  if (slug.includes("\\")) return false
  for (let at = 0; at < slug.length; at += 1) {
    const code = slug.charCodeAt(at)
    if (code < 0x20 || code === 0x7f) return false
  }
  return slug.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
}

/**
 * A name the screen is allowed to bring in.
 *
 * **An upload names one file and nothing else**, so unlike a slug it carries no
 * separator: a research's box is flat, and what arrives by drop is a file
 * somebody picked rather than a place they chose for it. Putting one under a
 * folder in the `common/` box is done afterwards, by changing its slug.
 */
export function isUploadableName(name: string): boolean {
  return !name.includes("/") && isFileSlug(name)
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

/**
 * The orderings a box can be read in.
 *
 * **The slug is the first of them** because it is the address, and a box is
 * read by looking for one — the size and the date are for finding what is big
 * or what moved, which is a second question rather than the first.
 */
export const BOX_SORT_KEYS = ["slug", "size", "updated"] as const

export type BoxSortKey = typeof BOX_SORT_KEYS[number]

export const BOX_SORT: BoxSortKey = BOX_SORT_KEYS[0]

export function isBoxSortKey(value: string | null): value is BoxSortKey {
  return value !== null && (BOX_SORT_KEYS as readonly string[]).includes(value)
}

/**
 * The box in the order asked for.
 *
 * **The slug breaks every tie**, so the ordering is total: two files of the
 * same size or written in the same second would otherwise be free to swap, and
 * a row that swaps between two requests can cross a page boundary and be missed
 * or read twice.
 */
export function sortedBox<T extends StoredNode>(
  rows: readonly T[],
  key: BoxSortKey,
  order: "asc" | "desc",
): T[] {
  const by = (a: T, b: T): number => {
    if (key === "size") return a.size - b.size || a.name.localeCompare(b.name)
    if (key === "updated") return a.updatedAt.localeCompare(b.updatedAt) || a.name.localeCompare(b.name)
    return a.name.localeCompare(b.name)
  }
  const sorted = [...rows].sort(by)
  return order === "desc" ? sorted.reverse() : sorted
}

/** The two sides of the store a research's file can be on, as the listing's axis names them. */
export const BOX_STATES = ["public", "private"] as const
export type BoxState = (typeof BOX_STATES)[number]

export interface BoxFilter {
  /** Words all of which have to appear in the slug. Empty is every file. */
  keyword: string
  /** The first and the last JST day to keep, each `null` when that end is open. */
  from: string | null
  to: string | null
}

/**
 * The files a filter leaves, in the order they were given.
 *
 * **The words are looked for in the slug and nowhere else** — it is the one
 * thing a row says about a file that a curator can have typed — and every word
 * separated by whitespace has to appear, as in the other listings' boxes
 * (`app/admin/listing.ts`). Case does not count: a slug is written in lower
 * case and what is typed need not be.
 *
 * **The day is the JST day the file was written** (`dates.ts` の `dayInJst`),
 * which is the day the row shows — a range read against a day the column does
 * not print would keep rows the reader can see fall outside it. Both ends are
 * inclusive and either may be open; a lower bound above the upper leaves
 * nothing, which is what was asked.
 */
export function narrowedBox<T extends StoredNode>(rows: readonly T[], filter: BoxFilter): T[] {
  const words = filter.keyword.toLowerCase().split(/\s+/).filter((word) => word !== "")
  return rows.filter((row) => {
    if (words.length > 0) {
      const slug = row.name.toLowerCase()
      if (!words.every((word) => slug.includes(word))) return false
    }
    if (filter.from === null && filter.to === null) return true
    const day = dayInJst(row.updatedAt)
    if (filter.from !== null && day < filter.from) return false
    if (filter.to !== null && day > filter.to) return false
    return true
  })
}

export interface BoxPage<T> {
  rows: T[]
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole box. */
  rangeFrom: number
  rangeTo: number
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
  return {
    rows: rows.slice(from, from + size),
    total: rows.length,
    page: wanted,
    pageCount,
    ...pageRange(wanted, size, rows.length),
  }
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
