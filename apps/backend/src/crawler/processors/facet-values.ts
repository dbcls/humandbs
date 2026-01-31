/**
 * Facet Values Collector
 *
 * Collects unique values from searchable fields across all datasets
 * and generates mapping files for facet normalization.
 */
import type { SearchableExperimentFields, DiseaseInfo } from "@/crawler/types"

// Types

/** Entry for a facet value */
export interface FacetValueEntry {
  value: string
  count: number
  normalizedTo: string
}

/** Facet mapping file structure */
export interface FacetMapping {
  values: FacetValueEntry[]
  total: number
}

/** Facet field names that can be normalized */
export type FacetFieldName =
  | "assayType"
  | "cellLine"
  | "diseases"
  | "fileTypes"
  | "libraryKits"
  | "platformModel"
  | "platformVendor"
  | "population"
  | "processedDataTypes"
  | "referenceGenome"
  | "tissues"

/** All facet field names */
export const FACET_FIELD_NAMES: FacetFieldName[] = [
  "assayType",
  "cellLine",
  "diseases",
  "fileTypes",
  "libraryKits",
  "platformModel",
  "platformVendor",
  "population",
  "processedDataTypes",
  "referenceGenome",
  "tissues",
]

// Value Extraction

/** Extract values from a single searchable fields object */
export const extractValuesFromSearchable = (
  searchable: SearchableExperimentFields,
): Map<FacetFieldName, string[]> => {
  const result = new Map<FacetFieldName, string[]>()

  // String fields (nullable)
  const stringFields: { name: FacetFieldName; value: string | null }[] = [
    { name: "assayType", value: searchable.assayType },
    { name: "cellLine", value: searchable.cellLine },
    { name: "platformModel", value: searchable.platformModel },
    { name: "platformVendor", value: searchable.platformVendor },
    { name: "population", value: searchable.population },
    { name: "referenceGenome", value: searchable.referenceGenome },
  ]

  for (const { name, value } of stringFields) {
    if (value !== null && value !== undefined && value.trim() !== "") {
      result.set(name, [value])
    }
  }

  // Array fields
  const arrayFields: { name: FacetFieldName; values: string[] }[] = [
    { name: "fileTypes", values: searchable.fileTypes ?? [] },
    { name: "libraryKits", values: searchable.libraryKits ?? [] },
    { name: "processedDataTypes", values: searchable.processedDataTypes ?? [] },
    { name: "tissues", values: searchable.tissues ?? [] },
  ]

  for (const { name, values } of arrayFields) {
    const filtered = values.filter(v => v && v.trim() !== "")
    if (filtered.length > 0) {
      result.set(name, filtered)
    }
  }

  // Disease labels (special handling for DiseaseInfo[])
  const diseaseLabels = (searchable.diseases ?? [])
    .map((d: DiseaseInfo) => d.label)
    .filter((label): label is string => label !== null && label !== undefined && label.trim() !== "")

  if (diseaseLabels.length > 0) {
    result.set("diseases", diseaseLabels)
  }

  return result
}

// Value Collection

/** Value counter for collecting unique values with counts */
export class ValueCounter {
  private counts = new Map<FacetFieldName, Map<string, number>>()

  constructor() {
    for (const fieldName of FACET_FIELD_NAMES) {
      this.counts.set(fieldName, new Map())
    }
  }

  /** Add a value to the counter */
  add(fieldName: FacetFieldName, value: string): void {
    const fieldCounts = this.counts.get(fieldName)!
    const current = fieldCounts.get(value) ?? 0
    fieldCounts.set(value, current + 1)
  }

  /** Add multiple values from a searchable fields object */
  addFromSearchable(searchable: SearchableExperimentFields): void {
    const values = extractValuesFromSearchable(searchable)
    for (const [fieldName, fieldValues] of values) {
      for (const value of fieldValues) {
        this.add(fieldName, value)
      }
    }
  }

  /** Get counts for a field */
  getFieldCounts(fieldName: FacetFieldName): Map<string, number> {
    return this.counts.get(fieldName) ?? new Map()
  }

  /** Get all field names */
  getFieldNames(): FacetFieldName[] {
    return FACET_FIELD_NAMES
  }
}

// Mapping Generation

/** Merge existing mapping with new counts, preserving normalizedTo values */
export const mergeWithExistingMapping = (
  counts: Map<string, number>,
  existingMapping: FacetMapping | null,
): FacetMapping => {
  // Create a map of existing normalizedTo values
  const existingNormalizedTo = new Map<string, string>()
  if (existingMapping) {
    for (const entry of existingMapping.values) {
      existingNormalizedTo.set(entry.value, entry.normalizedTo)
    }
  }

  // Build new values array
  const values: FacetValueEntry[] = []
  let total = 0

  for (const [value, count] of counts) {
    values.push({
      value,
      count,
      normalizedTo: existingNormalizedTo.get(value) ?? "",
    })
    total += count
  }

  // Add entries from existing mapping that are no longer present
  // (keep them with count 0 so users can see what was removed)
  if (existingMapping) {
    for (const entry of existingMapping.values) {
      if (!counts.has(entry.value)) {
        values.push({
          value: entry.value,
          count: 0,
          normalizedTo: entry.normalizedTo,
        })
      }
    }
  }

  // Sort by value alphabetically
  values.sort((a, b) => a.value.localeCompare(b.value))

  return { values, total }
}

/** Generate mapping for a single field */
export const generateFieldMapping = (
  counter: ValueCounter,
  fieldName: FacetFieldName,
  existingMapping: FacetMapping | null,
): FacetMapping => {
  const counts = counter.getFieldCounts(fieldName)
  return mergeWithExistingMapping(counts, existingMapping)
}
