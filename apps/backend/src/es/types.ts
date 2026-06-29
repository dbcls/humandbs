/**
 * Elasticsearch document types and zod schemas
 *
 * This module provides:
 * 1. Re-exports of Zod schemas from @/crawler/types (single source of truth)
 * 2. ES-specific schema extensions (status, uids, etc.)
 * 3. TypeScript types inferred from Zod schemas
 *
 * Dependency flow: crawler/types → es/types → api/types
 *
 * The bare `@hono/zod-openapi` import is a side-effect: it calls
 * `extendZodWithOpenApi(z)` on load, so the `.openapi(...)` method is available
 * on the schemas defined below regardless of whether the consumer (test runner,
 * crawler CLI, API server) has imported `@hono/zod-openapi` itself.
 */
import "@hono/zod-openapi"
import { z } from "zod"

import { unescapeMarkdown } from "../crawler/utils/text"

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
  CRITERIA_CANONICAL_ORDER,
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
  CRITERIA_CANONICAL_ORDER,
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

// === Derived-field helpers ===

/**
 * Flatten experiment.data into a single string for ES full-text indexing
 * (`dataText` field, copy_to → all_text).
 *
 * D11 made BilingualTextValue.text markdown-shaped, so without undoing
 * turndown's `\[ \] \* \\` escapes the analyzer would index broken tokens
 * (`\[DRA016393\]` instead of `DRA016393`). The haystack is plain text, so
 * undo here.
 */
export const extractDataText = (
  data: Record<string, { ja?: { text?: string } | null; en?: { text?: string } | null } | null>,
): string => {
  const texts: string[] = []
  for (const value of Object.values(data)) {
    if (value == null) continue
    if (value.ja?.text) texts.push(unescapeMarkdown(value.ja.text))
    if (value.en?.text) texts.push(unescapeMarkdown(value.en.text))
  }
  return texts.join(" ")
}

// === ES-specific schemas (extensions for ES documents) ===
// Schemas with differences use .extend() for composition.

// === ES Dataset Schema (diff: + originalMetadata) ===

export const EsDatasetSchema = CrawlerDatasetSchema.extend({
  // `.openapi({ type: "object" })` keeps the generated schema valid under
  // OpenAPI 3.0's nullable-type-sibling rule (`z.any()` / `z.unknown()` alone
  // emit `{ nullable: true }` with no `type`).
  originalMetadata: z.record(z.string(), z.any()).nullable().optional()
    .describe("Original metadata preserved from the data source (for debugging/audit)")
    .openapi({ type: "object" }),
  // Dataset-level last-modified date (max versionReleaseDate across versions),
  // populated at ingest and kept version-invariant; used for the listing sort.
  // Optional so reads of docs indexed before this field existed do not fail
  // validation during the migration window (the sort treats it as `_last`).
  dateModified: z.string().optional()
    .describe("ISO 8601 date of this dataset's most recent version release"),
})
export type EsDataset = z.infer<typeof EsDatasetSchema>

// === ES Research Schema (diff: + status, uids) ===

export const ResearchStatusSchema = z.enum([
  "draft",
  "review",
  "published",
])
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>

export const EsResearchSchema = CrawlerResearchSchema.extend({
  status: ResearchStatusSchema
    .describe("Publication status: 'draft', 'review', or 'published'"),
  draftVersion: z.string().nullable()
    .describe("Version being edited (e.g., 'v2'). Null if no editing in progress."),
  // Short bilingual summaries used by the listing view. Source: Joomla
  // `humandbs.dbcls.jp/home` (ja article_id=58) and `/en/home` (en=168).
  // Null when the humId is not listed on the Joomla home page.
  summaryShort: z.object({
    methods: BilingualTextValueSchema,
    typeOfData: BilingualTextValueSchema,
    targets: BilingualTextValueSchema,
  }).nullable().optional()
    .describe("Short bilingual summaries for the listing view (research method / data type / target). Sourced from the Joomla home article."),
})
export type EsResearch = z.infer<typeof EsResearchSchema>

