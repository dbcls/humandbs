/**
 * Utility to merge searchable fields from multiple experiments
 *
 * Merges all experiment.searchable fields into a single Dataset-level mergedSearchable.
 */
import type { SearchableExperimentFields, VariantCounts } from "@/crawler/types"

/**
 * Merged searchable fields at Dataset level
 * Single-valued fields are converted to arrays when multiple experiments have different values
 */
export interface MergedSearchable {
  // Subject/sample info
  subjectCount: number | null // sum
  subjectCountType: string[] // unique values
  healthStatus: string[] // unique values

  // Disease info (multiple diseases supported)
  diseases: { label: string; icd10: string }[] // unique

  // Biological sample info
  tissues: string[] // concat unique
  isTumor: boolean[] // unique values
  cellLine: string[] // concat unique
  population: string[] // concat unique

  // Demographics
  sex: string[] // unique values
  ageGroup: string[] // unique values

  // Experimental method
  assayType: string[] // concat unique
  libraryKits: string[] // concat unique

  // Platform
  platforms: { vendor: string; model: string }[] // concat unique
  readType: string[] // unique values
  readLength: number | null // max

  // Sequencing quality
  sequencingDepth: number | null // max
  targetCoverage: number | null // max
  referenceGenome: string[] // concat unique

  // Variant data
  variantCounts: VariantCounts | null // sum each field
  hasPhenotypeData: boolean | null // OR (true if any is true)

  // Target region
  targets: string[] // unique values

  // Data info
  fileTypes: string[] // concat unique
  processedDataTypes: string[] // concat unique
  dataVolumeGb: number | null // sum

  // Policies (rule-based, not LLM)
  policies: { id: string; name: { ja: string | null; en: string | null }; url: string | null }[] // concat unique by id
}

/**
 * Unique array helper for strings
 */
const uniqueStrings = (arr: string[]): string[] => [...new Set(arr)]

/**
 * Unique array helper for objects (by JSON stringification)
 */
const uniqueObjects = <T>(arr: T[]): T[] => {
  const seen = new Set<string>()
  return arr.filter(item => {
    const key = JSON.stringify(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Sum nullable numbers
 */
const sumNullable = (values: (number | null)[]): number | null => {
  const nonNull = values.filter((v): v is number => v !== null)
  if (nonNull.length === 0) return null
  return nonNull.reduce((a, b) => a + b, 0)
}

/**
 * Max nullable numbers
 */
const maxNullable = (values: (number | null)[]): number | null => {
  const nonNull = values.filter((v): v is number => v !== null)
  if (nonNull.length === 0) return null
  return Math.max(...nonNull)
}

/**
 * OR nullable booleans
 */
const orNullable = (values: (boolean | null)[]): boolean | null => {
  const nonNull = values.filter((v): v is boolean => v !== null)
  if (nonNull.length === 0) return null
  return nonNull.some(v => v)
}

/**
 * Sum variant counts
 */
const sumVariantCounts = (counts: (VariantCounts | null)[]): VariantCounts | null => {
  const nonNull = counts.filter((v): v is VariantCounts => v !== null)
  if (nonNull.length === 0) return null
  return {
    snv: sumNullable(nonNull.map(c => c.snv)),
    indel: sumNullable(nonNull.map(c => c.indel)),
    cnv: sumNullable(nonNull.map(c => c.cnv)),
    sv: sumNullable(nonNull.map(c => c.sv)),
    total: sumNullable(nonNull.map(c => c.total)),
  }
}

/**
 * Merge multiple searchable fields into one
 */
export const mergeSearchableFields = (searchables: SearchableExperimentFields[]): MergedSearchable => {
  if (searchables.length === 0) {
    return {
      subjectCount: null,
      subjectCountType: [],
      healthStatus: [],
      diseases: [],
      tissues: [],
      isTumor: [],
      cellLine: [],
      population: [],
      sex: [],
      ageGroup: [],
      assayType: [],
      libraryKits: [],
      platforms: [],
      readType: [],
      readLength: null,
      sequencingDepth: null,
      targetCoverage: null,
      referenceGenome: [],
      variantCounts: null,
      hasPhenotypeData: null,
      targets: [],
      fileTypes: [],
      processedDataTypes: [],
      dataVolumeGb: null,
      policies: [],
    }
  }

  return {
    // Sum
    subjectCount: sumNullable(searchables.map(s => s.subjectCount)),

    // Unique arrays from enum/nullable values
    subjectCountType: uniqueStrings(searchables.map(s => s.subjectCountType).filter((v): v is NonNullable<typeof v> => v !== null)),
    healthStatus: uniqueStrings(searchables.map(s => s.healthStatus).filter((v): v is NonNullable<typeof v> => v !== null)),

    // Concat unique - for diseases, ensure icd10 is converted to non-null string
    diseases: uniqueObjects(searchables.flatMap(s => s.diseases).map(d => ({ label: d.label, icd10: d.icd10 ?? "" }))),
    tissues: uniqueStrings(searchables.flatMap(s => s.tissues)),
    cellLine: uniqueStrings(searchables.flatMap(s => s.cellLine)),
    population: uniqueStrings(searchables.flatMap(s => s.population)),
    assayType: uniqueStrings(searchables.flatMap(s => s.assayType)),
    libraryKits: uniqueStrings(searchables.flatMap(s => s.libraryKits)),
    platforms: uniqueObjects(searchables.flatMap(s => s.platforms)),
    referenceGenome: uniqueStrings(searchables.flatMap(s => s.referenceGenome)),
    fileTypes: uniqueStrings(searchables.flatMap(s => s.fileTypes)),
    processedDataTypes: uniqueStrings(searchables.flatMap(s => s.processedDataTypes)),
    policies: uniqueObjects(searchables.flatMap(s => s.policies)),

    // Unique arrays from boolean
    isTumor: uniqueObjects(searchables.map(s => s.isTumor).filter((v): v is boolean => v !== null)),

    // Unique arrays from enum
    sex: uniqueStrings(searchables.map(s => s.sex).filter((v): v is NonNullable<typeof v> => v !== null)),
    ageGroup: uniqueStrings(searchables.map(s => s.ageGroup).filter((v): v is NonNullable<typeof v> => v !== null)),
    readType: uniqueStrings(searchables.map(s => s.readType).filter((v): v is NonNullable<typeof v> => v !== null)),

    // Unique arrays from string
    targets: uniqueStrings(searchables.map(s => s.targets).filter((v): v is string => v !== null)),

    // Max
    readLength: maxNullable(searchables.map(s => s.readLength)),
    sequencingDepth: maxNullable(searchables.map(s => s.sequencingDepth)),
    targetCoverage: maxNullable(searchables.map(s => s.targetCoverage)),

    // Sum
    dataVolumeGb: sumNullable(searchables.map(s => s.dataVolumeGb)),

    // Sum variant counts
    variantCounts: sumVariantCounts(searchables.map(s => s.variantCounts)),

    // OR
    hasPhenotypeData: orNullable(searchables.map(s => s.hasPhenotypeData)),
  }
}

/**
 * Add mergedSearchable to a dataset document
 */
export const addMergedSearchable = <T extends { experiments?: { searchable?: SearchableExperimentFields }[] }>(
  dataset: T,
): T & { mergedSearchable: MergedSearchable } => {
  const searchables = (dataset.experiments ?? [])
    .map(e => e.searchable)
    .filter((s): s is SearchableExperimentFields => s !== undefined)

  return {
    ...dataset,
    mergedSearchable: mergeSearchableFields(searchables),
  }
}
