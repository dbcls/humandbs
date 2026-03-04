/**
 * Facet Type Definitions
 *
 * Centralized facet name definitions for type safety.
 */
import { z } from "zod";
/**
 * Available facet names for Dataset search
 */
export declare const DATASET_FACET_NAMES: readonly ["criteria", "assayType", "healthStatus", "subjectCountType", "sex", "ageGroup", "tissues", "population", "platform", "libraryKits", "readType", "referenceGenome", "fileTypes", "processedDataTypes", "disease", "diseaseIcd10", "cellLine", "policyId"];
export type DatasetFacetName = (typeof DATASET_FACET_NAMES)[number];
/**
 * Available facet names for Research search
 * (Research uses a subset of Dataset facets when filtering by linked datasets)
 */
export declare const RESEARCH_FACET_NAMES: readonly ["criteria", "assayType", "healthStatus", "subjectCountType", "sex", "ageGroup", "tissues", "population", "platform", "libraryKits", "readType", "referenceGenome", "fileTypes", "processedDataTypes", "disease", "diseaseIcd10", "cellLine", "policyId"];
export type ResearchFacetName = DatasetFacetName;
/**
 * Facet value with count (Zod schema)
 */
export declare const FacetValueSchema: z.ZodObject<{
    value: z.ZodString;
    count: z.ZodNumber;
}, z.core.$strip>;
export type FacetValue = z.infer<typeof FacetValueSchema>;
export declare const FacetsMapSchema: z.ZodObject<{
    criteria: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    assayType: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    healthStatus: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    subjectCountType: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    sex: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    ageGroup: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    tissues: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    population: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    platform: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    libraryKits: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    readType: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    referenceGenome: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    fileTypes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    processedDataTypes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    disease: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    diseaseIcd10: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    cellLine: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
    policyId: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type FacetsMap = z.infer<typeof FacetsMapSchema>;
/**
 * Check if a string is a valid facet name
 */
export declare function isValidFacetName(name: string): name is DatasetFacetName;
//# sourceMappingURL=facets.d.ts.map