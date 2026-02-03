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
    humVersionId: z.string(),
    version: z.string(),
    versionReleaseDate: z.string(),
    releaseNote: BilingualTextValueSchema,
    datasets: z.array(EsDatasetDocSchema),
    // Optimistic locking fields (optional for backwards compatibility)
    _seq_no: z.number().nullable().optional(),
    _primary_term: z.number().nullable().optional(),
  })
export type EsResearchDetail = z.infer<typeof EsResearchDetailSchema>

// Dataset version item (for version list)
export const DatasetVersionItemSchema = z.object({
  version: z.string(),
  typeOfData: BilingualTextSchema.nullable().optional(),
  criteria: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
})
export type DatasetVersionItem = z.infer<typeof DatasetVersionItemSchema>

// === MergedSearchable Schema ===

/**
 * Merged searchable fields at Dataset level
 * Aggregates all experiment.searchable fields into a single Dataset-level object
 */
export const MergedSearchableSchema = z.object({
  // Subject/sample info
  subjectCount: z.number().nullable(),
  subjectCountType: z.array(z.string()),
  healthStatus: z.array(z.string()),

  // Disease info (multiple diseases supported)
  diseases: z.array(z.object({
    label: z.string(),
    icd10: z.string(),
  })),

  // Biological sample info
  tissues: z.array(z.string()),
  isTumor: z.array(z.boolean()),
  cellLine: z.array(z.string()),
  population: z.array(z.string()),

  // Demographics
  sex: z.array(z.string()),
  ageGroup: z.array(z.string()),

  // Experimental method
  assayType: z.array(z.string()),
  libraryKits: z.array(z.string()),

  // Platform
  platforms: z.array(z.object({
    vendor: z.string(),
    model: z.string(),
  })),
  readType: z.array(z.string()),
  readLength: z.number().nullable(),

  // Sequencing quality
  sequencingDepth: z.number().nullable(),
  targetCoverage: z.number().nullable(),
  referenceGenome: z.array(z.string()),

  // Target region
  targets: z.array(z.string()),

  // Variant data
  variantCounts: VariantCountsSchema.nullable(),
  hasPhenotypeData: z.boolean().nullable(),

  // Data info
  fileTypes: z.array(z.string()),
  processedDataTypes: z.array(z.string()),
  dataVolumeGb: z.number().nullable(),

  // Policies (rule-based, not LLM)
  // Note: Using relaxed types matching MergedSearchable interface
  policies: z.array(z.object({
    id: z.string(),
    name: z.object({ ja: z.string().nullable(), en: z.string().nullable() }),
    url: z.string().nullable(),
  })),
})
export type MergedSearchable = z.infer<typeof MergedSearchableSchema>

// Dataset document with mergedSearchable (for API response)
export const EsDatasetDocWithMergedSchema = EsDatasetDocSchema.extend({
  mergedSearchable: MergedSearchableSchema.optional(),
})
export type EsDatasetDocWithMerged = z.infer<typeof EsDatasetDocWithMergedSchema>
