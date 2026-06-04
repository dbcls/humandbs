/**
 * Elasticsearch mapping generation utilities
 *
 * Generates ES mappings from TypeScript schema definitions.
 * Supports bilingual (ja/en) fields as first-class citizens.
 */
import type { estypes } from "@elastic/elasticsearch"

import { INDEX_ANALYSIS_SETTINGS } from "./analysis"

type MappingProperty = estypes.MappingProperty
type PropertyName = estypes.PropertyName

/**
 * Root catch-all field name. Text and facet fields mirror their value into it
 * via `copy_to`, so a single `match` against it performs document-wide
 * full-text search. Shared by the index schemas and the search query layer.
 */
export const CATCH_ALL_FIELD = "all_text"

// Field definition types
export type FieldType =
  | "keyword"
  | "text"
  | "text_keyword"
  | "date"
  | "integer"
  | "long"
  | "float"
  | "boolean"
  | "nested"
  | "object"
  | "flattened"
  | "noindex"
  | "disabled"

export interface FieldDef {
  type: FieldType
  format?: string
  schema?: Record<string, FieldDef>
  /** Catch-all target: copies this field's value into a root field at index time. */
  copyTo?: string
}

/**
 * Field definition helper functions
 */
export const f = {
  // `copyTo` is omitted from the returned object when absent so callers without
  // it keep producing the exact same FieldDef shape (no `copyTo: undefined` key).
  keyword: (copyTo?: string): FieldDef => (copyTo ? { type: "keyword", copyTo } : { type: "keyword" }),
  text: (copyTo?: string): FieldDef => (copyTo ? { type: "text", copyTo } : { type: "text" }),
  textKw: (copyTo?: string): FieldDef => (copyTo ? { type: "text_keyword", copyTo } : { type: "text_keyword" }),
  date: (format?: string): FieldDef => ({ type: "date", format }),
  integer: (): FieldDef => ({ type: "integer" }),
  long: (): FieldDef => ({ type: "long" }),
  float: (): FieldDef => ({ type: "float" }),
  boolean: (): FieldDef => ({ type: "boolean" }),
  flattened: (): FieldDef => ({ type: "flattened" }),
  noindex: (): FieldDef => ({ type: "noindex" }),
  /** Object stored but not indexed (enabled: false). For arbitrary metadata. */
  disabled: (): FieldDef => ({ type: "disabled" }),
  nested: <T extends Record<string, FieldDef>>(schema: T): FieldDef => ({
    type: "nested",
    schema,
  }),
  object: <T extends Record<string, FieldDef>>(schema: T): FieldDef => ({
    type: "object",
    schema,
  }),

  // Bilingual helpers
  // `copyTo` is forwarded to the leaf text/keyword fields so the bilingual value
  // is mirrored into the catch-all field for both languages.
  /** BilingualText: { ja: string | null, en: string | null } as text */
  bilingualText: (copyTo?: string): FieldDef =>
    f.object({
      ja: f.text(copyTo),
      en: f.text(copyTo),
    }),

  /** BilingualText as keyword (for exact match / facets) */
  bilingualKeyword: (copyTo?: string): FieldDef =>
    f.object({
      ja: f.keyword(copyTo),
      en: f.keyword(copyTo),
    }),

  /** BilingualText with both text and keyword subfield */
  bilingualTextKw: (copyTo?: string): FieldDef =>
    f.object({
      ja: f.textKw(copyTo),
      en: f.textKw(copyTo),
    }),

  /** BilingualTextValue: { ja: { text, rawHtml }, en: { text, rawHtml } } with text index */
  bilingualTextValue: (copyTo?: string): FieldDef =>
    f.object({
      ja: f.object({
        text: f.text(copyTo),
        rawHtml: f.noindex(),
      }),
      en: f.object({
        text: f.text(copyTo),
        rawHtml: f.noindex(),
      }),
    }),

  /** BilingualTextValue with keyword subfield for text */
  bilingualTextValueKw: (copyTo?: string): FieldDef =>
    f.object({
      ja: f.object({
        text: f.textKw(copyTo),
        rawHtml: f.noindex(),
      }),
      en: f.object({
        text: f.textKw(copyTo),
        rawHtml: f.noindex(),
      }),
    }),
}

/**
 * Convert FieldDef to ES MappingProperty
 */
function fieldDefToProperty(def: FieldDef): MappingProperty {
  // copy_to is a leaf-level property; it is set on keyword/text fields and
  // mirrors their value into the named root catch-all field at index time.
  const copyTo = def.copyTo ? { copy_to: def.copyTo } : {}
  switch (def.type) {
    case "keyword":
      return { type: "keyword", ...copyTo }
    case "text":
      return { type: "text", ...copyTo }
    case "text_keyword":
      return {
        type: "text",
        fields: {
          kw: { type: "keyword" },
        },
        ...copyTo,
      }
    case "date":
      return {
        type: "date",
        format: def.format ?? "yyyy-MM-dd||yyyy-MM||yyyy",
      }
    case "integer":
      return { type: "integer" }
    case "long":
      return { type: "long" }
    case "float":
      return { type: "float" }
    case "boolean":
      return { type: "boolean" }
    case "flattened":
      return { type: "flattened" }
    case "noindex":
      return { type: "text", index: false }
    case "disabled":
      return { type: "object", enabled: false }
    case "nested":
      return {
        type: "nested",
        properties: generateProperties(def.schema!),
      }
    case "object":
      return {
        type: "object",
        properties: generateProperties(def.schema!),
      }
    default:
      throw new Error(`Unknown field type: ${(def).type}`)
  }
}

/**
 * Generate ES properties from schema
 */
function generateProperties(
  schema: Record<string, FieldDef>,
): Record<PropertyName, MappingProperty> {
  const properties: Record<PropertyName, MappingProperty> = {}
  for (const [key, def] of Object.entries(schema)) {
    properties[key] = fieldDefToProperty(def)
  }
  return properties
}

/**
 * ES index body: analysis settings + mappings.
 *
 * `settings.analysis` carries the kuromoji default analyzer (see analysis.ts);
 * it travels with the mapping so every index-creation site (load-mappings,
 * bootstrap-it-index minimal seed) applies the same analyzer without extra
 * wiring. The `--from-production` reindex path forwards the live analysis
 * instead.
 */
export interface EsMapping {
  settings: {
    analysis: typeof INDEX_ANALYSIS_SETTINGS
  }
  mappings: {
    dynamic: false | "strict"
    properties: Record<PropertyName, MappingProperty>
  }
}

/**
 * Generate full ES index body (settings + mappings) from schema
 */
export function generateMapping(schema: Record<string, FieldDef>): EsMapping {
  return {
    settings: {
      analysis: INDEX_ANALYSIS_SETTINGS,
    },
    mappings: {
      dynamic: false,
      properties: generateProperties(schema),
    },
  }
}
