/**
 * Query parameter type definitions
 *
 * This module provides:
 * - Common query schemas (lang, version)
 * - Research listing/search query schemas
 * - Dataset listing/search query schemas
 * - Facet types
 */
import { z } from "zod"

import { LANG_TYPES, booleanFromString } from "@/api/types/common"
import { RESEARCH_STATUS } from "@/api/types/workflow"

// === Common Query Schemas ===

// Lang version query
export const LangVersionQuerySchema = z.object({
  lang: z.enum(LANG_TYPES).default("ja"),
  version: z.string().regex(/^v\d+$/).nullable().optional(),
  includeRawHtml: z.coerce.boolean().default(false),
})
export type LangVersionQuery = z.infer<typeof LangVersionQuerySchema>

// Lang query
export const LangQuerySchema = z.object({
  lang: z.enum(LANG_TYPES).default("ja"),
  includeRawHtml: z.coerce.boolean().default(false),
})
export type LangQuery = z.infer<typeof LangQuerySchema>

// === Facets ===

export const FacetItemSchema = z.object({
  value: z.string(),
  count: z.number(),
})
export type FacetItem = z.infer<typeof FacetItemSchema>

export const FacetsMapSchema = z.record(z.string(), z.array(FacetItemSchema))
export type FacetsMap = z.infer<typeof FacetsMapSchema>

// === Research Listing Query (GET /research) ===

/**
 * Research listing query parameters (GET /research)
 * For complex searches with filters, use POST /research/search instead
 */
export const ResearchListingQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
  lang: z.enum(LANG_TYPES).default("ja")
    .describe("Response language for bilingual fields"),
  sort: z.enum(["humId", "title", "releaseDate"]).default("humId")
    .describe("Sort field"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order"),

  // Status filter (admin only for non-published)
  status: z.enum(["draft", "review", "published", "deleted"]).optional()
    .describe("Filter by status. public: published only, authenticated: own draft/review/published, admin: all including deleted"),

  // Optional humId filter for specific research
  humId: z.string().optional()
    .describe("Filter by specific Research ID"),

  // Include facet counts in response
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields (e.g., summary.aims.rawHtml) in response"),
})
export type ResearchListingQuery = z.infer<typeof ResearchListingQuerySchema>

// === Research Search Query & Response ===

export const ResearchSearchQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
  lang: z.enum(LANG_TYPES).default("ja")
    .describe("Response language for bilingual fields"),
  sort: z.enum(["humId", "title", "releaseDate", "relevance"]).default("humId")
    .describe("Sort field. Use 'relevance' for full-text search ranking"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order (default: desc when sort=relevance)"),

  // Status filter (admin only for non-published)
  status: z.enum(["draft", "review", "published", "deleted"]).optional()
    .describe("Filter by status. public: published only, authenticated: own draft/review/published, admin: all including deleted"),

  // Full-text search
  q: z.string().optional()
    .describe("Full-text search query. Searches title, aims, methods, and targets"),

  // Research-specific filters (legacy, kept for backwards compatibility)
  releasedAfter: z.string().optional()
    .describe("Filter by release date >= (ISO 8601 date, legacy)"),
  releasedBefore: z.string().optional()
    .describe("Filter by release date <= (ISO 8601 date, legacy)"),

  // Date range filters for POST search
  minDatePublished: z.string().optional()
    .describe("Filter by datePublished >= (ISO 8601 date)"),
  maxDatePublished: z.string().optional()
    .describe("Filter by datePublished <= (ISO 8601 date)"),
  minDateModified: z.string().optional()
    .describe("Filter by dateModified >= (ISO 8601 date)"),
  maxDateModified: z.string().optional()
    .describe("Filter by dateModified <= (ISO 8601 date)"),

  // Filter Research by Dataset attributes (comma-separated for OR)
  assayType: z.string().optional()
    .describe("Filter by assay type (comma-separated for OR, e.g., 'WGS,WES')"),
  disease: z.string().optional()
    .describe("Filter by disease label (partial match)"),
  diseaseIcd10: z.string().optional()
    .describe("Filter by ICD-10 code (prefix match, comma-separated for OR)"),
  tissue: z.string().optional()
    .describe("Filter by tissue type (comma-separated for OR)"),
  population: z.string().optional()
    .describe("Filter by population (comma-separated for OR)"),
  platform: z.string().optional()
    .describe("Filter by sequencing platform (comma-separated for OR)"),
  criteria: z.string().optional()
    .describe("Filter by data access criteria: Controlled-access (Type I/II), Unrestricted-access"),
  fileType: z.string().optional()
    .describe("Filter by file type (comma-separated for OR)"),
  minSubjects: z.coerce.number().int().min(0).optional()
    .describe("Minimum subject count"),
  maxSubjects: z.coerce.number().int().min(0).optional()
    .describe("Maximum subject count"),

  // Extended filters
  healthStatus: z.string().optional()
    .describe("Filter by health status: healthy, affected, mixed (comma-separated for OR)"),
  subjectCountType: z.string().optional()
    .describe("Filter by subject count type: individual, sample, mixed"),
  sex: z.string().optional()
    .describe("Filter by sex: male, female, mixed (comma-separated for OR)"),
  ageGroup: z.string().optional()
    .describe("Filter by age group: infant, child, adult, elderly, mixed (comma-separated for OR)"),
  libraryKits: z.string().optional()
    .describe("Filter by library preparation kit (comma-separated for OR)"),
  readType: z.string().optional()
    .describe("Filter by read type: single-end, paired-end"),
  referenceGenome: z.string().optional()
    .describe("Filter by reference genome (comma-separated for OR)"),
  processedDataTypes: z.string().optional()
    .describe("Filter by processed data types (comma-separated for OR)"),
  hasPhenotypeData: booleanFromString
    .describe("Filter by presence of phenotype data"),
  cellLine: z.string().optional()
    .describe("Filter by cell line (exact match)"),
  isTumor: booleanFromString
    .describe("Filter by tumor sample status"),
  policyId: z.string().optional()
    .describe("Filter by data access policy ID"),

  // Range filters
  minReleaseDate: z.string().optional()
    .describe("Filter by Dataset release date >= (ISO 8601 date)"),
  maxReleaseDate: z.string().optional()
    .describe("Filter by Dataset release date <= (ISO 8601 date)"),
  minReadLength: z.coerce.number().int().min(0).optional()
    .describe("Minimum read length (bp)"),
  maxReadLength: z.coerce.number().int().min(0).optional()
    .describe("Maximum read length (bp)"),
  minSequencingDepth: z.coerce.number().min(0).optional()
    .describe("Minimum sequencing depth (x)"),
  maxSequencingDepth: z.coerce.number().min(0).optional()
    .describe("Maximum sequencing depth (x)"),
  minTargetCoverage: z.coerce.number().min(0).optional()
    .describe("Minimum target coverage (%)"),
  maxTargetCoverage: z.coerce.number().min(0).optional()
    .describe("Maximum target coverage (%)"),
  minDataVolumeGb: z.coerce.number().min(0).optional()
    .describe("Minimum data volume (GB)"),
  maxDataVolumeGb: z.coerce.number().min(0).optional()
    .describe("Maximum data volume (GB)"),
  minVariantSnv: z.coerce.number().int().min(0).optional()
    .describe("Minimum SNV variant count"),
  maxVariantSnv: z.coerce.number().int().min(0).optional()
    .describe("Maximum SNV variant count"),
  minVariantIndel: z.coerce.number().int().min(0).optional()
    .describe("Minimum indel variant count"),
  maxVariantIndel: z.coerce.number().int().min(0).optional()
    .describe("Maximum indel variant count"),
  minVariantCnv: z.coerce.number().int().min(0).optional()
    .describe("Minimum CNV variant count"),
  maxVariantCnv: z.coerce.number().int().min(0).optional()
    .describe("Maximum CNV variant count"),
  minVariantSv: z.coerce.number().int().min(0).optional()
    .describe("Minimum SV variant count"),
  maxVariantSv: z.coerce.number().int().min(0).optional()
    .describe("Maximum SV variant count"),
  minVariantTotal: z.coerce.number().int().min(0).optional()
    .describe("Minimum total variant count"),
  maxVariantTotal: z.coerce.number().int().min(0).optional()
    .describe("Maximum total variant count"),

  // Include facet counts in response
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields in response"),
})
export type ResearchSearchQuery = z.infer<typeof ResearchSearchQuerySchema>

// === Dataset Listing Query (GET /dataset) ===

/**
 * Dataset listing query parameters (GET /dataset)
 * For complex searches with filters, use POST /dataset/search instead
 */
export const DatasetListingQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
  lang: z.enum(LANG_TYPES).default("ja")
    .describe("Response language for bilingual fields"),
  sort: z.enum(["datasetId", "releaseDate"]).default("datasetId")
    .describe("Sort field"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order"),

  // Parent Research ID filter
  humId: z.string().optional()
    .describe("Filter by parent Research ID"),

  // Include facet counts in response
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields in response"),
})
export type DatasetListingQuery = z.infer<typeof DatasetListingQuerySchema>

// === Dataset Search Query ===

export const DatasetSearchQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
  lang: z.enum(LANG_TYPES).default("ja")
    .describe("Response language for bilingual fields"),
  sort: z.enum(["datasetId", "releaseDate", "subjectCount", "relevance"]).default("datasetId")
    .describe("Sort field. Use 'relevance' for full-text search ranking"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order (default: desc when sort=relevance)"),

  // Full-text search
  q: z.string().optional()
    .describe("Full-text search query. Searches experiments (header, data, footers)"),

  // Dataset filters
  humId: z.string().optional()
    .describe("Filter by parent Research ID (exact match)"),
  criteria: z.string().optional()
    .describe("Filter by data access criteria (comma-separated for OR)"),
  typeOfData: z.string().optional()
    .describe("Filter by data type (partial match)"),
  assayType: z.string().optional()
    .describe("Filter by assay type (comma-separated for OR)"),
  disease: z.string().optional()
    .describe("Filter by disease label (partial match)"),
  diseaseIcd10: z.string().optional()
    .describe("Filter by ICD-10 code (prefix match, comma-separated for OR)"),
  tissue: z.string().optional()
    .describe("Filter by tissue type (comma-separated for OR)"),
  population: z.string().optional()
    .describe("Filter by population (comma-separated for OR)"),
  platform: z.string().optional()
    .describe("Filter by sequencing platform model (comma-separated for OR)"),
  fileType: z.string().optional()
    .describe("Filter by file type (comma-separated for OR)"),
  minSubjects: z.coerce.number().int().min(0).optional()
    .describe("Minimum subject count"),
  maxSubjects: z.coerce.number().int().min(0).optional()
    .describe("Maximum subject count"),

  // Extended filters
  healthStatus: z.string().optional()
    .describe("Filter by health status: healthy, affected, mixed (comma-separated for OR)"),
  subjectCountType: z.string().optional()
    .describe("Filter by subject count type: individual, sample, mixed"),
  sex: z.string().optional()
    .describe("Filter by sex: male, female, mixed (comma-separated for OR)"),
  ageGroup: z.string().optional()
    .describe("Filter by age group: infant, child, adult, elderly, mixed (comma-separated for OR)"),
  libraryKits: z.string().optional()
    .describe("Filter by library preparation kit (comma-separated for OR)"),
  readType: z.string().optional()
    .describe("Filter by read type: single-end, paired-end"),
  referenceGenome: z.string().optional()
    .describe("Filter by reference genome (comma-separated for OR)"),
  processedDataTypes: z.string().optional()
    .describe("Filter by processed data types (comma-separated for OR)"),
  hasPhenotypeData: booleanFromString
    .describe("Filter by presence of phenotype data"),
  cellLine: z.string().optional()
    .describe("Filter by cell line (exact match)"),
  isTumor: booleanFromString
    .describe("Filter by tumor sample status"),
  policyId: z.string().optional()
    .describe("Filter by data access policy ID"),

  // Range filters
  minReleaseDate: z.string().optional()
    .describe("Filter by release date >= (ISO 8601 date)"),
  maxReleaseDate: z.string().optional()
    .describe("Filter by release date <= (ISO 8601 date)"),
  minReadLength: z.coerce.number().int().min(0).optional()
    .describe("Minimum read length (bp)"),
  maxReadLength: z.coerce.number().int().min(0).optional()
    .describe("Maximum read length (bp)"),
  minSequencingDepth: z.coerce.number().min(0).optional()
    .describe("Minimum sequencing depth (x)"),
  maxSequencingDepth: z.coerce.number().min(0).optional()
    .describe("Maximum sequencing depth (x)"),
  minTargetCoverage: z.coerce.number().min(0).optional()
    .describe("Minimum target coverage (%)"),
  maxTargetCoverage: z.coerce.number().min(0).optional()
    .describe("Maximum target coverage (%)"),
  minDataVolumeGb: z.coerce.number().min(0).optional()
    .describe("Minimum data volume (GB)"),
  maxDataVolumeGb: z.coerce.number().min(0).optional()
    .describe("Maximum data volume (GB)"),
  minVariantSnv: z.coerce.number().int().min(0).optional()
    .describe("Minimum SNV variant count"),
  maxVariantSnv: z.coerce.number().int().min(0).optional()
    .describe("Maximum SNV variant count"),
  minVariantIndel: z.coerce.number().int().min(0).optional()
    .describe("Minimum indel variant count"),
  maxVariantIndel: z.coerce.number().int().min(0).optional()
    .describe("Maximum indel variant count"),
  minVariantCnv: z.coerce.number().int().min(0).optional()
    .describe("Minimum CNV variant count"),
  maxVariantCnv: z.coerce.number().int().min(0).optional()
    .describe("Maximum CNV variant count"),
  minVariantSv: z.coerce.number().int().min(0).optional()
    .describe("Minimum SV variant count"),
  maxVariantSv: z.coerce.number().int().min(0).optional()
    .describe("Maximum SV variant count"),
  minVariantTotal: z.coerce.number().int().min(0).optional()
    .describe("Minimum total variant count"),
  maxVariantTotal: z.coerce.number().int().min(0).optional()
    .describe("Maximum total variant count"),

  // Include facet counts in response
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),

  // Include rawHtml fields in response (default: false)
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields in response"),
})
export type DatasetSearchQuery = z.infer<typeof DatasetSearchQuerySchema>

// === Research Summary (for list view) ===

export const ResearchSummarySchema = z.object({
  humId: z.string(),
  lang: z.enum(LANG_TYPES),
  title: z.string(),
  versions: z.array(z.object({
    version: z.string(),
    releaseDate: z.string(),
  })),
  methods: z.string(),
  datasetIds: z.array(z.string()),
  typeOfData: z.array(z.string()),
  platforms: z.array(z.string()),
  targets: z.string(),
  dataProvider: z.array(z.string()),
  criteria: z.string(),
})
export type ResearchSummary = z.infer<typeof ResearchSummarySchema>

// === Search Query (Legacy) ===

/**
 * Search query parameters
 */
export const SearchQuerySchema = z.object({
  q: z.string().optional(), // Full-text search

  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["relevance", "releaseDate", "title"]).default("relevance"),
  order: z.enum(["asc", "desc"]).default("desc"),

  // Research filters
  dataProvider: z.string().optional(),
  organization: z.string().optional(),
  releasedAfter: z.string().optional(), // ISO 8601 date
  releasedBefore: z.string().optional(), // ISO 8601 date

  // Filter Research by Dataset attributes
  assayType: z.string().optional(),
  disease: z.string().optional(),
  tissue: z.string().optional(),
  platform: z.string().optional(),
  hasHealthyControl: z.coerce.boolean().optional(),

  // Dataset-specific filters
  criteria: z.string().optional(),
  minSubjects: z.coerce.number().int().min(0).optional(),
  maxSubjects: z.coerce.number().int().min(0).optional(),
})
export type SearchQuery = z.infer<typeof SearchQuerySchema>

// === List Query Schemas (for CRUD) ===

/**
 * Research list query parameters
 */
export const ResearchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["humId", "title", "releaseDate", "updatedAt"]).default("humId"),
  order: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(RESEARCH_STATUS).optional(), // For authenticated users
})
export type ResearchListQuery = z.infer<typeof ResearchListQuerySchema>

/**
 * Dataset list query parameters
 */
export const DatasetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["datasetId", "releaseDate", "updatedAt"]).default("datasetId"),
  order: z.enum(["asc", "desc"]).default("asc"),
})
export type DatasetListQuery = z.infer<typeof DatasetListQuerySchema>
