/**
 * API Request/Response type definitions
 *
 * This module provides:
 * - CRUD request/response schemas
 * - Path parameter schemas
 * - Search response schemas
 * - Error response schemas
 */
import { z } from "zod";
import { CrawlerResearchSchema as ResearchSchema, CrawlerResearchVersionSchema as ResearchVersionSchema } from "@/es/types";
export declare const ExperimentSchemaBase: z.ZodObject<{
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
}, z.core.$strip>;
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
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Error codes
 */
export declare const ERROR_CODES: readonly ["VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"];
export type ErrorCode = (typeof ERROR_CODES)[number];
/**
 * RFC 7807 Problem Details for HTTP APIs
 * @see https://tools.ietf.org/html/rfc7807
 */
export declare const ProblemDetailsSchema: z.ZodObject<{
    type: z.ZodURL;
    title: z.ZodString;
    status: z.ZodNumber;
    detail: z.ZodOptional<z.ZodString>;
    instance: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodString;
    requestId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
/**
 * Meta information for single resource responses
 * Contains optimistic locking fields
 */
export declare const ResponseMetaSchema: z.ZodObject<{
    _seq_no: z.ZodNumber;
    _primary_term: z.ZodNumber;
}, z.core.$strip>;
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;
/**
 * Create research request
 * Creates Research + initial ResearchVersion (v1) simultaneously
 * Note: humId, versionIds, latestVersion, datePublished, dateModified are auto-generated
 * All fields are optional - defaults will be used for missing fields
 */
export declare const CreateResearchRequestSchema: z.ZodObject<{
    humId: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    summary: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
    dataProvider: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    researchProject: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    grant: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    relatedPublication: z.ZodOptional<z.ZodArray<z.ZodObject<{
        title: z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        doi: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        datasetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    uids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    initialReleaseNote: z.ZodOptional<z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CreateResearchRequest = z.infer<typeof CreateResearchRequestSchema>;
/**
 * Update research request (full replacement)
 * Note: humId, url, versionIds, latestVersion, datePublished, dateModified cannot be changed
 * url is auto-generated from humId
 * Includes optimistic locking fields (_seq_no, _primary_term) for concurrent edit detection
 */
export declare const UpdateResearchRequestSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    summary: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
    dataProvider: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    researchProject: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    grant: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    relatedPublication: z.ZodOptional<z.ZodArray<z.ZodObject<{
        title: z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        doi: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        datasetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    controlledAccessUser: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    _seq_no: z.ZodNumber;
    _primary_term: z.ZodNumber;
}, z.core.$strip>;
export type UpdateResearchRequest = z.infer<typeof UpdateResearchRequestSchema>;
/**
 * Research with status (extends Research with API-specific fields)
 */
export declare const ResearchWithStatusSchema: z.ZodObject<{
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
    uids: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ResearchWithStatus = z.infer<typeof ResearchWithStatusSchema>;
/**
 * Research response with status info
 */
export declare const ResearchResponseSchema: z.ZodObject<{
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
    uids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    datasets: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>;
/**
 * Update Research UIDs (owner list) request
 * Includes optimistic locking fields
 */
export declare const UpdateUidsRequestSchema: z.ZodObject<{
    uids: z.ZodArray<z.ZodString>;
    _seq_no: z.ZodNumber;
    _primary_term: z.ZodNumber;
}, z.core.$strip>;
export type UpdateUidsRequest = z.infer<typeof UpdateUidsRequestSchema>;
/**
 * Create version request
 * Note: datasets are automatically copied from the previous version
 */
export declare const CreateVersionRequestSchema: z.ZodObject<{
    releaseNote: z.ZodOptional<z.ZodObject<{
        ja: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
        en: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            rawHtml: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CreateVersionRequest = z.infer<typeof CreateVersionRequestSchema>;
/**
 * Version response
 */
export declare const VersionResponseSchema: z.ZodObject<{
    humId: z.ZodString;
    humVersionId: z.ZodString;
    version: z.ZodString;
    versionReleaseDate: z.ZodString;
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
    datasets: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type VersionResponse = z.infer<typeof VersionResponseSchema>;
/**
 * Versions list response
 */
export declare const VersionsListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
        humId: z.ZodString;
        humVersionId: z.ZodString;
        version: z.ZodString;
        versionReleaseDate: z.ZodString;
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
        datasets: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type VersionsListResponse = z.infer<typeof VersionsListResponseSchema>;
/**
 * Create dataset request
 * Note: datasetId, version, versionReleaseDate are auto-generated
 */
export declare const CreateDatasetRequestSchema: z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CreateDatasetRequest = z.infer<typeof CreateDatasetRequestSchema>;
/**
 * Update dataset request (full replacement)
 * Note: datasetId, version, versionReleaseDate cannot be changed
 * Includes optimistic locking fields (_seq_no, _primary_term) for concurrent edit detection
 */
export declare const UpdateDatasetRequestSchema: z.ZodObject<{
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
    }, z.core.$strip>>;
    _seq_no: z.ZodNumber;
    _primary_term: z.ZodNumber;
}, z.core.$strip>;
export type UpdateDatasetRequest = z.infer<typeof UpdateDatasetRequestSchema>;
/**
 * Dataset with metadata
 */
export declare const DatasetWithMetadataSchema: z.ZodObject<{
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
    }, z.core.$strip>>;
    ownerId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type DatasetWithMetadata = z.infer<typeof DatasetWithMetadataSchema>;
/**
 * Dataset list response
 */
export declare const DatasetListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
        ownerId: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        updatedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    pagination: z.ZodObject<{
        page: z.ZodNumber;
        limit: z.ZodNumber;
        total: z.ZodNumber;
        totalPages: z.ZodNumber;
        hasNext: z.ZodBoolean;
        hasPrev: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export type DatasetListResponse = z.infer<typeof DatasetListResponseSchema>;
/**
 * Create dataset request for POST /research/{humId}/dataset/new
 * All fields are optional - defaults will be used
 */
export declare const CreateDatasetForResearchRequestSchema: z.ZodObject<{
    datasetId: z.ZodOptional<z.ZodString>;
    releaseDate: z.ZodOptional<z.ZodString>;
    criteria: z.ZodOptional<z.ZodEnum<{
        "Controlled-access (Type I)": "Controlled-access (Type I)";
        "Controlled-access (Type II)": "Controlled-access (Type II)";
        "Unrestricted-access": "Unrestricted-access";
    }>>;
    typeOfData: z.ZodOptional<z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    experiments: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type CreateDatasetForResearchRequest = z.infer<typeof CreateDatasetForResearchRequestSchema>;
/**
 * Linked datasets response
 */
export declare const LinkedDatasetsResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type LinkedDatasetsResponse = z.infer<typeof LinkedDatasetsResponseSchema>;
/**
 * Linked researches response
 * Note: Uses EsResearchDetailSchema (without versionIds) for API responses
 */
export declare const LinkedResearchesResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
        url: z.ZodObject<{
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
        title: z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        humId: z.ZodString;
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
        humVersionId: z.ZodString;
        version: z.ZodString;
        versionReleaseDate: z.ZodString;
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
        datasets: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
        _seq_no: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        _primary_term: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type LinkedResearchesResponse = z.infer<typeof LinkedResearchesResponseSchema>;
/**
 * Search result item (Research)
 */
export declare const SearchResearchResultSchema: z.ZodObject<{
    type: z.ZodLiteral<"research">;
    humId: z.ZodString;
    title: z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    summary: z.ZodOptional<z.ZodString>;
    dataProvider: z.ZodArray<z.ZodString>;
    releaseDate: z.ZodOptional<z.ZodString>;
    score: z.ZodOptional<z.ZodNumber>;
    highlights: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
}, z.core.$strip>;
export type SearchResearchResult = z.infer<typeof SearchResearchResultSchema>;
/**
 * Search result item (Dataset)
 */
export declare const SearchDatasetResultSchema: z.ZodObject<{
    type: z.ZodLiteral<"dataset">;
    datasetId: z.ZodString;
    humId: z.ZodString;
    typeOfData: z.ZodOptional<z.ZodObject<{
        ja: z.ZodNullable<z.ZodString>;
        en: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    criteria: z.ZodOptional<z.ZodEnum<{
        "Controlled-access (Type I)": "Controlled-access (Type I)";
        "Controlled-access (Type II)": "Controlled-access (Type II)";
        "Unrestricted-access": "Unrestricted-access";
    }>>;
    score: z.ZodOptional<z.ZodNumber>;
    highlights: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
}, z.core.$strip>;
export type SearchDatasetResult = z.infer<typeof SearchDatasetResultSchema>;
/**
 * Facets response
 */
export declare const FacetsResponseSchema: z.ZodObject<{
    facets: z.ZodObject<{
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
}, z.core.$strip>;
export type FacetsResponse = z.infer<typeof FacetsResponseSchema>;
/**
 * Facet value with count
 */
export declare const FacetValueWithCountSchema: z.ZodObject<{
    value: z.ZodString;
    count: z.ZodNumber;
}, z.core.$strip>;
export type FacetValueWithCount = z.infer<typeof FacetValueWithCountSchema>;
/**
 * Single facet field response (with counts)
 */
export declare const FacetFieldResponseSchema: z.ZodObject<{
    fieldName: z.ZodString;
    values: z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FacetFieldResponse = z.infer<typeof FacetFieldResponseSchema>;
/**
 * All facets response (GET /facets) - with counts
 */
export declare const AllFacetsResponseSchema: z.ZodObject<{
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
export type AllFacetsResponse = z.infer<typeof AllFacetsResponseSchema>;
export declare const HumIdParamsSchema: z.ZodObject<{
    humId: z.ZodString;
}, z.core.$strip>;
export type HumIdParams = z.infer<typeof HumIdParamsSchema>;
export declare const DatasetIdParamsSchema: z.ZodObject<{
    datasetId: z.ZodString;
}, z.core.$strip>;
export type DatasetIdParams = z.infer<typeof DatasetIdParamsSchema>;
export declare const VersionParamsSchema: z.ZodObject<{
    humId: z.ZodString;
    version: z.ZodString;
}, z.core.$strip>;
export type VersionParams = z.infer<typeof VersionParamsSchema>;
export declare const DatasetVersionParamsSchema: z.ZodObject<{
    datasetId: z.ZodString;
    version: z.ZodString;
}, z.core.$strip>;
export type DatasetVersionParams = z.infer<typeof DatasetVersionParamsSchema>;
export declare const HealthResponseSchema: z.ZodObject<{
    status: z.ZodString;
    timestamp: z.ZodString;
}, z.core.$strip>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export declare const IsAdminResponseSchema: z.ZodObject<{
    isAdmin: z.ZodBoolean;
}, z.core.$strip>;
export type IsAdminResponse = z.infer<typeof IsAdminResponseSchema>;
/**
 * Stats facet counts per Research/Dataset
 */
export declare const StatsFacetCountSchema: z.ZodObject<{
    research: z.ZodNumber;
    dataset: z.ZodNumber;
}, z.core.$strip>;
export type StatsFacetCount = z.infer<typeof StatsFacetCountSchema>;
/**
 * Stats response (GET /stats)
 * Returns counts and facets for published resources
 * Facets include both Research and Dataset counts per value
 */
export declare const StatsResponseSchema: z.ZodObject<{
    research: z.ZodObject<{
        total: z.ZodNumber;
    }, z.core.$strip>;
    dataset: z.ZodObject<{
        total: z.ZodNumber;
    }, z.core.$strip>;
    facets: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodObject<{
        research: z.ZodNumber;
        dataset: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
/**
 * Create single response schema (with optimistic locking)
 */
export declare const createSingleResponseSchema: <T extends z.ZodType>(dataSchema: T) => z.ZodObject<{
    data: T;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
/**
 * Create single read-only response schema
 */
export declare const createSingleReadOnlyResponseSchema: <T extends z.ZodType>(dataSchema: T) => z.ZodObject<{
    data: T;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
/**
 * Create list response schema
 */
export declare const createListResponseSchema: <T extends z.ZodType>(itemSchema: T) => z.ZodObject<{
    data: z.ZodArray<T>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        pagination: z.ZodObject<{
            page: z.ZodNumber;
            limit: z.ZodNumber;
            total: z.ZodNumber;
            totalPages: z.ZodNumber;
            hasNext: z.ZodBoolean;
            hasPrev: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
/**
 * Create search response schema with facets
 */
export declare const createSearchResponseSchema: <T extends z.ZodType>(itemSchema: T) => z.ZodObject<{
    data: z.ZodArray<T>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        pagination: z.ZodObject<{
            page: z.ZodNumber;
            limit: z.ZodNumber;
            total: z.ZodNumber;
            totalPages: z.ZodNumber;
            hasNext: z.ZodBoolean;
            hasPrev: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    facets: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export { ResearchSchema, ResearchVersionSchema };
/**
 * Workflow action response data (submit, approve, reject, unpublish)
 */
export declare const WorkflowDataSchema: z.ZodObject<{
    humId: z.ZodString;
    status: z.ZodEnum<{
        draft: "draft";
        review: "review";
        published: "published";
        deleted: "deleted";
    }>;
    dateModified: z.ZodString;
}, z.core.$strip>;
export type WorkflowData = z.infer<typeof WorkflowDataSchema>;
export declare const WorkflowResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
        humId: z.ZodString;
        status: z.ZodEnum<{
            draft: "draft";
            review: "review";
            published: "published";
            deleted: "deleted";
        }>;
        dateModified: z.ZodString;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>;
/**
 * UIDs update response data
 */
export declare const UidsDataSchema: z.ZodObject<{
    humId: z.ZodString;
    uids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type UidsData = z.infer<typeof UidsDataSchema>;
export declare const UidsResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
        humId: z.ZodString;
        uids: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type UidsResponse = z.infer<typeof UidsResponseSchema>;
/**
 * Research detail response (GET /research/{humId})
 * Omits internal ES locking fields from data — they are surfaced in meta instead.
 */
export declare const ResearchDetailResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
        url: z.ZodObject<{
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
        title: z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        datasets: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
        version: z.ZodString;
        versionReleaseDate: z.ZodString;
        humId: z.ZodString;
        humVersionId: z.ZodString;
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
        latestVersion: z.ZodString;
        datePublished: z.ZodString;
        dateModified: z.ZodString;
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
        status: z.ZodEnum<{
            draft: "draft";
            review: "review";
            published: "published";
            deleted: "deleted";
        }>;
        uids: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ResearchDetailResponse = z.infer<typeof ResearchDetailResponseSchema>;
/**
 * Research create/update response (POST /research/new, PUT /research/{humId}/update)
 */
export declare const ResearchWithLockResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
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
        uids: z.ZodDefault<z.ZodArray<z.ZodString>>;
        datasets: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ResearchWithLockResponse = z.infer<typeof ResearchWithLockResponseSchema>;
/**
 * Research search/list response (GET /research, POST /research/search)
 */
export declare const ResearchSearchResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        pagination: z.ZodObject<{
            page: z.ZodNumber;
            limit: z.ZodNumber;
            total: z.ZodNumber;
            totalPages: z.ZodNumber;
            hasNext: z.ZodBoolean;
            hasPrev: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    facets: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ResearchSearchResponse = z.infer<typeof ResearchSearchResponseSchema>;
/**
 * Research versions list response (GET /research/{humId}/versions)
 */
export declare const ResearchVersionsListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        pagination: z.ZodObject<{
            page: z.ZodNumber;
            limit: z.ZodNumber;
            total: z.ZodNumber;
            totalPages: z.ZodNumber;
            hasNext: z.ZodBoolean;
            hasPrev: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ResearchVersionsListResponse = z.infer<typeof ResearchVersionsListResponseSchema>;
/**
 * Specific version detail response, read-only (GET /research/{humId}/versions/{version})
 */
export declare const VersionDetailResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
        humId: z.ZodString;
        humVersionId: z.ZodString;
        version: z.ZodString;
        versionReleaseDate: z.ZodString;
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
        datasets: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type VersionDetailResponse = z.infer<typeof VersionDetailResponseSchema>;
/**
 * Version create response (POST /research/{humId}/versions/new)
 */
export declare const VersionCreateResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
        humId: z.ZodString;
        humVersionId: z.ZodString;
        version: z.ZodString;
        versionReleaseDate: z.ZodString;
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
        datasets: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type VersionCreateResponse = z.infer<typeof VersionCreateResponseSchema>;
/**
 * Linked datasets list response (GET /research/{humId}/dataset)
 */
export declare const LinkedDatasetsListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        pagination: z.ZodObject<{
            page: z.ZodNumber;
            limit: z.ZodNumber;
            total: z.ZodNumber;
            totalPages: z.ZodNumber;
            hasNext: z.ZodBoolean;
            hasPrev: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type LinkedDatasetsListResponse = z.infer<typeof LinkedDatasetsListResponseSchema>;
/**
 * Dataset create response (POST /research/{humId}/dataset/new)
 */
export declare const DatasetCreateResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
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
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type DatasetCreateResponse = z.infer<typeof DatasetCreateResponseSchema>;
/**
 * Dataset search/list response (GET /dataset, POST /dataset/search)
 */
export declare const DatasetSearchResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        pagination: z.ZodObject<{
            page: z.ZodNumber;
            limit: z.ZodNumber;
            total: z.ZodNumber;
            totalPages: z.ZodNumber;
            hasNext: z.ZodBoolean;
            hasPrev: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
    facets: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DatasetSearchResponse = z.infer<typeof DatasetSearchResponseSchema>;
/**
 * Dataset detail response (GET /dataset/{datasetId})
 */
export declare const DatasetDetailResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
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
        mergedSearchable: z.ZodOptional<z.ZodObject<{
            subjectCount: z.ZodNullable<z.ZodNumber>;
            subjectCountType: z.ZodArray<z.ZodString>;
            healthStatus: z.ZodArray<z.ZodString>;
            diseases: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                icd10: z.ZodString;
            }, z.core.$strip>>;
            tissues: z.ZodArray<z.ZodString>;
            isTumor: z.ZodArray<z.ZodEnum<{
                mixed: "mixed";
                tumor: "tumor";
                normal: "normal";
            }>>;
            cellLine: z.ZodArray<z.ZodString>;
            population: z.ZodArray<z.ZodString>;
            sex: z.ZodArray<z.ZodString>;
            ageGroup: z.ZodArray<z.ZodString>;
            assayType: z.ZodArray<z.ZodString>;
            libraryKits: z.ZodArray<z.ZodString>;
            platforms: z.ZodArray<z.ZodObject<{
                vendor: z.ZodString;
                model: z.ZodString;
            }, z.core.$strip>>;
            readType: z.ZodArray<z.ZodString>;
            readLength: z.ZodNullable<z.ZodNumber>;
            sequencingDepth: z.ZodNullable<z.ZodNumber>;
            targetCoverage: z.ZodNullable<z.ZodNumber>;
            referenceGenome: z.ZodArray<z.ZodString>;
            targets: z.ZodArray<z.ZodString>;
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
                id: z.ZodString;
                name: z.ZodObject<{
                    ja: z.ZodNullable<z.ZodString>;
                    en: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                url: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type DatasetDetailResponse = z.infer<typeof DatasetDetailResponseSchema>;
/**
 * Dataset update response (PUT /dataset/{datasetId}/update)
 */
export declare const DatasetUpdateResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
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
        }, z.core.$strip>>;
        ownerId: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        updatedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        _seq_no: z.ZodNumber;
        _primary_term: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type DatasetUpdateResponse = z.infer<typeof DatasetUpdateResponseSchema>;
/**
 * Dataset versions list response (GET /dataset/{datasetId}/versions)
 */
export declare const DatasetVersionsListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
        version: z.ZodString;
        typeOfData: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>>;
        criteria: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        releaseDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        pagination: z.ZodObject<{
            page: z.ZodNumber;
            limit: z.ZodNumber;
            total: z.ZodNumber;
            totalPages: z.ZodNumber;
            hasNext: z.ZodBoolean;
            hasPrev: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type DatasetVersionsListResponse = z.infer<typeof DatasetVersionsListResponseSchema>;
/**
 * Dataset version detail response, read-only (GET /dataset/{datasetId}/versions/{version})
 */
export declare const DatasetVersionDetailResponseSchema: z.ZodObject<{
    data: z.ZodObject<{
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
        mergedSearchable: z.ZodOptional<z.ZodObject<{
            subjectCount: z.ZodNullable<z.ZodNumber>;
            subjectCountType: z.ZodArray<z.ZodString>;
            healthStatus: z.ZodArray<z.ZodString>;
            diseases: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                icd10: z.ZodString;
            }, z.core.$strip>>;
            tissues: z.ZodArray<z.ZodString>;
            isTumor: z.ZodArray<z.ZodEnum<{
                mixed: "mixed";
                tumor: "tumor";
                normal: "normal";
            }>>;
            cellLine: z.ZodArray<z.ZodString>;
            population: z.ZodArray<z.ZodString>;
            sex: z.ZodArray<z.ZodString>;
            ageGroup: z.ZodArray<z.ZodString>;
            assayType: z.ZodArray<z.ZodString>;
            libraryKits: z.ZodArray<z.ZodString>;
            platforms: z.ZodArray<z.ZodObject<{
                vendor: z.ZodString;
                model: z.ZodString;
            }, z.core.$strip>>;
            readType: z.ZodArray<z.ZodString>;
            readLength: z.ZodNullable<z.ZodNumber>;
            sequencingDepth: z.ZodNullable<z.ZodNumber>;
            targetCoverage: z.ZodNullable<z.ZodNumber>;
            referenceGenome: z.ZodArray<z.ZodString>;
            targets: z.ZodArray<z.ZodString>;
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
                id: z.ZodString;
                name: z.ZodObject<{
                    ja: z.ZodNullable<z.ZodString>;
                    en: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>;
                url: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type DatasetVersionDetailResponse = z.infer<typeof DatasetVersionDetailResponseSchema>;
/**
 * Linked researches list response (GET /dataset/{datasetId}/research)
 */
export declare const LinkedResearchesListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
        url: z.ZodObject<{
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
        title: z.ZodObject<{
            ja: z.ZodNullable<z.ZodString>;
            en: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        humId: z.ZodString;
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
        humVersionId: z.ZodString;
        version: z.ZodString;
        versionReleaseDate: z.ZodString;
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
        datasets: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
        _seq_no: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        _primary_term: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strip>>;
    meta: z.ZodObject<{
        requestId: z.ZodString;
        timestamp: z.ZodString;
        pagination: z.ZodObject<{
            page: z.ZodNumber;
            limit: z.ZodNumber;
            total: z.ZodNumber;
            totalPages: z.ZodNumber;
            hasNext: z.ZodBoolean;
            hasPrev: z.ZodBoolean;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type LinkedResearchesListResponse = z.infer<typeof LinkedResearchesListResponseSchema>;
//# sourceMappingURL=request-response.d.ts.map