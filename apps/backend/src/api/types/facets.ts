/**
 * Facet Type Definitions
 *
 * Centralized facet name definitions for type safety.
 */

/**
 * Available facet names for Dataset search
 */
export const DATASET_FACET_NAMES = [
  "criteria",
  "assayType",
  "healthStatus",
  "subjectCountType",
  "sex",
  "ageGroup",
  "tissue",
  "population",
  "platform",
  "libraryKits",
  "readType",
  "referenceGenome",
  "fileType",
  "processedDataTypes",
  "diseaseIcd10",
  "cellLine",
] as const

export type DatasetFacetName = (typeof DATASET_FACET_NAMES)[number]

/**
 * Available facet names for Research search
 * (Research uses a subset of Dataset facets when filtering by linked datasets)
 */
export const RESEARCH_FACET_NAMES = DATASET_FACET_NAMES

export type ResearchFacetName = DatasetFacetName

/**
 * Facet value with count
 */
export interface FacetValue {
  value: string
  count: number
}

/**
 * Type-safe facets map
 */
export type TypedFacetsMap = Partial<Record<DatasetFacetName, FacetValue[]>>

/**
 * Check if a string is a valid facet name
 */
export function isValidFacetName(name: string): name is DatasetFacetName {
  return (DATASET_FACET_NAMES as readonly string[]).includes(name)
}
