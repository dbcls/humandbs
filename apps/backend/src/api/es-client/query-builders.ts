/**
 * Pure functions for building Elasticsearch query components
 *
 * This module provides:
 * - Sort spec builders (dataset, research)
 * - Multi-match query builders (dataset, research)
 * - Date range filter builder (research)
 * - POST search body -> GET-equivalent query normalisers
 */
import type { estypes } from "@elastic/elasticsearch"

import { ARRAY_FIELD_MAPPINGS, RANGE_FIELD_MAPPINGS } from "@/api/es-client/filters"
import { classifyIdToken, type IdField } from "@/api/es-client/id-patterns"
import type {
  DatasetSearchBody,
  DatasetSearchQuery,
  ResearchSearchBody,
  ResearchSearchQuery,
} from "@/api/types"
import type { LangType } from "@/api/types/common"
import { CATCH_ALL_FIELD } from "@/es/generate-mapping"

type QueryContainer = estypes.QueryDslQueryContainer

/** Script-based sort for version fields (v1, v2, ..., v10, ...) to avoid lexicographic ordering */
export const versionSortSpec = (order: "asc" | "desc"): estypes.SortCombinations => ({
  _script: {
    type: "number" as const,
    script: { source: "Integer.parseInt(doc['version'].value.substring(1))" },
    order,
  },
})

// === Sort Default Resolvers ===

// Per docs/api-guide.md § sort / order の default:
//   query 指定あり → sort default = relevance
//   query 指定なし → sort default = humId / datasetId
// Schemas surface `sort` as optional so the GET and POST search paths can
// share these resolvers instead of fighting Zod defaults.

export type ResearchSortField = "humId" | "title" | "releaseDate" | "datePublished" | "dateModified" | "relevance"
export type DatasetSortField = "datasetId" | "releaseDate" | "relevance"

export const resolveResearchSort = (
  sort: ResearchSortField | undefined,
  hasQuery: boolean,
): ResearchSortField => sort ?? (hasQuery ? "relevance" : "humId")

export const resolveDatasetSort = (
  sort: DatasetSortField | undefined,
  hasQuery: boolean,
): DatasetSortField => sort ?? (hasQuery ? "relevance" : "datasetId")

// === Sort Spec Builders ===

export const buildDatasetSortSpec = (
  sort: "datasetId" | "releaseDate" | "relevance",
  order: "asc" | "desc",
  hasQuery: boolean,
): estypes.Sort => {
  if (sort === "relevance" && hasQuery) {
    return [{ _score: { order: "desc" } }, { datasetId: { order: "asc" } }]
  }
  if (sort === "releaseDate") {
    return [{ releaseDate: { order, missing: "_last" } }, { datasetId: { order: "asc" } }]
  }

  return [{ datasetId: { order } }]
}

export const buildResearchSortSpec = (
  sort: "humId" | "title" | "releaseDate" | "datePublished" | "dateModified" | "relevance",
  order: "asc" | "desc",
  lang: LangType,
  hasQuery: boolean,
): estypes.Sort => {
  if (sort === "relevance" && hasQuery) {
    return [{ _score: { order: "desc" } }, { humId: { order: "asc" } }]
  }
  if (sort === "relevance") {
    return [{ humId: { order } }]
  }
  if (sort === "title") {
    const titleKw = lang === "en" ? "title.en.kw" : "title.ja.kw"

    return [{ [titleKw]: { order } }, { humId: { order: "asc" } }]
  }
  if (sort === "releaseDate" || sort === "dateModified") {
    return [{ dateModified: { order, missing: "_last" } }, { humId: { order: "asc" } }]
  }
  if (sort === "datePublished") {
    return [{ datePublished: { order, missing: "_last" } }, { humId: { order: "asc" } }]
  }

  return [{ humId: { order } }]
}

// === Free-Text Query Parsing & Clause Building ===

// Tokens containing one of these chars are treated as a phrase (match_phrase) so
// the analyzer does not split them and inflate hit counts (e.g. gene symbol
// `HIF-1`). Mirrors DDBJ ddbj-search-api `search/phrase.py § ES_AUTO_PHRASE_CHARS`.
// docs/api-guide.md § 全文一致のセマンティクス.
const PHRASE_TRIGGER_CHARS = /[-/.+:]/

// Trailing-prefix (`match_phrase_prefix`) requires this many literal chars on the
// last word, so a 1-char prefix does not scan a huge term space.
const MIN_PREFIX_LITERAL_LEN = 2

// Field lists for the natural-language clause: the all_text catch-all carries the
// AND requirement (it aggregates the whole document), and the boosted field lifts
// matches in the resource's headline field for ranking.
const DATASET_TEXT_FIELDS = [CATCH_ALL_FIELD, "typeOfData.ja^2", "typeOfData.en^2"]
const RESEARCH_TEXT_FIELDS = [CATCH_ALL_FIELD, "title.ja^2", "title.en^2"]

export interface ParsedFreeTextQuery {
  /** ID-shaped tokens → exact term/prefix lookup (never all_text). */
  idTokens: { field: IdField; value: string }[]
  /** Quoted or symbol-containing tokens → exact phrase match. */
  phraseTokens: string[]
  /** Plain tokens → AND match across the text fields. */
  bareWords: string[]
  /** The last token overall is a bare word eligible for the trailing prefix. */
  lastIsBare: boolean
}

/**
 * Split a raw free-text query into ID / phrase / bare tokens.
 *
 * Evaluation order per token is **ID → quote/symbol → bare** so that an ID whose
 * shape contains an auto-phrase char (`E-GEAD-1051`, `hum0013.v1.freq.v1`) is
 * routed to the ID path, not phrased. docs/api-guide.md § フリーテキスト検索.
 */
export const classifyFreeTextQuery = (q: string): ParsedFreeTextQuery => {
  const idTokens: { field: IdField; value: string }[] = []
  const phraseTokens: string[] = []
  const bareWords: string[] = []
  let lastIsBare = false

  // A double-quoted run stays one token (spans spaces); everything else splits on
  // whitespace.
  const rawTokens = q.match(/"[^"]*"|\S+/g) ?? []
  for (const raw of rawTokens) {
    if (raw.length >= 2 && raw.startsWith("\"") && raw.endsWith("\"")) {
      const inner = raw.slice(1, -1).trim()
      if (inner) {
        phraseTokens.push(inner)
        lastIsBare = false
      }
      continue
    }
    const token = raw.replace(/"/g, "")
    if (!token) continue
    const field = classifyIdToken(token)
    if (field) {
      idTokens.push({ field, value: token })
      lastIsBare = false
    } else if (PHRASE_TRIGGER_CHARS.test(token)) {
      phraseTokens.push(token)
      lastIsBare = false
    } else {
      bareWords.push(token)
      lastIsBare = true
    }
  }

  return { idTokens, phraseTokens, bareWords, lastIsBare }
}

/** True when the parsed query carries any matchable token. */
export const hasFreeTextQuery = (parsed: ParsedFreeTextQuery): boolean =>
  parsed.idTokens.length > 0 || parsed.phraseTokens.length > 0 || parsed.bareWords.length > 0

// term gives exact-match (boost 10), prefix catches partial typing like "hum000"
// (boost 5). case_insensitive lets "HUM0001" / "jgad000001" match. Multiple values
// for one field are OR-ed.
const buildIdFieldClause = (field: IdField, values: readonly string[]): QueryContainer => ({
  bool: {
    minimum_should_match: 1,
    should: values.flatMap((v) => [
      { term: { [field]: { value: v, case_insensitive: true, boost: 10 } } },
      { prefix: { [field]: { value: v, case_insensitive: true, boost: 5 } } },
    ]),
  },
})

// Natural-language clauses (ANDed by the caller): bare words AND-match across the
// fields (the AND requirement is met via the all_text catch-all); the trailing
// bare word also gets match_phrase_prefix for type-ahead. Phrase / symbol / quoted
// tokens are exact match_phrase.
const buildTextClauses = (parsed: ParsedFreeTextQuery, fields: string[]): QueryContainer[] => {
  const clauses: QueryContainer[] = []
  if (parsed.bareWords.length > 0) {
    const text = parsed.bareWords.join(" ")
    const andClause: QueryContainer = { multi_match: { query: text, fields, operator: "and" } }
    const lastWord = parsed.bareWords[parsed.bareWords.length - 1]
    if (parsed.lastIsBare && lastWord.length >= MIN_PREFIX_LITERAL_LEN) {
      clauses.push({
        bool: {
          minimum_should_match: 1,
          should: [
            andClause,
            { multi_match: { query: text, fields, type: "phrase_prefix" } },
          ],
        },
      })
    } else {
      clauses.push(andClause)
    }
  }
  for (const phrase of parsed.phraseTokens) {
    clauses.push({ multi_match: { query: phrase, fields, type: "phrase" } })
  }

  return clauses
}

/**
 * must-clauses for the free-text portion of a Dataset search. ID tokens become
 * exact term/prefix filters on humId / datasetId; the natural-language part is
 * AND-matched against the text fields. Returns `[]` for an empty query.
 */
export const buildDatasetQueryClauses = (parsed: ParsedFreeTextQuery): QueryContainer[] => {
  const clauses: QueryContainer[] = []
  const humIds = parsed.idTokens.filter((t) => t.field === "humId").map((t) => t.value)
  const datasetIds = parsed.idTokens.filter((t) => t.field === "datasetId").map((t) => t.value)
  if (humIds.length > 0) clauses.push(buildIdFieldClause("humId", humIds))
  if (datasetIds.length > 0) clauses.push(buildIdFieldClause("datasetId", datasetIds))
  clauses.push(...buildTextClauses(parsed, DATASET_TEXT_FIELDS))

  return clauses
}

/**
 * must-clauses for the free-text portion of a Research search. humId tokens
 * filter directly; datasetId tokens cannot match Research, so the caller resolves
 * them to parent humIds (async, Dataset index) and passes them as
 * `datasetParentHumIds` — an empty list then narrows to zero results (the
 * datasetId matched no resource). Returns `[]` for an empty query.
 */
export const buildResearchQueryClauses = (
  parsed: ParsedFreeTextQuery,
  datasetParentHumIds: readonly string[],
): QueryContainer[] => {
  const clauses: QueryContainer[] = []
  const humIds = parsed.idTokens.filter((t) => t.field === "humId").map((t) => t.value)
  if (humIds.length > 0) clauses.push(buildIdFieldClause("humId", humIds))
  if (parsed.idTokens.some((t) => t.field === "datasetId")) {
    clauses.push({ terms: { humId: [...datasetParentHumIds] } })
  }
  clauses.push(...buildTextClauses(parsed, RESEARCH_TEXT_FIELDS))

  return clauses
}

/** datasetId tokens whose parent humIds a Research search must resolve. */
export const datasetIdTokens = (parsed: ParsedFreeTextQuery): string[] =>
  parsed.idTokens.filter((t) => t.field === "datasetId").map((t) => t.value)

// === POST Body → Query Normalisation ===

interface RangeValue { min?: string | number; max?: string | number }

/**
 * Convert DatasetFilters (POST format) to query params (GET format)
 * POST uses arrays, GET uses comma-separated strings
 */
export const convertDatasetFiltersToQuery = (
  filters: DatasetSearchBody["filters"],
): Partial<DatasetSearchQuery> => {
  if (!filters) return {}

  const query: Record<string, unknown> = {}
  const f = filters as Record<string, unknown>

  // Convert array fields to comma-separated strings
  for (const { from, to } of ARRAY_FIELD_MAPPINGS) {
    const value = f[from]
    if (Array.isArray(value) && value.length > 0) {
      query[to] = value.join(",")
    }
  }

  // Convert range fields
  for (const { from, minTo, maxTo } of RANGE_FIELD_MAPPINGS) {
    const range = f[from] as RangeValue | undefined
    if (range?.min !== undefined) {
      query[minTo] = range.min
    }
    if (range?.max !== undefined) {
      query[maxTo] = range.max
    }
  }

  // Direct string fields
  if (filters.disease) query.disease = filters.disease

  // String enum field
  if (filters.isTumor !== undefined) query.isTumor = filters.isTumor

  // Boolean fields
  if (filters.hasPhenotypeData !== undefined) query.hasPhenotypeData = filters.hasPhenotypeData

  return query
}

/**
 * Convert ResearchSearchBody (POST) to ResearchSearchQuery (GET format).
 *
 * `sort` is left undefined when the caller did not provide one; the
 * search layer (`searchResearches`) calls `resolveResearchSort(sort, !!q)`
 * so the default depends on whether `query` is set — matching the GET path.
 */
export const convertResearchBodyToQuery = (body: ResearchSearchBody): ResearchSearchQuery => {
  const datasetFilters = convertDatasetFiltersToQuery(body.datasetFilters)

  return {
    page: body.page,
    limit: body.limit,
    lang: body.lang,
    sort: body.sort,
    order: body.order,
    q: body.query,
    // datePublished range (first release date) — DateRangeFilterSchema enforces ISO 8601 strings
    minDatePublished: body.datePublished?.min,
    maxDatePublished: body.datePublished?.max,
    // dateModified range (last update date)
    minDateModified: body.dateModified?.min,
    maxDateModified: body.dateModified?.max,
    status: body.status,
    includeFacets: body.includeFacets,
    ...datasetFilters,
    // body has zod defaults for `lang` / `order` etc., but the body schemas
    // mark some fields optional that the query schemas surface as required
    // (e.g. `includeRawHtml` defaults to `false` only on the query side).
    // The downstream `searchResearches` handles these as optional, so the cast
    // is safe; field-level type-checking above stays in scope.
  } as ResearchSearchQuery
}

/**
 * Convert DatasetSearchBody (POST) to DatasetSearchQuery (GET format).
 *
 * `sort` is left undefined; `searchDatasets` resolves the default with
 * `resolveDatasetSort(sort, !!q)`.
 */
export const convertDatasetBodyToQuery = (body: DatasetSearchBody): DatasetSearchQuery => {
  const filters = convertDatasetFiltersToQuery(body.filters)

  return {
    page: body.page,
    limit: body.limit,
    lang: body.lang,
    sort: body.sort,
    order: body.order,
    q: body.query,
    humId: body.humId,
    includeFacets: body.includeFacets,
    ...filters,
    // See note on convertResearchBodyToQuery — same body-vs-query optionality.
  } as DatasetSearchQuery
}

// === Date Range Filter Builder ===

export const buildResearchDateRangeFilters = (params: {
  minDatePublished?: string
  maxDatePublished?: string
  minDateModified?: string
  maxDateModified?: string
}): QueryContainer[] => {
  const filters: QueryContainer[] = []

  if (params.minDatePublished) {
    filters.push({ range: { datePublished: { gte: params.minDatePublished } } })
  }
  if (params.maxDatePublished) {
    filters.push({ range: { datePublished: { lte: params.maxDatePublished } } })
  }
  if (params.minDateModified) {
    filters.push({ range: { dateModified: { gte: params.minDateModified } } })
  }
  if (params.maxDateModified) {
    filters.push({ range: { dateModified: { lte: params.maxDateModified } } })
  }

  return filters
}
