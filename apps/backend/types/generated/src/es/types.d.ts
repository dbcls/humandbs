/**
 * Elasticsearch document types and zod schemas
 *
 * This module provides:
 * 1. Re-exports of Zod schemas from @/crawler/types (single source of truth)
 * 2. ES-specific schema extensions (status, uids, etc.)
 * 3. TypeScript types inferred from Zod schemas
 *
 * Dependency flow: crawler/types → es/types → api/types
 */
import { z } from "zod";
import { TextValueSchema, UrlValueSchema, BilingualTextSchema, BilingualTextValueSchema, BilingualUrlValueSchema, PeriodOfDataUseSchema, CriteriaCanonicalSchema, PolicyCanonicalSchema, NormalizedPolicySchema, SubjectCountTypeSchema, HealthStatusSchema, ReadTypeSchema, DiseaseInfoSchema as CrawlerDiseaseInfoSchema, PlatformInfoSchema, SexSchema, AgeGroupSchema, IsTumorSchema, VariantCountsSchema, SearchableExperimentFieldsSchema as CrawlerSearchableExperimentFieldsSchema, ExperimentSchema as CrawlerExperimentSchema, DatasetSchema as CrawlerDatasetSchema, SummarySchema, PersonSchema, ResearchProjectSchema, GrantSchema, PublicationSchema, ResearchSchema as CrawlerResearchSchema, DatasetRefSchema, ResearchVersionSchema as CrawlerResearchVersionSchema, SearchableDatasetSchema } from "../crawler/types";
export { TextValueSchema, UrlValueSchema, BilingualTextSchema, BilingualTextValueSchema, BilingualUrlValueSchema, PeriodOfDataUseSchema, CriteriaCanonicalSchema, PolicyCanonicalSchema, NormalizedPolicySchema, SubjectCountTypeSchema, HealthStatusSchema, ReadTypeSchema, CrawlerDiseaseInfoSchema, PlatformInfoSchema, SexSchema, AgeGroupSchema, IsTumorSchema, VariantCountsSchema, CrawlerSearchableExperimentFieldsSchema, CrawlerExperimentSchema, CrawlerDatasetSchema, SummarySchema, PersonSchema, ResearchProjectSchema, GrantSchema, PublicationSchema, CrawlerResearchSchema, DatasetRefSchema, CrawlerResearchVersionSchema, SearchableDatasetSchema, };
export type { LangType, TextValue, UrlValue, BilingualText, BilingualTextValue, BilingualUrlValue, CriteriaCanonical, NormalizedPolicy, Experiment, Dataset, Summary, Person, ResearchProject, Grant, Publication, Research, ResearchVersion, DatasetRef, SubjectCountType, HealthStatus, ReadType, DiseaseInfo, PlatformInfo, IsTumor, SearchableExperimentFields, SearchableDataset, } from "../crawler/types";
/**
 * Normalized disease info schema for ES documents
 * Differs from CrawlerDiseaseInfoSchema: icd10 is required (not nullable)
 * because icd10-normalize step ensures all diseases have a valid ICD10 code before ES indexing
 */
export declare const NormalizedDiseaseSchema: z.ZodObject<{
    label: z.ZodString;
    icd10: z.ZodString;
}, z.core.$strip>;
export type NormalizedDisease = z.infer<typeof NormalizedDiseaseSchema>;
/**
 * SearchableExperimentFields schema for ES documents
 * Platform facet aggregation is done via nested aggregation in API
 */
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
        icd10: z.ZodString;
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
    targets: z.ZodNullable<z.ZodString>;
    variantCounts: z.ZodNullable<z.ZodObject<{
        snv: z.ZodNullable<z.ZodNumber>;
        indel: z.ZodNullable<z.ZodNumber>;
        cnv: z.ZodNullable<z.ZodNumber>;
        sv: z.ZodNullable<z.ZodNumber>;
        total: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    hasPhenotypeData: z.ZodNullable<z.ZodBoolean>;
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
export type EsSearchableExperimentFields = z.infer<typeof SearchableExperimentFieldsSchema>;
export declare const EsExperimentSchema: z.ZodObject<{
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
            icd10: z.ZodString;
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
        targets: z.ZodNullable<z.ZodString>;
        variantCounts: z.ZodNullable<z.ZodObject<{
            snv: z.ZodNullable<z.ZodNumber>;
            indel: z.ZodNullable<z.ZodNumber>;
            cnv: z.ZodNullable<z.ZodNumber>;
            sv: z.ZodNullable<z.ZodNumber>;
            total: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
        hasPhenotypeData: z.ZodNullable<z.ZodBoolean>;
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
export type EsExperiment = z.infer<typeof EsExperimentSchema>;
export declare const EsDatasetSchema: z.ZodObject<{
    datasetId: z.ZodString;
    version: z.ZodString;
    humId: z.ZodString;
    humVersionId: z.ZodString;
    versionReleaseDate: z.ZodString;
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
                icd10: z.ZodString;
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
            targets: z.ZodNullable<z.ZodString>;
            variantCounts: z.ZodNullable<z.ZodObject<{
                snv: z.ZodNullable<z.ZodNumber>;
                indel: z.ZodNullable<z.ZodNumber>;
                cnv: z.ZodNullable<z.ZodNumber>;
                sv: z.ZodNullable<z.ZodNumber>;
                total: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>>;
            hasPhenotypeData: z.ZodNullable<z.ZodBoolean>;
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
export type EsDataset = z.infer<typeof EsDatasetSchema>;
export declare const EsPersonSchema: z.ZodObject<{
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
export type EsPerson = z.infer<typeof EsPersonSchema>;
export declare const EsResearchProjectSchema: z.ZodObject<{
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
export type EsResearchProject = z.infer<typeof EsResearchProjectSchema>;
export declare const EsGrantSchema: z.ZodObject<{
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
export type EsGrant = z.infer<typeof EsGrantSchema>;
export declare const EsPublicationSchema: z.ZodObject<{
    title: z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    doi: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    datasetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type EsPublication = z.infer<typeof EsPublicationSchema>;
export declare const EsSummarySchema: z.ZodObject<{
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
export type EsSummary = z.infer<typeof EsSummarySchema>;
export declare const ResearchStatusSchema: z.ZodEnum<{
    draft: "draft";
    review: "review";
    published: "published";
    deleted: "deleted";
}>;
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>;
export declare const EsResearchSchema: z.ZodObject<{
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
    status: z.ZodEnum<{
        draft: "draft";
        review: "review";
        published: "published";
        deleted: "deleted";
    }>;
    uids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type EsResearch = z.infer<typeof EsResearchSchema>;
export declare const EsResearchVersionSchema: z.ZodObject<{
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
export type EsResearchVersion = z.infer<typeof EsResearchVersionSchema>;
//# sourceMappingURL=types.d.ts.map