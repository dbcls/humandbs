/**
 * Common type definitions
 *
 * ES で使う型は Zod スキーマで定義し、TypeScript 型を推論する。
 * crawler 内部のみで使う型は interface として定義する。
 */
import { z } from "zod";
/** Language type for ja/en versions */
export type LangType = "ja" | "en";
/** Text with normalized text and original raw HTML */
export declare const TextValueSchema: z.ZodObject<{
    text: z.ZodString;
    rawHtml: z.ZodString;
}, z.core.$strip>;
export type TextValue = z.infer<typeof TextValueSchema>;
/** URL with display text and actual URL */
export declare const UrlValueSchema: z.ZodObject<{
    text: z.ZodString;
    url: z.ZodString;
}, z.core.$strip>;
export type UrlValue = z.infer<typeof UrlValueSchema>;
/** Bilingual text field (language-dependent strings) */
export declare const BilingualTextSchema: z.ZodObject<{
    ja: z.ZodNullable<z.ZodString>;
    en: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type BilingualText = z.infer<typeof BilingualTextSchema>;
/** Bilingual TextValue field */
export declare const BilingualTextValueSchema: z.ZodObject<{
    ja: z.ZodNullable<z.ZodObject<{
        text: z.ZodString;
        rawHtml: z.ZodString;
    }, z.core.$strip>>;
    en: z.ZodNullable<z.ZodObject<{
        text: z.ZodString;
        rawHtml: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BilingualTextValue = z.infer<typeof BilingualTextValueSchema>;
/** Bilingual UrlValue field */
export declare const BilingualUrlValueSchema: z.ZodObject<{
    ja: z.ZodNullable<z.ZodObject<{
        text: z.ZodString;
        url: z.ZodString;
    }, z.core.$strip>>;
    en: z.ZodNullable<z.ZodObject<{
        text: z.ZodString;
        url: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BilingualUrlValue = z.infer<typeof BilingualUrlValueSchema>;
/** Period of data use */
export declare const PeriodOfDataUseSchema: z.ZodObject<{
    startDate: z.ZodNullable<z.ZodString>;
    endDate: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type PeriodOfDataUse = z.infer<typeof PeriodOfDataUseSchema>;
/** Canonical criteria values after normalization */
export declare const CriteriaCanonicalSchema: z.ZodEnum<{
    "Controlled-access (Type I)": "Controlled-access (Type I)";
    "Controlled-access (Type II)": "Controlled-access (Type II)";
    "Unrestricted-access": "Unrestricted-access";
}>;
export type CriteriaCanonical = z.infer<typeof CriteriaCanonicalSchema>;
/** Dataset ID type prefixes */
export type DatasetIdType = "JGAD" | "JGAS" | "DRA" | "GEA" | "NBDC_DATASET" | "BP" | "METABO";
/** Canonical policy identifiers */
export declare const PolicyCanonicalSchema: z.ZodEnum<{
    "nbdc-policy": "nbdc-policy";
    "company-limitation-policy": "company-limitation-policy";
    "cancer-research-policy": "cancer-research-policy";
    "familial-policy": "familial-policy";
    "custom-policy": "custom-policy";
}>;
export type PolicyCanonical = z.infer<typeof PolicyCanonicalSchema>;
/** Normalized policy information */
export declare const NormalizedPolicySchema: z.ZodObject<{
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
}, z.core.$strip>;
export type NormalizedPolicy = z.infer<typeof NormalizedPolicySchema>;
/** Override fields for dataset */
export interface DatasetOverrideFields {
    criteria?: CriteriaCanonical;
    releaseDate?: string;
}
/** Dataset overrides config: humId -> datasetId -> override fields */
export type DatasetOverridesConfig = Record<string, Record<string, DatasetOverrideFields>>;
//# sourceMappingURL=common.d.ts.map