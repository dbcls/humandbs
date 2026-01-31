import type { estypes } from "@elastic/elasticsearch"

/** nested + terms クエリ */
export const nestedTermsQuery = (
  path: string,
  field: string,
  values: string[],
): estypes.QueryDslQueryContainer => ({
  nested: {
    path,
    query: { terms: { [field]: values } },
  },
})

/** nested + term クエリ (単一値) */
export const nestedTermQuery = (
  path: string,
  field: string,
  value: string | boolean,
): estypes.QueryDslQueryContainer => ({
  nested: {
    path,
    query: { term: { [field]: value } },
  },
})

/** nested + wildcard クエリ (部分一致) */
export const nestedWildcardQuery = (
  path: string,
  field: string,
  value: string,
): estypes.QueryDslQueryContainer => ({
  nested: {
    path,
    query: {
      wildcard: { [field]: { value: `*${value}*`, case_insensitive: true } },
    },
  },
})

/** nested + exists クエリ */
export const nestedExistsQuery = (
  path: string,
  field: string,
): estypes.QueryDslQueryContainer => ({
  nested: {
    path,
    query: { exists: { field } },
  },
})

/** nested + range クエリ */
export const nestedRangeQuery = (
  path: string,
  field: string,
  range: estypes.QueryDslRangeQuery,
): estypes.QueryDslQueryContainer => ({
  nested: {
    path,
    query: { range: { [field]: range } },
  },
})

/** 二重 nested + wildcard クエリ */
export const doubleNestedWildcardQuery = (
  outerPath: string,
  innerPath: string,
  field: string,
  value: string,
): estypes.QueryDslQueryContainer => ({
  nested: {
    path: outerPath,
    query: {
      nested: {
        path: innerPath,
        query: {
          wildcard: { [field]: { value: `*${value}*`, case_insensitive: true } },
        },
      },
    },
  },
})
