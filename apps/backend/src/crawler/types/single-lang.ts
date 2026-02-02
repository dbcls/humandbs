/**
 * Single-language type definitions (intermediate structures before bilingual merge)
 *
 * These types represent data after transformation from NormalizedParseResult
 * but before bilingual merging into final output types
 */
import type { TextValue, UrlValue, CriteriaCanonical, PeriodOfDataUse } from "./common"

/** Single-language experiment (before bilingual merge) */
export interface SingleLangExperiment {
  header: TextValue
  data: Record<string, TextValue | null>
  footers: TextValue[]
}

/** Single-language dataset (before bilingual merge) */
export interface SingleLangDataset {
  datasetId: string
  version: string
  versionReleaseDate: string
  humId: string
  humVersionId: string
  releaseDate: string
  criteria: CriteriaCanonical | null
  typeOfData: string | null
  experiments: SingleLangExperiment[]
}

/** Single-language research version (before bilingual merge) */
export interface SingleLangResearchVersion {
  humId: string
  humVersionId: string
  version: string
  versionReleaseDate: string
  releaseDate: string
  releaseNote: TextValue
}

/** Single-language person (data provider or controlled access user) */
export interface SingleLangPerson {
  name: TextValue
  email?: string | null
  orcid?: string | null
  organization?: {
    name: TextValue
    address?: { country?: string | null } | null
  } | null
  datasetIds?: string[]
  researchTitle?: string | null
  periodOfDataUse?: PeriodOfDataUse | null
}

/** Single-language research project */
export interface SingleLangResearchProject {
  name: TextValue
  url?: UrlValue | null
}

/** Single-language grant */
export interface SingleLangGrant {
  id: string[]
  title: string | null
  agency: { name: string | null }
}

/** Single-language publication */
export interface SingleLangPublication {
  title: string | null
  doi?: string | null
  datasetIds?: string[]
}

/** Single-language summary */
export interface SingleLangSummary {
  aims: TextValue
  methods: TextValue
  targets: TextValue
  url: UrlValue[]
  footers: TextValue[]
}

/** Single-language research (before bilingual merge) */
export interface SingleLangResearch {
  humId: string
  url: string
  title: string
  summary: SingleLangSummary
  dataProvider: SingleLangPerson[]
  researchProject: SingleLangResearchProject[]
  grant: SingleLangGrant[]
  relatedPublication: SingleLangPublication[]
  controlledAccessUser: SingleLangPerson[]
  versionIds: string[]
  latestVersion: string
  datePublished: string
  dateModified: string
}
