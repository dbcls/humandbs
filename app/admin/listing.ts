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

export interface AdminResearchRow {
  researchId: string
  humLabel: string | null
  /** From the working content: the drafts if there are any, else what is published. */
  title: TranslatedText
  /** Matched against, never shown: a listing of names would crowd out the titles. */
  providerNames: TranslatedText[]
  datasetLabels: string[]
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
    ...row.datasetLabels,
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

export interface ListingPage {
  rows: AdminResearchRow[]
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole result. */
  rangeFrom: number
  rangeTo: number
}

export function pageOf(
  rows: readonly AdminResearchRow[],
  page: number,
  size: PageSize = PAGE_SIZE,
): ListingPage {
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
