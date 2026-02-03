/**
 * Elasticsearch query helper functions
 *
 * This module provides helper functions for building nested and double-nested
 * Elasticsearch queries used in search operations.
 */
import type { estypes } from "@elastic/elasticsearch"

/** nested + terms query */
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

/** nested + range query */
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

/** double nested + wildcard query */
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

/** double nested + terms query */
export const doubleNestedTermsQuery = (
  outerPath: string,
  innerPath: string,
  field: string,
  values: string[],
): estypes.QueryDslQueryContainer => ({
  nested: {
    path: outerPath,
    query: {
      nested: {
        path: innerPath,
        query: { terms: { [field]: values } },
      },
    },
  },
})

/** nested + boolean term query */
export const nestedBooleanTermQuery = (
  path: string,
  field: string,
  value: boolean,
): estypes.QueryDslQueryContainer => ({
  nested: {
    path,
    query: { term: { [field]: value } },
  },
})
