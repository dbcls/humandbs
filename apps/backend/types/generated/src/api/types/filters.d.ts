/**
 * Search filter type definitions (POST search API)
 *
 * This module provides:
 * - Range filter schema
 * - Dataset filters schema
 * - Research search body schema
 * - Dataset search body schema
 */
import { z } from "zod";
/**
 * Range filter for numeric/date values
 */
export declare const RangeFilterSchema: z.ZodObject<{
    min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
}, z.core.$strip>;
export type RangeFilter = z.infer<typeof RangeFilterSchema>;
/**
 * Dataset filters for POST search (used in both Research and Dataset search)
 * Values are arrays (OR logic within each filter)
 */
export declare const DatasetFiltersSchema: z.ZodObject<{
    criteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
    subjectCountType: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        individual: "individual";
        sample: "sample";
        mixed: "mixed";
    }>>>;
    healthStatus: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        mixed: "mixed";
        healthy: "healthy";
        affected: "affected";
    }>>>;
    disease: z.ZodOptional<z.ZodString>;
    diseaseIcd10: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tissues: z.ZodOptional<z.ZodArray<z.ZodString>>;
    isTumor: z.ZodOptional<z.ZodEnum<{
        mixed: "mixed";
        tumor: "tumor";
        normal: "normal";
    }>>;
    cellLine: z.ZodOptional<z.ZodArray<z.ZodString>>;
    population: z.ZodOptional<z.ZodArray<z.ZodString>>;
    sex: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        mixed: "mixed";
        male: "male";
        female: "female";
    }>>>;
    ageGroup: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        mixed: "mixed";
        infant: "infant";
        child: "child";
        adult: "adult";
        elderly: "elderly";
    }>>>;
    assayType: z.ZodOptional<z.ZodArray<z.ZodString>>;
    libraryKits: z.ZodOptional<z.ZodArray<z.ZodString>>;
    platform: z.ZodOptional<z.ZodArray<z.ZodString>>;
    readType: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        "single-end": "single-end";
        "paired-end": "paired-end";
    }>>>;
    referenceGenome: z.ZodOptional<z.ZodArray<z.ZodString>>;
    fileTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    processedDataTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    hasPhenotypeData: z.ZodOptional<z.ZodBoolean>;
    policyId: z.ZodOptional<z.ZodArray<z.ZodString>>;
    releaseDate: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    subjectCount: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    readLength: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    sequencingDepth: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    targetCoverage: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    dataVolumeGb: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    variantSnv: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    variantIndel: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    variantCnv: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    variantSv: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    variantTotal: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DatasetFilters = z.infer<typeof DatasetFiltersSchema>;
/**
 * POST /research/search request body
 */
export declare const ResearchSearchBodySchema: z.ZodObject<{
    lang: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    sort: z.ZodOptional<z.ZodEnum<{
        humId: "humId";
        datePublished: "datePublished";
        dateModified: "dateModified";
        relevance: "relevance";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    query: z.ZodOptional<z.ZodString>;
    datePublished: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    dateModified: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    }, z.core.$strip>>;
    datasetFilters: z.ZodOptional<z.ZodObject<{
        criteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
        subjectCountType: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            individual: "individual";
            sample: "sample";
            mixed: "mixed";
        }>>>;
        healthStatus: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            mixed: "mixed";
            healthy: "healthy";
            affected: "affected";
        }>>>;
        disease: z.ZodOptional<z.ZodString>;
        diseaseIcd10: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tissues: z.ZodOptional<z.ZodArray<z.ZodString>>;
        isTumor: z.ZodOptional<z.ZodEnum<{
            mixed: "mixed";
            tumor: "tumor";
            normal: "normal";
        }>>;
        cellLine: z.ZodOptional<z.ZodArray<z.ZodString>>;
        population: z.ZodOptional<z.ZodArray<z.ZodString>>;
        sex: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            mixed: "mixed";
            male: "male";
            female: "female";
        }>>>;
        ageGroup: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            mixed: "mixed";
            infant: "infant";
            child: "child";
            adult: "adult";
            elderly: "elderly";
        }>>>;
        assayType: z.ZodOptional<z.ZodArray<z.ZodString>>;
        libraryKits: z.ZodOptional<z.ZodArray<z.ZodString>>;
        platform: z.ZodOptional<z.ZodArray<z.ZodString>>;
        readType: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            "single-end": "single-end";
            "paired-end": "paired-end";
        }>>>;
        referenceGenome: z.ZodOptional<z.ZodArray<z.ZodString>>;
        fileTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        processedDataTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        hasPhenotypeData: z.ZodOptional<z.ZodBoolean>;
        policyId: z.ZodOptional<z.ZodArray<z.ZodString>>;
        releaseDate: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        subjectCount: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        readLength: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        sequencingDepth: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        targetCoverage: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        dataVolumeGb: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantSnv: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantIndel: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantCnv: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantSv: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantTotal: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    includeFacets: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ResearchSearchBody = z.infer<typeof ResearchSearchBodySchema>;
/**
 * POST /dataset/search request body
 */
export declare const DatasetSearchBodySchema: z.ZodObject<{
    lang: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        ja: "ja";
        en: "en";
    }>>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    sort: z.ZodOptional<z.ZodEnum<{
        datasetId: "datasetId";
        releaseDate: "releaseDate";
        relevance: "relevance";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    query: z.ZodOptional<z.ZodString>;
    humId: z.ZodOptional<z.ZodString>;
    filters: z.ZodOptional<z.ZodObject<{
        criteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
        subjectCountType: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            individual: "individual";
            sample: "sample";
            mixed: "mixed";
        }>>>;
        healthStatus: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            mixed: "mixed";
            healthy: "healthy";
            affected: "affected";
        }>>>;
        disease: z.ZodOptional<z.ZodString>;
        diseaseIcd10: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tissues: z.ZodOptional<z.ZodArray<z.ZodString>>;
        isTumor: z.ZodOptional<z.ZodEnum<{
            mixed: "mixed";
            tumor: "tumor";
            normal: "normal";
        }>>;
        cellLine: z.ZodOptional<z.ZodArray<z.ZodString>>;
        population: z.ZodOptional<z.ZodArray<z.ZodString>>;
        sex: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            mixed: "mixed";
            male: "male";
            female: "female";
        }>>>;
        ageGroup: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            mixed: "mixed";
            infant: "infant";
            child: "child";
            adult: "adult";
            elderly: "elderly";
        }>>>;
        assayType: z.ZodOptional<z.ZodArray<z.ZodString>>;
        libraryKits: z.ZodOptional<z.ZodArray<z.ZodString>>;
        platform: z.ZodOptional<z.ZodArray<z.ZodString>>;
        readType: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            "single-end": "single-end";
            "paired-end": "paired-end";
        }>>>;
        referenceGenome: z.ZodOptional<z.ZodArray<z.ZodString>>;
        fileTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        processedDataTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        hasPhenotypeData: z.ZodOptional<z.ZodBoolean>;
        policyId: z.ZodOptional<z.ZodArray<z.ZodString>>;
        releaseDate: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        subjectCount: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        readLength: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        sequencingDepth: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        targetCoverage: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        dataVolumeGb: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantSnv: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantIndel: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantCnv: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantSv: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
        variantTotal: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
            max: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    includeFacets: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type DatasetSearchBody = z.infer<typeof DatasetSearchBodySchema>;
//# sourceMappingURL=filters.d.ts.map