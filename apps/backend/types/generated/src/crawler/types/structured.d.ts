/**
 * Output type definitions (ja/en integrated structure)
 *
 * These types represent the final bilingual output after merging ja/en data,
 * including searchable fields for search functionality.
 *
 * ES で使う型は Zod スキーマで定義し、TypeScript 型を推論する。
 */
import { z } from "zod";
import type { UrlValue } from "./common";
/** Subject count type */
export declare const SubjectCountTypeSchema: z.ZodEnum<{
    individual: "individual";
    sample: "sample";
    mixed: "mixed";
}>;
export type SubjectCountType = z.infer<typeof SubjectCountTypeSchema>;
/** Health status */
export declare const HealthStatusSchema: z.ZodEnum<{
    mixed: "mixed";
    healthy: "healthy";
    affected: "affected";
}>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
/** Read type */
export declare const ReadTypeSchema: z.ZodEnum<{
    "single-end": "single-end";
    "paired-end": "paired-end";
}>;
export type ReadType = z.infer<typeof ReadTypeSchema>;
/** Disease information (icd10 is nullable in crawler output, but required after icd10-normalize) */
export declare const DiseaseInfoSchema: z.ZodObject<{
    label: z.ZodString;
    icd10: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type DiseaseInfo = z.infer<typeof DiseaseInfoSchema>;
/** Platform information */
export declare const PlatformInfoSchema: z.ZodObject<{
    vendor: z.ZodString;
    model: z.ZodString;
}, z.core.$strip>;
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>;
/** Sex */
export declare const SexSchema: z.ZodEnum<{
    mixed: "mixed";
    male: "male";
    female: "female";
}>;
export type Sex = z.infer<typeof SexSchema>;
/** Age group */
export declare const AgeGroupSchema: z.ZodEnum<{
    mixed: "mixed";
    infant: "infant";
    child: "child";
    adult: "adult";
    elderly: "elderly";
}>;
export type AgeGroup = z.infer<typeof AgeGroupSchema>;
/** Tumor status */
export declare const IsTumorSchema: z.ZodEnum<{
    mixed: "mixed";
    tumor: "tumor";
    normal: "normal";
}>;
export type IsTumor = z.infer<typeof IsTumorSchema>;
/** Variant counts */
export declare const VariantCountsSchema: z.ZodObject<{
    snv: z.ZodNullable<z.ZodNumber>;
    indel: z.ZodNullable<z.ZodNumber>;
    cnv: z.ZodNullable<z.ZodNumber>;
    sv: z.ZodNullable<z.ZodNumber>;
    total: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type VariantCounts = z.infer<typeof VariantCountsSchema>;
/** Experiment-level searchable fields (extracted via LLM + rule-based) */
export declare const SearchableExperimentFieldsSchema: z.ZodObject<{
    subjectCount: z.ZodNullable<z.ZodNumber>;
    subjectCountType: z.ZodNullable<z.ZodEnum<{
        individual: "individual";
        sample: "sample";
        mixed: "mixed";
    }>>;
    healthStatus: z.ZodNullable<z.ZodEnum<{
        mixed: "mixed";
        healthy: "healthy";
        affected: "affected";
    }>>;
    diseases: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        icd10: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    tissues: z.ZodArray<z.ZodString>;
    isTumor: z.ZodNullable<z.ZodEnum<{
        mixed: "mixed";
        tumor: "tumor";
        normal: "normal";
    }>>;
    cellLine: z.ZodArray<z.ZodString>;
    population: z.ZodArray<z.ZodString>;
    sex: z.ZodNullable<z.ZodEnum<{
        mixed: "mixed";
        male: "male";
        female: "female";
    }>>;
    ageGroup: z.ZodNullable<z.ZodEnum<{
        mixed: "mixed";
        infant: "infant";
        child: "child";
        adult: "adult";
        elderly: "elderly";
    }>>;
    assayType: z.ZodArray<z.ZodString>;
    libraryKits: z.ZodArray<z.ZodString>;
    platforms: z.ZodArray<z.ZodObject<{
        vendor: z.ZodString;
        model: z.ZodString;
    }, z.core.$strip>>;
    readType: z.ZodNullable<z.ZodEnum<{
        "single-end": "single-end";
        "paired-end": "paired-end";
    }>>;
    readLength: z.ZodNullable<z.ZodNumber>;
    sequencingDepth: z.ZodNullable<z.ZodNumber>;
    targetCoverage: z.ZodNullable<z.ZodNumber>;
    referenceGenome: z.ZodArray<z.ZodString>;
    variantCounts: z.ZodNullable<z.ZodObject<{
        snv: z.ZodNullable<z.ZodNumber>;
        indel: z.ZodNullable<z.ZodNumber>;
        cnv: z.ZodNullable<z.ZodNumber>;
        sv: z.ZodNullable<z.ZodNumber>;
        total: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    hasPhenotypeData: z.ZodNullable<z.ZodBoolean>;
    targets: z.ZodNullable<z.ZodString>;
    fileTypes: z.ZodArray<z.ZodString>;
    processedDataTypes: z.ZodArray<z.ZodString>;
    dataVolumeGb: z.ZodNullable<z.ZodNumber>;
    policies: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            "nbdc-policy": "nbdc-policy";
            "company-limitation-policy": "company-limitation-policy";
            "cancer-research-policy": "cancer-research-policy";
            "familial-policy": "familial-policy";
            "custom-policy": "custom-policy";
        }>;
        name: z.ZodObject<{
            ja: z.ZodString;
            en: z.ZodString;
        }, z.core.$strip>;
        url: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SearchableExperimentFields = z.infer<typeof SearchableExperimentFieldsSchema>;
/** Experiment (ja/en pairs) */
export declare const ExperimentSchema: z.ZodObject<{
    header: z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    data: z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    footers: z.ZodObject<{
        ja: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    searchable: z.ZodOptional<z.ZodObject<{
        subjectCount: z.ZodNullable<z.ZodNumber>;
        subjectCountType: z.ZodNullable<z.ZodEnum<{
            individual: "individual";
            sample: "sample";
            mixed: "mixed";
        }>>;
        healthStatus: z.ZodNullable<z.ZodEnum<{
            mixed: "mixed";
            healthy: "healthy";
            affected: "affected";
        }>>;
        diseases: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            icd10: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        tissues: z.ZodArray<z.ZodString>;
        isTumor: z.ZodNullable<z.ZodEnum<{
            mixed: "mixed";
            tumor: "tumor";
            normal: "normal";
        }>>;
        cellLine: z.ZodArray<z.ZodString>;
        population: z.ZodArray<z.ZodString>;
        sex: z.ZodNullable<z.ZodEnum<{
            mixed: "mixed";
            male: "male";
            female: "female";
        }>>;
        ageGroup: z.ZodNullable<z.ZodEnum<{
            mixed: "mixed";
            infant: "infant";
            child: "child";
            adult: "adult";
            elderly: "elderly";
        }>>;
        assayType: z.ZodArray<z.ZodString>;
        libraryKits: z.ZodArray<z.ZodString>;
        platforms: z.ZodArray<z.ZodObject<{
            vendor: z.ZodString;
            model: z.ZodString;
        }, z.core.$strip>>;
        readType: z.ZodNullable<z.ZodEnum<{
            "single-end": "single-end";
            "paired-end": "paired-end";
        }>>;
        readLength: z.ZodNullable<z.ZodNumber>;
        sequencingDepth: z.ZodNullable<z.ZodNumber>;
        targetCoverage: z.ZodNullable<z.ZodNumber>;
        referenceGenome: z.ZodArray<z.ZodString>;
        variantCounts: z.ZodNullable<z.ZodObject<{
            snv: z.ZodNullable<z.ZodNumber>;
            indel: z.ZodNullable<z.ZodNumber>;
            cnv: z.ZodNullable<z.ZodNumber>;
            sv: z.ZodNullable<z.ZodNumber>;
            total: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
        hasPhenotypeData: z.ZodNullable<z.ZodBoolean>;
        targets: z.ZodNullable<z.ZodString>;
        fileTypes: z.ZodArray<z.ZodString>;
        processedDataTypes: z.ZodArray<z.ZodString>;
        dataVolumeGb: z.ZodNullable<z.ZodNumber>;
        policies: z.ZodArray<z.ZodObject<{
            id: z.ZodEnum<{
                "nbdc-policy": "nbdc-policy";
                "company-limitation-policy": "company-limitation-policy";
                "cancer-research-policy": "cancer-research-policy";
                "familial-policy": "familial-policy";
                "custom-policy": "custom-policy";
            }>;
            name: z.ZodObject<{
                ja: z.ZodString;
                en: z.ZodString;
            }, z.core.$strip>;
            url: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Experiment = z.infer<typeof ExperimentSchema>;
/** Dataset (language-integrated) */
export declare const DatasetSchema: z.ZodObject<{
    datasetId: z.ZodString;
    version: z.ZodString;
    versionReleaseDate: z.ZodString;
    humId: z.ZodString;
    humVersionId: z.ZodString;
    releaseDate: z.ZodString;
    criteria: z.ZodEnum<{
        "Controlled-access (Type I)": "Controlled-access (Type I)";
        "Controlled-access (Type II)": "Controlled-access (Type II)";
        "Unrestricted-access": "Unrestricted-access";
    }>;
    typeOfData: z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    experiments: z.ZodArray<z.ZodObject<{
        header: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        data: z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
        footers: z.ZodObject<{
            ja: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        searchable: z.ZodOptional<z.ZodObject<{
            subjectCount: z.ZodNullable<z.ZodNumber>;
            subjectCountType: z.ZodNullable<z.ZodEnum<{
                individual: "individual";
                sample: "sample";
                mixed: "mixed";
            }>>;
            healthStatus: z.ZodNullable<z.ZodEnum<{
                mixed: "mixed";
                healthy: "healthy";
                affected: "affected";
            }>>;
            diseases: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                icd10: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            tissues: z.ZodArray<z.ZodString>;
            isTumor: z.ZodNullable<z.ZodEnum<{
                mixed: "mixed";
                tumor: "tumor";
                normal: "normal";
            }>>;
            cellLine: z.ZodArray<z.ZodString>;
            population: z.ZodArray<z.ZodString>;
            sex: z.ZodNullable<z.ZodEnum<{
                mixed: "mixed";
                male: "male";
                female: "female";
            }>>;
            ageGroup: z.ZodNullable<z.ZodEnum<{
                mixed: "mixed";
                infant: "infant";
                child: "child";
                adult: "adult";
                elderly: "elderly";
            }>>;
            assayType: z.ZodArray<z.ZodString>;
            libraryKits: z.ZodArray<z.ZodString>;
            platforms: z.ZodArray<z.ZodObject<{
                vendor: z.ZodString;
                model: z.ZodString;
            }, z.core.$strip>>;
            readType: z.ZodNullable<z.ZodEnum<{
                "single-end": "single-end";
                "paired-end": "paired-end";
            }>>;
            readLength: z.ZodNullable<z.ZodNumber>;
            sequencingDepth: z.ZodNullable<z.ZodNumber>;
            targetCoverage: z.ZodNullable<z.ZodNumber>;
            referenceGenome: z.ZodArray<z.ZodString>;
            variantCounts: z.ZodNullable<z.ZodObject<{
                snv: z.ZodNullable<z.ZodNumber>;
                indel: z.ZodNullable<z.ZodNumber>;
                cnv: z.ZodNullable<z.ZodNumber>;
                sv: z.ZodNullable<z.ZodNumber>;
                total: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
            hasPhenotypeData: z.ZodNullable<z.ZodBoolean>;
            targets: z.ZodNullable<z.ZodString>;
            fileTypes: z.ZodArray<z.ZodString>;
            processedDataTypes: z.ZodArray<z.ZodString>;
            dataVolumeGb: z.ZodNullable<z.ZodNumber>;
            policies: z.ZodArray<z.ZodObject<{
                id: z.ZodEnum<{
                    "nbdc-policy": "nbdc-policy";
                    "company-limitation-policy": "company-limitation-policy";
                    "cancer-research-policy": "cancer-research-policy";
                    "familial-policy": "familial-policy";
                    "custom-policy": "custom-policy";
                }>;
                name: z.ZodObject<{
                    ja: z.ZodString;
                    en: z.ZodString;
                }, z.core.$strip>;
                url: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Dataset = z.infer<typeof DatasetSchema>;
/** Summary (language-integrated) */
export declare const SummarySchema: z.ZodObject<{
    aims: z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    methods: z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    targets: z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    url: z.ZodObject<{
        ja: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    footers: z.ZodObject<{
        ja: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type Summary = z.infer<typeof SummarySchema>;
export type { UrlValue };
/** Person (data provider or controlled access user) */
export declare const PersonSchema: z.ZodObject<{
    name: z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orcid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    organization: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        name: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        address: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            country: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
    datasetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    researchTitle: z.ZodOptional<z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    periodOfDataUse: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        startDate: z.ZodNullable<z.ZodString>;
        endDate: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type Person = z.infer<typeof PersonSchema>;
/** Research project */
export declare const ResearchProjectSchema: z.ZodObject<{
    name: z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    url: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ResearchProject = z.infer<typeof ResearchProjectSchema>;
/** Grant */
export declare const GrantSchema: z.ZodObject<{
    id: z.ZodArray<z.ZodString>;
    title: z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    agency: z.ZodObject<{
        name: z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type Grant = z.infer<typeof GrantSchema>;
/** Publication */
export declare const PublicationSchema: z.ZodObject<{
    title: z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    doi: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    datasetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type Publication = z.infer<typeof PublicationSchema>;
/** Research (language-integrated) */
export declare const ResearchSchema: z.ZodObject<{
    humId: z.ZodString;
    url: z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    title: z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    summary: z.ZodObject<{
        aims: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        methods: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        targets: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        url: z.ZodObject<{
            ja: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        footers: z.ZodObject<{
            ja: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    dataProvider: z.ZodArray<z.ZodObject<{
        name: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        orcid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        organization: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            name: z.ZodObject<{
                ja: z.ZodNullable<z.ZodObject<{
                    text: z.ZodString;
                    rawHtml: z.ZodString;
                }, z.core.$strip>>;
                en: z.ZodNullable<z.ZodObject<{
                    text: z.ZodString;
                    rawHtml: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            address: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                country: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>>;
        datasetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        researchTitle: z.ZodOptional<z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        periodOfDataUse: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            startDate: z.ZodNullable<z.ZodString>;
            endDate: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    researchProject: z.ZodArray<z.ZodObject<{
        name: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        url: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    grant: z.ZodArray<z.ZodObject<{
        id: z.ZodArray<z.ZodString>;
        title: z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        agency: z.ZodObject<{
            name: z.ZodObject<{
                ja: z.ZodNullable<z.ZodString>;
                en: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    relatedPublication: z.ZodArray<z.ZodObject<{
        title: z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        doi: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        datasetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    controlledAccessUser: z.ZodArray<z.ZodObject<{
        name: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        orcid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        organization: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            name: z.ZodObject<{
                ja: z.ZodNullable<z.ZodObject<{
                    text: z.ZodString;
                    rawHtml: z.ZodString;
                }, z.core.$strip>>;
                en: z.ZodNullable<z.ZodObject<{
                    text: z.ZodString;
                    rawHtml: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
            address: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                country: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>>;
        datasetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        researchTitle: z.ZodOptional<z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        periodOfDataUse: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            startDate: z.ZodNullable<z.ZodString>;
            endDate: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    versionIds: z.ZodArray<z.ZodString>;
    latestVersion: z.ZodString;
    datePublished: z.ZodString;
    dateModified: z.ZodString;
}, z.core.$strip>;
export type Research = z.infer<typeof ResearchSchema>;
/** Dataset reference with version */
export declare const DatasetRefSchema: z.ZodObject<{
    datasetId: z.ZodString;
    version: z.ZodString;
}, z.core.$strip>;
export type DatasetRef = z.infer<typeof DatasetRefSchema>;
/** Research version (language-integrated) */
export declare const ResearchVersionSchema: z.ZodObject<{
    humId: z.ZodString;
    humVersionId: z.ZodString;
    version: z.ZodString;
    versionReleaseDate: z.ZodString;
    datasets: z.ZodArray<z.ZodObject<{
        datasetId: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>>;
    releaseNote: z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ResearchVersion = z.infer<typeof ResearchVersionSchema>;
/** Dataset with additional metadata for LLM extraction */
export declare const SearchableDatasetSchema: z.ZodObject<{
    datasetId: z.ZodString;
    version: z.ZodString;
    versionReleaseDate: z.ZodString;
    humId: z.ZodString;
    humVersionId: z.ZodString;
    releaseDate: z.ZodString;
    criteria: z.ZodEnum<{
        "Controlled-access (Type I)": "Controlled-access (Type I)";
        "Controlled-access (Type II)": "Controlled-access (Type II)";
        "Unrestricted-access": "Unrestricted-access";
    }>;
    typeOfData: z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    experiments: z.ZodArray<z.ZodObject<{
        header: z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        data: z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodObject<{
            ja: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
        footers: z.ZodObject<{
            ja: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
            en: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                rawHtml: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        searchable: z.ZodOptional<z.ZodObject<{
            subjectCount: z.ZodNullable<z.ZodNumber>;
            subjectCountType: z.ZodNullable<z.ZodEnum<{
                individual: "individual";
                sample: "sample";
                mixed: "mixed";
            }>>;
            healthStatus: z.ZodNullable<z.ZodEnum<{
                mixed: "mixed";
                healthy: "healthy";
                affected: "affected";
            }>>;
            diseases: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                icd10: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
            tissues: z.ZodArray<z.ZodString>;
            isTumor: z.ZodNullable<z.ZodEnum<{
                mixed: "mixed";
                tumor: "tumor";
                normal: "normal";
            }>>;
            cellLine: z.ZodArray<z.ZodString>;
            population: z.ZodArray<z.ZodString>;
            sex: z.ZodNullable<z.ZodEnum<{
                mixed: "mixed";
                male: "male";
                female: "female";
            }>>;
            ageGroup: z.ZodNullable<z.ZodEnum<{
                mixed: "mixed";
                infant: "infant";
                child: "child";
                adult: "adult";
                elderly: "elderly";
            }>>;
            assayType: z.ZodArray<z.ZodString>;
            libraryKits: z.ZodArray<z.ZodString>;
            platforms: z.ZodArray<z.ZodObject<{
                vendor: z.ZodString;
                model: z.ZodString;
            }, z.core.$strip>>;
            readType: z.ZodNullable<z.ZodEnum<{
                "single-end": "single-end";
                "paired-end": "paired-end";
            }>>;
            readLength: z.ZodNullable<z.ZodNumber>;
            sequencingDepth: z.ZodNullable<z.ZodNumber>;
            targetCoverage: z.ZodNullable<z.ZodNumber>;
            referenceGenome: z.ZodArray<z.ZodString>;
            variantCounts: z.ZodNullable<z.ZodObject<{
                snv: z.ZodNullable<z.ZodNumber>;
                indel: z.ZodNullable<z.ZodNumber>;
                cnv: z.ZodNullable<z.ZodNumber>;
                sv: z.ZodNullable<z.ZodNumber>;
                total: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
            hasPhenotypeData: z.ZodNullable<z.ZodBoolean>;
            targets: z.ZodNullable<z.ZodString>;
            fileTypes: z.ZodArray<z.ZodString>;
            processedDataTypes: z.ZodArray<z.ZodString>;
            dataVolumeGb: z.ZodNullable<z.ZodNumber>;
            policies: z.ZodArray<z.ZodObject<{
                id: z.ZodEnum<{
                    "nbdc-policy": "nbdc-policy";
                    "company-limitation-policy": "company-limitation-policy";
                    "cancer-research-policy": "cancer-research-policy";
                    "familial-policy": "familial-policy";
                    "custom-policy": "custom-policy";
                }>;
                name: z.ZodObject<{
                    ja: z.ZodString;
                    en: z.ZodString;
                }, z.core.$strip>;
                url: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    originalMetadata: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodAny>>>;
}, z.core.$strip>;
export type SearchableDataset = z.infer<typeof SearchableDatasetSchema>;
//# sourceMappingURL=structured.d.ts.map