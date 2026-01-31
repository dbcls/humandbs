/**
 * Output type definitions (ja/en integrated structure)
 *
 * These types represent the final bilingual output after merging ja/en data,
 * including searchable fields for search functionality.
 */
import type {
  TextValue,
  BilingualText,
  BilingualTextValue,
  BilingualUrlValue,
  CriteriaCanonical,
  NormalizedPolicy,
  PeriodOfDataUse,
  UrlValue,
} from "./common"

// Output Types

/** Experiment (ja/en pairs) */
export interface Experiment {
  header: BilingualTextValue
  data: Record<string, BilingualTextValue | null>
  footers: {
    ja: TextValue[]
    en: TextValue[]
  }
  searchable?: SearchableExperimentFields
}

/** Dataset (language-integrated) */
export interface Dataset {
  // Language-independent
  datasetId: string
  version: string
  versionReleaseDate: string
  humId: string
  humVersionId: string
  releaseDate: string
  criteria: CriteriaCanonical // must not be null, single value

  // Language-dependent - at least one of ja/en must be non-null
  typeOfData: { ja: string | null; en: string | null }

  // Experiments (ja/en pairs)
  experiments: Experiment[]
}

/** Summary (language-integrated) */
export interface Summary {
  aims: BilingualTextValue
  methods: BilingualTextValue
  targets: BilingualTextValue
  url: {
    ja: UrlValue[]
    en: UrlValue[]
  }
  footers: {
    ja: TextValue[]
    en: TextValue[]
  }
}
export type { UrlValue }

/** Person (data provider or controlled access user) */
export interface Person {
  name: BilingualTextValue
  email?: string | null
  orcid?: string | null
  organization?: {
    name: BilingualTextValue
    address?: { country?: string | null } | null
  } | null
  datasetIds?: string[]
  researchTitle?: BilingualText
  periodOfDataUse?: PeriodOfDataUse | null
}

/** Research project */
export interface ResearchProject {
  name: BilingualTextValue
  url?: BilingualUrlValue | null
}

/** Grant */
export interface Grant {
  id: string[]
  title: BilingualText
  agency: { name: BilingualText }
}

/** Publication */
export interface Publication {
  title: BilingualText
  doi?: string | null
  datasetIds?: string[]
}

/** Research (language-integrated) */
export interface Research {
  // Language-independent
  humId: string
  url: BilingualText

  // Language-dependent
  title: BilingualText
  summary: Summary

  // Data provider
  dataProvider: Person[]

  // Research project
  researchProject: ResearchProject[]

  // Grant information
  grant: Grant[]

  // Publications (accumulated)
  relatedPublication: Publication[]

  // Controlled access users (accumulated)
  controlledAccessUser: Person[]

  // Version references
  versionIds: string[]
  latestVersion: string

  // Timestamps
  datePublished: string
  dateModified: string
}

/** Dataset reference with version */
export interface DatasetRef {
  datasetId: string
  version: string
}

/** Research version (language-integrated) */
export interface ResearchVersion {
  // Language-independent
  humId: string
  humVersionId: string
  version: string
  versionReleaseDate: string
  datasets: DatasetRef[]

  // Language-dependent
  releaseNote: BilingualTextValue
}

// Searchable types (extracted via LLM + rule-based for search functionality)

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

/** Data volume with unit (deprecated, use dataVolumeGb instead) */
export type DataVolumeUnit = "KB" | "MB" | "GB" | "TB"

export interface DataVolume {
  value: number
  unit: DataVolumeUnit
}

/** Sex */
export type Sex = "male" | "female" | "mixed"

/** Age group */
export type AgeGroup = "infant" | "child" | "adult" | "elderly" | "mixed"

/** Variant counts */
export interface VariantCounts {
  snv: number | null
  indel: number | null
  cnv: number | null
  sv: number | null
  total: number | null
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

  // Demographics
  sex: Sex | null
  ageGroup: AgeGroup | null

  // Experimental method
  assayType: string | null
  libraryKits: string[]

  // Platform
  platformVendor: string | null
  platformModel: string | null
  readType: ReadType | null
  readLength: number | null

  // Sequencing quality
  sequencingDepth: number | null
  targetCoverage: number | null
  referenceGenome: string | null

  // Variant data
  variantCounts: VariantCounts | null
  hasPhenotypeData: boolean | null

  // Target region
  targets: string | null

  // Data info
  fileTypes: string[]
  processedDataTypes: string[]
  dataVolumeGb: number | null

  // Policies (rule-based, not LLM)
  policies: NormalizedPolicy[]
}

/** Dataset with additional metadata for LLM extraction */
export interface SearchableDataset extends Dataset {
  originalMetadata?: Record<string, unknown> | null
}
