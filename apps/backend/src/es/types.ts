/**
 * Elasticsearch document types and zod schemas
 *
 * This module provides:
 * 1. Re-exports of Zod schemas from @/crawler/types (single source of truth)
 * 2. ES-specific schema extensions (status, uids, etc.)
 * 3. TypeScript types inferred from Zod schemas
 *
 * Dependency flow: crawler/types → es/types → api/types
 */
import { z } from "zod"

import {
  // Common schemas (used locally)
  TextValueSchema,
  UrlValueSchema,
  BilingualTextSchema,
  BilingualTextValueSchema,
  BilingualUrlValueSchema,
  PeriodOfDataUseSchema,
  CriteriaCanonicalSchema,
  PolicyCanonicalSchema,
  NormalizedPolicySchema,
  // Searchable schemas
  SubjectCountTypeSchema,
  HealthStatusSchema,
  ReadTypeSchema,
  DiseaseInfoSchema as CrawlerDiseaseInfoSchema,
  PlatformInfoSchema,
  SexSchema,
  AgeGroupSchema,
  VariantCountsSchema,
  SearchableExperimentFieldsSchema as CrawlerSearchableExperimentFieldsSchema,
  // Structured schemas
  ExperimentSchema as CrawlerExperimentSchema,
  DatasetSchema as CrawlerDatasetSchema,
  SummarySchema,
  PersonSchema,
  ResearchProjectSchema,
  GrantSchema,
  PublicationSchema,
  ResearchSchema as CrawlerResearchSchema,
  DatasetRefSchema,
  ResearchVersionSchema as CrawlerResearchVersionSchema,
  SearchableDatasetSchema,
} from "@/crawler/types"

// === Re-export Zod schemas from crawler/types (single source of truth) ===

export {
  // Common schemas
  TextValueSchema,
  UrlValueSchema,
  BilingualTextSchema,
  BilingualTextValueSchema,
  BilingualUrlValueSchema,
  PeriodOfDataUseSchema,
  CriteriaCanonicalSchema,
  PolicyCanonicalSchema,
  NormalizedPolicySchema,
  // Searchable schemas
  SubjectCountTypeSchema,
  HealthStatusSchema,
  ReadTypeSchema,
  CrawlerDiseaseInfoSchema,
  PlatformInfoSchema,
  SexSchema,
  AgeGroupSchema,
  VariantCountsSchema,
  CrawlerSearchableExperimentFieldsSchema,
  // Structured schemas
  CrawlerExperimentSchema,
  CrawlerDatasetSchema,
  SummarySchema,
  PersonSchema,
  ResearchProjectSchema,
  GrantSchema,
  PublicationSchema,
  CrawlerResearchSchema,
  DatasetRefSchema,
  CrawlerResearchVersionSchema,
  SearchableDatasetSchema,
}

// Re-export types for convenience
export type {
  LangType,
  TextValue,
  UrlValue,
  BilingualText,
  BilingualTextValue,
  BilingualUrlValue,
  CriteriaCanonical,
  NormalizedPolicy,
  Experiment,
  Dataset,
  Summary,
  Person,
  ResearchProject,
  Grant,
  Publication,
  Research,
  ResearchVersion,
  DatasetRef,
  SubjectCountType,
  HealthStatus,
  ReadType,
  DiseaseInfo,
  PlatformInfo,
  SearchableExperimentFields,
  SearchableDataset,
} from "@/crawler/types"

// === ES-specific schemas (extensions for ES documents) ===

/**
 * Normalized disease info schema for ES documents
 * Differs from CrawlerDiseaseInfoSchema: icd10 is required (not nullable)
 * because icd10-normalize step ensures all diseases have a valid ICD10 code before ES indexing
 */
export const NormalizedDiseaseSchema = z.object({
  label: z.string(),
  icd10: z.string(), // Required in ES (normalized from crawler's nullable version)
})
export type NormalizedDisease = z.infer<typeof NormalizedDiseaseSchema>

/**
 * SearchableExperimentFields schema for ES documents
 * Platform facet aggregation is done via nested aggregation in API
 */
export const SearchableExperimentFieldsSchema = z.object({
  // Subject/sample info
  subjectCount: z.number().nullable(),
  subjectCountType: z.enum(["individual", "sample", "mixed"]).nullable(),
  healthStatus: z.enum(["healthy", "affected", "mixed"]).nullable(),

  // Disease info (multiple diseases supported)
  diseases: z.array(NormalizedDiseaseSchema),

  // Biological sample info
  tissues: z.array(z.string()),
  isTumor: z.boolean().nullable(),
  cellLine: z.array(z.string()),
  population: z.array(z.string()),

  // Demographics
  sex: z.enum(["male", "female", "mixed"]).nullable(),
  ageGroup: z.enum(["infant", "child", "adult", "elderly", "mixed"]).nullable(),

  // Experimental method
  assayType: z.array(z.string()),
  libraryKits: z.array(z.string()),

  // Platform (nested for vendor/model relationship)
  platforms: z.array(PlatformInfoSchema),
  readType: z.enum(["single-end", "paired-end"]).nullable(),
  readLength: z.number().nullable(),

  // Sequencing quality
  sequencingDepth: z.number().nullable(),
  targetCoverage: z.number().nullable(),
  referenceGenome: z.array(z.string()),

  // Target region
  targets: z.string().nullable(),

  // Variant data
  variantCounts: VariantCountsSchema.nullable(),
  hasPhenotypeData: z.boolean().nullable(),

  // Data info
  fileTypes: z.array(z.string()),
  processedDataTypes: z.array(z.string()),
  dataVolumeGb: z.number().nullable(),

  // Policies (rule-based, not LLM)
  policies: z.array(NormalizedPolicySchema),
})
export type EsSearchableExperimentFields = z.infer<typeof SearchableExperimentFieldsSchema>

// === ES Experiment Schema ===

export const EsExperimentSchema = z.object({
  header: BilingualTextValueSchema,
  data: z.record(z.string(), BilingualTextValueSchema.nullable()),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
  searchable: SearchableExperimentFieldsSchema.optional(),
})
export type EsExperiment = z.infer<typeof EsExperimentSchema>

// === ES Dataset Schema ===

export const EsDatasetSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
  humId: z.string(),
  humVersionId: z.string(),
  versionReleaseDate: z.string(),
  releaseDate: z.string(),
  criteria: CriteriaCanonicalSchema,
  typeOfData: BilingualTextSchema,
  experiments: z.array(EsExperimentSchema),
  originalMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type EsDataset = z.infer<typeof EsDatasetSchema>

// === ES Person Schema (for Research) ===

export const EsPersonSchema = z.object({
  name: BilingualTextValueSchema,
  email: z.string().nullable().optional(),
  orcid: z.string().nullable().optional(),
  organization: z.object({
    name: BilingualTextValueSchema,
    address: z.object({
      country: z.string().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
  researchTitle: BilingualTextSchema.optional(),
  periodOfDataUse: z.object({
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
  }).nullable().optional(),
})
export type EsPerson = z.infer<typeof EsPersonSchema>

// === ES Research Project Schema ===

export const EsResearchProjectSchema = z.object({
  name: BilingualTextValueSchema,
  url: z.object({
    ja: UrlValueSchema.nullable(),
    en: UrlValueSchema.nullable(),
  }).nullable().optional(),
})
export type EsResearchProject = z.infer<typeof EsResearchProjectSchema>

// === ES Grant Schema ===

export const EsGrantSchema = z.object({
  id: z.array(z.string()),
  title: BilingualTextSchema,
  agency: z.object({
    name: BilingualTextSchema,
  }),
})
export type EsGrant = z.infer<typeof EsGrantSchema>

// === ES Publication Schema ===

export const EsPublicationSchema = z.object({
  title: BilingualTextSchema,
  doi: z.string().nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
})
export type EsPublication = z.infer<typeof EsPublicationSchema>

// === ES Summary Schema ===

export const EsSummarySchema = z.object({
  aims: BilingualTextValueSchema,
  methods: BilingualTextValueSchema,
  targets: BilingualTextValueSchema,
  url: z.object({
    ja: z.array(UrlValueSchema),
    en: z.array(UrlValueSchema),
  }),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
})
export type EsSummary = z.infer<typeof EsSummarySchema>

// === ES Research Schema ===

export const ResearchStatusSchema = z.enum(["draft", "review", "published", "deleted"])
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>

export const EsResearchSchema = z.object({
  humId: z.string(),
  url: BilingualTextSchema,
  title: BilingualTextSchema,
  summary: EsSummarySchema,
  dataProvider: z.array(EsPersonSchema),
  researchProject: z.array(EsResearchProjectSchema),
  grant: z.array(EsGrantSchema),
  relatedPublication: z.array(EsPublicationSchema),
  controlledAccessUser: z.array(EsPersonSchema),
  versionIds: z.array(z.string()),
  latestVersion: z.string(),
  datePublished: z.string(),
  dateModified: z.string(),
  // ES-specific fields (not in crawler Research)
  status: ResearchStatusSchema,
  uids: z.array(z.string()),
})
export type EsResearch = z.infer<typeof EsResearchSchema>

// === ES Research Version Schema ===

// Note: DatasetRefSchema and DatasetRef are already exported in the first export block

export const EsResearchVersionSchema = z.object({
  humId: z.string(),
  humVersionId: z.string(),
  version: z.string(),
  versionReleaseDate: z.string(),
  datasets: z.array(DatasetRefSchema),
  releaseNote: BilingualTextValueSchema,
})
export type EsResearchVersion = z.infer<typeof EsResearchVersionSchema>
