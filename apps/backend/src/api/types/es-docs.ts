/**
 * Elasticsearch document type re-exports
 *
 * This module re-exports ES document schemas from ../../es/types.
 * No aliases — uses canonical names directly.
 *
 * API view models (detail views, merged searchable, etc.) are in views.ts.
 */

// Re-export ES document schemas directly
export {
  DatasetRefSchema,
  EsDatasetSchema,
  EsResearchSchema,
  ResearchVersionSchema,
} from "../../es/types"

// Re-export types directly
export type {
  DatasetRef,
  EsDataset,
  EsResearch,
  ResearchVersion,
  Experiment,
  Person,
  Grant,
  Publication,
  Summary,
} from "../../es/types"
