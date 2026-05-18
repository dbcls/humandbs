/**
 * BioSample attribute parser
 *
 * DDBJ Search API returns BioSample metadata as xmltodict-flavored JSON. The
 * sample-level attributes live under `properties.BioSample.Attributes.Attribute[]`
 * with each entry shaped like:
 *
 *   { attribute_name: "strain",
 *     harmonized_name: "strain",        // optional, only when an NCBI-controlled key matches
 *     display_name: "strain",           // optional, human-readable label
 *     content: "BEST195" }              // or "#text" depending on xmltodict mode
 *
 * Per the agreed template design, we surface attributes keyed by INSDC vocab
 * (harmonized_name when present, otherwise attribute_name verbatim — spaces
 * preserved).
 *
 * xmltodict quirk: single-Attribute records come back as an object, multi-
 * Attribute records as an array. Both shapes are handled.
 */

interface RawAttribute {
  attribute_name?: unknown
  harmonized_name?: unknown
  display_name?: unknown
  content?: unknown
  "#text"?: unknown
}

const asString = (v: unknown): string | null =>
  typeof v === "string" ? v : null

const toArray = (v: unknown): unknown[] => {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * Extract { key: value } from a BioSample _source.properties object.
 *
 * Key precedence:
 *   1. harmonized_name (INSDC controlled vocab; snake_case)
 *   2. attribute_name (raw submitter label; may contain spaces)
 *
 * If two attributes share the same key (e.g., two unharmonized "sample comment"
 * rows), the last one wins. This is consistent with `Record<string, string>`
 * semantics and avoids surprising the admin with a hidden array shape.
 */
export const parseBiosampleAttributes = (
  properties: unknown,
): Record<string, string> => {
  if (!properties || typeof properties !== "object") return {}
  const bsRoot = (properties as Record<string, unknown>).BioSample
  if (!bsRoot || typeof bsRoot !== "object") return {}
  const attrsContainer = (bsRoot as Record<string, unknown>).Attributes
  if (!attrsContainer || typeof attrsContainer !== "object") return {}
  const rawAttrs = (attrsContainer as Record<string, unknown>).Attribute

  const out: Record<string, string> = {}
  for (const item of toArray(rawAttrs)) {
    if (!item || typeof item !== "object") continue
    const a = item as RawAttribute
    const key = asString(a.harmonized_name) ?? asString(a.attribute_name)
    const value = asString(a.content) ?? asString(a["#text"])
    if (!key || value === null) continue
    out[key] = value
  }
  return out
}
