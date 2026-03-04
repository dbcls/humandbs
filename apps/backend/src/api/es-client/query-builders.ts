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

export const buildDatasetMultiMatchQuery = (q: string): QueryContainer => ({
  multi_match: {
    query: q,
    fields: [
      "typeOfData.ja^2",
      "typeOfData.en^2",
      "experiments.header.ja.text",
      "experiments.header.en.text",
      "experiments.searchable.targets",
    ],
    type: "best_fields",
    fuzziness: "AUTO",
  },
})

export const buildResearchMultiMatchQuery = (q: string): QueryContainer => ({
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
    fuzziness: "AUTO",
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
