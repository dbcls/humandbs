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
  subjectCount: z.number().nullable()
    .describe("Number of subjects/samples in this experiment"),
  subjectCountType: z.enum(["individual", "sample", "mixed"]).nullable()
    .describe("Type of subject count: 'individual', 'sample', or 'mixed'"),
  healthStatus: z.enum(["healthy", "affected", "mixed"]).nullable()
    .describe("Health status of subjects: 'healthy', 'affected', or 'mixed'"),

  // Disease info (multiple diseases supported)
  diseases: z.array(NormalizedDiseaseSchema)
    .describe("Diseases associated with the experiment"),

  // Biological sample info
  tissues: z.array(z.string())
    .describe("Tissue types used (e.g., 'Blood', 'Liver')"),
  isTumor: z.boolean().nullable()
    .describe("Whether samples include tumor tissue"),
  cellLine: z.array(z.string())
    .describe("Cell line names if applicable"),
  population: z.array(z.string())
    .describe("Population groups (e.g., 'Japanese', 'East Asian')"),

  // Demographics
  sex: z.enum(["male", "female", "mixed"]).nullable()
    .describe("Biological sex: 'male', 'female', or 'mixed'"),
  ageGroup: z.enum(["infant", "child", "adult", "elderly", "mixed"]).nullable()
    .describe("Age group: 'infant', 'child', 'adult', 'elderly', or 'mixed'"),

  // Experimental method
  assayType: z.array(z.string())
    .describe("Assay types (e.g., 'WGS', 'WES', 'RNA-seq')"),
  libraryKits: z.array(z.string())
    .describe("Library preparation kits used"),

  // Platform (nested for vendor/model relationship)
  platforms: z.array(PlatformInfoSchema)
    .describe("Sequencing platforms used"),
  readType: z.enum(["single-end", "paired-end"]).nullable()
    .describe("Read type: 'single-end' or 'paired-end'"),
  readLength: z.number().nullable()
    .describe("Read length in base pairs"),

  // Sequencing quality
  sequencingDepth: z.number().nullable()
    .describe("Average sequencing depth (coverage)"),
  targetCoverage: z.number().nullable()
    .describe("Target region coverage percentage"),
  referenceGenome: z.array(z.string())
    .describe("Reference genome versions (e.g., 'GRCh38', 'GRCh37')"),

  // Target region
  targets: z.string().nullable()
    .describe("Target regions or gene panels"),

  // Variant data
  variantCounts: VariantCountsSchema.nullable()
    .describe("Variant counts by type (SNV, indel, CNV, SV)"),
  hasPhenotypeData: z.boolean().nullable()
    .describe("Whether phenotype data is available"),

  // Data info
  fileTypes: z.array(z.string())
    .describe("Available file types (e.g., 'FASTQ', 'BAM', 'VCF')"),
  processedDataTypes: z.array(z.string())
    .describe("Types of processed data available"),
  dataVolumeGb: z.number().nullable()
    .describe("Total data volume in gigabytes"),

  // Policies (rule-based, not LLM)
  policies: z.array(NormalizedPolicySchema)
    .describe("Data access policies applicable to this experiment"),
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
  datasetId: z.string()
    .describe("Unique dataset identifier (e.g., 'JGAD000001')"),
  version: z.string()
    .describe("Dataset version (e.g., 'v1', 'v2')"),
  humId: z.string()
    .describe("Parent Research identifier (e.g., 'hum0001')"),
  humVersionId: z.string()
    .describe("Parent Research version identifier (e.g., 'hum0001.v1')"),
  versionReleaseDate: z.string()
    .describe("ISO 8601 date when this dataset version was released"),
  releaseDate: z.string()
    .describe("ISO 8601 date when the dataset was first released"),
  criteria: CriteriaCanonicalSchema
    .describe("Data access criteria: 'Controlled-access (Type I)', 'Controlled-access (Type II)', or 'Unrestricted-access'"),
  typeOfData: BilingualTextSchema
    .describe("Bilingual description of the type of data in this dataset"),
  experiments: z.array(EsExperimentSchema)
    .describe("Array of experiment records containing sample/sequencing metadata"),
  originalMetadata: z.record(z.string(), z.unknown()).nullable().optional()
    .describe("Original metadata preserved from the data source (for debugging/audit)"),
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
  humId: z.string()
    .describe("Research identifier (e.g., 'hum0001'). Unique across all Research resources."),
  url: BilingualTextSchema
    .describe("URLs to the Research detail page (Japanese and English)"),
  title: BilingualTextSchema
    .describe("Research title in Japanese and English"),
  summary: EsSummarySchema
    .describe("Research summary including aims, methods, and targets"),
  dataProvider: z.array(EsPersonSchema)
    .describe("Data providers (researchers providing the data)"),
  researchProject: z.array(EsResearchProjectSchema)
    .describe("Related research projects"),
  grant: z.array(EsGrantSchema)
    .describe("Funding grants"),
  relatedPublication: z.array(EsPublicationSchema)
    .describe("Related publications (papers, preprints)"),
  controlledAccessUser: z.array(EsPersonSchema)
    .describe("Users with controlled access to the data"),
  versionIds: z.array(z.string())
    .describe("List of version identifiers (e.g., ['hum0001.v1', 'hum0001.v2'])"),
  latestVersion: z.string()
    .describe("Latest version number (e.g., 'v2')"),
  datePublished: z.string()
    .describe("ISO 8601 timestamp when the Research was first published"),
  dateModified: z.string()
    .describe("ISO 8601 timestamp when the Research was last modified"),
  // ES-specific fields (not in crawler Research)
  status: ResearchStatusSchema
    .describe("Publication status: 'draft', 'review', 'published', or 'deleted'"),
  uids: z.array(z.string())
    .describe("Keycloak user IDs (sub) who can edit this Research"),
})
export type EsResearch = z.infer<typeof EsResearchSchema>

// === ES Research Version Schema ===

// Note: DatasetRefSchema and DatasetRef are already exported in the first export block

export const EsResearchVersionSchema = z.object({
  humId: z.string()
    .describe("Research identifier (e.g., 'hum0001')"),
  humVersionId: z.string()
    .describe("Research version identifier (e.g., 'hum0001.v1')"),
  version: z.string()
    .describe("Version number (e.g., 'v1', 'v2')"),
  versionReleaseDate: z.string()
    .describe("ISO 8601 date when this version was released"),
  datasets: z.array(DatasetRefSchema)
    .describe("References to datasets linked to this Research version"),
  releaseNote: BilingualTextValueSchema
    .describe("Bilingual release note describing changes in this version"),
})
export type EsResearchVersion = z.infer<typeof EsResearchVersionSchema>
