/**
 * Centralized filter definitions for Dataset search
 *
 * This module provides a single source of truth for:
 * - ES nested query field mappings
 * - POST-to-GET query parameter conversions
 *
 * Used by:
 * - es-client.ts: Building Elasticsearch queries
 * - routes/search.ts: Converting POST body to GET query format
 */

// === Nested Terms Filter Definitions ===
// Maps query parameters to Elasticsearch nested field paths

export interface NestedTermsFilter {
  /** Query parameter name */
  param: string
  /** Elasticsearch field path (within experiments.searchable) */
  field: string
}

/**
 * Nested terms filters for experiment attributes
 * These are used to filter Datasets by experiment-level facets
 */
export const NESTED_TERMS_FILTERS: NestedTermsFilter[] = [
  { param: "assayType", field: "experiments.searchable.assayType" },
  { param: "tissue", field: "experiments.searchable.tissues" },
  { param: "population", field: "experiments.searchable.population" },
  { param: "fileType", field: "experiments.searchable.fileTypes" },
  { param: "healthStatus", field: "experiments.searchable.healthStatus" },
  { param: "subjectCountType", field: "experiments.searchable.subjectCountType" },
  { param: "sex", field: "experiments.searchable.sex" },
  { param: "ageGroup", field: "experiments.searchable.ageGroup" },
  { param: "libraryKits", field: "experiments.searchable.libraryKits" },
  // platform is handled separately (vendor + model matching)
  { param: "readType", field: "experiments.searchable.readType" },
  { param: "referenceGenome", field: "experiments.searchable.referenceGenome" },
  { param: "processedDataTypes", field: "experiments.searchable.processedDataTypes" },
  { param: "cellLine", field: "experiments.searchable.cellLine" },
]

// === Nested Range Filter Definitions ===

export interface NestedRangeFilter {
  /** Query parameter name for minimum value */
  minParam: string
  /** Query parameter name for maximum value */
  maxParam: string
  /** Elasticsearch field path (within experiments.searchable) */
  field: string
}

/**
 * Nested range filters for numeric experiment attributes
 * These are used to filter Datasets by numeric ranges
 */
export const NESTED_RANGE_FILTERS: NestedRangeFilter[] = [
  { minParam: "minSubjects", maxParam: "maxSubjects", field: "experiments.searchable.subjectCount" },
  { minParam: "minReadLength", maxParam: "maxReadLength", field: "experiments.searchable.readLength" },
  { minParam: "minSequencingDepth", maxParam: "maxSequencingDepth", field: "experiments.searchable.sequencingDepth" },
  { minParam: "minTargetCoverage", maxParam: "maxTargetCoverage", field: "experiments.searchable.targetCoverage" },
  { minParam: "minDataVolumeGb", maxParam: "maxDataVolumeGb", field: "experiments.searchable.dataVolumeGb" },
  { minParam: "minVariantSnv", maxParam: "maxVariantSnv", field: "experiments.searchable.variantCounts.snv" },
  { minParam: "minVariantIndel", maxParam: "maxVariantIndel", field: "experiments.searchable.variantCounts.indel" },
  { minParam: "minVariantCnv", maxParam: "maxVariantCnv", field: "experiments.searchable.variantCounts.cnv" },
  { minParam: "minVariantSv", maxParam: "maxVariantSv", field: "experiments.searchable.variantCounts.sv" },
  { minParam: "minVariantTotal", maxParam: "maxVariantTotal", field: "experiments.searchable.variantCounts.total" },
]

// === POST Body to GET Query Mappings ===
// Used for converting POST /research/search and POST /dataset/search bodies
// to the GET query format that searchResearches/searchDatasets expect

export interface ArrayFieldMapping {
  /** POST body field name (in DatasetFilters) */
  from: string
  /** GET query parameter name */
  to: string
}

/**
 * Array field mappings for POST-to-GET conversion
 * POST uses arrays, GET uses comma-separated strings
 */
export const ARRAY_FIELD_MAPPINGS: ArrayFieldMapping[] = [
  { from: "criteria", to: "criteria" },
  { from: "subjectCountType", to: "subjectCountType" },
  { from: "healthStatus", to: "healthStatus" },
  { from: "diseaseIcd10", to: "diseaseIcd10" },
  { from: "tissue", to: "tissue" },
  { from: "cellLine", to: "cellLine" },
  { from: "population", to: "population" },
  { from: "sex", to: "sex" },
  { from: "ageGroup", to: "ageGroup" },
  { from: "assayType", to: "assayType" },
  { from: "libraryKits", to: "libraryKits" },
  { from: "platform", to: "platform" },
  { from: "readType", to: "readType" },
  { from: "referenceGenome", to: "referenceGenome" },
  { from: "fileType", to: "fileType" },
  { from: "processedDataTypes", to: "processedDataTypes" },
  { from: "policyId", to: "policyId" },
]

export interface RangeFieldMapping {
  /** POST body field name (in DatasetFilters) */
  from: string
  /** GET query parameter name for minimum */
  minTo: string
  /** GET query parameter name for maximum */
  maxTo: string
}

/**
 * Range field mappings for POST-to-GET conversion
 * POST uses {min, max} objects, GET uses separate minX/maxX params
 */
export const RANGE_FIELD_MAPPINGS: RangeFieldMapping[] = [
  { from: "releaseDate", minTo: "minReleaseDate", maxTo: "maxReleaseDate" },
  { from: "subjectCount", minTo: "minSubjects", maxTo: "maxSubjects" },
  { from: "readLength", minTo: "minReadLength", maxTo: "maxReadLength" },
  { from: "sequencingDepth", minTo: "minSequencingDepth", maxTo: "maxSequencingDepth" },
  { from: "targetCoverage", minTo: "minTargetCoverage", maxTo: "maxTargetCoverage" },
  { from: "dataVolumeGb", minTo: "minDataVolumeGb", maxTo: "maxDataVolumeGb" },
  { from: "variantSnv", minTo: "minVariantSnv", maxTo: "maxVariantSnv" },
  { from: "variantIndel", minTo: "minVariantIndel", maxTo: "maxVariantIndel" },
  { from: "variantCnv", minTo: "minVariantCnv", maxTo: "maxVariantCnv" },
  { from: "variantSv", minTo: "minVariantSv", maxTo: "maxVariantSv" },
  { from: "variantTotal", minTo: "minVariantTotal", maxTo: "maxVariantTotal" },
]
