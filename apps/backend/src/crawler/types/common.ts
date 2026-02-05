/**
 * Common type definitions
 *
 * ES で使う型は Zod スキーマで定義し、TypeScript 型を推論する。
 * crawler 内部のみで使う型は interface として定義する。
 */
import { z } from "zod"

/** Language type for ja/en versions */
export type LangType = "ja" | "en"

// === Zod Schemas (ES で使う型) ===

/** Text with normalized text and original raw HTML */
export const TextValueSchema = z.object({
  text: z.string(),
  rawHtml: z.string(),
})
export type TextValue = z.infer<typeof TextValueSchema>

/** URL with display text and actual URL */
export const UrlValueSchema = z.object({
  text: z.string(),
  url: z.string(),
})
export type UrlValue = z.infer<typeof UrlValueSchema>

/** Bilingual text field (language-dependent strings) */
export const BilingualTextSchema = z.object({
  ja: z.string().nullable(),
  en: z.string().nullable(),
})
export type BilingualText = z.infer<typeof BilingualTextSchema>

/** Bilingual TextValue field */
export const BilingualTextValueSchema = z.object({
  ja: TextValueSchema.nullable(),
  en: TextValueSchema.nullable(),
})
export type BilingualTextValue = z.infer<typeof BilingualTextValueSchema>

/** Bilingual UrlValue field */
export const BilingualUrlValueSchema = z.object({
  ja: UrlValueSchema.nullable(),
  en: UrlValueSchema.nullable(),
})
export type BilingualUrlValue = z.infer<typeof BilingualUrlValueSchema>

/** Period of data use */
export const PeriodOfDataUseSchema = z.object({
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
})
export type PeriodOfDataUse = z.infer<typeof PeriodOfDataUseSchema>

// === TypeScript Interfaces (crawler 内部のみ) ===

/** Canonical criteria values after normalization */
export const CriteriaCanonicalSchema = z.enum([
  "Controlled-access (Type I)",
  "Controlled-access (Type II)",
  "Unrestricted-access",
])
export type CriteriaCanonical = z.infer<typeof CriteriaCanonicalSchema>

/** Dataset ID type prefixes */
export type DatasetIdType =
  | "JGAD"
  | "JGAS"
  | "DRA"
  | "GEA"
  | "NBDC_DATASET"
  | "BP"
  | "METABO"

/** Canonical policy identifiers */
export const PolicyCanonicalSchema = z.enum([
  "nbdc-policy",
  "company-limitation-policy",
  "cancer-research-policy",
  "familial-policy",
  "custom-policy",
])
export type PolicyCanonical = z.infer<typeof PolicyCanonicalSchema>

/** Normalized policy information */
export const NormalizedPolicySchema = z.object({
  id: PolicyCanonicalSchema,
  name: z.object({ ja: z.string(), en: z.string() }),
  url: z.string().nullable(),
})
export type NormalizedPolicy = z.infer<typeof NormalizedPolicySchema>

/** Override fields for dataset */
export interface DatasetOverrideFields {
  criteria?: CriteriaCanonical
  releaseDate?: string
}

/** Dataset overrides config: humId -> datasetId -> override fields */
export type DatasetOverridesConfig = Record<string, Record<string, DatasetOverrideFields>>
