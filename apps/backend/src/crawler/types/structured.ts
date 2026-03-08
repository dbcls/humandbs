/**
 * Output type definitions (ja/en integrated structure)
 *
 * These types represent the final bilingual output after merging ja/en data,
 * including searchable fields for search functionality.
 *
 * ES で使う型は Zod スキーマで定義し、TypeScript 型を推論する。
 */
import { z } from "zod"

import {
  TextValueSchema,
  BilingualTextSchema,
  BilingualTextValueSchema,
  BilingualUrlValueSchema,
  CriteriaCanonicalSchema,
  NormalizedPolicySchema,
  PeriodOfDataUseSchema,
  UrlValueSchema,
} from "./common"
import type { UrlValue } from "./common"

// === Searchable types (extracted via LLM + rule-based for search functionality) ===
// These are Zod schemas as they are stored in ES
// Note: Defined first because ExperimentSchema depends on SearchableExperimentFieldsSchema

/** Subject count type */
export const SubjectCountTypeSchema = z.enum(["individual", "sample", "mixed"])
export type SubjectCountType = z.infer<typeof SubjectCountTypeSchema>

/** Health status */
export const HealthStatusSchema = z.enum(["healthy", "affected", "mixed"])
export type HealthStatus = z.infer<typeof HealthStatusSchema>

/** Read type */
export const ReadTypeSchema = z.enum(["single-end", "paired-end", "mixed"])
export type ReadType = z.infer<typeof ReadTypeSchema>

/** Disease information (icd10 is nullable in crawler output, but required after icd10-normalize) */
export const DiseaseInfoSchema = z.object({
  label: z.string(),
  icd10: z.string().nullable(),
})
export type DiseaseInfo = z.infer<typeof DiseaseInfoSchema>

/** Platform information */
export const PlatformInfoSchema = z.object({
  vendor: z.string().nullable(),
  model: z.string().nullable(),
})
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>

/** Sex */
export const SexSchema = z.enum(["male", "female", "mixed"])
export type Sex = z.infer<typeof SexSchema>

/** Age group */
export const AgeGroupSchema = z.enum([
  "infant",
  "child",
  "adult",
  "elderly",
  "mixed",
])
export type AgeGroup = z.infer<typeof AgeGroupSchema>

/** Tumor status */
export const IsTumorSchema = z.enum(["tumor", "normal", "mixed"])
export type IsTumor = z.infer<typeof IsTumorSchema>

/** Variant counts */
export const VariantCountsSchema = z.object({
  snv: z.number().nullable(),
  indel: z.number().nullable(),
  cnv: z.number().nullable(),
  sv: z.number().nullable(),
  total: z.number().nullable(),
})
export type VariantCounts = z.infer<typeof VariantCountsSchema>

/** Experiment-level searchable fields (extracted via LLM + rule-based) */
export const SearchableExperimentFieldsSchema = z.object({
  // Subject/sample info
  subjectCount: z.number().nullable()
    .describe("Number of subjects/samples in this experiment"),
  subjectCountType: SubjectCountTypeSchema.nullable()
    .describe("Type of subject count: 'individual', 'sample', or 'mixed'"),
  healthStatus: HealthStatusSchema.nullable()
    .describe("Health status of subjects: 'healthy', 'affected', or 'mixed'"),

  // Disease info (multiple diseases supported)
  diseases: z.array(DiseaseInfoSchema)
    .describe("Diseases associated with the experiment"),

  // Biological sample info
  tissues: z.array(z.string())
    .describe("Tissue types used (e.g., 'Blood', 'Liver')"),
  isTumor: IsTumorSchema.nullable()
    .describe("Whether samples include tumor tissue: 'tumor', 'normal', or 'mixed'"),
  cellLine: z.array(z.string())
    .describe("Cell line names if applicable"),
  population: z.array(z.string())
    .describe("Population groups (e.g., 'Japanese', 'East Asian')"),

  // Demographics
  sex: SexSchema.nullable()
    .describe("Biological sex: 'male', 'female', or 'mixed'"),
  ageGroup: AgeGroupSchema.nullable()
    .describe("Age group: 'infant', 'child', 'adult', 'elderly', or 'mixed'"),

  // Experimental method
  assayType: z.array(z.string())
    .describe("Assay types (e.g., 'WGS', 'WES', 'RNA-seq')"),
  libraryKits: z.array(z.string())
    .describe("Library preparation kits used"),

  // Platform (nested for vendor/model relationship)
  platforms: z.array(PlatformInfoSchema)
    .describe("Sequencing platforms used"),
  readType: ReadTypeSchema.nullable()
    .describe("Read type: 'single-end', 'paired-end', or 'mixed'"),
  readLength: z.number().nullable()
    .describe("Read length in base pairs"),

  // Sequencing quality
  sequencingDepth: z.number().nullable()
    .describe("Average sequencing depth (coverage)"),
  targetCoverage: z.number().nullable()
    .describe("Target region coverage percentage"),
  referenceGenome: z.array(z.string())
    .describe("Reference genome versions (e.g., 'GRCh38', 'GRCh37')"),

  // Variant data
  variantCounts: VariantCountsSchema.nullable()
    .describe("Variant counts by type (SNV, indel, CNV, SV)"),
  hasPhenotypeData: z.boolean().nullable()
    .describe("Whether phenotype data is available"),

  // Target region
  targets: z.string().nullable()
    .describe("Target regions or gene panels"),

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
export type SearchableExperimentFields = z.infer<
  typeof SearchableExperimentFieldsSchema
>

// === Output Types (Zod schemas for ES storage) ===

/** Experiment (ja/en pairs) */
export const ExperimentSchema = z.object({
  header: BilingualTextValueSchema,
  data: z.record(z.string(), BilingualTextValueSchema.nullable()),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
  searchable: SearchableExperimentFieldsSchema.optional(),
})
export type Experiment = z.infer<typeof ExperimentSchema>

/** Dataset (language-integrated) */
export const DatasetSchema = z.object({
  // Language-independent
  datasetId: z.string()
    .describe("Unique dataset identifier (e.g., 'JGAD000001')"),
  version: z.string()
    .describe("Dataset version (e.g., 'v1', 'v2')"),
  versionReleaseDate: z.string()
    .describe("ISO 8601 date when this dataset version was released"),
  humId: z.string()
    .describe("Parent Research identifier (e.g., 'hum0001')"),
  humVersionId: z.string()
    .describe("Parent Research version identifier (e.g., 'hum0001.v1')"),
  releaseDate: z.string()
    .describe("ISO 8601 date when the dataset was first released"),
  criteria: CriteriaCanonicalSchema
    .describe("Data access criteria: 'Controlled-access (Type I)', 'Controlled-access (Type II)', or 'Unrestricted-access'"),

  // Language-dependent - at least one of ja/en must be non-null
  typeOfData: BilingualTextSchema
    .describe("Bilingual description of the type of data in this dataset"),

  // Experiments (ja/en pairs)
  experiments: z.array(ExperimentSchema)
    .describe("Array of experiment records containing sample/sequencing metadata"),
})
export type Dataset = z.infer<typeof DatasetSchema>

/** Summary (language-integrated) */
export const SummarySchema = z.object({
  aims: BilingualTextValueSchema,
  methods: BilingualTextValueSchema,
  targets: BilingualTextValueSchema,
  url: z.object({
    ja: z.array(UrlValueSchema),
    en: z.array(UrlValueSchema),
  }),
})
export type Summary = z.infer<typeof SummarySchema>
export type { UrlValue }

/** Person (data provider or controlled access user) */
export const PersonSchema = z.object({
  name: BilingualTextValueSchema,
  email: z.string().nullable().optional(),
  orcid: z.string().nullable().optional(),
  organization: z
    .object({
      name: BilingualTextValueSchema,
      address: z
        .object({
          country: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  datasetIds: z.array(z.string()).optional(),
  researchTitle: BilingualTextSchema.optional(),
  periodOfDataUse: PeriodOfDataUseSchema.nullable().optional(),
})
export type Person = z.infer<typeof PersonSchema>

/** Research project */
export const ResearchProjectSchema = z.object({
  name: BilingualTextValueSchema,
  url: BilingualUrlValueSchema.nullable().optional(),
})
export type ResearchProject = z.infer<typeof ResearchProjectSchema>

/** Grant */
export const GrantSchema = z.object({
  id: z.array(z.string()),
  title: BilingualTextSchema,
  agency: z.object({ name: BilingualTextSchema }),
})
export type Grant = z.infer<typeof GrantSchema>

/** Publication */
export const PublicationSchema = z.object({
  title: BilingualTextSchema,
  doi: z.string().nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
})
export type Publication = z.infer<typeof PublicationSchema>

/** Research (language-integrated) */
export const ResearchSchema = z.object({
  // Language-independent
  humId: z.string()
    .describe("Research identifier (e.g., 'hum0001'). Unique across all Research resources."),
  url: BilingualTextSchema
    .describe("URLs to the Research detail page (Japanese and English)"),

  // Language-dependent
  title: BilingualTextSchema
    .describe("Research title in Japanese and English"),
  summary: SummarySchema
    .describe("Research summary including aims, methods, and targets"),

  // Data provider
  dataProvider: z.array(PersonSchema)
    .describe("Data providers (researchers providing the data)"),

  // Research project
  researchProject: z.array(ResearchProjectSchema)
    .describe("Related research projects"),

  // Grant information
  grant: z.array(GrantSchema)
    .describe("Funding grants"),

  // Publications (accumulated)
  relatedPublication: z.array(PublicationSchema)
    .describe("Related publications (papers, preprints)"),

  // Controlled access users (accumulated)
  controlledAccessUser: z.array(PersonSchema)
    .describe("Users with controlled access to the data"),

  // Version references
  versionIds: z.array(z.string())
    .describe("List of version identifiers (e.g., ['hum0001.v1', 'hum0001.v2'])"),
  latestVersion: z.string()
    .describe("Latest version number (e.g., 'v2')"),

  // Timestamps
  datePublished: z.string()
    .describe("ISO 8601 timestamp when the Research was first published"),
  dateModified: z.string()
    .describe("ISO 8601 timestamp when the Research was last modified"),
})
export type Research = z.infer<typeof ResearchSchema>

/** Dataset reference with version */
export const DatasetRefSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
})
export type DatasetRef = z.infer<typeof DatasetRefSchema>

/** Research version (language-integrated) */
export const ResearchVersionSchema = z.object({
  // Language-independent
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

  // Language-dependent
  releaseNote: BilingualTextValueSchema
    .describe("Bilingual release note describing changes in this version"),
})
export type ResearchVersion = z.infer<typeof ResearchVersionSchema>

/** Dataset with additional metadata for LLM extraction */
export const SearchableDatasetSchema = DatasetSchema.extend({
  originalMetadata: z.record(z.string(), z.any()).nullable().optional(),
})
export type SearchableDataset = z.infer<typeof SearchableDatasetSchema>
