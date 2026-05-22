/**
 * Facet Type Definitions
 *
 * Centralized facet name definitions for type safety.
 */
import "@hono/zod-openapi"
import { z } from "zod"

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
  "tissues",
  "population",
  "platform",
  "libraryKits",
  "readType",
  "referenceGenome",
  "fileTypes",
  "processedDataTypes",
  "disease",
  "diseaseIcd10",
  "cellLine",
  "policyId",
  "isTumor",
  "hasPhenotypeData",
] as const

export type DatasetFacetName = (typeof DATASET_FACET_NAMES)[number]

/**
 * Available facet names for Research search
 * (Research uses a subset of Dataset facets when filtering by linked datasets)
 */
export const RESEARCH_FACET_NAMES = DATASET_FACET_NAMES

export type ResearchFacetName = DatasetFacetName

/**
 * Facet value with count (Zod schema)
 *
 * The meaning of `count` depends on the endpoint that returned it:
 * - `POST /research/search` (includeFacets=true): number of unique Researches (humId cardinality)
 * - `POST /dataset/search` (includeFacets=true): number of unique Datasets (datasetId cardinality)
 * - `GET /facets`, `GET /facets/{fieldName}`: depends on the `countBy` query parameter
 *   ("research" = humId cardinality, "dataset" = datasetId cardinality; defaults to "dataset")
 */
export const FacetValueSchema = z.object({
  value: z.string()
    .describe("The facet value (e.g., 'WGS', 'Controlled-access (Type I)')"),
  count: z.number()
    .describe(
      "Number of unique entities matching this facet value. "
      + "Research list endpoints count unique Researches (humId); "
      + "Dataset list endpoints count unique Datasets (datasetId). "
      + "For GET /facets, the counted entity is controlled by the countBy query parameter.",
    ),
})
export type FacetValue = z.infer<typeof FacetValueSchema>

/**
 * Facets map (explicit object with all 20 facet fields)
 */
const facetField = z.array(FacetValueSchema).optional()
export const FacetsMapSchema = z.object({
  criteria: facetField,
  assayType: facetField,
  healthStatus: facetField,
  subjectCountType: facetField,
  sex: facetField,
  ageGroup: facetField,
  tissues: facetField,
  population: facetField,
  platform: facetField,
  libraryKits: facetField,
  readType: facetField,
  referenceGenome: facetField,
  fileTypes: facetField,
  processedDataTypes: facetField,
  disease: facetField,
  diseaseIcd10: facetField,
  cellLine: facetField,
  policyId: facetField,
  isTumor: facetField,
  hasPhenotypeData: facetField,
}).describe("Map of facet field names to their available values with counts")
export type FacetsMap = z.infer<typeof FacetsMapSchema>

/**
 * Check if a string is a valid facet name
 */
export function isValidFacetName(name: string): name is DatasetFacetName {
  return (DATASET_FACET_NAMES as readonly string[]).includes(name)
}
