/**
 * Elasticsearch document type aliases
 *
 * This module provides type aliases for ES document schemas.
 * Actual schemas are defined in @/es/types.
 */
import { z } from "zod"

// Import Zod schemas from es/types (which re-exports from crawler/types)
import {
  BilingualTextSchema,
  BilingualTextValueSchema,
  DatasetRefSchema,
  EsDatasetSchema,
  EsResearchSchema,
  EsResearchVersionSchema,
  VariantCountsSchema,
} from "@/es/types"

// Re-export for convenience
export type {
  EsDataset,
  EsResearch,
  EsResearchVersion,
  EsExperiment,
  EsPerson,
  EsGrant,
  EsPublication,
  EsSummary,
} from "@/es/types"

// === Re-export ES schemas for convenience ===

// Dataset reference (re-export from es/types)
export { DatasetRefSchema }
export type DatasetRef = z.infer<typeof DatasetRefSchema>

// Dataset document (alias to ES schema)
export const EsDatasetDocSchema = EsDatasetSchema
export type EsDatasetDoc = z.infer<typeof EsDatasetDocSchema>

// ResearchVersion document (alias to ES schema)
export const EsResearchVersionDocSchema = EsResearchVersionSchema
export type EsResearchVersionDoc = z.infer<typeof EsResearchVersionDocSchema>

// Research document (alias to ES schema)
export const EsResearchDocSchema = EsResearchSchema
export type EsResearchDoc = z.infer<typeof EsResearchDocSchema>

// Research detail (Research + ResearchVersion info + Datasets)
// Includes _seq_no and _primary_term for optimistic locking
export const EsResearchDetailSchema = EsResearchDocSchema
  .omit({ versionIds: true })
  .extend({
    humVersionId: z.string()
      .describe("Research version identifier (e.g., 'hum0001.v1')"),
    version: z.string()
      .describe("Version number (e.g., 'v1', 'v2')"),
    versionReleaseDate: z.string()
      .describe("ISO 8601 date when this version was released"),
    releaseNote: BilingualTextValueSchema
      .describe("Bilingual release note describing changes in this version"),
    datasets: z.array(EsDatasetDocSchema)
      .describe("Datasets linked to this Research version"),
    // Optimistic locking fields (optional for backwards compatibility)
    _seq_no: z.number().nullable().optional()
      .describe("Elasticsearch sequence number for optimistic concurrency control"),
    _primary_term: z.number().nullable().optional()
      .describe("Elasticsearch primary term for optimistic concurrency control"),
  })
export type EsResearchDetail = z.infer<typeof EsResearchDetailSchema>

// Dataset version item (for version list)
export const DatasetVersionItemSchema = z.object({
  version: z.string()
    .describe("Version identifier (e.g., 'v1', 'v2')"),
  typeOfData: BilingualTextSchema.nullable().optional()
    .describe("Bilingual description of the data type"),
  criteria: z.string().nullable().optional()
    .describe("Data access criteria (e.g., 'Controlled-access (Type I)')"),
  releaseDate: z.string().nullable().optional()
    .describe("ISO 8601 date when this version was released"),
})
export type DatasetVersionItem = z.infer<typeof DatasetVersionItemSchema>

// === MergedSearchable Schema ===

/**
 * Merged searchable fields at Dataset level
 * Aggregates all experiment.searchable fields into a single Dataset-level object
 */
export const MergedSearchableSchema = z.object({
  // Subject/sample info
  subjectCount: z.number().nullable()
    .describe("Total number of subjects/samples in this dataset"),
  subjectCountType: z.array(z.string())
    .describe("Type of subject count: 'individual', 'sample', or 'mixed'"),
  healthStatus: z.array(z.string())
    .describe("Health status of subjects: 'healthy', 'affected', or 'mixed'"),

  // Disease info (multiple diseases supported)
  diseases: z.array(z.object({
    label: z.string()
      .describe("Disease name/label"),
    icd10: z.string()
      .describe("ICD-10 disease classification code"),
  })).describe("Diseases associated with the dataset (multiple diseases supported)"),

  // Biological sample info
  tissues: z.array(z.string())
    .describe("Tissue types used in the study (e.g., 'Blood', 'Liver')"),
  isTumor: z.array(z.boolean())
    .describe("Whether samples include tumor tissue"),
  cellLine: z.array(z.string())
    .describe("Cell line names if applicable"),
  population: z.array(z.string())
    .describe("Population groups (e.g., 'Japanese', 'East Asian')"),

  // Demographics
  sex: z.array(z.string())
    .describe("Biological sex: 'male', 'female', or 'mixed'"),
  ageGroup: z.array(z.string())
    .describe("Age groups: 'infant', 'child', 'adult', 'elderly', or 'mixed'"),

  // Experimental method
  assayType: z.array(z.string())
    .describe("Assay types (e.g., 'WGS', 'WES', 'RNA-seq', 'Genotyping array')"),
  libraryKits: z.array(z.string())
    .describe("Library preparation kits used"),

  // Platform
  platforms: z.array(z.object({
    vendor: z.string()
      .describe("Platform vendor (e.g., 'Illumina', 'PacBio')"),
    model: z.string()
      .describe("Platform model (e.g., 'NovaSeq 6000', 'Sequel II')"),
  })).describe("Sequencing platforms used"),
  readType: z.array(z.string())
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
  targets: z.array(z.string())
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
  policies: z.array(z.object({
    id: z.string()
      .describe("Policy identifier"),
    name: z.object({
      ja: z.string().nullable()
        .describe("Policy name in Japanese"),
      en: z.string().nullable()
        .describe("Policy name in English"),
    }),
    url: z.string().nullable()
      .describe("URL to policy details"),
  })).describe("Data access policies applicable to this dataset"),
})
export type MergedSearchable = z.infer<typeof MergedSearchableSchema>

// Dataset document with mergedSearchable (for API response)
export const EsDatasetDocWithMergedSchema = EsDatasetDocSchema.extend({
  mergedSearchable: MergedSearchableSchema.optional(),
})
export type EsDatasetDocWithMerged = z.infer<typeof EsDatasetDocWithMergedSchema>
