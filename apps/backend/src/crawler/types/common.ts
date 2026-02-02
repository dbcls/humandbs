/**
 * Common type definitions
 */

/** Language type for ja/en versions */
export type LangType = "ja" | "en"

/** Text with normalized text and original raw HTML */
export interface TextValue {
  text: string
  rawHtml: string
}

/** URL with display text and actual URL */
export interface UrlValue {
  text: string
  url: string
}

/** Bilingual text field (language-dependent strings) */
export interface BilingualText {
  ja: string | null
  en: string | null
}

/** Bilingual TextValue field */
export interface BilingualTextValue {
  ja: TextValue | null
  en: TextValue | null
}

/** Bilingual UrlValue field */
export interface BilingualUrlValue {
  ja: UrlValue | null
  en: UrlValue | null
}

/** Period of data use */
export interface PeriodOfDataUse {
  startDate: string | null
  endDate: string | null
}

/** Canonical criteria values after normalization */
export type CriteriaCanonical =
  | "Controlled-access (Type I)"
  | "Controlled-access (Type II)"
  | "Unrestricted-access"

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
export type PolicyCanonical =
  | "nbdc-policy"
  | "company-limitation-policy"
  | "cancer-research-policy"
  | "familial-policy"
  | "custom-policy"

/** Normalized policy information */
export interface NormalizedPolicy {
  id: PolicyCanonical
  name: { ja: string; en: string }
  url: string | null
}

/** Override fields for dataset */
export interface DatasetOverrideFields {
  criteria?: CriteriaCanonical
  releaseDate?: string
}

/** Dataset overrides config: humId -> datasetId -> override fields */
export type DatasetOverridesConfig = Record<string, Record<string, DatasetOverrideFields>>
