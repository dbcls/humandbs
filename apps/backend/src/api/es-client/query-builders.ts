/**
 * Pure functions for building Elasticsearch query components
 *
 * This module provides:
 * - Sort spec builders (dataset, research)
 * - Multi-match query builders (dataset, research)
 * - Date range filter builder (research)
 */
import type { estypes } from "@elastic/elasticsearch"

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
