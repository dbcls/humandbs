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
export const EsResearchDetailSchema = EsResearchDocSchema
  .omit({ versionIds: true })
  .extend({
    humVersionId: z.string(),
    version: z.string(),
    versionReleaseDate: z.string(),
    releaseNote: BilingualTextValueSchema,
    datasets: z.array(EsDatasetDocSchema),
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
