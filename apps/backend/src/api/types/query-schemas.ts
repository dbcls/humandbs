/**
 * Composable query schema fragments
 *
 * This module provides:
 * - Reusable Zod schema fragments for query parameters
 * - Pagination, language, response control, fulltext, date filter, dataset filter
 *
 * These fragments are composed via .merge()/.extend() in query-params.ts
 * to build endpoint-specific query schemas.
 */
import { z } from "zod"

import { IsTumorSchema } from "../../es/types"

import { LANG_TYPES, booleanFromString } from "./common"

// === Pagination ===

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1)
    .describe("Page number for pagination (1-indexed)"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
    .describe("Number of items per page (max: 100)"),
})

// === Language ===

export const LangQueryBase = z.object({
  lang: z.enum(LANG_TYPES).default("ja")
    .describe("Response language for bilingual fields ('ja' or 'en')"),
})

// === Response Control ===

export const ResponseControlQuerySchema = z.object({
  includeFacets: booleanFromString
    .describe("Include facet aggregation counts in response"),
  includeRawHtml: z.coerce.boolean().default(false)
    .describe("Include rawHtml fields in response"),
})

// === Full-text Search ===

export const FulltextQuerySchema = z.object({
  q: z.string().optional()
    .describe("Full-text search query"),
})

// === Research Date Filters ===

export const ResearchDateFilterQuerySchema = z.object({
  minDatePublished: z.string().optional()
    .describe("Filter by datePublished >= (ISO 8601 date)"),
  maxDatePublished: z.string().optional()
    .describe("Filter by datePublished <= (ISO 8601 date)"),
  minDateModified: z.string().optional()
    .describe("Filter by dateModified >= (ISO 8601 date)"),
  maxDateModified: z.string().optional()
    .describe("Filter by dateModified <= (ISO 8601 date)"),
})

// === Dataset Filter (shared between Dataset Search and Research Search) ===

export const DatasetFilterQuerySchema = z.object({
  // Facet filters
  criteria: z.string().optional()
    .describe("Filter by data access criteria: Controlled-access (Type I/II), Unrestricted-access"),
  assayType: z.string().optional()
    .describe("Filter by assay type (comma-separated for OR, e.g., 'WGS,WES')"),
  disease: z.string().optional()
    .describe("Filter by disease label (partial match)"),
  diseaseIcd10: z.string().optional()
    .describe("Filter by ICD-10 code (prefix match, comma-separated for OR)"),
  tissues: z.string().optional()
    .describe("Filter by tissue type (comma-separated for OR)"),
  population: z.string().optional()
    .describe("Filter by population (comma-separated for OR)"),
  platform: z.string().optional()
    .describe("Filter by sequencing platform (comma-separated for OR)"),
  fileTypes: z.string().optional()
    .describe("Filter by file type (comma-separated for OR)"),
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
  isTumor: IsTumorSchema.optional()
    .describe("Filter by tumor sample status: tumor, normal, or mixed"),
  policyId: z.string().optional()
    .describe("Filter by data access policy ID"),

  // Range filters
  minReleaseDate: z.string().optional()
    .describe("Filter by Dataset release date >= (ISO 8601 date)"),
  maxReleaseDate: z.string().optional()
    .describe("Filter by Dataset release date <= (ISO 8601 date)"),
  minSubjects: z.coerce.number().int().min(0).optional()
    .describe("Minimum subject count"),
  maxSubjects: z.coerce.number().int().min(0).optional()
    .describe("Maximum subject count"),
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
})
