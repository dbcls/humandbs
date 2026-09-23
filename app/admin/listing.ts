/**
 * The management listing: what a row holds, and how the filters narrow it.
 *
 * **The box is a direct lookup, not the public search.** It matches a hum
 * label, a dataset id, a title or a provider's name, on whichever of the two
 * languages holds one — a curator arrives knowing which research they mean, and
 * the full-text index would not help because it only holds what is published.
 * Several words all have to match, as they do in the public box.
 *
 * **The status and the shortcomings are two axes and combine as an AND; within
 * each axis the choices are an OR.** Ticking three shortcomings asks for the
 * rows that need looking at, not for the rare row that manages all three at
 * once, and an axis nothing is ticked on narrows nothing. Nothing here reaches
 * the database, so a rule can be checked against a row without one.
 *
 * **The shortcomings are the ones a row can be built with**, which is a wider
 * line than "derived from the content": two of them come from the pin ledger and
 * one from the upstream cache. What decides it is whether the listing query can
 * reach it — a publish the gate would stop has to be visible before the curator
 * walks all the way to the confirmation screen.
 */

import type { TranslatedText } from "~/content/types"
import { pageRange } from "~/paging"
import { PAGE_SIZE, type PageSize } from "~/search/page-size"
import { DEFAULT_SORT, defaultOrder, type SortKey, type SortOrder } from "~/search/sort"

import type { ContentFlags } from "./flags"

/**
 * Whether anything of this research is out.
 *
 * **Taking a version back is not a third state.** It leaves the version in
 * place with its number spent and its `published` false, so a research whose
 * versions have all been taken back stands exactly where one that never had any
 * stands: nothing of it is readable. Which versions exist and which of them are
 * out is the research's own screen to say.
 */
export type AdminStatus = "published" | "unpublished"

export const ADMIN_STATUSES: readonly AdminStatus[] = ["published", "unpublished"]

export interface AdminFlags extends ContentFlags {
  /** No hum label is pinned, which alone is enough to stop a version publishing. */
  noHumLabel: boolean
  /** Some dataset of this research carries no id, which stops a publish just as hard. */
  noDatasetLabel: boolean
  /** A pinned JGA accession upstream does not know, or holds against another research. */
  upstreamMismatch: boolean
}

export type AdminFlagKey = keyof AdminFlags

export const ADMIN_FLAG_KEYS: readonly AdminFlagKey[] = [
  "noHumLabel",
  "noDatasetLabel",
  "unsettled",
  "untranslated",
  "upstreamMismatch",
]

export function isAdminStatus(value: string | null): value is AdminStatus {
  return value !== null && (ADMIN_STATUSES as readonly string[]).includes(value)
}

export function isAdminFlagKey(value: string): value is AdminFlagKey {
  return (ADMIN_FLAG_KEYS as readonly string[]).includes(value)
}

/** A dataset as the listing names it: by its pinned label, out or not. */
export interface AdminDatasetRef {
  label: string
  /** A search row exists for it, which is what gives it a public page. */
  published: boolean
}

export interface AdminResearchRow {
  researchId: string
  humLabel: string | null
  /** From the latest version that is out, or from a draft while none is. */
  title: TranslatedText
  /** From the same content as the title. Matched against, never shown: a listing of names would crowd out the titles. */
  providerNames: TranslatedText[]
  /** Every pinned dataset of the research, in label order. */
  datasets: AdminDatasetRef[]
  status: AdminStatus
  publishedVersions: number
  draftCount: number
  flags: AdminFlags
  /** The most recent change to the research, any of its versions or its drafts. */
  updatedAt: string
  /** The release date of the latest version that is out, or `null` while none is. */
  publishedOn: string | null
}

export interface ListingFilter {
  keyword: string
  /** Which states to keep. Empty is every state, the way no shortcoming is. */
  statuses: readonly AdminStatus[]
  flags: readonly AdminFlagKey[]
}

/**
 * Both languages of a pair, whatever their states. An unsettled side holds no
 * value to match, and a settled one is matched as it is written.
 */
function sides(pair: TranslatedText): string[] {
  return [pair.ja, pair.en].flatMap((slot) => slot.state === "value" ? [slot.value] : [])
}

function haystack(row: AdminResearchRow): string {
  return [
    row.humLabel ?? "",
    ...row.datasets.map((entry) => entry.label),
    ...sides(row.title),
    ...row.providerNames.flatMap(sides),
  ].join("\n").toLowerCase()
}

/** Words separated by whitespace all have to appear, as in the public box. */
function matchesKeyword(row: AdminResearchRow, keyword: string): boolean {
  const words = keyword.toLowerCase().split(/\s+/).filter((word) => word !== "")
  if (words.length === 0) return true
  const text = haystack(row)
  return words.every((word) => text.includes(word))
}

export function filterResearchRows(
  rows: readonly AdminResearchRow[],
  filter: ListingFilter,
): AdminResearchRow[] {
  return rows.filter((row) =>
    matchesKeyword(row, filter.keyword)
    && (filter.statuses.length === 0 || filter.statuses.includes(row.status))
    && (filter.flags.length === 0 || filter.flags.some((flag) => row.flags[flag])))
}

/**
 * The rows in the order asked for, most recently touched first by default.
 *
 * **The keys are the ones the public listings offer** (`search/sort.ts`), so a
 * curator moving between the two sides has one set of orderings to learn rather
 * than two.
 *
 * **A row with nothing under the key sinks, whichever way the order runs.** An
 * unpinned label and a research that has never been out have no place on a
 * scale of labels or of dates, and sorting them as the empty string would put
 * them at one end for `asc` and the other for `desc` — a reader turning the
 * order around would see them cross the whole listing.
 *
 * The tie-break is the identity, which is time-ordered, so a page boundary does
 * not move rows around between requests.
 */
export function sortResearchRows(
  rows: readonly AdminResearchRow[],
  sort: SortKey = DEFAULT_SORT,
  order: SortOrder = defaultOrder(sort),
): AdminResearchRow[] {
  const turn = order === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const one = keyOf(a, sort)
    const other = keyOf(b, sort)
    if (one === null || other === null) {
      if (one !== other) return one === null ? 1 : -1
    } else if (one !== other) {
      return one.localeCompare(other) * turn
    }
    return b.researchId.localeCompare(a.researchId)
  })
}

function keyOf(row: AdminResearchRow, sort: SortKey): string | null {
  if (sort === "id") return row.humLabel
  if (sort === "datePublished") return row.publishedOn
  return row.updatedAt
}

export interface ListingPage<Row> {
  rows: Row[]
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole result. */
  rangeFrom: number
  rangeTo: number
}

/** Cutting a page out of a result, whatever the rows of it are. */
export function pageOf<Row>(
  rows: readonly Row[],
  page: number,
  size: PageSize = PAGE_SIZE,
): ListingPage<Row> {
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

/**
 * How many rows each choice of one axis would leave.
 *
 * **Counted with that axis's own condition lifted**, which is the rule the
 * public panel runs on (`components/facets.tsx`). Counted inside the narrowed
 * result instead, every value a reader has not chosen reads 0, and an axis that
 * has already been used cannot be told from one that leads nowhere — so the
 * second value of an axis would look unreachable the moment the first is
 * ticked. **The other axes stay on**, so a number says what the pane is about
 * to do rather than what the whole table holds.
 *
 * Which rows those are is the listing's own business, so the caller hands in
 * the ones that survive everything *but* this axis.
 */
export function axisCounts<Row, Value extends string>(
  rows: readonly Row[],
  values: readonly Value[],
  holds: (row: Row, value: Value) => boolean,
): Record<Value, number> {
  const counts = Object.fromEntries(values.map((value) => [value, 0])) as Record<Value, number>
  for (const row of rows) {
    for (const value of values) {
      if (holds(row, value)) counts[value] += 1
    }
  }
  return counts
}

// === the branches of approved applications ===

/**
 * Where an approval branch stands with the portal, which is what decides what
 * taking it in can do.
 *
 * **Most branches land on a research that already exists** — four in five, the
 * portal holding the hum label the application was approved under — so a
 * listing that cannot tell the three apart is mostly rows a curator has to open
 * to find out. A branch with no hum label at all is its own standing rather
 * than one of the other two: the number is issued upstream, and until it is
 * there is nothing to match a research by.
 */
export type BranchStanding = "held" | "absent" | "unlabelled"

export const BRANCH_STANDINGS: readonly BranchStanding[] = ["held", "absent", "unlabelled"]

/**
 * The orderings this listing offers.
 *
 * **Not the ones the other listings offer** (`app/search/sort.ts`): a branch is
 * not a research, it is never modified and it is never published, so the two
 * date keys have nothing to read. What it has is the day it was approved and
 * the number it was approved under.
 */
export const BRANCH_SORT_KEYS = ["approved", "application"] as const

export type BranchSortKey = typeof BRANCH_SORT_KEYS[number]

/** A listing opens on the newest approval: that is what a curator was told about. */
export const BRANCH_SORT: BranchSortKey = "approved"

/** A date runs from the newest and a number from the smallest, as elsewhere. */
export function branchOrder(sort: BranchSortKey): SortOrder {
  return sort === "application" ? "asc" : "desc"
}

export function isBranchStanding(value: string): value is BranchStanding {
  return (BRANCH_STANDINGS as readonly string[]).includes(value)
}

export function isBranchSortKey(value: string | null): value is BranchSortKey {
  return value !== null && (BRANCH_SORT_KEYS as readonly string[]).includes(value)
}

/** What narrowing and ordering read of a branch. The row shows more. */
export interface BranchRow {
  applicationId: string
  humLabel: string | null
  approvedOn: string | null
  /** The datasets the branch has registered, which is what it can seed. */
  datasets: readonly string[]
  /** The research whose hum label this already is, when there is one. */
  heldBy: string | null
}

export function branchStanding(row: BranchRow): BranchStanding {
  if (row.heldBy !== null) return "held"
  return row.humLabel === null ? "unlabelled" : "absent"
}

export interface BranchFilter {
  standings: readonly BranchStanding[]
}

/**
 * The branches a curator asked to see.
 *
 * **The word is not matched here.** It is matched by the application system,
 * which is where the titles and the names are; what this axis reads is the
 * portal's own answer about the branch, which upstream cannot know.
 *
 * **Whether the branch registered anything is not an axis.** The row already
 * lists what it registered, and the listing is for finding the branch a
 * research is made from, which a branch without datasets still is.
 *
 * An empty axis narrows nothing, as on the research listing.
 */
export function filterBranchRows<Row extends BranchRow>(
  rows: readonly Row[],
  filter: BranchFilter,
): Row[] {
  return rows.filter((row) =>
    filter.standings.length === 0 || filter.standings.includes(branchStanding(row)))
}

/**
 * The branches in the order asked for, newest approval first by default.
 *
 * A branch with no approval date sinks whichever way the order runs, for the
 * reason the research listing sinks a research that has never been out. The
 * tie-break is the application number, which is unique, so a row cannot move
 * between pages from one request to the next.
 */
export function sortBranchRows<Row extends BranchRow>(
  rows: readonly Row[],
  sort: BranchSortKey = BRANCH_SORT,
  order: SortOrder = branchOrder(sort),
): Row[] {
  const turn = order === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const one = sort === "application" ? a.applicationId : a.approvedOn
    const other = sort === "application" ? b.applicationId : b.approvedOn
    if (one === null || other === null) {
      if (one !== other) return one === null ? 1 : -1
    } else if (one !== other) {
      return one.localeCompare(other) * turn
    }
    return a.applicationId.localeCompare(b.applicationId)
  })
}
