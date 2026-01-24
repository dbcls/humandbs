/**
 * LLM extraction type definitions
 */
import type { Experiment, Dataset } from "./unified"

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

/** Experiment-level extracted fields */
export interface ExtractedExperimentFields {
  // Subject/sample info
  subjectCount: number | null
  subjectCountType: SubjectCountType | null
  healthStatus: HealthStatus | null

  // Disease info (multiple diseases supported)
  diseases: DiseaseInfo[]

  // Biological sample info
  tissue: string | null
  isTumor: boolean | null
  cellLine: string | null

  // Experimental method
  assayType: string | null
  libraryKit: string | null

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
}

/** Dataset-level searchable aggregated fields */
export interface SearchableDatasetFields {
  // Diseases
  diseases: DiseaseInfo[]

  // Biological samples
  tissues: string[]

  // Experimental methods
  assayTypes: string[]

  // Platforms
  platforms: PlatformInfo[]
  readTypes: string[]

  // Data info
  fileTypes: string[]
  totalSubjectCount: number | null
  totalDataVolume: DataVolume | null

  // Flags
  hasHealthyControl: boolean
  hasTumor: boolean
  hasCellLine: boolean
}

/** Experiment with extracted fields (matchType excluded from output) */
export interface ExtractedExperiment extends Omit<Experiment, "matchType"> {
  extracted: ExtractedExperimentFields
}

/** Dataset with searchable fields */
export interface SearchableDataset extends Omit<Dataset, "experiments"> {
  searchable: SearchableDatasetFields
  experiments: ExtractedExperiment[]
  originalMetadata?: Record<string, unknown> | null
}
