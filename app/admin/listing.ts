/**
 * The management listing: what a row holds, and how the filters narrow it.
 *
 * **The box is a direct lookup, not the public search.** It matches a hum
 * label, a dataset id, a title or a provider's name, on whichever of the two
 * languages holds one — a curator arrives knowing which research they mean, and
 * the full-text index would not help because it only holds what is published.
 * Several words all have to match, as they do in the public box.
 *
 * The filters are separate axes and combine as an AND: a status, and any number
 * of the shortcomings. Nothing here reaches the database, so a rule can be
 * checked against a row without one.
 *
 * **The shortcomings are the ones a row can be built with**, which is a wider
 * line than "derived from the content": two of them come from the pin ledger and
 * one from the upstream cache. What decides it is whether the listing query can
 * reach it — a publish the gate would stop has to be visible before the curator
 * walks all the way to the confirmation screen.
 */

import type { TranslatedText } from "~/content/types"

import type { ContentFlags } from "./flags"

export const ADMIN_PAGE_SIZE = 20

export type AdminStatus = "published" | "withdrawn" | "unpublished"

export const ADMIN_STATUSES: readonly AdminStatus[] = ["published", "withdrawn", "unpublished"]

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
}

export interface ListingFilter {
  keyword: string
  status: AdminStatus | null
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
    && (filter.status === null || row.status === filter.status)
    && filter.flags.every((flag) => row.flags[flag]))
}

/**
 * Most recently touched first. The tie-break is the identity, which is
 * time-ordered, so a page boundary does not move rows around between requests.
 */
export function sortResearchRows(rows: readonly AdminResearchRow[]): AdminResearchRow[] {
  return [...rows].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt) || b.researchId.localeCompare(a.researchId))
}

export interface ListingPage {
  rows: AdminResearchRow[]
  total: number
  page: number
  pageCount: number
}

export function pageOf(rows: readonly AdminResearchRow[], page: number): ListingPage {
  const pageCount = Math.max(1, Math.ceil(rows.length / ADMIN_PAGE_SIZE))
  const wanted = Math.min(Math.max(page, 1), pageCount)
  const from = (wanted - 1) * ADMIN_PAGE_SIZE
  return {
    rows: rows.slice(from, from + ADMIN_PAGE_SIZE),
    total: rows.length,
    page: wanted,
    pageCount,
  }
}
