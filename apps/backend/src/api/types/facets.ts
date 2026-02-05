/**
 * Facet Type Definitions
 *
 * Centralized facet name definitions for type safety.
 */
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
 */
export const FacetValueSchema = z.object({
  value: z.string()
    .describe("The facet value (e.g., 'WGS', 'Controlled-access (Type I)')"),
  count: z.number()
    .describe("Number of resources matching this facet value"),
})
export type FacetValue = z.infer<typeof FacetValueSchema>

/**
 * Facets map (record of facet name to array of facet values)
 */
export const FacetsMapSchema = z.record(z.string(), z.array(FacetValueSchema))
  .describe("Map of facet field names to their available values with counts. Facet names include: criteria, assayType, healthStatus, tissues, platform, etc.")
export type FacetsMap = z.infer<typeof FacetsMapSchema>

/**
 * Type-safe facets map (utility type, not Zod schema)
 */
export type TypedFacetsMap = Partial<Record<DatasetFacetName, FacetValue[]>>

/**
 * Check if a string is a valid facet name
 */
export function isValidFacetName(name: string): name is DatasetFacetName {
  return (DATASET_FACET_NAMES as readonly string[]).includes(name)
}
