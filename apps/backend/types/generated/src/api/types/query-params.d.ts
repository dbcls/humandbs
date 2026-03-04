/**
 * Query parameter type definitions
 *
 * This module provides:
 * - Common query schemas (lang, version)
 * - Research listing/search query schemas
 * - Dataset listing/search query schemas
 */
import { z } from "zod";
export declare const LangVersionQuerySchema: z.ZodObject<{
    lang: z.ZodDefault<z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>>;
    version: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    includeRawHtml: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
}, z.core.$strip>;
export type LangVersionQuery = z.infer<typeof LangVersionQuerySchema>;
export declare const LangQuerySchema: z.ZodObject<{
    lang: z.ZodDefault<z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>>;
    includeRawHtml: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
}, z.core.$strip>;
export type LangQuery = z.infer<typeof LangQuerySchema>;
/**
 * Research listing query parameters (GET /research)
 * For complex searches with filters, use POST /research/search instead
 */
export declare const ResearchListingQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    lang: z.ZodDefault<z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>>;
    sort: z.ZodDefault<z.ZodEnum<{
        releaseDate: "releaseDate";
        title: "title";
        humId: "humId";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        review: "review";
        published: "published";
        deleted: "deleted";
    }>>;
    humId: z.ZodOptional<z.ZodString>;
    includeFacets: z.ZodOptional<z.ZodPipe<z.ZodTransform<boolean | undefined, unknown>, z.ZodOptional<z.ZodBoolean>>>;
    includeRawHtml: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
}, z.core.$strip>;
export type ResearchListingQuery = z.infer<typeof ResearchListingQuerySchema>;
export declare const ResearchSearchQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    lang: z.ZodDefault<z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>>;
    sort: z.ZodDefault<z.ZodEnum<{
        releaseDate: "releaseDate";
        title: "title";
        humId: "humId";
        datePublished: "datePublished";
        dateModified: "dateModified";
        relevance: "relevance";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        review: "review";
        published: "published";
        deleted: "deleted";
    }>>;
    q: z.ZodOptional<z.ZodString>;
    releasedAfter: z.ZodOptional<z.ZodString>;
    releasedBefore: z.ZodOptional<z.ZodString>;
    minDatePublished: z.ZodOptional<z.ZodString>;
    maxDatePublished: z.ZodOptional<z.ZodString>;
    minDateModified: z.ZodOptional<z.ZodString>;
    maxDateModified: z.ZodOptional<z.ZodString>;
    assayType: z.ZodOptional<z.ZodString>;
    disease: z.ZodOptional<z.ZodString>;
    diseaseIcd10: z.ZodOptional<z.ZodString>;
    tissues: z.ZodOptional<z.ZodString>;
    population: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodString>;
    criteria: z.ZodOptional<z.ZodString>;
    fileTypes: z.ZodOptional<z.ZodString>;
    minSubjects: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxSubjects: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    healthStatus: z.ZodOptional<z.ZodString>;
    subjectCountType: z.ZodOptional<z.ZodString>;
    sex: z.ZodOptional<z.ZodString>;
    ageGroup: z.ZodOptional<z.ZodString>;
    libraryKits: z.ZodOptional<z.ZodString>;
    readType: z.ZodOptional<z.ZodString>;
    referenceGenome: z.ZodOptional<z.ZodString>;
    processedDataTypes: z.ZodOptional<z.ZodString>;
    hasPhenotypeData: z.ZodPipe<z.ZodTransform<boolean | undefined, unknown>, z.ZodOptional<z.ZodBoolean>>;
    cellLine: z.ZodOptional<z.ZodString>;
    isTumor: z.ZodOptional<z.ZodEnum<{
        mixed: "mixed";
        tumor: "tumor";
        normal: "normal";
    }>>;
    policyId: z.ZodOptional<z.ZodString>;
    minReleaseDate: z.ZodOptional<z.ZodString>;
    maxReleaseDate: z.ZodOptional<z.ZodString>;
    minReadLength: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxReadLength: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minSequencingDepth: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxSequencingDepth: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minTargetCoverage: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxTargetCoverage: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minDataVolumeGb: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxDataVolumeGb: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantSnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantSnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantIndel: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantIndel: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantCnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantCnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantSv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantSv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantTotal: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantTotal: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    includeFacets: z.ZodPipe<z.ZodTransform<boolean | undefined, unknown>, z.ZodOptional<z.ZodBoolean>>;
    includeRawHtml: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
}, z.core.$strip>;
export type ResearchSearchQuery = z.infer<typeof ResearchSearchQuerySchema>;
/**
 * Dataset listing query parameters (GET /dataset)
 * For complex searches with filters, use POST /dataset/search instead
 */
export declare const DatasetListingQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    lang: z.ZodDefault<z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>>;
    sort: z.ZodDefault<z.ZodEnum<{
        datasetId: "datasetId";
        releaseDate: "releaseDate";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    humId: z.ZodOptional<z.ZodString>;
    includeFacets: z.ZodOptional<z.ZodPipe<z.ZodTransform<boolean | undefined, unknown>, z.ZodOptional<z.ZodBoolean>>>;
    includeRawHtml: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
}, z.core.$strip>;
export type DatasetListingQuery = z.infer<typeof DatasetListingQuerySchema>;
export declare const DatasetSearchQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    lang: z.ZodDefault<z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>>;
    sort: z.ZodDefault<z.ZodEnum<{
        datasetId: "datasetId";
        releaseDate: "releaseDate";
        relevance: "relevance";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    q: z.ZodOptional<z.ZodString>;
    humId: z.ZodOptional<z.ZodString>;
    criteria: z.ZodOptional<z.ZodString>;
    typeOfData: z.ZodOptional<z.ZodString>;
    assayType: z.ZodOptional<z.ZodString>;
    disease: z.ZodOptional<z.ZodString>;
    diseaseIcd10: z.ZodOptional<z.ZodString>;
    tissues: z.ZodOptional<z.ZodString>;
    population: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodString>;
    fileTypes: z.ZodOptional<z.ZodString>;
    minSubjects: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxSubjects: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    healthStatus: z.ZodOptional<z.ZodString>;
    subjectCountType: z.ZodOptional<z.ZodString>;
    sex: z.ZodOptional<z.ZodString>;
    ageGroup: z.ZodOptional<z.ZodString>;
    libraryKits: z.ZodOptional<z.ZodString>;
    readType: z.ZodOptional<z.ZodString>;
    referenceGenome: z.ZodOptional<z.ZodString>;
    processedDataTypes: z.ZodOptional<z.ZodString>;
    hasPhenotypeData: z.ZodPipe<z.ZodTransform<boolean | undefined, unknown>, z.ZodOptional<z.ZodBoolean>>;
    cellLine: z.ZodOptional<z.ZodString>;
    isTumor: z.ZodOptional<z.ZodEnum<{
        mixed: "mixed";
        tumor: "tumor";
        normal: "normal";
    }>>;
    policyId: z.ZodOptional<z.ZodString>;
    minReleaseDate: z.ZodOptional<z.ZodString>;
    maxReleaseDate: z.ZodOptional<z.ZodString>;
    minReadLength: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxReadLength: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minSequencingDepth: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxSequencingDepth: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minTargetCoverage: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxTargetCoverage: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minDataVolumeGb: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxDataVolumeGb: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantSnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantSnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantIndel: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantIndel: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantCnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantCnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantSv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantSv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantTotal: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantTotal: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    includeFacets: z.ZodPipe<z.ZodTransform<boolean | undefined, unknown>, z.ZodOptional<z.ZodBoolean>>;
    includeRawHtml: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
}, z.core.$strip>;
export type DatasetSearchQuery = z.infer<typeof DatasetSearchQuerySchema>;
/**
 * Facet filter query parameters (GET /facets, GET /facets/{fieldName})
 * DatasetSearchQuerySchema from pagination, sort, lang, includeFacets, includeRawHtml
 */
export declare const FacetFilterQuerySchema: z.ZodObject<{
    criteria: z.ZodOptional<z.ZodString>;
    typeOfData: z.ZodOptional<z.ZodString>;
    subjectCountType: z.ZodOptional<z.ZodString>;
    healthStatus: z.ZodOptional<z.ZodString>;
    tissues: z.ZodOptional<z.ZodString>;
    isTumor: z.ZodOptional<z.ZodEnum<{
        mixed: "mixed";
        tumor: "tumor";
        normal: "normal";
    }>>;
    cellLine: z.ZodOptional<z.ZodString>;
    population: z.ZodOptional<z.ZodString>;
    sex: z.ZodOptional<z.ZodString>;
    ageGroup: z.ZodOptional<z.ZodString>;
    assayType: z.ZodOptional<z.ZodString>;
    libraryKits: z.ZodOptional<z.ZodString>;
    readType: z.ZodOptional<z.ZodString>;
    referenceGenome: z.ZodOptional<z.ZodString>;
    hasPhenotypeData: z.ZodPipe<z.ZodTransform<boolean | undefined, unknown>, z.ZodOptional<z.ZodBoolean>>;
    fileTypes: z.ZodOptional<z.ZodString>;
    processedDataTypes: z.ZodOptional<z.ZodString>;
    humId: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodString>;
    disease: z.ZodOptional<z.ZodString>;
    diseaseIcd10: z.ZodOptional<z.ZodString>;
    policyId: z.ZodOptional<z.ZodString>;
    q: z.ZodOptional<z.ZodString>;
    minSubjects: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxSubjects: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minReleaseDate: z.ZodOptional<z.ZodString>;
    maxReleaseDate: z.ZodOptional<z.ZodString>;
    minReadLength: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxReadLength: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minSequencingDepth: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxSequencingDepth: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minTargetCoverage: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxTargetCoverage: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minDataVolumeGb: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxDataVolumeGb: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantSnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantSnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantIndel: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantIndel: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantCnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantCnv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantSv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantSv: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    minVariantTotal: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxVariantTotal: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type FacetFilterQuery = z.infer<typeof FacetFilterQuerySchema>;
export declare const ResearchSummarySchema: z.ZodObject<{
    humId: z.ZodString;
    lang: z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>;
    title: z.ZodString;
    versions: z.ZodArray<z.ZodObject<{
        version: z.ZodString;
        releaseDate: z.ZodString;
    }, z.core.$strip>>;
    methods: z.ZodString;
    datasetIds: z.ZodArray<z.ZodString>;
    typeOfData: z.ZodArray<z.ZodString>;
    platforms: z.ZodArray<z.ZodString>;
    targets: z.ZodString;
    dataProvider: z.ZodArray<z.ZodString>;
    criteria: z.ZodString;
}, z.core.$strip>;
export type ResearchSummary = z.infer<typeof ResearchSummarySchema>;
/**
 * Search query parameters
 */
export declare const SearchQuerySchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    sort: z.ZodDefault<z.ZodEnum<{
        releaseDate: "releaseDate";
        title: "title";
        relevance: "relevance";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    dataProvider: z.ZodOptional<z.ZodString>;
    organization: z.ZodOptional<z.ZodString>;
    releasedAfter: z.ZodOptional<z.ZodString>;
    releasedBefore: z.ZodOptional<z.ZodString>;
    assayType: z.ZodOptional<z.ZodString>;
    disease: z.ZodOptional<z.ZodString>;
    tissues: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodString>;
    hasHealthyControl: z.ZodOptional<z.ZodCoercedBoolean<unknown>>;
    criteria: z.ZodOptional<z.ZodString>;
    minSubjects: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    maxSubjects: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
/**
 * Research list query parameters
 */
export declare const ResearchListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    sort: z.ZodDefault<z.ZodEnum<{
        releaseDate: "releaseDate";
        title: "title";
        humId: "humId";
        updatedAt: "updatedAt";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        review: "review";
        published: "published";
        deleted: "deleted";
    }>>;
}, z.core.$strip>;
export type ResearchListQuery = z.infer<typeof ResearchListQuerySchema>;
/**
 * Dataset list query parameters
 */
export declare const DatasetListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    sort: z.ZodDefault<z.ZodEnum<{
        datasetId: "datasetId";
        releaseDate: "releaseDate";
        updatedAt: "updatedAt";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
}, z.core.$strip>;
export type DatasetListQuery = z.infer<typeof DatasetListQuerySchema>;
//# sourceMappingURL=query-params.d.ts.map