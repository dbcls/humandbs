/**
 * Types module for crawler
 *
 * Re-exports all type definitions
 */

import type { DatasetIdType } from "./common"

// Common types
export type {
  LangType,
  TextValue,
  UrlValue,
  BilingualText,
  BilingualTextValue,
  BilingualUrlValue,
  PeriodOfDataUse,
  CriteriaCanonical,
  DatasetIdType,
} from "./common"

/** Extracted IDs grouped by type */
export type ExtractedIds = Partial<Record<DatasetIdType, Set<string>>>

// Parse types (Raw* prefix indicates parsed HTML output before normalization)
export type {
  RawDataset,
  RawSummary,
  RawMolecularData,
  RawGrant,
  RawDataProvider,
  RawPublication,
  RawControlledAccessUser,
  RawRelease,
  RawParseResult,
} from "./parse"

// Normalized types
export type {
  NormalizedDataset,
  NormalizedMolecularData,
  NormalizedGrant,
  NormalizedControlledAccessUser,
  NormalizedParseResult,
} from "./normalized"

// Single-language types (intermediate structures before bilingual merge)
export type {
  SingleLangExperiment,
  SingleLangDataset,
  SingleLangResearchVersion,
  SingleLangPerson,
  SingleLangResearchProject,
  SingleLangGrant,
  SingleLangPublication,
  SingleLangSummary,
  SingleLangResearch,
} from "./transformed"

// Output types (ja/en integrated - final output format)
export type {
  ExperimentMatchType,
  PublicationMatchType,
  GrantMatchType,
  ControlledAccessUserMatchType,
  ResearchProjectMatchType,
  Experiment,
  Dataset,
  Summary,
  Person,
  ResearchProject,
  Grant,
  Publication,
  Research,
  ResearchVersion,
} from "./unified"

// Extracted types
export type {
  SubjectCountType,
  HealthStatus,
  ReadType,
  DiseaseInfo,
  PlatformInfo,
  DataVolumeUnit,
  DataVolume,
  ExtractedExperimentFields,
  SearchableDatasetFields,
  ExtractedExperiment,
  SearchableDataset,
} from "./extracted"

// API types (enriched with external API data)
export type {
  EnrichedPublication,
  EnrichedDataset,
  EnrichedResearch,
} from "./api"

// CLI types
export type {
  CrawlArgs,
  CrawlOneResult,
  NormalizeOneResult,
  CrawlHumIdResult,
} from "./cli"

// Re-export DoiSearchResult from api module
export type { DoiSearchResult, DoiCacheEntry } from "@/crawler/api/doi"
