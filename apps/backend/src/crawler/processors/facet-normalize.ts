/**
 * Facet Normalization Processor
 *
 * Normalizes searchable field values using mapping files.
 * Updates structured-json in-place.
 */
import type { SearchableExperimentFields, PlatformInfo } from "@/crawler/types"

import type { FacetMapping, FacetFieldName } from "./facet-values"
import { FACET_FIELD_NAMES, MAPPING_PENDING } from "./facet-values"

// Types

/** Result of normalizing a single experiment */
export interface NormalizeExperimentResult {
  updated: boolean
  unmappedValues: Map<FacetFieldName, string[]>
  pendingValues: Map<FacetFieldName, string[]>
}

/** Result of normalizing a single dataset */
export interface NormalizeDatasetResult {
  experimentsUpdated: number
  unmappedValues: Map<FacetFieldName, string[]>
  pendingValues: Map<FacetFieldName, string[]>
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

/** Accumulated pending values tracker (values matching __PENDING__ entries) */
export class PendingValuesTracker {
  private pending = new Map<FacetFieldName, Set<string>>()

  constructor() {
    for (const fieldName of FACET_FIELD_NAMES) {
      this.pending.set(fieldName, new Set())
    }
  }

  /** Add pending values from a normalize result */
  addFromResult(result: NormalizeExperimentResult | NormalizeDatasetResult): void {
    for (const [fieldName, values] of result.pendingValues) {
      const fieldPending = this.pending.get(fieldName)!
      for (const value of values) {
        fieldPending.add(value)
      }
    }
  }

  /** Get all pending values as a summary */
  getSummary(): Map<FacetFieldName, string[]> {
    const result = new Map<FacetFieldName, string[]>()
    for (const [fieldName, values] of this.pending) {
      if (values.size > 0) {
        result.set(fieldName, [...values].sort())
      }
    }
    return result
  }

  /** Get total count of pending values */
  getTotalCount(): number {
    let count = 0
    for (const values of this.pending.values()) {
      count += values.size
    }
    return count
  }
}

// Constants

/** Separator for multiple normalized values in TSV */
export const MULTI_VALUE_SEPARATOR = "||"

// Normalization Logic

/**
 * Split a normalizedTo value that may contain multiple targets
 *
 * @example
 * splitNormalizedTo("eQTL||pQTL") // ["eQTL", "pQTL"]
 * splitNormalizedTo("WGS") // ["WGS"]
 * splitNormalizedTo("") // [""]
 */
export const splitNormalizedTo = (normalizedTo: string): string[] => {
  if (!normalizedTo.includes(MULTI_VALUE_SEPARATOR)) {
    return [normalizedTo]
  }
  return normalizedTo.split(MULTI_VALUE_SEPARATOR).map(v => v.trim()).filter(v => v !== "")
}

/**
 * Normalize a single value using mapping
 *
 * Returns:
 * - shouldDelete: true if normalizedTo is null (value should be removed)
 * - normalized: array of normalized values (supports 1-to-many mapping via || separator)
 * - wasUnmapped: true if value was not found in mapping
 * - wasPending: true if value matched a __PENDING__ entry (used as-is)
 */
export const normalizeValue = (
  value: string,
  mapping: FacetMapping,
): { normalized: string[]; wasUnmapped: boolean; shouldDelete: boolean; wasPending: boolean } => {
  const entry = mapping.values.find(e => e.value === value)
  if (!entry) {
    // Value not in mapping - return as-is but mark as unmapped
    return { normalized: [value], wasUnmapped: true, shouldDelete: false, wasPending: false }
  }
  // If normalizedTo is null, mark for deletion (__DELETE__ was converted to null)
  if (entry.normalizedTo === null) {
    return { normalized: [value], wasUnmapped: false, shouldDelete: true, wasPending: false }
  }
  // If normalizedTo is __PENDING__, use original value as-is but mark as pending
  if (entry.normalizedTo === MAPPING_PENDING) {
    return { normalized: [value], wasUnmapped: false, shouldDelete: false, wasPending: true }
  }
  // If normalizedTo is empty, the value itself is the canonical form
  if (entry.normalizedTo === "") {
    return { normalized: [value], wasUnmapped: false, shouldDelete: false, wasPending: false }
  }
  // Split normalizedTo in case it contains multiple targets (e.g., "eQTL||pQTL")
  const normalized = splitNormalizedTo(entry.normalizedTo)
  return { normalized, wasUnmapped: false, shouldDelete: false, wasPending: false }
}

/** Check if a value is empty or whitespace-only */
const isEmptyOrWhitespace = (value: string): boolean => {
  return value.trim() === ""
}

/** Normalize an array of values, removing duplicates and deleted values */
export const normalizeArrayValues = (
  values: string[],
  mapping: FacetMapping,
): { normalized: string[]; unmapped: string[]; deleted: string[]; pending: string[] } => {
  const normalizedSet = new Set<string>()
  const unmapped: string[] = []
  const deleted: string[] = []
  const pending: string[] = []

  for (const value of values) {
    // Skip empty or whitespace-only values
    if (isEmptyOrWhitespace(value)) {
      continue
    }
    const result = normalizeValue(value, mapping)
    if (result.shouldDelete) {
      deleted.push(value)
      continue
    }
    // Add all normalized values (supports 1-to-many mapping)
    for (const normalizedValue of result.normalized) {
      normalizedSet.add(normalizedValue)
    }
    if (result.wasUnmapped) {
      unmapped.push(value)
    }
    if (result.wasPending) {
      pending.push(value)
    }
  }

  return {
    normalized: [...normalizedSet],
    unmapped,
    deleted,
    pending,
  }
}

/** Normalize a nullable string field */
export const normalizeStringField = (
  value: string | null,
  mapping: FacetMapping,
): { normalized: string | null; unmapped: string | null; deleted: boolean; pending: string | null } => {
  if (value === null || value === undefined) {
    return { normalized: null, unmapped: null, deleted: false, pending: null }
  }

  const result = normalizeValue(value, mapping)
  if (result.shouldDelete) {
    return { normalized: null, unmapped: null, deleted: true, pending: null }
  }
  // For string fields, use the first normalized value (multi-value not supported for single fields)
  return {
    normalized: result.normalized[0],
    unmapped: result.wasUnmapped ? value : null,
    deleted: false,
    pending: result.wasPending ? value : null,
  }
}

/** Normalize platforms array (special handling for PlatformInfo[]) */
export const normalizePlatforms = (
  platforms: PlatformInfo[],
  vendorMapping: FacetMapping,
  modelMapping: FacetMapping,
): { normalized: PlatformInfo[]; unmappedVendors: string[]; unmappedModels: string[]; pendingVendors: string[]; pendingModels: string[] } => {
  const normalizedList: PlatformInfo[] = []
  const unmappedVendors: string[] = []
  const unmappedModels: string[] = []
  const pendingVendors: string[] = []
  const pendingModels: string[] = []

  // Use a set to track unique vendor+model combinations
  const seenCombinations = new Set<string>()

  for (const platform of platforms) {
    const vendorResult = normalizeValue(platform.vendor, vendorMapping)
    const modelResult = normalizeValue(platform.model, modelMapping)

    // Skip if either vendor or model should be deleted
    if (vendorResult.shouldDelete || modelResult.shouldDelete) {
      continue
    }

    if (vendorResult.wasUnmapped) {
      unmappedVendors.push(platform.vendor)
    }
    if (modelResult.wasUnmapped) {
      unmappedModels.push(platform.model)
    }
    if (vendorResult.wasPending) {
      pendingVendors.push(platform.vendor)
    }
    if (modelResult.wasPending) {
      pendingModels.push(platform.model)
    }

    // For platforms, use the first normalized value (multi-value not supported for vendor/model)
    const normalizedVendor = vendorResult.normalized[0]
    const normalizedModel = modelResult.normalized[0]
    const key = `${normalizedVendor}|${normalizedModel}`

    // Deduplicate by vendor+model combination
    if (!seenCombinations.has(key)) {
      seenCombinations.add(key)
      normalizedList.push({
        vendor: normalizedVendor,
        model: normalizedModel,
      })
    }
  }

  return {
    normalized: normalizedList,
    unmappedVendors,
    unmappedModels,
    pendingVendors,
    pendingModels,
  }
}

// Experiment Normalization

/** Normalize a single experiment's searchable fields */
export const normalizeExperimentSearchable = (
  searchable: SearchableExperimentFields,
  mappings: Map<FacetFieldName, FacetMapping>,
): NormalizeExperimentResult => {
  const unmappedValues = new Map<FacetFieldName, string[]>()
  const pendingValues = new Map<FacetFieldName, string[]>()
  let updated = false

  // Create a copy of searchable to modify
  const result = { ...searchable }

  // Array fields (excluding platforms which need special handling)
  const arrayFields: { name: FacetFieldName; key: keyof SearchableExperimentFields }[] = [
    { name: "assayType", key: "assayType" },
    { name: "cellLine", key: "cellLine" },
    { name: "fileTypes", key: "fileTypes" },
    { name: "libraryKits", key: "libraryKits" },
    { name: "population", key: "population" },
    { name: "processedDataTypes", key: "processedDataTypes" },
    { name: "referenceGenome", key: "referenceGenome" },
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
    if (normalized.pending.length > 0) {
      pendingValues.set(name, normalized.pending)
    }

    // Check if changed (compare sorted arrays)
    const originalSorted = [...values].sort()
    const normalizedSorted = [...normalized.normalized].sort()
    if (JSON.stringify(originalSorted) !== JSON.stringify(normalizedSorted)) {
      (result as Record<string, unknown>)[key] = normalized.normalized
      updated = true
    }
  }

  // Platforms (special handling for PlatformInfo[])
  const platformVendorMapping = mappings.get("platformVendor")
  const platformModelMapping = mappings.get("platformModel")
  if (platformVendorMapping && platformModelMapping) {
    const platforms = searchable.platforms ?? []
    const normalized = normalizePlatforms(platforms, platformVendorMapping, platformModelMapping)

    if (normalized.unmappedVendors.length > 0) {
      unmappedValues.set("platformVendor", normalized.unmappedVendors)
    }
    if (normalized.unmappedModels.length > 0) {
      unmappedValues.set("platformModel", normalized.unmappedModels)
    }
    if (normalized.pendingVendors.length > 0) {
      pendingValues.set("platformVendor", normalized.pendingVendors)
    }
    if (normalized.pendingModels.length > 0) {
      pendingValues.set("platformModel", normalized.pendingModels)
    }

    // Check if changed
    const originalKey = platforms.map(p => `${p.vendor}|${p.model}`).sort().join(",")
    const normalizedKey = normalized.normalized.map(p => `${p.vendor}|${p.model}`).sort().join(",")
    if (originalKey !== normalizedKey) {
      result.platforms = normalized.normalized
      updated = true
    }
  }

  // String fields (single value)
  const stringFields: { name: FacetFieldName; key: keyof SearchableExperimentFields }[] = [
    { name: "targets", key: "targets" },
  ]

  for (const { name, key } of stringFields) {
    const mapping = mappings.get(name)
    if (!mapping) continue

    const value = searchable[key] as string | null
    const normalized = normalizeStringField(value, mapping)

    if (normalized.unmapped) {
      unmappedValues.set(name, [normalized.unmapped])
    }
    if (normalized.pending) {
      pendingValues.set(name, [normalized.pending])
    }

    // Check if changed
    if (value !== normalized.normalized) {
      (result as Record<string, unknown>)[key] = normalized.normalized
      updated = true
    }
  }

  // dataVolumeGb: convert negative values to null
  if (searchable.dataVolumeGb !== null && searchable.dataVolumeGb < 0) {
    result.dataVolumeGb = null
    updated = true
  }

  // readLength: convert zero and negative values to null
  if (searchable.readLength !== null && searchable.readLength <= 0) {
    result.readLength = null
    updated = true
  }

  // sequencingDepth: convert zero and negative values to null
  if (searchable.sequencingDepth !== null && searchable.sequencingDepth <= 0) {
    result.sequencingDepth = null
    updated = true
  }

  // targetCoverage: convert zero and negative values to null
  if (searchable.targetCoverage !== null && searchable.targetCoverage <= 0) {
    result.targetCoverage = null
    updated = true
  }

  // targets: convert empty string to null
  if (result.targets === "") {
    result.targets = null
    updated = true
  }

  return {
    updated,
    unmappedValues,
    pendingValues,
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

  // Array fields (excluding platforms which need special handling)
  const arrayFields: { name: FacetFieldName; key: keyof SearchableExperimentFields }[] = [
    { name: "assayType", key: "assayType" },
    { name: "cellLine", key: "cellLine" },
    { name: "fileTypes", key: "fileTypes" },
    { name: "libraryKits", key: "libraryKits" },
    { name: "population", key: "population" },
    { name: "processedDataTypes", key: "processedDataTypes" },
    { name: "referenceGenome", key: "referenceGenome" },
    { name: "tissues", key: "tissues" },
  ]

  for (const { name, key } of arrayFields) {
    const mapping = mappings.get(name)
    if (!mapping) continue

    const values = (searchable[key] as string[]) ?? []
    const normalizedResult = normalizeArrayValues(values, mapping);
    (normalized as Record<string, unknown>)[key] = normalizedResult.normalized
  }

  // Platforms
  const platformVendorMapping = mappings.get("platformVendor")
  const platformModelMapping = mappings.get("platformModel")
  if (platformVendorMapping && platformModelMapping) {
    const platforms = searchable.platforms ?? []
    const normalizedResult = normalizePlatforms(platforms, platformVendorMapping, platformModelMapping)
    normalized.platforms = normalizedResult.normalized
  }

  // String fields (single value)
  const stringFields: { name: FacetFieldName; key: keyof SearchableExperimentFields }[] = [
    { name: "targets", key: "targets" },
  ]

  for (const { name, key } of stringFields) {
    const mapping = mappings.get(name)
    if (!mapping) continue

    const value = searchable[key] as string | null
    const normalizedResult = normalizeStringField(value, mapping);
    (normalized as Record<string, unknown>)[key] = normalizedResult.normalized
  }

  // dataVolumeGb: convert negative values to null
  if (searchable.dataVolumeGb !== null && searchable.dataVolumeGb < 0) {
    normalized.dataVolumeGb = null
  }

  // readLength: convert zero and negative values to null
  if (searchable.readLength !== null && searchable.readLength <= 0) {
    normalized.readLength = null
  }

  // sequencingDepth: convert zero and negative values to null
  if (searchable.sequencingDepth !== null && searchable.sequencingDepth <= 0) {
    normalized.sequencingDepth = null
  }

  // targetCoverage: convert zero and negative values to null
  if (searchable.targetCoverage !== null && searchable.targetCoverage <= 0) {
    normalized.targetCoverage = null
  }

  // targets: convert empty string to null
  if (normalized.targets === "") {
    normalized.targets = null
  }

  return normalized
}
