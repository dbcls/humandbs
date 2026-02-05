/**
 * Facet Values Collector
 *
 * Collects unique values from searchable fields across all datasets
 * and generates mapping files for facet normalization.
 */
import type { SearchableExperimentFields, PlatformInfo } from "@/crawler/types"

// Constants

/** Special value indicating the entry should be deleted from searchable fields */
export const MAPPING_DELETE = "__DELETE__"

/** Special value indicating the entry is pending review (use original value as-is) */
export const MAPPING_PENDING = "__PENDING__"

// Types

/**
 * TSV mapping entry (without count - count is only for logging)
 *
 * normalizedTo behavior:
 * - "" (empty string): This value itself is the canonical form (confirmed)
 * - "SomeValue": Normalize to "SomeValue"
 * - "__DELETE__": Delete this value (not a valid value for this field)
 * - "__PENDING__": Pending review (new value, use original as-is with warning)
 */
export interface TsvMappingEntry {
  value: string
  normalizedTo: string
}

/**
 * Entry for a facet value (used during collection with count)
 *
 * normalizedTo behavior:
 * - "" (empty string): This value itself is the canonical form
 * - "SomeValue": Normalize to "SomeValue"
 * - null: Delete this value (not a valid value for this field)
 */
export interface FacetValueEntry {
  value: string
  count: number
  normalizedTo: string | null
}

/** Facet mapping file structure (legacy JSON format) */
export interface FacetMapping {
  values: FacetValueEntry[]
  total: number
}

/** TSV-based facet mapping (new format) */
export interface TsvFacetMapping {
  entries: TsvMappingEntry[]
}

/** Facet field names that can be normalized */
export type FacetFieldName =
  | "assayType"
  | "cellLine"
  | "fileTypes"
  | "libraryKits"
  | "platformModel"
  | "platformVendor"
  | "population"
  | "processedDataTypes"
  | "referenceGenome"
  | "targets"
  | "tissues"

/** All facet field names */
export const FACET_FIELD_NAMES: FacetFieldName[] = [
  "assayType",
  "cellLine",
  "fileTypes",
  "libraryKits",
  "platformModel",
  "platformVendor",
  "population",
  "processedDataTypes",
  "referenceGenome",
  "targets",
  "tissues",
]

// Value Extraction

/** Extract values from a single searchable fields object */
export const extractValuesFromSearchable = (
  searchable: SearchableExperimentFields,
): Map<FacetFieldName, string[]> => {
  const result = new Map<FacetFieldName, string[]>()

  // Array fields
  const arrayFields: { name: FacetFieldName; values: string[] }[] = [
    { name: "assayType", values: searchable.assayType ?? [] },
    { name: "cellLine", values: searchable.cellLine ?? [] },
    { name: "fileTypes", values: searchable.fileTypes ?? [] },
    { name: "libraryKits", values: searchable.libraryKits ?? [] },
    { name: "population", values: searchable.population ?? [] },
    { name: "processedDataTypes", values: searchable.processedDataTypes ?? [] },
    { name: "referenceGenome", values: searchable.referenceGenome ?? [] },
    { name: "tissues", values: searchable.tissues ?? [] },
  ]

  for (const { name, values } of arrayFields) {
    const filtered = values.filter(v => v && v.trim() !== "")
    if (filtered.length > 0) {
      result.set(name, filtered)
    }
  }

  // String fields (single value)
  const stringFields: { name: FacetFieldName; value: string | null }[] = [
    { name: "targets", value: searchable.targets },
  ]

  for (const { name, value } of stringFields) {
    if (value && value.trim() !== "") {
      result.set(name, [value])
    }
  }

  // Platform vendor and model (special handling for PlatformInfo[])
  const platforms = searchable.platforms ?? []
  const platformVendors = platforms
    .map((p: PlatformInfo) => p.vendor)
    .filter((v): v is string => v !== null && v !== undefined && v.trim() !== "")
  const platformModels = platforms
    .map((p: PlatformInfo) => p.model)
    .filter((m): m is string => m !== null && m !== undefined && m.trim() !== "")

  if (platformVendors.length > 0) {
    result.set("platformVendor", platformVendors)
  }
  if (platformModels.length > 0) {
    result.set("platformModel", platformModels)
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
    return this.counts.get(fieldName) ?? new Map<string, number>()
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
  // Create a map of existing normalizedTo values (including null)
  const existingNormalizedTo = new Map<string, string | null>()
  if (existingMapping) {
    for (const entry of existingMapping.values) {
      existingNormalizedTo.set(entry.value, entry.normalizedTo)
    }
  }

  // Build new values array
  const values: FacetValueEntry[] = []
  let total = 0

  for (const [value, count] of counts) {
    // Preserve existing normalizedTo (including null), default to "" for new values
    const normalizedTo = existingNormalizedTo.has(value)
      ? existingNormalizedTo.get(value)!
      : ""
    values.push({
      value,
      count,
      normalizedTo,
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

// TSV I/O Functions

/**
 * Parse TSV content into mapping entries
 * Format: value<TAB>normalizedTo (no header)
 */
/** Escape newlines and backslashes for TSV storage */
const escapeForTsv = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r")

/** Unescape newlines and backslashes from TSV storage */
const unescapeFromTsv = (s: string): string =>
  s.replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\\\/g, "\\")

export const parseTsv = (content: string): TsvMappingEntry[] => {
  const entries: TsvMappingEntry[] = []
  const lines = content.split("\n")

  for (const line of lines) {
    // Remove only trailing CR/LF, preserve leading whitespace in values
    const trimmedEnd = line.replace(/\r?\n?$/, "")
    if (trimmedEnd === "" || trimmedEnd.trim() === "") continue

    const parts = trimmedEnd.split("\t")
    if (parts.length < 1) continue

    // Unescape values that may contain escaped newlines
    const value = unescapeFromTsv(parts[0])
    const normalizedTo = parts.length >= 2 ? unescapeFromTsv(parts[1]) : ""

    entries.push({ value, normalizedTo })
  }

  return entries
}

/**
 * Generate TSV content from mapping entries
 * Format: value<TAB>normalizedTo (no header)
 * Newlines in values are escaped as \n
 */
export const generateTsv = (entries: TsvMappingEntry[]): string => {
  const lines = entries.map(entry =>
    `${escapeForTsv(entry.value)}\t${escapeForTsv(entry.normalizedTo)}`,
  )
  return lines.join("\n") + "\n"
}

/**
 * Merge existing TSV mapping with new counts
 * - Preserves existing normalizedTo values
 * - New values get __PENDING__ as normalizedTo
 * - Values no longer present are kept (for tracking removed values)
 */
export const mergeWithExistingTsvMapping = (
  counts: Map<string, number>,
  existingEntries: TsvMappingEntry[],
): { entries: TsvMappingEntry[]; newValues: string[] } => {
  // Create a map of existing normalizedTo values
  const existingNormalizedTo = new Map<string, string>()
  for (const entry of existingEntries) {
    existingNormalizedTo.set(entry.value, entry.normalizedTo)
  }

  // Build new entries array
  const entries: TsvMappingEntry[] = []
  const newValues: string[] = []

  for (const [value] of counts) {
    if (existingNormalizedTo.has(value)) {
      // Preserve existing normalizedTo
      entries.push({
        value,
        normalizedTo: existingNormalizedTo.get(value)!,
      })
    } else {
      // New value - mark as pending
      entries.push({
        value,
        normalizedTo: MAPPING_PENDING,
      })
      newValues.push(value)
    }
  }

  // Add entries from existing mapping that are no longer present
  // (keep them so users can see what was removed)
  for (const entry of existingEntries) {
    if (!counts.has(entry.value)) {
      entries.push(entry)
    }
  }

  // Sort by value alphabetically
  entries.sort((a, b) => a.value.localeCompare(b.value))

  return { entries, newValues }
}

/**
 * Generate TSV mapping for a single field
 */
export const generateFieldTsvMapping = (
  counter: ValueCounter,
  fieldName: FacetFieldName,
  existingEntries: TsvMappingEntry[],
): { entries: TsvMappingEntry[]; newValues: string[] } => {
  const counts = counter.getFieldCounts(fieldName)
  return mergeWithExistingTsvMapping(counts, existingEntries)
}

/**
 * Convert TsvMappingEntry[] to FacetMapping for compatibility with normalize functions
 * Note: count is not available from TSV, so it's set to 0
 */
export const tsvToFacetMapping = (entries: TsvMappingEntry[]): FacetMapping => {
  const values: FacetValueEntry[] = entries.map(entry => ({
    value: entry.value,
    count: 0,
    // Convert __DELETE__ to null for backward compatibility with normalize logic
    normalizedTo: entry.normalizedTo === MAPPING_DELETE ? null : entry.normalizedTo,
  }))
  return { values, total: 0 }
}
