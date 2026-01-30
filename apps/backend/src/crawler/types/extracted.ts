/**
 * LLM extraction type definitions
 *
 * "searchable" indicates fields that are extracted/refined for search functionality
 * These fields are derived from raw experiment data via LLM + rule-based extraction
 */
import type { NormalizedPolicy } from "./common"
import type { Experiment, Dataset } from "./structured"

/** Subject count type */
export type SubjectCountType = "individual" | "sample" | "mixed"

/** Health status */
export type HealthStatus = "healthy" | "affected" | "mixed"

/** Read type */
export type ReadType = "single-end" | "paired-end"

/** Disease information */
export interface DiseaseInfo {
  label: string
  icd10: string | null
}

/** Platform information */
export interface PlatformInfo {
  vendor: string
  model: string
}

/** Data volume with unit */
export type DataVolumeUnit = "KB" | "MB" | "GB" | "TB"

export interface DataVolume {
  value: number
  unit: DataVolumeUnit
}

/** Experiment-level searchable fields (extracted via LLM + rule-based) */
export interface SearchableExperimentFields {
  // Subject/sample info
  subjectCount: number | null
  subjectCountType: SubjectCountType | null
  healthStatus: HealthStatus | null

  // Disease info (multiple diseases supported)
  diseases: DiseaseInfo[]

  // Biological sample info
  tissues: string[]
  isTumor: boolean | null
  cellLine: string | null
  population: string | null

  // Experimental method
  assayType: string | null
  libraryKits: string[]

  // Platform
  platformVendor: string | null
  platformModel: string | null
  readType: ReadType | null
  readLength: number | null

  // Target region
  targets: string | null

  // Data info
  fileTypes: string[]
  dataVolume: DataVolume | null

  // Policies (rule-based, not LLM)
  policies: NormalizedPolicy[]
}

/**
 * Experiment with searchable fields
 * - Latest version datasets: searchable field is present
 * - Historical version datasets: searchable field may be undefined
 */
export interface SearchableExperiment extends Experiment {
  searchable?: SearchableExperimentFields
}

/** Dataset with searchable experiments */
export interface SearchableDataset extends Omit<Dataset, "experiments"> {
  experiments: SearchableExperiment[]
  originalMetadata?: Record<string, unknown> | null
}

