/**
 * Search filter type definitions (POST search API)
 *
 * This module provides:
 * - Range filter schema
 * - Dataset filters schema
 * - Research search body schema
 * - Dataset search body schema
 */
import { z } from "zod"

// === Range Filter ===

/**
 * Range filter for numeric/date values
 */
export const RangeFilterSchema = z.object({
  min: z.union([z.string(), z.number()]).optional(),
  max: z.union([z.string(), z.number()]).optional(),
})
export type RangeFilter = z.infer<typeof RangeFilterSchema>

// === Dataset Filters (POST search) ===

/**
 * Dataset filters for POST search (used in both Research and Dataset search)
 * Values are arrays (OR logic within each filter)
 */
export const DatasetFiltersSchema = z.object({
  // Facet filters (category values)
  criteria: z.array(z.string()).optional()
    .describe("Data access criteria: Controlled-access (Type I/II), Unrestricted-access. Array for OR logic."),
  subjectCountType: z.array(z.enum(["individual", "sample", "mixed"])).optional()
    .describe("Subject count type: individual, sample, or mixed"),
  healthStatus: z.array(z.enum(["healthy", "affected", "mixed"])).optional()
    .describe("Health status: healthy, affected, or mixed"),
  disease: z.string().optional()
    .describe("Disease label partial match (free-text search)"),
  diseaseIcd10: z.array(z.string()).optional()
    .describe("ICD-10 disease codes (prefix match, e.g., 'C34' matches 'C34.1')"),
  tissues: z.array(z.string()).optional()
    .describe("Tissue types (facet selection)"),
  isTumor: z.boolean().optional()
    .describe("Filter by tumor sample status"),
  cellLine: z.array(z.string()).optional()
    .describe("Cell line names (facet selection)"),
  population: z.array(z.string()).optional()
    .describe("Population groups (facet selection)"),
  sex: z.array(z.enum(["male", "female", "mixed"])).optional()
    .describe("Biological sex: male, female, or mixed"),
  ageGroup: z.array(z.enum(["infant", "child", "adult", "elderly", "mixed"])).optional()
    .describe("Age groups: infant, child, adult, elderly, or mixed"),
  assayType: z.array(z.string()).optional()
    .describe("Assay types (e.g., WGS, WES, RNA-seq)"),
  libraryKits: z.array(z.string()).optional()
    .describe("Library preparation kits"),
  platform: z.array(z.string()).optional()
    .describe("Sequencing platforms (e.g., 'Illumina NovaSeq 6000')"),
  readType: z.array(z.enum(["single-end", "paired-end"])).optional()
    .describe("Read type: single-end or paired-end"),
  referenceGenome: z.array(z.string()).optional()
    .describe("Reference genomes (e.g., GRCh38, GRCh37)"),
  fileTypes: z.array(z.string()).optional()
    .describe("File types (e.g., FASTQ, BAM, VCF)"),
  processedDataTypes: z.array(z.string()).optional()
    .describe("Processed data types available"),
  hasPhenotypeData: z.boolean().optional()
    .describe("Filter by presence of phenotype data"),
  policyId: z.array(z.string()).optional()
    .describe("Data access policy IDs"),

  // Range filters
  releaseDate: RangeFilterSchema.optional()
    .describe("Dataset release date range (ISO 8601 format, e.g., {min: '2020-01-01', max: '2024-12-31'})"),
  subjectCount: RangeFilterSchema.optional()
    .describe("Subject count range (e.g., {min: 100, max: 1000})"),
  readLength: RangeFilterSchema.optional()
    .describe("Read length range in base pairs"),
  sequencingDepth: RangeFilterSchema.optional()
    .describe("Sequencing depth range (x)"),
  targetCoverage: RangeFilterSchema.optional()
    .describe("Target coverage range (%)"),
  dataVolumeGb: RangeFilterSchema.optional()
    .describe("Data volume range in GB"),
  variantSnv: RangeFilterSchema.optional()
    .describe("SNV variant count range"),
  variantIndel: RangeFilterSchema.optional()
    .describe("Indel variant count range"),
  variantCnv: RangeFilterSchema.optional()
    .describe("CNV variant count range"),
  variantSv: RangeFilterSchema.optional()
    .describe("SV variant count range"),
  variantTotal: RangeFilterSchema.optional()
    .describe("Total variant count range"),
})
export type DatasetFilters = z.infer<typeof DatasetFiltersSchema>

// === Research Search Body (POST /research/search) ===

/**
 * POST /research/search request body
 */
export const ResearchSearchBodySchema = z.object({
  // Language
  lang: z.enum(["ja", "en"]).optional().default("ja")
    .describe("Response language for bilingual fields"),

  // Pagination
  page: z.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),

  // Sort
  sort: z.enum(["humId", "datePublished", "dateModified", "relevance"]).optional()
    .describe("Sort field. Defaults to 'relevance' when query is provided, 'humId' otherwise"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order. Defaults to 'desc' when sort=relevance"),

  // Free-text search
  query: z.string().optional()
    .describe("Full-text search query. Searches title, aims, methods, and targets"),

  // Date range filters
  datePublished: RangeFilterSchema.optional()
    .describe("Filter by datePublished range (ISO 8601 format)"),
  dateModified: RangeFilterSchema.optional()
    .describe("Filter by dateModified range (ISO 8601 format)"),

  // Dataset attribute filters (parent-child filter)
  datasetFilters: DatasetFiltersSchema.optional()
    .describe("Filter Research by attributes of linked Datasets. Returns Research that has at least one Dataset matching the filters."),

  // Options
  includeFacets: z.boolean().default(false)
    .describe("Include facet aggregation counts in response"),
  fields: z.array(z.string()).optional()
    .describe("Additional fields to include in response"),
})
export type ResearchSearchBody = z.infer<typeof ResearchSearchBodySchema>

// === Dataset Search Body (POST /dataset/search) ===

/**
 * POST /dataset/search request body
 */
export const DatasetSearchBodySchema = z.object({
  // Language
  lang: z.enum(["ja", "en"]).optional().default("ja")
    .describe("Response language for bilingual fields"),

  // Pagination
  page: z.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),

  // Sort
  sort: z.enum(["datasetId", "releaseDate", "relevance"]).optional()
    .describe("Sort field. Defaults to 'relevance' when query is provided, 'datasetId' otherwise"),
  order: z.enum(["asc", "desc"]).default("asc")
    .describe("Sort order. Defaults to 'desc' when sort=relevance"),

  // Free-text search (unified query instead of separate metadataQuery/experimentQuery)
  query: z.string().optional()
    .describe("Full-text search query. Searches experiments (header, data, footers)"),

  // Parent Research filter
  humId: z.string().optional()
    .describe("Filter by parent Research ID (exact match)"),

  // Dataset filters
  filters: DatasetFiltersSchema.optional()
    .describe("Filter Datasets by various attributes"),

  // Options
  includeFacets: z.boolean().default(false)
    .describe("Include facet aggregation counts in response"),
  fields: z.array(z.string()).optional()
    .describe("Additional fields to include in response"),
})
export type DatasetSearchBody = z.infer<typeof DatasetSearchBodySchema>
