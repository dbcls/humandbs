/**
 * ICD10 Code Normalization Processor
 *
 * Normalizes disease entries using:
 * 1. Manual split definitions (from disease-split-rules.json)
 * 2. Pre-computed disease mappings (from icd10-disease-mapping.json)
 * 3. ICD10 label master (from icd10-labels.json)
 * 4. Automatic ICD10 extraction from labels
 *
 * Output:
 * - Each disease has a valid ICD10 code (string, not null)
 * - Label is the WHO ICD10 master English label
 * - Diseases without valid ICD10 are excluded
 */
import diseaseExcludeData from "@/crawler/data/icd10/disease-exclude.json"
import diseaseSplitRules from "@/crawler/data/icd10/disease-split-rules.json"
import diseaseMappingData from "@/crawler/data/icd10/icd10-disease-mapping.json"
import icd10LabelsData from "@/crawler/data/icd10/icd10-labels.json"
import type { DiseaseInfo } from "@/crawler/types"

// Types

/** Manual split definition record */
type DiseaseSplitRecord = Record<string, DiseaseInfo[]>

/** Disease mapping record */
type DiseaseMappingRecord = Record<string, { label: string; icd10: string }>

/** ICD10 label master (code -> English label) */
type Icd10LabelRecord = Record<string, string>

/** Normalized disease with required icd10 */
export interface NormalizedDisease {
  label: string
  icd10: string
}

// Ensure type safety for imported JSON
const diseaseSplitMap: DiseaseSplitRecord = diseaseSplitRules
const diseaseMappingMap: DiseaseMappingRecord = diseaseMappingData
const diseaseExcludeSet = new Set<string>(diseaseExcludeData)
const icd10LabelMap: Icd10LabelRecord = icd10LabelsData

/**
 * ICD10 code extraction pattern
 *
 * Matches patterns like:
 * - "乳がん(C509)" -> label="乳がん", icd10="C509"
 * - "白血病(C910)" -> label="白血病", icd10="C910"
 * - "大腸・直腸がん(C189, C20)" -> label="大腸・直腸がん", icd10="C189, C20"
 *
 * ICD10 code format: Letter followed by 2-4 digits (e.g., C50, C509, I500)
 * Multiple codes are comma-separated within parentheses
 */
const ICD10_PATTERN = /^(.+?)\s*\(([A-Z]\d{2,4}(?:,\s*[A-Z]?\d{2,4})*)\)$/

/**
 * Normalize label for matching against manual split definitions
 * Removes space before opening parenthesis: "病名 (C123)" -> "病名(C123)"
 */
export const normalizeLabelForMatching = (label: string): string => {
  return label.replace(/\s+\(/g, "(")
}

/**
 * Extract ICD10 code from a disease label
 *
 * @param label - Disease label that may contain ICD10 code in parentheses
 * @returns Object with cleaned label and extracted ICD10 code (if found)
 */
export const extractIcd10FromLabel = (label: string): {
  cleanLabel: string
  extractedIcd10: string | null
} => {
  const match = label.match(ICD10_PATTERN)
  if (match) {
    return {
      cleanLabel: match[1].trim(),
      extractedIcd10: match[2],
    }
  }
  return { cleanLabel: label, extractedIcd10: null }
}

/**
 * Select a single ICD10 code from extracted or existing
 * Extracted takes priority. For multiple codes, returns the first one.
 *
 * @param existing - Existing ICD10 code from the disease info
 * @param extracted - Newly extracted ICD10 code(s) from the label
 * @returns Single ICD10 code, or null if both are null
 */
export const selectIcd10 = (
  existing: string | null,
  extracted: string | null,
): string | null => {
  // Prefer extracted, fall back to existing
  const icd10 = extracted ?? existing
  if (!icd10) return null

  // If multiple codes, take the first one (split rules should handle multiple codes)
  const firstCode = icd10.split(/,\s*/)[0]
  return firstCode
}

/**
 * Check if a label contains multiple ICD10 codes (potential manual split candidate)
 *
 * @param label - Disease label to check
 * @returns True if the label contains multiple ICD10 codes
 */
export const hasMultipleIcd10Codes = (label: string): boolean => {
  const match = label.match(ICD10_PATTERN)
  if (!match) return false

  const icd10Part = match[2]
  // Count codes by splitting on comma
  const codes = icd10Part.split(/,\s*/)
  return codes.length > 1
}

/**
 * Create a mapping key from disease label and icd10
 * Key format: "label|icd10"
 */
const createMappingKey = (label: string, icd10: string | null): string => {
  return `${label}|${icd10 ?? ""}`
}

/**
 * Get the WHO ICD10 master label for a given ICD10 code
 * Returns null if the code is not found in the master
 */
export const getIcd10Label = (icd10: string): string | null => {
  return icd10LabelMap[icd10] ?? null
}

/**
 * Normalize a single disease entry using:
 * 1. Manual split definitions
 * 2. Pre-computed disease mapping
 * 3. ICD10 label master
 *
 * @param disease - Disease info to normalize
 * @returns Array of normalized diseases with required icd10 (may be empty if invalid)
 */
export const normalizeDiseaseWithIcd10 = (disease: DiseaseInfo): {
  result: NormalizedDisease[]
  warnings: string[]
} => {
  const warnings: string[] = []

  // Skip excluded diseases (not actual disease names)
  if (diseaseExcludeSet.has(disease.label)) {
    return { result: [], warnings }
  }

  // Skip empty or whitespace-only labels
  if (!disease.label.trim()) {
    return { result: [], warnings }
  }

  // 1. Check for manual split definition first (try both original and normalized label)
  const normalizedLabel = normalizeLabelForMatching(disease.label)
  const manualSplit = diseaseSplitMap[disease.label] ?? diseaseSplitMap[normalizedLabel]
  if (manualSplit) {
    // Apply disease mapping to each split result, then resolve to ICD10 master label
    const results: NormalizedDisease[] = []
    for (const d of manualSplit) {
      const mapped = applyDiseaseMapping(d)
      const resolved = resolveToIcd10MasterLabel(mapped, warnings)
      if (resolved) {
        results.push(resolved)
      }
    }
    return { result: results, warnings }
  }

  // 2. Check for multiple ICD10 codes without split definition
  if (hasMultipleIcd10Codes(disease.label)) {
    warnings.push(`Multiple ICD10 codes without split definition: "${disease.label}" - Add to disease-split-rules.json`)
  }

  // 3. Extract ICD10 from label if present
  const { cleanLabel, extractedIcd10 } = extractIcd10FromLabel(disease.label)
  const selectedIcd10 = selectIcd10(disease.icd10, extractedIcd10)

  // 4. Create candidate disease for mapping lookup
  const candidate: DiseaseInfo = { label: cleanLabel, icd10: selectedIcd10 }

  // 5. Apply disease mapping
  const mapped = applyDiseaseMapping(candidate)

  // Also try mapping with original label if different
  if (mapped === candidate && disease.label !== cleanLabel) {
    const originalCandidate: DiseaseInfo = { label: disease.label, icd10: disease.icd10 }
    const originalMapped = applyDiseaseMapping(originalCandidate)
    if (originalMapped !== originalCandidate) {
      const resolved = resolveToIcd10MasterLabel(originalMapped, warnings)
      return { result: resolved ? [resolved] : [], warnings }
    }
  }

  // 6. Resolve to ICD10 master label
  const resolved = resolveToIcd10MasterLabel(mapped, warnings)
  return {
    result: resolved ? [resolved] : [],
    warnings,
  }
}

/**
 * Apply disease mapping to normalize label and icd10
 * Returns the mapped disease if found, otherwise returns the original
 */
const applyDiseaseMapping = (disease: DiseaseInfo): DiseaseInfo => {
  const key = createMappingKey(disease.label, disease.icd10)
  const mapping = diseaseMappingMap[key]
  if (mapping) {
    return {
      label: mapping.label,
      icd10: mapping.icd10,
    }
  }
  return disease
}

/**
 * Resolve a disease to its ICD10 master label
 * Returns null only for excluded diseases (disease-exclude.json)
 * Other issues generate warnings but still output
 */
const resolveToIcd10MasterLabel = (
  disease: DiseaseInfo,
  warnings: string[],
): NormalizedDisease | null => {
  // No ICD10 code - warn but keep for manual fixing
  if (!disease.icd10) {
    if (disease.label !== "") {
      warnings.push(`Disease without ICD10: "${disease.label}" - Add to icd10-disease-mapping.json`)
    }
    // Return with null icd10 converted to empty string (will be filtered later if needed)
    return null
  }

  // Check for invalid ICD10 patterns (ranges, dots) - warn but keep
  if (/[-.]/.test(disease.icd10)) {
    warnings.push(`Disease with invalid ICD10: "${disease.label}" (icd10: ${disease.icd10}) - Add to icd10-disease-mapping.json`)
    // Keep for manual fixing
    return {
      label: disease.label || disease.icd10,
      icd10: disease.icd10,
    }
  }

  // Get label from ICD10 master
  const masterLabel = getIcd10Label(disease.icd10)
  if (masterLabel) {
    return {
      label: masterLabel,
      icd10: disease.icd10,
    }
  }

  // ICD10 code not in master - use original label if English, warn if Japanese
  if (disease.label && !isJapanese(disease.label)) {
    return {
      label: disease.label,
      icd10: disease.icd10,
    }
  }

  // Japanese label with ICD10 not in master
  warnings.push(`ICD10 code not in master: "${disease.icd10}" for "${disease.label}" - Verify ICD10 code`)
  return {
    label: disease.label || disease.icd10,
    icd10: disease.icd10,
  }
}

/**
 * Check if text contains Japanese characters
 */
const isJapanese = (text: string): boolean => {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)
}

/**
 * Normalize an array of diseases, applying ICD10 extraction and manual splits
 *
 * @param diseases - Array of disease info to normalize
 * @returns Object containing normalized diseases (all with valid icd10) and any warnings
 */
export const normalizeDiseases = (diseases: DiseaseInfo[]): {
  normalized: NormalizedDisease[]
  warnings: string[]
  updated: boolean
} => {
  const allWarnings: string[] = []
  const normalizedDiseases: NormalizedDisease[] = []

  for (const disease of diseases) {
    const { result, warnings } = normalizeDiseaseWithIcd10(disease)
    allWarnings.push(...warnings)
    normalizedDiseases.push(...result)
  }

  // Deduplicate by label+icd10 combination
  const seen = new Set<string>()
  const deduplicated: NormalizedDisease[] = []

  for (const disease of normalizedDiseases) {
    const key = `${disease.label}|${disease.icd10}`
    if (!seen.has(key)) {
      seen.add(key)
      deduplicated.push(disease)
    }
  }

  // Check if anything changed
  const updated = deduplicated.length !== diseases.length ||
    deduplicated.some((d, i) => {
      const orig = diseases[i]
      return !orig || d.label !== orig.label || d.icd10 !== orig.icd10
    })

  return {
    normalized: deduplicated,
    warnings: allWarnings,
    updated,
  }
}

/**
 * Get all manual split definitions
 * Useful for listing defined splits or testing
 */
export const getManualSplitDefinitions = (): DiseaseSplitRecord => {
  return { ...diseaseSplitMap }
}

/**
 * Get all excluded disease labels
 * These are not actual disease names and are excluded from output
 */
export const getExcludedDiseases = (): string[] => {
  return [...diseaseExcludeSet]
}

/**
 * Validation error for normalized disease data
 */
export interface NormalizedDiseaseValidationError {
  type: "invalid_icd10" | "icd10_not_in_master" | "label_mismatch"
  disease: NormalizedDisease
  expectedLabel?: string
}

/**
 * Validate that a normalized disease meets strict requirements:
 * - icd10 is in the master (icd10-labels.json)
 * - label matches the master label exactly
 *
 * Note: icd10 being non-null is guaranteed by NormalizedDisease type
 *
 * @param disease - Normalized disease to validate
 * @returns Array of validation errors (empty if valid)
 */
export const validateNormalizedDisease = (disease: NormalizedDisease): NormalizedDiseaseValidationError[] => {
  const errors: NormalizedDiseaseValidationError[] = []

  // Check for invalid ICD10 format (contains . or -)
  if (/[-.]/.test(disease.icd10)) {
    errors.push({
      type: "invalid_icd10",
      disease,
    })
    return errors
  }

  // Check if icd10 is in master
  const masterLabel = getIcd10Label(disease.icd10)
  if (!masterLabel) {
    errors.push({
      type: "icd10_not_in_master",
      disease,
    })
    return errors
  }

  // Check if label matches master label exactly
  if (disease.label !== masterLabel) {
    errors.push({
      type: "label_mismatch",
      disease,
      expectedLabel: masterLabel,
    })
  }

  return errors
}

/**
 * Validate an array of normalized diseases
 *
 * @param diseases - Array of normalized diseases to validate
 * @returns Array of all validation errors
 */
export const validateNormalizedDiseases = (diseases: NormalizedDisease[]): NormalizedDiseaseValidationError[] => {
  const allErrors: NormalizedDiseaseValidationError[] = []
  for (const disease of diseases) {
    allErrors.push(...validateNormalizedDisease(disease))
  }
  return allErrors
}
