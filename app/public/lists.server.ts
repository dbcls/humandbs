/**
 * What the two listings load.
 *
 * The listings are the public search. They read the same rows every other
 * public page reads its set from, so a draft cannot appear in one, and the two
 * differ only in which kind of row they ask for and what they show of it.
 *
 * **The address always holds the query language.** The box holds keywords, so a
 * submission arrives as `k` and is turned into a tree here, then answered with
 * a redirect to the `q` that tree writes out. One search has one address, it
 * can be shared, and none of it needs JavaScript — the box is a GET form.
 */

import { and, desc, eq, inArray } from "drizzle-orm"
import { redirect } from "react-router"

import { publicDatasetContent, publicResearchContent } from "~/content/public"
import { getDb } from "~/db/client.server"
import {
  contentSnapshot,
  datasetContent,
  researchVersion,
  searchDoc,
  searchFacetTerm,
} from "~/db/schema"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { hasFreeText, parseQuery, serializeQuery, type QueryError, type QueryNode } from "~/search/dsl"
import { joinKeyword, splitKeyword } from "~/search/keyword"
import {
  countMatches,
  PAGE_SIZE,
  searchDocs,
  type SearchHit,
  type SearchTarget,
  type SortKey,
} from "~/search/query.server"

import { loadCatalog } from "./queries.server"
import { href, listPath, searchQuery } from "./urls"
import {
  ACCESS_TYPE_KEY,
  datasetListRowView,
  researchListRowView,
  type CatalogView,
  type DatasetListRowView,
  type ResearchListRowView,
} from "./view.server"

/** Nothing on a public page is ever rendered with unsettled values kept. */
const PUBLISHED = { keepUnsettled: false }

const SORT_KEYS: readonly SortKey[] = ["relevance", "dateModified", "datePublished", "id"]

export interface ConditionChip {
  label: string
  /** The address of the same search without this condition. */
  href: string
}

interface ListShell {
  locale: Locale
  /** What the box shows. */
  keyword: string
  conditions: ConditionChip[]
  /** The normalised query, for building links off this search. */
  query: string
  parseError: QueryError | null
  sort: SortKey
  sortOptions: readonly SortKey[]
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole result. */
  rangeFrom: number
  rangeTo: number
  /** How many the other listing matches, or null when there is no query. */
  otherCount: number | null
}

export interface ResearchListView extends ListShell {
  rows: ResearchListRowView[]
}

export interface DatasetListView extends ListShell {
  rows: DatasetListRowView[]
}

function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value)
}

function readPage(value: string | null): number {
  const page = Number(value ?? "1")
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/**
 * A search arriving from the box is answered with the address it should have
 * had. Redirecting rather than rendering keeps one search at one address,
 * which is what makes the result shareable.
 */
export function canonicalRedirect(
  url: URL,
  target: SearchTarget,
  locale: Locale,
): Response | null {
  const typed = url.searchParams.get("k")
  if (typed === null) return null
  const parsed = parseQuery(url.searchParams.get("q") ?? "")
  const kept = parsed.ok ? splitKeyword(parsed.ast).conditions : []
  const ast = joinKeyword(typed, kept)
  const sort = url.searchParams.get("sort")
  return redirect(href(locale, listPath(target) + searchQuery({
    q: serializeQuery(ast),
    sort: isSortKey(sort) ? sort : null,
    page: 1,
  })))
}

function describeCondition(node: QueryNode, locale: Locale): string {
  const words = messagesFor(locale).search
  if (node.op === "NOT") {
    const [only] = node.rules
    return only === undefined ? "" : `${words.exclude}: ${describeCondition(only, locale)}`
  }
  if (node.op === "field") {
    const labels: Record<string, string> = words.fields
    const label = labels[node.field] ?? node.field
    const value = typeof node.value === "string"
      ? node.value
      : `${node.value.from} – ${node.value.to}`
    return `${label}: ${value}`
  }
  if (node.op === "free_text") return node.value
  return serializeQuery(node)
}

interface Shell {
  shell: ListShell
  hits: SearchHit[]
  catalog: CatalogView
}

async function listShell(
  target: SearchTarget,
  request: { locale: Locale, url: URL },
): Promise<Shell> {
  const db = getDb()
  const catalog = await loadCatalog(db)
  const locale = request.locale
  const parsed = parseQuery(request.url.searchParams.get("q") ?? "")
  const requestedSort = request.url.searchParams.get("sort")
  const ast = parsed.ok ? parsed.ast : null
  // Only a full-text match carries a score, so a query made of field
  // conditions alone has nothing to rank by.
  const ranked = hasFreeText(ast)
  const sortOptions = ranked ? SORT_KEYS : SORT_KEYS.filter((key) => key !== "relevance")
  const fallbackSort: SortKey = ranked
    ? "relevance"
    : target === "research" ? "dateModified" : "id"
  const sort = isSortKey(requestedSort) && sortOptions.includes(requestedSort)
    ? requestedSort
    : fallbackSort

  const empty: ListShell = {
    locale,
    keyword: "",
    conditions: [],
    query: serializeQuery(ast),
    parseError: parsed.ok ? null : parsed.error,
    sort,
    sortOptions,
    total: 0,
    page: 1,
    pageCount: 1,
    rangeFrom: 0,
    rangeTo: 0,
    otherCount: null,
  }
  if (!parsed.ok) return { shell: empty, hits: [], catalog }

  const split = splitKeyword(ast)
  const other: SearchTarget = target === "research" ? "dataset" : "research"
  const [result, otherCount] = await Promise.all([
    searchDocs(db, { target, ast, sort, page: readPage(request.url.searchParams.get("page")) }),
    ast === null ? Promise.resolve(null) : countMatches(db, { target: other, ast }),
  ])

  const conditions = split.conditions.map((condition, at): ConditionChip => {
    const rest = split.conditions.filter((_, index) => index !== at)
    return {
      label: describeCondition(condition, locale),
      href: href(locale, listPath(target) + searchQuery({
        q: serializeQuery(joinKeyword(split.keyword, rest)),
        sort: isSortKey(requestedSort) ? requestedSort : null,
        page: 1,
      })),
    }
  })

  return {
    shell: {
      ...empty,
      keyword: split.keyword,
      conditions,
      total: result.total,
      page: result.page,
      pageCount: result.pageCount,
      rangeFrom: result.total === 0 ? 0 : (result.page - 1) * PAGE_SIZE + 1,
      rangeTo: Math.min(result.page * PAGE_SIZE, result.total),
      otherCount,
    },
    hits: result.hits,
    catalog,
  }
}

export async function researchListPage(
  request: { locale: Locale, url: URL },
): Promise<ResearchListView> {
  const { shell, hits, catalog } = await listShell("research", request)
  if (hits.length === 0) return { ...shell, rows: [] }

  const db = getDb()
  const ids = hits.map((hit) => hit.targetId)
  const [snapshots, datasetRows, accessRows] = await Promise.all([
    db
      .selectDistinctOn([researchVersion.researchId], {
        researchId: researchVersion.researchId,
        content: contentSnapshot.content,
      })
      .from(researchVersion)
      .innerJoin(contentSnapshot, eq(contentSnapshot.id, researchVersion.snapshotId))
      .where(and(eq(researchVersion.published, true), inArray(researchVersion.researchId, ids)))
      .orderBy(researchVersion.researchId, desc(researchVersion.number)),
    db
      .select({
        researchId: searchDoc.researchId,
        datasetId: searchDoc.targetId,
        label: searchDoc.datasetLabel,
      })
      .from(searchDoc)
      .where(and(eq(searchDoc.targetType, "dataset"), inArray(searchDoc.researchId, ids))),
    accessTermsByResearch(ids, catalog),
  ])

  const contentOf = new Map(snapshots.map((row) => [row.researchId, row.content]))
  const labelOf = new Map(datasetRows.flatMap((row) =>
    row.label === null ? [] : [[row.datasetId, row.label] as const]))

  const rows = hits.flatMap((hit) => {
    const snapshot = contentOf.get(hit.targetId)
    if (snapshot === undefined) return []
    const content = publicResearchContent(snapshot, PUBLISHED)
    return [researchListRowView({
      humLabel: hit.humLabel,
      content,
      datasetLabels: content.datasetIds.flatMap((id) => {
        const label = labelOf.get(id)
        return label === undefined ? [] : [label]
      }),
      accessTermIds: accessRows.get(hit.targetId) ?? [],
      datePublished: hit.datePublished,
      dateModified: hit.dateModified,
    }, shell.locale, catalog)]
  })
  return { ...shell, rows }
}

/** Access types across a research's published datasets, from the facet rows. */
async function accessTermsByResearch(
  researchIds: readonly string[],
  catalog: CatalogView,
): Promise<Map<string, string[]>> {
  const key = catalog.keyByCode.get(ACCESS_TYPE_KEY)
  if (key === undefined) return new Map()
  const rows = await getDb()
    .selectDistinct({ researchId: searchDoc.researchId, termId: searchFacetTerm.termId })
    .from(searchFacetTerm)
    .innerJoin(searchDoc, eq(searchDoc.id, searchFacetTerm.docId))
    .where(and(
      eq(searchFacetTerm.keyId, key.id),
      inArray(searchDoc.researchId, [...researchIds]),
    ))
  const byResearch = new Map<string, string[]>()
  for (const row of rows) {
    const held = byResearch.get(row.researchId) ?? []
    held.push(row.termId)
    byResearch.set(row.researchId, held)
  }
  return byResearch
}

export async function datasetListPage(
  request: { locale: Locale, url: URL },
): Promise<DatasetListView> {
  const { shell, hits, catalog } = await listShell("dataset", request)
  if (hits.length === 0) return { ...shell, rows: [] }

  const ids = hits.map((hit) => hit.targetId)
  const contents = await getDb()
    .select({ datasetId: datasetContent.datasetId, content: datasetContent.content })
    .from(datasetContent)
    .where(inArray(datasetContent.datasetId, ids))
  const contentOf = new Map(contents.map((row) => [row.datasetId, row.content]))

  const rows = hits.flatMap((hit) => {
    const content = contentOf.get(hit.targetId)
    if (content === undefined || hit.datasetLabel === null) return []
    return [datasetListRowView({
      id: hit.targetId,
      label: hit.datasetLabel,
      humLabel: hit.humLabel,
      content: publicDatasetContent(content, { keys: catalog.keyById, files: [] }, PUBLISHED),
      datePublished: hit.datePublished,
      dateModified: hit.dateModified,
    }, shell.locale, catalog)]
  })
  return { ...shell, rows }
}
