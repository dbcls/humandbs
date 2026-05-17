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
import type {
  DatasetSearchBody,
  DatasetSearchQuery,
  ResearchSearchBody,
  ResearchSearchQuery,
} from "@/api/types"
import type { LangType } from "@/api/types/common"

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

// === Multi-Match Query Builders ===

// term completes exact-match (boost 10), prefix catches partial typing like "hum000" (boost 5).
// case_insensitive lets "HUM0001" match "hum0001".
const buildIdMatchClauses = (
  fields: readonly ("humId" | "datasetId")[],
  q: string,
): QueryContainer[] => {
  const clauses: QueryContainer[] = []
  for (const field of fields) {
    clauses.push({ term: { [field]: { value: q, case_insensitive: true, boost: 10 } } })
    clauses.push({ prefix: { [field]: { value: q, case_insensitive: true, boost: 5 } } })
  }

  return clauses
}

// AUTO:5,12 で「0-4 文字: 距離 0 / 5-11 文字: 距離 1 / 12+ 文字: 距離 2」。
// 10 文字の JGAD ID が distance 2 で別番号と誤マッチするのを避けつつ英語 typo 吸収を残す。
const FULL_TEXT_FUZZINESS = "AUTO:5,12" as const

export const buildDatasetMultiMatchQuery = (q: string): QueryContainer => ({
  bool: {
    minimum_should_match: 1,
    should: [
      {
        multi_match: {
          query: q,
          fields: [
            "typeOfData.ja^2",
            "typeOfData.en^2",
            "experiments.searchable.targets",
          ],
          type: "best_fields",
          fuzziness: FULL_TEXT_FUZZINESS,
        },
      },
      ...buildIdMatchClauses(["humId", "datasetId"], q),
    ],
  },
})

export const buildResearchMultiMatchQuery = (q: string): QueryContainer => ({
  bool: {
    minimum_should_match: 1,
    should: [
      {
        multi_match: {
          query: q,
          fields: [
            "title.ja^2",
            "title.en^2",
            "summary.aims.ja.text",
            "summary.aims.en.text",
            "summary.methods.ja.text",
            "summary.methods.en.text",
            "summary.targets.ja.text",
            "summary.targets.en.text",
          ],
          type: "best_fields",
          fuzziness: FULL_TEXT_FUZZINESS,
        },
      },
      ...buildIdMatchClauses(["humId"], q),
    ],
  },
})

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

  return query as Partial<DatasetSearchQuery>
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
