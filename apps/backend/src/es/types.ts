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
  LANG_TYPES,
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
  DiseaseInfoSchema,
  PlatformInfoSchema,
  SexSchema,
  AgeGroupSchema,
  IsTumorSchema,
  VariantCountsSchema,
  SearchableExperimentFieldsSchema,
  // Structured schemas
  ExperimentSchema,
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
} from "../crawler/types"

// === Re-export Zod schemas from crawler/types (single source of truth) ===

export {
  // Common values
  LANG_TYPES,
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
  DiseaseInfoSchema,
  PlatformInfoSchema,
  SexSchema,
  AgeGroupSchema,
  IsTumorSchema,
  VariantCountsSchema,
  SearchableExperimentFieldsSchema,
  // Structured schemas
  ExperimentSchema,
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

// Re-export ResearchVersionSchema (identical to crawler)
export const ResearchVersionSchema = CrawlerResearchVersionSchema
export type ResearchVersion = z.infer<typeof ResearchVersionSchema>

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
  DatasetRef,
  SubjectCountType,
  HealthStatus,
  ReadType,
  DiseaseInfo,
  PlatformInfo,
  IsTumor,
  VariantCounts,
  SearchableExperimentFields,
  SearchableDataset,
} from "../crawler/types"

// === ES-specific schemas (extensions for ES documents) ===
// Schemas with differences use .extend() for composition.

// === ES Dataset Schema (diff: + originalMetadata) ===

export const EsDatasetSchema = CrawlerDatasetSchema.extend({
  originalMetadata: z.record(z.string(), z.any()).nullable().optional()
    .describe("Original metadata preserved from the data source (for debugging/audit)"),
})
export type EsDataset = z.infer<typeof EsDatasetSchema>

// === ES Research Schema (diff: + status, uids) ===

export const ResearchStatusSchema = z.enum([
  "draft",
  "review",
  "published",
  "deleted",
])
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>

export const EsResearchSchema = CrawlerResearchSchema.extend({
  status: ResearchStatusSchema
    .describe("Publication status: 'draft', 'review', 'published', or 'deleted'"),
  uids: z.array(z.string())
    .describe("Keycloak user IDs (sub) who can edit this Research"),
  draftVersion: z.string().nullable()
    .describe("Version being edited (e.g., 'v2'). Null if no editing in progress."),
})
export type EsResearch = z.infer<typeof EsResearchSchema>

// === JGA Shinsei (re-export as-is, no ES-specific extensions) ===

export {
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
} from "../crawler/types"

export type {
  DsApplicationTransformed,
  DuApplicationTransformed,
} from "../crawler/types"

