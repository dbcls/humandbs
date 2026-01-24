/**
 * Output type definitions (ja/en integrated structure)
 *
 * These types represent the final bilingual output after merging ja/en data
 */
import type {
  TextValue,
  BilingualText,
  BilingualTextValue,
  BilingualUrlValue,
  CriteriaCanonical,
  PeriodOfDataUse,
  UrlValue,
} from "./common"

// Match Types

/** Match type for experiment pairing */
export type ExperimentMatchType =
  | "exact" // Matched by accession ID
  | "fuzzy" // Matched by header similarity
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Match type for publication pairing */
export type PublicationMatchType =
  | "exact-doi" // Matched by DOI
  | "exact-datasetIds" // Matched by datasetIds
  | "fuzzy-title" // Matched by title similarity
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Match type for grant pairing */
export type GrantMatchType =
  | "exact-grantId" // Matched by grantId overlap
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Match type for controlled access user pairing */
export type ControlledAccessUserMatchType =
  | "exact-both" // Matched by datasetIds AND periodOfDataUse
  | "exact-datasetIds" // Matched by datasetIds only
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Match type for research project pairing */
export type ResearchProjectMatchType =
  | "exact-url" // Matched by URL
  | "fuzzy-name" // Matched by name similarity
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

// Output Types

/** Experiment (ja/en pairs) */
export interface Experiment {
  header: BilingualTextValue
  data: Record<string, BilingualTextValue | null>
  footers: {
    ja: TextValue[]
    en: TextValue[]
  }
  matchType: ExperimentMatchType
}

/** Dataset (language-integrated) */
export interface Dataset {
  // Language-independent
  datasetId: string
  version: string
  versionReleaseDate: string
  humId: string
  humVersionId: string
  releaseDate: string[] // must not be null
  criteria: CriteriaCanonical[] // must not be null

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
  matchType?: ControlledAccessUserMatchType
}

/** Research project */
export interface ResearchProject {
  name: BilingualTextValue
  url?: BilingualUrlValue | null
  matchType?: ResearchProjectMatchType
}

/** Grant */
export interface Grant {
  id: string[]
  title: BilingualText
  agency: { name: BilingualText }
  matchType?: GrantMatchType
}

/** Publication */
export interface Publication {
  title: BilingualText
  doi?: string | null
  datasetIds?: string[]
  matchType?: PublicationMatchType
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
  firstReleaseDate: string
  lastReleaseDate: string
}

/** Research version (language-integrated) */
export interface ResearchVersion {
  // Language-independent
  humId: string
  humVersionId: string
  version: string
  versionReleaseDate: string
  datasetIds: string[]

  // Language-dependent
  releaseNote: BilingualTextValue
}
