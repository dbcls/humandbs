/**
 * Elasticsearch mapping generation utilities
 *
 * Generates ES mappings from TypeScript schema definitions.
 * Supports bilingual (ja/en) fields as first-class citizens.
 */
import type { estypes } from "@elastic/elasticsearch"

type MappingProperty = estypes.MappingProperty
type PropertyName = estypes.PropertyName

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

export interface FieldDef {
  type: FieldType
  format?: string
  schema?: Record<string, FieldDef>
}

/**
 * Field definition helper functions
 */
export const f = {
  keyword: (): FieldDef => ({ type: "keyword" }),
  text: (): FieldDef => ({ type: "text" }),
  textKw: (): FieldDef => ({ type: "text_keyword" }),
  date: (format?: string): FieldDef => ({ type: "date", format }),
  integer: (): FieldDef => ({ type: "integer" }),
  long: (): FieldDef => ({ type: "long" }),
  float: (): FieldDef => ({ type: "float" }),
  boolean: (): FieldDef => ({ type: "boolean" }),
  flattened: (): FieldDef => ({ type: "flattened" }),
  noindex: (): FieldDef => ({ type: "noindex" }),
  nested: <T extends Record<string, FieldDef>>(schema: T): FieldDef => ({
    type: "nested",
    schema,
  }),
  object: <T extends Record<string, FieldDef>>(schema: T): FieldDef => ({
    type: "object",
    schema,
  }),

  // Bilingual helpers
  /** BilingualText: { ja: string | null, en: string | null } as text */
  bilingualText: (): FieldDef =>
    f.object({
      ja: f.text(),
      en: f.text(),
    }),

  /** BilingualText as keyword (for exact match / facets) */
  bilingualKeyword: (): FieldDef =>
    f.object({
      ja: f.keyword(),
      en: f.keyword(),
    }),

  /** BilingualText with both text and keyword subfield */
  bilingualTextKw: (): FieldDef =>
    f.object({
      ja: f.textKw(),
      en: f.textKw(),
    }),

  /** BilingualTextValue: { ja: { text, rawHtml }, en: { text, rawHtml } } with text index */
  bilingualTextValue: (): FieldDef =>
    f.object({
      ja: f.object({
        text: f.text(),
        rawHtml: f.noindex(),
      }),
      en: f.object({
        text: f.text(),
        rawHtml: f.noindex(),
      }),
    }),

  /** BilingualTextValue with keyword subfield for text */
  bilingualTextValueKw: (): FieldDef =>
    f.object({
      ja: f.object({
        text: f.textKw(),
        rawHtml: f.noindex(),
      }),
      en: f.object({
        text: f.textKw(),
        rawHtml: f.noindex(),
      }),
    }),
}

/**
 * Convert FieldDef to ES MappingProperty
 */
function fieldDefToProperty(def: FieldDef): MappingProperty {
  switch (def.type) {
    case "keyword":
      return { type: "keyword" }
    case "text":
      return { type: "text" }
    case "text_keyword":
      return {
        type: "text",
        fields: {
          kw: { type: "keyword" },
        },
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
      throw new Error(`Unknown field type: ${(def as FieldDef).type}`)
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
 * ES mapping structure
 */
export interface EsMapping {
  mappings: {
    dynamic: false | "strict"
    properties: Record<PropertyName, MappingProperty>
  }
}

/**
 * Generate full ES mapping from schema
 */
export function generateMapping(schema: Record<string, FieldDef>): EsMapping {
  return {
    mappings: {
      dynamic: false,
      properties: generateProperties(schema),
    },
  }
}
