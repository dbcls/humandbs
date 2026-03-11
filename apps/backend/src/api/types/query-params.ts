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
import { z } from "zod"

import { LANG_TYPES } from "./common"
import {
  PaginationQuerySchema,
  LangQueryBase,
  ResponseControlQuerySchema,
  FulltextQuerySchema,
  ResearchDateFilterQuerySchema,
  DatasetFilterQuerySchema,
} from "./query-schemas"

export { PaginationQuerySchema } from "./query-schemas"

// === Common Query Schemas ===

// Lang version query
export const LangVersionQuerySchema = z.object({
  lang: z
    .enum(LANG_TYPES)
    .default("ja")
    .describe("Response language for bilingual fields ('ja' or 'en')"),
  version: z
    .string()
    .regex(/^v\d+$/)
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

// === Research Listing Query (GET /research) ===

/**
 * Research listing query parameters (GET /research)
 * For complex searches with filters, use POST /research/search instead
 */
export const ResearchListingQuerySchema = PaginationQuerySchema
  .extend(LangQueryBase.shape)
  .extend(ResponseControlQuerySchema.shape)
  .extend({
    sort: z.enum(["humId", "title", "releaseDate"]).default("humId")
      .describe("Sort field"),
    order: z.enum(["asc", "desc"]).default("asc")
      .describe("Sort order"),
    status: z.enum(["draft", "review", "published", "deleted"]).optional()
      .describe("Filter by status. public: published only, authenticated: own draft/review/published, admin: all including deleted"),
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
    sort: z.enum(["humId", "title", "releaseDate", "datePublished", "dateModified", "relevance"]).default("humId")
      .describe("Sort field. Use 'relevance' for full-text search ranking"),
    order: z.enum(["asc", "desc"]).default("asc")
      .describe("Sort order (default: desc when sort=relevance)"),
    status: z.enum(["draft", "review", "published", "deleted"]).optional()
      .describe("Filter by status. public: published only, authenticated: own draft/review/published, admin: all including deleted"),
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
    sort: z.enum(["datasetId", "releaseDate"]).default("datasetId")
      .describe("Sort field"),
    order: z.enum(["asc", "desc"]).default("asc")
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
    sort: z.enum(["datasetId", "releaseDate", "relevance"]).default("datasetId")
      .describe("Sort field. Use 'relevance' for full-text search ranking"),
    order: z.enum(["asc", "desc"]).default("asc")
      .describe("Sort order (default: desc when sort=relevance)"),
    humId: z.string().optional()
      .describe("Filter by parent Research ID (exact match)"),
    typeOfData: z.string().optional()
      .describe("Filter by data type (partial match)"),
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
})
export type FacetFilterQuery = z.infer<typeof FacetFilterQuerySchema>

// === Research Summary (for list view) ===

export const ResearchSummarySchema = z.object({
  humId: z.string().describe("Research identifier (e.g., 'hum0001')"),
  lang: z
    .enum(LANG_TYPES)
    .describe("Language of text fields in this response ('ja' or 'en')"),
  title: z.string().describe("Research title in the requested language"),
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
    .string()
    .describe("Data access criteria summary (e.g., 'Controlled-access')"),
})
export type ResearchSummary = z.infer<typeof ResearchSummarySchema>
