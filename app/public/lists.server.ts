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

import { publicDatasetContent, publicResearchContent, PUBLISHED } from "~/content/public"
import { getDb, type Executor } from "~/db/client.server"
import {
  contentSnapshot,
  datasetContent,
  researchVersion,
  searchDoc,
  searchFacetTerm,
} from "~/db/schema"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { ICD10_SET_CODE } from "~/icd10/codes"
import { resolveTypedCode } from "~/icd10/entry.server"
import { loadFacetDefinitions } from "~/search/catalog.server"
import {
  hasFreeText,
  OPEN_BOUND,
  parseQuery,
  serializeQuery,
  type QueryError,
  type QueryNode,
} from "~/search/dsl"
import { queryFields, type QueryFields } from "~/search/fields"
import { joinKeyword, splitKeyword } from "~/search/keyword"
import {
  countMatches,
  isSortKey,
  PAGE_SIZE,
  searchDocs,
  sortOffer,
  type SearchHit,
  type SearchRequest,
  type SearchResult,
  type SearchTarget,
  type SortKey,
} from "~/search/query.server"
import { withRange, withTerm } from "~/search/selection"

import { facetPanel, type FacetPanelView } from "./facets.server"
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
  /**
   * What `?sort=` held, which is not the same as the ordering in force: an
   * ordering nobody asked for is not written into the links the page builds.
   */
  requestedSort: string | null
  sortOptions: readonly SortKey[]
  total: number
  page: number
  pageCount: number
  /** 1-based positions of the shown rows within the whole result. */
  rangeFrom: number
  rangeTo: number
  /** How many the other listing matches, or null when there is no query. */
  otherCount: number | null
  /** Which facet is opened and what its box holds, for the form to carry on. */
  facet: string | null
  find: string
  facets: FacetPanelView | null
}

export interface ResearchListView extends ListShell {
  rows: ResearchListRowView[]
}

export interface DatasetListView extends ListShell {
  rows: DatasetListRowView[]
}

function readPage(value: string | null): number {
  const page = Number(value ?? "1")
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/**
 * The last page rather than an empty one.
 *
 * A reader who followed a link from when there were more results is looking for
 * the results, not for a page saying there are none here. **The API answers the
 * question as it was asked** (`app/search/query.server.ts`), because something
 * walking the pages needs the walk to end.
 */
async function lastPageInstead(db: Executor, request: SearchRequest): Promise<SearchResult> {
  const result = await searchDocs(db, request)
  if (result.page <= result.pageCount) return result
  return searchDocs(db, { ...request, page: result.pageCount })
}

/**
 * A submission is answered with the address it should have had.
 *
 * **All three forms on the page arrive here**: the keyword box, which carries
 * what was typed under `k`; the range inputs of a numeric facet, which carry
 * the key and the two ends; and the disease facet's code box. None of them is a
 * way of asking a question the address cannot hold — they are turned into the
 * query straight away and redirected to, so one search has one address and the
 * result can be shared.
 *
 * **A code that names nothing is the one submission with no address of its
 * own.** It is left where it is so that the panel can say which of the two
 * things went wrong (`facets.server.ts`).
 */
export async function canonicalRedirect(
  url: URL,
  target: SearchTarget,
  locale: Locale,
): Promise<Response | null> {
  const typed = url.searchParams.get("k")
  const rangeKey = url.searchParams.get("rangeKey")
  const code = url.searchParams.get("code")
  if (typed === null && rangeKey === null && code === null) return null

  const db = getDb()
  const definitions = await loadFacetDefinitions(db)
  const fields = queryFields(definitions.map((one) => one.field))
  const parsed = parseQuery(url.searchParams.get("q") ?? "", fields)
  const held = parsed.ok ? parsed.ast : null

  let ast: QueryNode | null
  if (typed !== null) {
    ast = joinKeyword(typed, splitKeyword(held).conditions)
  } else if (rangeKey !== null) {
    ast = withRange(held, fields, rangeKey, {
      from: bound(url.searchParams.get("rangeFrom")),
      to: bound(url.searchParams.get("rangeTo")),
    })
  } else {
    const icd10 = definitions.find((one) => one.setCode === ICD10_SET_CODE)
    const setId = icd10?.field.setId ?? null
    if (icd10 === undefined || setId === null) return null
    const resolved = await resolveTypedCode(db, setId, code ?? "")
    if (resolved.status !== "found") return null
    ast = withTerm(held, fields, icd10.field.code, resolved.code)
  }

  const sort = url.searchParams.get("sort")
  return redirect(href(locale, listPath(target) + searchQuery({
    q: serializeQuery(ast),
    sort: isSortKey(sort) ? sort : null,
    page: 1,
    facet: url.searchParams.get("facet"),
    find: url.searchParams.get("find"),
  })))
}

/** An input left blank is an end that is not being asked about. */
function bound(value: string | null): string {
  const written = value?.trim() ?? ""
  return written === "" || !Number.isFinite(Number(written)) ? OPEN_BOUND : written
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

/**
 * Whether the panel is what shows this condition. Those are left off the chips
 * above the result: the panel draws them as chosen values with a way to take
 * each one off, and saying the same thing twice invites the two to disagree.
 */
function shownByPanel(node: QueryNode, fields: QueryFields): boolean {
  if (node.op === "field") return fields.facet(node.field) !== undefined
  if (node.op !== "OR") return false
  return node.rules.every((rule) => rule.op === "field" && fields.facet(rule.field) !== undefined)
}

/** The chosen values of the panel, each with the link that takes it off. */
function facetChips(panel: FacetPanelView | null): ConditionChip[] {
  if (panel === null) return []
  return panel.categories.flatMap((category) => category.facets.flatMap((facet) => {
    const range = facet.range
    if (range !== null && range.clearHref !== null) {
      const from = range.from === "" ? "" : range.from
      const to = range.to === "" ? "" : range.to
      return [{ label: `${facet.label}: ${from} – ${to}`, href: range.clearHref }]
    }
    return facet.values
      .filter((value) => value.selected)
      .map((value) => ({ label: `${facet.label}: ${value.label}`, href: value.href }))
  }))
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
  const [catalog, definitions] = await Promise.all([loadCatalog(db), loadFacetDefinitions(db)])
  const fields = queryFields(definitions.map((one) => one.field))
  const locale = request.locale
  const parsed = parseQuery(request.url.searchParams.get("q") ?? "", fields)
  const requestedSort = request.url.searchParams.get("sort")
  const expanded = request.url.searchParams.get("facet")
  const find = request.url.searchParams.get("find") ?? ""
  const ast = parsed.ok ? parsed.ast : null
  const { offered: sortOptions, fallback } = sortOffer(hasFreeText(ast), target)
  const sort = isSortKey(requestedSort) && sortOptions.includes(requestedSort)
    ? requestedSort
    : fallback

  const empty: ListShell = {
    locale,
    keyword: "",
    conditions: [],
    query: serializeQuery(ast),
    parseError: parsed.ok ? null : parsed.error,
    sort,
    requestedSort: isSortKey(requestedSort) ? requestedSort : null,
    sortOptions,
    total: 0,
    page: 1,
    pageCount: 1,
    rangeFrom: 0,
    rangeTo: 0,
    otherCount: null,
    facet: expanded,
    find,
    facets: null,
  }
  if (!parsed.ok) return { shell: empty, hits: [], catalog }

  const split = splitKeyword(ast)
  const other: SearchTarget = target === "research" ? "dataset" : "research"
  const [result, otherCount, panel] = await Promise.all([
    lastPageInstead(db, {
      target,
      ast,
      fields,
      sort,
      page: readPage(request.url.searchParams.get("page")),
    }),
    ast === null ? Promise.resolve(null) : countMatches(db, { target: other, ast, fields }),
    facetPanel(db, {
      target,
      ast,
      fields,
      definitions,
      locale,
      sort: isSortKey(requestedSort) ? requestedSort : null,
      expanded,
      find,
      code: request.url.searchParams.get("code") ?? "",
    }),
  ])

  const conditions = split.conditions.flatMap((condition, at): ConditionChip[] => {
    if (shownByPanel(condition, fields)) return []
    const rest = split.conditions.filter((_, index) => index !== at)
    return [{
      label: describeCondition(condition, locale),
      href: href(locale, listPath(target) + searchQuery({
        q: serializeQuery(joinKeyword(split.keyword, rest)),
        sort: isSortKey(requestedSort) ? requestedSort : null,
        page: 1,
        facet: expanded,
        find,
      })),
    }]
  })

  return {
    shell: {
      ...empty,
      keyword: split.keyword,
      conditions: [...conditions, ...facetChips(panel)],
      facets: panel,
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
  // **The research rows only.** A research row already holds the union of what
  // its datasets carry (`app/search/rebuild.server.ts`), so leaving the dataset
  // rows in would read the same values twice over and then throw the second
  // copy away.
  const rows = await getDb()
    .select({ researchId: searchDoc.researchId, termId: searchFacetTerm.termId })
    .from(searchFacetTerm)
    .innerJoin(searchDoc, eq(searchDoc.id, searchFacetTerm.docId))
    .where(and(
      eq(searchFacetTerm.keyId, key.id),
      eq(searchDoc.targetType, "research"),
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
