/**
 * Facet Normalization Processor
 *
 * Normalizes searchable field values using mapping files.
 * Updates structured-json in-place.
 */
import type { SearchableExperimentFields, DiseaseInfo } from "@/crawler/types"

import type { FacetMapping, FacetFieldName } from "./facet-values"
import { FACET_FIELD_NAMES } from "./facet-values"

// Types

/** Result of normalizing a single experiment */
export interface NormalizeExperimentResult {
  updated: boolean
  unmappedValues: Map<FacetFieldName, string[]>
}

/** Result of normalizing a single dataset */
export interface NormalizeDatasetResult {
  experimentsUpdated: number
  unmappedValues: Map<FacetFieldName, string[]>
}

/** Accumulated unmapped values tracker */
export class UnmappedValuesTracker {
  private unmapped = new Map<FacetFieldName, Set<string>>()

  constructor() {
    for (const fieldName of FACET_FIELD_NAMES) {
      this.unmapped.set(fieldName, new Set())
    }
  }

  /** Add unmapped values from a normalize result */
  addFromResult(result: NormalizeExperimentResult | NormalizeDatasetResult): void {
    for (const [fieldName, values] of result.unmappedValues) {
      const fieldUnmapped = this.unmapped.get(fieldName)!
      for (const value of values) {
        fieldUnmapped.add(value)
      }
    }
  }

  /** Get all unmapped values as a summary */
  getSummary(): Map<FacetFieldName, string[]> {
    const result = new Map<FacetFieldName, string[]>()
    for (const [fieldName, values] of this.unmapped) {
      if (values.size > 0) {
        result.set(fieldName, [...values].sort())
      }
    }
    return result
  }

  /** Get total count of unmapped values */
  getTotalCount(): number {
    let count = 0
    for (const values of this.unmapped.values()) {
      count += values.size
    }
    return count
  }
}

// Normalization Logic

/** Normalize a single value using mapping */
export const normalizeValue = (
  value: string,
  mapping: FacetMapping,
): { normalized: string; wasUnmapped: boolean } => {
  const entry = mapping.values.find(e => e.value === value)
  if (!entry) {
    // Value not in mapping - return as-is but mark as unmapped
    return { normalized: value, wasUnmapped: true }
  }
  // If normalizedTo is empty, the value itself is the canonical form
  const normalized = entry.normalizedTo || value
  return { normalized, wasUnmapped: false }
}

/** Normalize an array of values, removing duplicates */
export const normalizeArrayValues = (
  values: string[],
  mapping: FacetMapping,
): { normalized: string[]; unmapped: string[] } => {
  const normalizedSet = new Set<string>()
  const unmapped: string[] = []

  for (const value of values) {
    const result = normalizeValue(value, mapping)
    normalizedSet.add(result.normalized)
    if (result.wasUnmapped) {
      unmapped.push(value)
    }
  }

  return {
    normalized: [...normalizedSet],
    unmapped,
  }
}

/** Normalize a nullable string field */
export const normalizeStringField = (
  value: string | null,
  mapping: FacetMapping,
): { normalized: string | null; unmapped: string | null } => {
  if (value === null || value === undefined) {
    return { normalized: null, unmapped: null }
  }

  const result = normalizeValue(value, mapping)
  return {
    normalized: result.normalized,
    unmapped: result.wasUnmapped ? value : null,
  }
}

/** Normalize diseases array (special handling for DiseaseInfo[]) */
export const normalizeDiseases = (
  diseases: DiseaseInfo[],
  mapping: FacetMapping,
): { normalized: DiseaseInfo[]; unmapped: string[] } => {
  const normalizedMap = new Map<string, DiseaseInfo>()
  const unmapped: string[] = []

  for (const disease of diseases) {
    const result = normalizeValue(disease.label, mapping)
    if (result.wasUnmapped) {
      unmapped.push(disease.label)
    }

    // Use normalized label as key to deduplicate
    // If same label appears multiple times, keep the first one's icd10
    if (!normalizedMap.has(result.normalized)) {
      normalizedMap.set(result.normalized, {
        label: result.normalized,
        icd10: disease.icd10,
      })
    }
  }

  return {
    normalized: [...normalizedMap.values()],
    unmapped,
  }
}

// Experiment Normalization

/** Normalize a single experiment's searchable fields */
export const normalizeExperimentSearchable = (
  searchable: SearchableExperimentFields,
  mappings: Map<FacetFieldName, FacetMapping>,
): NormalizeExperimentResult => {
  const unmappedValues = new Map<FacetFieldName, string[]>()
  let updated = false

  // Create a copy of searchable to modify
  const result = { ...searchable }

  // String fields
  const stringFields: { name: FacetFieldName; key: keyof SearchableExperimentFields }[] = [
    { name: "assayType", key: "assayType" },
    { name: "cellLine", key: "cellLine" },
    { name: "platformModel", key: "platformModel" },
    { name: "platformVendor", key: "platformVendor" },
    { name: "population", key: "population" },
    { name: "referenceGenome", key: "referenceGenome" },
  ]

  for (const { name, key } of stringFields) {
    const mapping = mappings.get(name)
    if (!mapping) continue

    const value = searchable[key] as string | null
    const normalized = normalizeStringField(value, mapping)

    if (normalized.unmapped) {
      unmappedValues.set(name, [normalized.unmapped])
    }

    if (normalized.normalized !== value) {
      (result as Record<string, unknown>)[key] = normalized.normalized
      updated = true
    }
  }

  // Array fields
  const arrayFields: { name: FacetFieldName; key: keyof SearchableExperimentFields }[] = [
    { name: "fileTypes", key: "fileTypes" },
    { name: "libraryKits", key: "libraryKits" },
    { name: "processedDataTypes", key: "processedDataTypes" },
    { name: "tissues", key: "tissues" },
  ]

  for (const { name, key } of arrayFields) {
    const mapping = mappings.get(name)
    if (!mapping) continue

    const values = (searchable[key] as string[]) ?? []
    const normalized = normalizeArrayValues(values, mapping)

    if (normalized.unmapped.length > 0) {
      unmappedValues.set(name, normalized.unmapped)
    }

    // Check if changed (compare sorted arrays)
    const originalSorted = [...values].sort()
    const normalizedSorted = [...normalized.normalized].sort()
    if (JSON.stringify(originalSorted) !== JSON.stringify(normalizedSorted)) {
      (result as Record<string, unknown>)[key] = normalized.normalized
      updated = true
    }
  }

  // Diseases (special handling)
  const diseasesMapping = mappings.get("diseases")
  if (diseasesMapping) {
    const diseases = searchable.diseases ?? []
    const normalized = normalizeDiseases(diseases, diseasesMapping)

    if (normalized.unmapped.length > 0) {
      unmappedValues.set("diseases", normalized.unmapped)
    }

    // Check if changed
    const originalLabels = diseases.map(d => d.label).sort()
    const normalizedLabels = normalized.normalized.map(d => d.label).sort()
    if (JSON.stringify(originalLabels) !== JSON.stringify(normalizedLabels)) {
      result.diseases = normalized.normalized
      updated = true
    }
  }

  return {
    updated,
    unmappedValues,
  }
}

/** Apply normalization result to searchable fields */
export const applyNormalizationResult = (
  searchable: SearchableExperimentFields,
  mappings: Map<FacetFieldName, FacetMapping>,
): SearchableExperimentFields => {
  const result = normalizeExperimentSearchable(searchable, mappings)

  // If not updated, return original
  if (!result.updated) {
    return searchable
  }

  // Re-normalize and return the updated fields
  const normalized = { ...searchable }

  // String fields
  const stringFields: { name: FacetFieldName; key: keyof SearchableExperimentFields }[] = [
    { name: "assayType", key: "assayType" },
    { name: "cellLine", key: "cellLine" },
    { name: "platformModel", key: "platformModel" },
    { name: "platformVendor", key: "platformVendor" },
    { name: "population", key: "population" },
    { name: "referenceGenome", key: "referenceGenome" },
  ]

  for (const { name, key } of stringFields) {
    const mapping = mappings.get(name)
    if (!mapping) continue

    const value = searchable[key] as string | null
    const normalizedResult = normalizeStringField(value, mapping);
    (normalized as Record<string, unknown>)[key] = normalizedResult.normalized
  }

  // Array fields
  const arrayFields: { name: FacetFieldName; key: keyof SearchableExperimentFields }[] = [
    { name: "fileTypes", key: "fileTypes" },
    { name: "libraryKits", key: "libraryKits" },
    { name: "processedDataTypes", key: "processedDataTypes" },
    { name: "tissues", key: "tissues" },
  ]

  for (const { name, key } of arrayFields) {
    const mapping = mappings.get(name)
    if (!mapping) continue

    const values = (searchable[key] as string[]) ?? []
    const normalizedResult = normalizeArrayValues(values, mapping);
    (normalized as Record<string, unknown>)[key] = normalizedResult.normalized
  }

  // Diseases
  const diseasesMapping = mappings.get("diseases")
  if (diseasesMapping) {
    const diseases = searchable.diseases ?? []
    const normalizedResult = normalizeDiseases(diseases, diseasesMapping)
    normalized.diseases = normalizedResult.normalized
  }

  return normalized
}
