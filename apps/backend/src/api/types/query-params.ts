/**
 * Query parameter type definitions
 *
 * This module provides:
 * - Common query schemas (lang, version)
 * - Research listing/search query schemas
 * - Dataset listing/search query schemas
 *
 * Search/listing schemas are composed from reusable fragments in query-schemas.ts.
 */
import "@hono/zod-openapi"
import { z } from "zod"

import { CriteriaCanonicalSchema } from "../../es/types"
import { BATCH } from "../constants"

import { LANG_TYPES, BilingualTextSchema, VersionStringSchema } from "./common"
import {
  PaginationQuerySchema,
  LangQueryBase,
  ResponseControlQuerySchema,
  FulltextQuerySchema,
  ResearchDateFilterQuerySchema,
  DatasetFilterQuerySchema,
} from "./query-schemas"
import { RESEARCH_STATUS } from "./workflow"

export { PaginationQuerySchema } from "./query-schemas"

// === Sort enums (shared across GET query params and POST body) ===

export const RESEARCH_LISTING_SORT = ["humId", "title", "releaseDate"] as const
export const RESEARCH_SEARCH_SORT = ["humId", "title", "releaseDate", "datePublished", "dateModified", "relevance"] as const
export const DATASET_LISTING_SORT = ["datasetId", "releaseDate", "dateModified"] as const
export const DATASET_SEARCH_SORT = ["datasetId", "releaseDate", "dateModified", "relevance"] as const
export const SORT_ORDER = ["asc", "desc"] as const

// === Common Query Schemas ===

// Lang version query
export const LangVersionQuerySchema = z.object({
  lang: z
    .enum(LANG_TYPES)
    .default("ja")
    .describe("Response language for bilingual fields ('ja' or 'en')"),
  version: VersionStringSchema
    .nullable()
    .optional()
    .describe(
      "Specific version to retrieve (e.g., 'v1', 'v2'). Defaults to latest version.",
    ),
  includeRawHtml: z.coerce
    .boolean()
    .default(false)
    .describe(
      "Include rawHtml fields in response (default: false). Useful for rich text editing.",
    ),
})
export type LangVersionQuery = z.infer<typeof LangVersionQuerySchema>

// Lang query
export const LangQuerySchema = z.object({
  lang: z
    .enum(LANG_TYPES)
    .default("ja")
    .describe("Response language for bilingual fields ('ja' or 'en')"),
  includeRawHtml: z.coerce
    .boolean()
    .default(false)
    .describe(
      "Include rawHtml fields in response (default: false). Useful for rich text editing.",
    ),
})
export type LangQuery = z.infer<typeof LangQuerySchema>

// === Batch Get Query (GET /dataset/batch, GET /research/batch) ===

/**
 * Parse the `ids` query parameter into a string array.
 *
 * Accepts a comma-separated value (`?ids=a,b,c`) and is also tolerant of
 * repeated parameters (`?ids=a&ids=b`). Blank entries and surrounding
 * whitespace are dropped. Follows the `z.preprocess` idiom used by
 * `booleanFromString` (common.ts).
 */
const BatchIdsSchema = z.preprocess(
  (v) => {
    const raw = Array.isArray(v) ? v : typeof v === "string" ? [v] : null
    if (raw === null) return v
    return raw
      .flatMap((s) => (typeof s === "string" ? s.split(",") : []))
      .map((s) => s.trim())
      .filter(Boolean)
  },
  z.array(z.string().min(1)).min(1).max(BATCH.MAX_IDS),
).describe(
  `Comma-separated resource IDs (e.g. 'JGAD000001,JGAD000002'). At least 1, at most ${BATCH.MAX_IDS}.`,
)

/**
 * Dataset batch-get query (GET /dataset/batch).
 * `ids` are datasetIds; the latest version of each is returned.
 */
export const DatasetBatchQuerySchema = LangQuerySchema.extend({
  ids: BatchIdsSchema,
})
export type DatasetBatchQuery = z.infer<typeof DatasetBatchQuerySchema>

/**
 * Research batch-get query (GET /research/batch).
 * `ids` are humIds; the latest version of each is returned.
 */
export const ResearchBatchQuerySchema = LangQuerySchema.extend({
  ids: BatchIdsSchema,
})
export type ResearchBatchQuery = z.infer<typeof ResearchBatchQuerySchema>

// === Research Listing Query (GET /research) ===

/**
 * Research listing query parameters (GET /research)
 * For complex searches with filters, use POST /research/search instead
 */
export const ResearchListingQuerySchema = PaginationQuerySchema
  .extend(LangQueryBase.shape)
  .extend(ResponseControlQuerySchema.shape)
  .extend({
    sort: z.enum(RESEARCH_LISTING_SORT).default("humId")
      .describe("Sort field"),
    order: z.enum(SORT_ORDER).default("asc")
      .describe("Sort order"),
    status: z.enum(RESEARCH_STATUS).optional()
      .describe("Filter by status. public: published only, authenticated: own draft/review/published, admin: all"),
    humId: z.string().optional()
      .describe("Filter by specific Research ID"),
  })
export type ResearchListingQuery = z.infer<typeof ResearchListingQuerySchema>

// === Research Search Query & Response ===

export const ResearchSearchQuerySchema = PaginationQuerySchema
  .extend(LangQueryBase.shape)
  .extend(ResponseControlQuerySchema.shape)
  .extend(FulltextQuerySchema.shape)
  .extend(ResearchDateFilterQuerySchema.shape)
  .extend(DatasetFilterQuerySchema.shape)
  .extend({
    sort: z.enum(RESEARCH_SEARCH_SORT).optional()
      .describe("Sort field. Defaults to 'relevance' when q is provided, 'humId' otherwise"),
    order: z.enum(SORT_ORDER).default("asc")
      .describe("Sort order (default: desc when sort=relevance)"),
    status: z.enum(RESEARCH_STATUS).optional()
      .describe("Filter by status. public: published only, authenticated: own draft/review/published, admin: all"),
    humId: z.string().optional()
      .describe("Filter by specific Research ID"),
  })
export type ResearchSearchQuery = z.infer<typeof ResearchSearchQuerySchema>

// === Dataset Listing Query (GET /dataset) ===

/**
 * Dataset listing query parameters (GET /dataset)
 * For complex searches with filters, use POST /dataset/search instead
 */
export const DatasetListingQuerySchema = PaginationQuerySchema
  .extend(LangQueryBase.shape)
  .extend(ResponseControlQuerySchema.shape)
  .extend({
    sort: z.enum(DATASET_LISTING_SORT).default("datasetId")
      .describe("Sort field"),
    order: z.enum(SORT_ORDER).default("asc")
      .describe("Sort order"),
    humId: z.string().optional()
      .describe("Filter by parent Research ID"),
  })
export type DatasetListingQuery = z.infer<typeof DatasetListingQuerySchema>

// === Dataset Search Query ===

export const DatasetSearchQuerySchema = PaginationQuerySchema
  .extend(LangQueryBase.shape)
  .extend(ResponseControlQuerySchema.shape)
  .extend(FulltextQuerySchema.shape)
  .extend(DatasetFilterQuerySchema.shape)
  .extend({
    sort: z.enum(DATASET_SEARCH_SORT).optional()
      .describe("Sort field. Defaults to 'relevance' when q is provided, 'datasetId' otherwise"),
    order: z.enum(SORT_ORDER).default("asc")
      .describe("Sort order (default: desc when sort=relevance)"),
    humId: z.string().optional()
      .describe("Filter by parent Research ID (exact match)"),
    typeOfData: z.string().max(256).optional()
      .describe("Filter by data type (tokenized match against typeOfData.ja / .en, max 256 chars)"),
  })
export type DatasetSearchQuery = z.infer<typeof DatasetSearchQuerySchema>

/**
 * Facet filter query parameters (GET /facets, GET /facets/{fieldName})
 * DatasetSearchQuerySchema from pagination, sort, lang, includeFacets, includeRawHtml
 */
export const FacetFilterQuerySchema = DatasetSearchQuerySchema.omit({
  page: true,
  limit: true,
  lang: true,
  sort: true,
  order: true,
  includeFacets: true,
  includeRawHtml: true,
}).extend({
  countBy: z.enum(["research", "dataset"]).default("dataset")
    .describe(
      "Entity to count in each facet bucket. 'research' counts unique Researches (humId), "
      + "'dataset' counts unique Datasets (datasetId). Defaults to 'dataset' for backward compatibility.",
    ),
})
export type FacetFilterQuery = z.infer<typeof FacetFilterQuerySchema>

// === Research Summary (for list view) ===

export const ResearchSummarySchema = z.object({
  humId: z.string().describe("Research identifier (e.g., 'hum0001')"),
  lang: z
    .enum(LANG_TYPES)
    .describe("Language of text fields in this response ('ja' or 'en')"),
  title: BilingualTextSchema.describe("Research title in Japanese and English"),
  versions: z
    .array(
      z.object({
        version: z.string().describe("Version identifier (e.g., 'v1', 'v2')"),
        releaseDate: z
          .string()
          .describe("ISO 8601 date when this version was released"),
      }),
    )
    .describe("Available versions of this Research"),
  methods: z.string().describe("Summary of research methods (plain text)"),
  datasetIds: z
    .array(z.string())
    .describe("IDs of datasets belonging to this Research"),
  typeOfData: z
    .array(z.string())
    .describe("Types of data available (aggregated from datasets)"),
  platforms: z
    .array(z.string())
    .describe("Sequencing platforms used (aggregated from datasets)"),
  targets: z.string().describe("Summary of research targets (plain text)"),
  dataProvider: z.array(z.string()).describe("Names of data providers"),
  criteria: z
    .array(CriteriaCanonicalSchema)
    .describe(
      "Distinct access criteria across the Research's datasets, in canonical order (strictest first)",
    ),
  status: z.enum(RESEARCH_STATUS)
    .describe("Publication status. Owner/admin sees actual status, others see 'published'."),
})
export type ResearchSummary = z.infer<typeof ResearchSummarySchema>

// === JGA Shinsei List Query ===

export const JgaShinseiDsListQuerySchema = PaginationQuerySchema.extend({
  dsDuId: z.string().regex(/^J-DS\d+$/).optional()
    .describe("Filter by master DS ID (e.g., 'J-DS002494'). Returns all versions of this master."),
})
export type JgaShinseiDsListQuery = z.infer<typeof JgaShinseiDsListQuerySchema>

export const JgaShinseiDuListQuerySchema = PaginationQuerySchema.extend({
  dsDuId: z.string().regex(/^J-DU\d+$/).optional()
    .describe("Filter by master DU ID (e.g., 'J-DU006498'). Returns all versions of this master."),
})
export type JgaShinseiDuListQuery = z.infer<typeof JgaShinseiDuListQuerySchema>
