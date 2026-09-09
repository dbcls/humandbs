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
import { today } from "~/dates"
import { getDb, type Executor } from "~/db/client.server"
import {
  contentSnapshot,
  datasetContent,
  researchVersion,
  searchDoc,
  searchFacetTerm,
} from "~/db/schema"
import type { Locale } from "~/i18n/locale"
import { messagesFor, type Messages } from "~/i18n/messages"
import { ICD10_SET_CODE } from "~/icd10/codes"
import { resolveTypedCode } from "~/icd10/entry.server"
import { loadFacetDefinitions } from "~/search/catalog.server"
import {
  group,
  isRealDate,
  OPEN_BOUND,
  parseQuery,
  serializeQuery,
  type QueryError,
  type QueryNode,
} from "~/search/dsl"
import { isDateFacet, queryFields, type QueryFields } from "~/search/fields"
import { joinKeyword, splitKeyword } from "~/search/keyword"
import type { ExportTable } from "~/search/export"
import {
  countMatches,
  defaultOrder,
  DEFAULT_SORT,
  isSortKey,
  isSortOrder,
  isPageSize,
  PAGE_SIZE,
  type PageSize,
  searchAllDocs,
  searchDocs,
  type SearchHit,
  type SearchRequest,
  type SearchResult,
  type SearchTarget,
  type SortKey,
  type SortOrder,
} from "~/search/query.server"
import { onPanel, withRange, withTerm } from "~/search/selection"

import { facetPanel, type FacetPanelView } from "./facets.server"
import { loadCatalog } from "./queries.server"
import { href, listPath, searchQuery } from "./urls"
import {
  ACCESS_TYPE_KEY,
  datasetListRowView,
  fieldText,
  PLATFORM_KEY,
  researchListRowView,
  type CatalogView,
  type DatasetListRowView,
  type ResearchListRowView,
} from "./view.server"

export interface ConditionChip {
  /**
   * The dimension the condition is about, or null when it names none. It is
   * kept apart from the value because the panel draws the two apart
   * (`components/base.tsx` の `Chip`).
   */
  field: string | null
  value: string
  /** The address of the same search without this condition. */
  href: string
}

/** What both listings have in common, which is everything but the rows. */
export interface ListShell {
  locale: Locale
  /** What the box shows. */
  keyword: string
  conditions: ConditionChip[]
  /**
   * The search with everything in force lifted, or null when nothing is.
   * **The typed words go too** — they are one of the conditions listed, so a
   * control that says it lifts all of them and leaves one behind would be
   * saying something untrue about the list right above it.
   */
  clearHref: string | null
  /** The normalised query, for building links off this search. */
  query: string
  parseError: QueryError | null
  sort: SortKey
  /**
   * What `?sort=` held, which is not the same as the ordering in force: an
   * ordering nobody asked for is not written into the links the page builds.
   */
  requestedSort: string | null
  order: SortOrder
  /** What `?order=` held, carried for the same reason as `requestedSort`. */
  requestedOrder: string | null
  size: PageSize
  /**
   * The size to write into the links this page builds, or `null` for the
   * default — carried for the same reason as `requestedSort`, and the reason
   * `app/public/urls.ts` does not know what the default is.
   */
  requestedSize: number | null
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
    const kind = isDateFacet(rangeKey) ? "date" : "number"
    ast = withRange(held, fields, rangeKey, {
      from: bound(url.searchParams.get("rangeFrom"), kind),
      to: bound(url.searchParams.get("rangeTo"), kind),
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
  const order = url.searchParams.get("order")
  const size = Number(url.searchParams.get("size") ?? "")
  return redirect(href(locale, listPath(target) + searchQuery({
    q: serializeQuery(ast),
    sort: isSortKey(sort) ? sort : null,
    order: isSortOrder(order) ? order : null,
    page: 1,
    size: isPageSize(size) && size !== PAGE_SIZE ? size : null,
    facet: url.searchParams.get("facet"),
    find: url.searchParams.get("find"),
  })))
}

/**
 * An input left blank is an end that is not being asked about, and so is one
 * holding something the field could not take. **Both ends open means the facet
 * is not being asked at all**, which `withRange` answers by dropping the
 * condition rather than by making one that matches everything.
 */
function bound(value: string | null, kind: "number" | "date"): string {
  const written = value?.trim() ?? ""
  if (written === "") return OPEN_BOUND
  const real = kind === "date" ? isRealDate(written) : Number.isFinite(Number(written))
  return real ? written : OPEN_BOUND
}

/**
 * A range as a condition reads: both ends, or the one that is there with the
 * mark still showing which side is open. **`*` is how the address writes an
 * open end, and it is not how anything reads it** — a chip saying
 * `2024-01-01 – *` is the query language leaking onto the screen.
 */
function writtenRange(
  range: { from: string, to: string },
  words: Messages["search"]["refine"],
): string {
  const from = range.from === OPEN_BOUND ? "" : range.from
  const to = range.to === OPEN_BOUND ? "" : range.to
  if (from !== "" && to !== "") return words.span(from, to)
  return from !== "" ? words.spanFrom(from) : words.spanTo(to)
}

function describeCondition(node: QueryNode, locale: Locale): { field: string | null, value: string } {
  const words = messagesFor(locale).search
  if (node.op === "NOT") {
    const [only] = node.rules
    if (only === undefined) return { field: null, value: "" }
    // The negation belongs to the value rather than to the field: what is
    // excluded is this value of that dimension, and moving the word to the
    // field would say the dimension itself is being left out.
    const inner = describeCondition(only, locale)
    return { field: inner.field, value: `${words.exclude}: ${inner.value}` }
  }
  if (node.op === "field") {
    const labels: Record<string, string> = words.fields
    return {
      field: labels[node.field] ?? node.field,
      value: typeof node.value === "string"
        ? node.value
        : writtenRange(node.value, words.refine),
    }
  }
  // **The typed words are named too.** They narrow the listing the way a chosen
  // value does, and the column of conditions reads down the names — one row
  // without one is read as a value belonging to whatever is above it.
  if (node.op === "free_text") return { field: words.keyword, value: node.value }
  return { field: null, value: serializeQuery(node) }
}

/**
 * The conditions a query is the conjunction of, in the order they were written.
 *
 * **This is the only place the list of what is in force comes from.** The
 * refinement panel writes a tree, the box writes a tree, the address holds what
 * the two make together — so reading the tree back is what makes the answer to
 * "what is narrowing this" complete by construction. **The typed words are
 * among them**: they are free text rather than a field, but a reader who typed
 * a word has narrowed the listing with it exactly as a chosen value does.
 */
function inForce(ast: QueryNode | null): QueryNode[] {
  if (ast === null) return []
  return ast.op === "AND" ? [...ast.rules] : [ast]
}

/**
 * Whether the panel is what shows this condition. Those are left off the chips
 * above the result: the panel draws them as chosen values with a way to take
 * each one off, and saying the same thing twice invites the two to disagree.
 */
function shownByPanel(node: QueryNode, fields: QueryFields): boolean {
  if (node.op === "field") return onPanel(fields, node.field)
  if (node.op !== "OR") return false
  return node.rules.every((rule) => rule.op === "field" && onPanel(fields, rule.field))
}

/** The chosen values of the panel, each with the link that takes it off. */
function facetChips(panel: FacetPanelView | null, locale: Locale): ConditionChip[] {
  if (panel === null) return []
  const words = messagesFor(locale).search.refine
  return panel.categories.flatMap((category) => category.facets.flatMap((facet) => {
    const range = facet.range
    // A range is in force when one of its ends is written; the link that lifts
    // it is the facet's own, which is the same search either way.
    if (range !== null && (range.from !== "" || range.to !== "") && facet.clearHref !== null) {
      return [{ field: facet.label, value: writtenRange(range, words), href: facet.clearHref }]
    }
    return facet.values
      .filter((value) => value.selected)
      .map((value) => ({ field: facet.label, value: value.label, href: value.href }))
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
  const requestedOrder = request.url.searchParams.get("order")
  const expanded = request.url.searchParams.get("facet")
  const find = request.url.searchParams.get("find") ?? ""
  const ast = parsed.ok ? parsed.ast : null
  const sort = isSortKey(requestedSort) ? requestedSort : DEFAULT_SORT
  const order = isSortOrder(requestedOrder) ? requestedOrder : defaultOrder(sort)
  // A size that is not one of the offered ones is ignored rather than refused,
  // for the same reason an unusable ordering is: it can only have come from a
  // hand-written address, and the listing it names still exists.
  const askedSize = Number(request.url.searchParams.get("size") ?? "")
  const size: PageSize = isPageSize(askedSize) ? askedSize : PAGE_SIZE

  const empty: ListShell = {
    locale,
    keyword: "",
    conditions: [],
    clearHref: null,
    query: serializeQuery(ast),
    parseError: parsed.ok ? null : parsed.error,
    sort,
    requestedSort: isSortKey(requestedSort) ? requestedSort : null,
    order,
    requestedOrder: isSortOrder(requestedOrder) ? requestedOrder : null,
    size,
    requestedSize: size === PAGE_SIZE ? null : size,
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
      order,
      page: readPage(request.url.searchParams.get("page")),
      size,
    }),
    ast === null ? Promise.resolve(null) : countMatches(db, { target: other, ast, fields }),
    facetPanel(db, {
      target,
      ast,
      fields,
      definitions,
      locale,
      sort: isSortKey(requestedSort) ? requestedSort : null,
      order: isSortOrder(requestedOrder) ? requestedOrder : null,
      size: size === PAGE_SIZE ? null : size,
      expanded,
      find,
      code: request.url.searchParams.get("code") ?? "",
      today: today(),
    }),
  ])

  const at = (rest: readonly QueryNode[]) =>
    href(locale, listPath(target) + searchQuery({
      q: serializeQuery(group("AND", rest)),
      sort: isSortKey(requestedSort) ? requestedSort : null,
      order: isSortOrder(requestedOrder) ? requestedOrder : null,
      page: 1,
      size: size === PAGE_SIZE ? null : size,
      facet: expanded,
      find,
    }))

  const held = inForce(ast)
  const conditions = held.flatMap((condition, index): ConditionChip[] => {
    if (shownByPanel(condition, fields)) return []
    return [{
      ...describeCondition(condition, locale),
      href: at(held.filter((_, other) => other !== index)),
    }]
  })
  const listed = [...conditions, ...facetChips(panel, locale)]

  return {
    shell: {
      ...empty,
      keyword: split.keyword,
      conditions: listed,
      clearHref: listed.length === 0 ? null : at([]),
      facets: panel,
      total: result.total,
      page: result.page,
      pageCount: result.pageCount,
      rangeFrom: result.total === 0 ? 0 : (result.page - 1) * size + 1,
      rangeTo: Math.min(result.page * size, result.total),
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
  return { ...shell, rows: await researchRowsOf(hits, catalog, shell.locale) }
}

/**
 * The rows behind a set of hits. The screen asks for a page of them and the
 * export for all of them, and neither may show the other something different.
 */
async function researchRowsOf(
  hits: SearchHit[],
  catalog: CatalogView,
  locale: Locale,
): Promise<ResearchListRowView[]> {
  const db = getDb()
  const ids = hits.map((hit) => hit.targetId)
  const [snapshots, datasetRows, facetRows] = await Promise.all([
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
    facetTermsByResearch(ids, catalog, [ACCESS_TYPE_KEY, PLATFORM_KEY]),
  ])

  const contentOf = new Map(snapshots.map((row) => [row.researchId, row.content]))
  const labelOf = new Map(datasetRows.flatMap((row) =>
    row.label === null ? [] : [[row.datasetId, row.label] as const]))

  return hits.flatMap((hit) => {
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
      accessTermIds: facetRows.get(hit.targetId)?.get(ACCESS_TYPE_KEY) ?? [],
      platformTermIds: facetRows.get(hit.targetId)?.get(PLATFORM_KEY) ?? [],
      datePublished: hit.datePublished,
      dateModified: hit.dateModified,
    }, locale, catalog)]
  })
}

/**
 * The facet values a research holds under each of the given keys, kept by the
 * key's code.
 *
 * **The research rows only.** A research row already holds the union of what
 * its datasets carry (`app/search/rebuild.server.ts`), so leaving the dataset
 * rows in would read the same values twice over and then throw the second copy
 * away. **The keys are asked for together** for the same reason: a column of
 * the listing each would be a query each, over the same twenty rows.
 */
async function facetTermsByResearch(
  researchIds: readonly string[],
  catalog: CatalogView,
  codes: readonly string[],
): Promise<Map<string, Map<string, string[]>>> {
  const codeOf = new Map(codes.flatMap((code) => {
    const key = catalog.keyByCode.get(code)
    return key === undefined ? [] : [[key.id, code] as const]
  }))
  if (codeOf.size === 0) return new Map()
  const rows = await getDb()
    .select({
      researchId: searchDoc.researchId,
      keyId: searchFacetTerm.keyId,
      termId: searchFacetTerm.termId,
    })
    .from(searchFacetTerm)
    .innerJoin(searchDoc, eq(searchDoc.id, searchFacetTerm.docId))
    .where(and(
      inArray(searchFacetTerm.keyId, [...codeOf.keys()]),
      eq(searchDoc.targetType, "research"),
      inArray(searchDoc.researchId, [...researchIds]),
    ))
  const byResearch = new Map<string, Map<string, string[]>>()
  for (const row of rows) {
    const code = codeOf.get(row.keyId)
    if (code === undefined) continue
    const held = byResearch.get(row.researchId) ?? new Map<string, string[]>()
    const under = held.get(code)
    if (under === undefined) held.set(code, [row.termId])
    else under.push(row.termId)
    byResearch.set(row.researchId, held)
  }
  return byResearch
}

export async function datasetListPage(
  request: { locale: Locale, url: URL },
): Promise<DatasetListView> {
  const { shell, hits, catalog } = await listShell("dataset", request)
  if (hits.length === 0) return { ...shell, rows: [] }
  return { ...shell, rows: await datasetRowsOf(hits, catalog, shell.locale) }
}

async function datasetRowsOf(
  hits: SearchHit[],
  catalog: CatalogView,
  locale: Locale,
): Promise<DatasetListRowView[]> {
  const ids = hits.map((hit) => hit.targetId)
  const contents = await getDb()
    .select({ datasetId: datasetContent.datasetId, content: datasetContent.content })
    .from(datasetContent)
    .where(inArray(datasetContent.datasetId, ids))
  const contentOf = new Map(contents.map((row) => [row.datasetId, row.content]))

  return hits.flatMap((hit) => {
    const content = contentOf.get(hit.targetId)
    if (content === undefined || hit.datasetLabel === null) return []
    return [datasetListRowView({
      id: hit.targetId,
      label: hit.datasetLabel,
      humLabel: hit.humLabel,
      content: publicDatasetContent(content, { keys: catalog.keyById, files: [] }, PUBLISHED),
      datePublished: hit.datePublished,
      dateModified: hit.dateModified,
    }, locale, catalog)]
  })
}

/**
 * The datasets a reader has collected, in the order they collected them.
 *
 * **Read from the same rows as the listings**, so a dataset that has since been
 * withdrawn is simply not among them — the cart is held in the browser and can
 * name something the portal no longer publishes, and the screen says so rather
 * than inventing a row for it.
 */
export async function cartRows(
  labels: readonly string[],
  locale: Locale,
): Promise<DatasetListRowView[]> {
  if (labels.length === 0) return []
  const db = getDb()
  const catalog = await loadCatalog(db)
  const docs = await db
    .select({
      targetId: searchDoc.targetId,
      humLabel: searchDoc.humLabel,
      datasetLabel: searchDoc.datasetLabel,
      datePublished: searchDoc.datePublished,
      dateModified: searchDoc.dateModified,
    })
    .from(searchDoc)
    .where(and(eq(searchDoc.targetType, "dataset"), inArray(searchDoc.datasetLabel, [...labels])))

  const found = new Map(docs.map((row) => [row.datasetLabel, row]))
  const hits = labels.flatMap((label): SearchHit[] => {
    const doc = found.get(label)
    return doc === undefined ? [] : [{ ...doc }]
  })
  return datasetRowsOf(hits, catalog, locale)
}

/**
 * Every hit a search matched, with no page and no panel.
 *
 * The export is the same search as the screen's and reads the address the same
 * way, but none of the rest of a listing applies to a file: there are no chips
 * to draw, no facet counts to run, and no other listing to count.
 */
async function everyHit(
  target: SearchTarget,
  request: { locale: Locale, url: URL },
): Promise<{ hits: SearchHit[], catalog: CatalogView } | null> {
  const db = getDb()
  const [catalog, definitions] = await Promise.all([loadCatalog(db), loadFacetDefinitions(db)])
  const fields = queryFields(definitions.map((one) => one.field))
  const parsed = parseQuery(request.url.searchParams.get("q") ?? "", fields)
  // **A query that cannot be read has no answer.** Treating it as the empty
  // query would hand over the whole corpus under the name of a search that
  // matched nothing.
  if (!parsed.ok) return null
  const requestedSort = request.url.searchParams.get("sort")
  const requestedOrder = request.url.searchParams.get("order")
  const sort = isSortKey(requestedSort) ? requestedSort : DEFAULT_SORT
  const order = isSortOrder(requestedOrder) ? requestedOrder : defaultOrder(sort)
  return {
    hits: await searchAllDocs(db, { target, ast: parsed.ast, fields, sort, order }),
    catalog,
  }
}

/**
 * The research listing as a table.
 *
 * **The screen's columns without the mark.** A file has nowhere to put a study
 * into a cart, and everything else a row holds is drawn on screen as well — so
 * what a reader takes away is what they were looking at.
 */
export async function researchExportTable(
  request: { locale: Locale, url: URL },
): Promise<ExportTable | null> {
  const found = await everyHit("research", request)
  if (found === null) return null
  const rows = await researchRowsOf(found.hits, found.catalog, request.locale)
  const messages = messagesFor(request.locale)
  const t = messages.research
  const short = t.listingSummary
  return {
    headers: [
      t.researchId,
      t.datasets,
      t.title,
      short.methods,
      short.typeOfData,
      t.platforms,
      short.targets,
      messages.dataset.accessType,
      t.dataProvider,
      messages.dataset.datePublished,
      messages.dataset.dateModified,
    ],
    rows: rows.map((row) => [
      row.humLabel,
      row.datasetLabels.join(", "),
      fieldText(row.title),
      fieldText(row.methods),
      fieldText(row.typeOfData),
      row.platforms.map((term) => term.label).join(", "),
      fieldText(row.targets),
      row.accessTypes.map((term) => term.label).join(", "),
      row.dataProviders.map(fieldText).join(", "),
      row.datePublished ?? "",
      row.dateModified ?? "",
    ]),
  }
}

export async function datasetExportTable(
  request: { locale: Locale, url: URL },
): Promise<ExportTable | null> {
  const found = await everyHit("dataset", request)
  if (found === null) return null
  const rows = await datasetRowsOf(found.hits, found.catalog, request.locale)
  const messages = messagesFor(request.locale)
  const d = messages.dataset
  return {
    headers: [
      d.datasetId,
      messages.research.researchId,
      d.typeOfData,
      d.experiments,
      d.accessType,
      d.datePublished,
      d.dateModified,
    ],
    rows: rows.map((row) => [
      row.label,
      row.humLabel,
      row.typeOfData === null ? "" : fieldText(row.typeOfData),
      row.experimentLabels.join(", "),
      row.accessType?.label ?? "",
      row.datePublished ?? "",
      row.dateModified ?? "",
    ]),
  }
}
