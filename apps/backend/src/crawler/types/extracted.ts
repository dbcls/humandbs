/**
 * LLM extraction type definitions
 *
 * "refined" indicates data that has been refined/extracted from raw experiment data
 */
import type { NormalizedPolicy } from "./common"
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

/** Experiment-level refined fields (extracted via LLM + rule-based) */
export interface RefinedExperimentFields {
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

/** Experiment with refined fields */
export interface RefinedExperiment extends Experiment {
  refined: RefinedExperimentFields
}

/** Dataset with refined experiments (searchable fields aggregated dynamically) */
export interface RefinedDataset extends Omit<Dataset, "experiments"> {
  experiments: RefinedExperiment[]
  originalMetadata?: Record<string, unknown> | null
}
