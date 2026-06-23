/**
 * Domain leaf-shape detection for the schema-driven research form.
 *
 * `getFieldKind` covers primitive/enum/object/array kinds. This module adds the
 * domain-specific *bilingual* leaf shapes used across research metadata, detected
 * by **shape signature** (the Zod object's structure) rather than by field name —
 * so renaming a key, or omitting it from a request schema, is reflected
 * automatically.
 *
 * Each detected leaf maps to one of the existing `useFieldContext`-bound widgets
 * registered in FormContext (BilingualTextField, BilingualTextValueField,
 * BilingualURLArrayField) or a small inline composite (period → two DateFields).
 */

/** A Zod schema's internal def (zod v4: `schema._def`). */
type Def = { type?: string; innerType?: any; shape?: Record<string, any>; element?: any };

function def(schema: any): Def {
  return (schema?._def ?? {}) as Def;
}

/** Unwrap nullable/optional/default wrappers to the underlying schema. */
export function unwrap(schema: any): any {
  let s = schema;
  // Guard against cycles; these chains are shallow in practice.
  for (let i = 0; i < 10; i++) {
    const t = def(s).type;
    if (t === "nullable" || t === "optional" || t === "default") {
      s = def(s).innerType;
    } else {
      break;
    }
  }
  return s;
}

function typeOf(schema: any): string | undefined {
  return def(unwrap(schema)).type;
}

function objectShape(schema: any): Record<string, any> | undefined {
  const s = unwrap(schema);
  return def(s).type === "object" ? def(s).shape : undefined;
}

/** True when `shape` has exactly the given keys (order-independent). */
function hasExactKeys(shape: Record<string, any> | undefined, keys: string[]): boolean {
  if (!shape) return false;
  const actual = Object.keys(shape);
  return actual.length === keys.length && keys.every((k) => k in shape);
}

export type LeafKind =
  | "bilingual-text" // { ja: string|null, en: string|null }
  | "bilingual-text-value" // { ja: {text}|null, en: {text}|null }
  | "bilingual-url-value" // { ja: {text,url}|null, en: {text,url}|null }
  | "bilingual-url-array" // { ja: {text,url}[], en: {text,url}[] }
  | "period"; // { startDate, endDate }

/**
 * Detect a domain leaf kind from a schema's shape signature, or `null` if the
 * schema is not a recognized domain leaf (caller should fall back to the
 * generic `getFieldKind`/`FieldControl`).
 */
export function detectLeaf(schema: any): LeafKind | null {
  const shape = objectShape(schema);
  if (!shape) return null;

  // period: { startDate, endDate }
  if (hasExactKeys(shape, ["startDate", "endDate"])) {
    return "period";
  }

  // All remaining domain leaves are bilingual: exactly { ja, en }.
  if (!hasExactKeys(shape, ["ja", "en"])) return null;

  const ja = shape.ja;
  const jaType = typeOf(ja);

  // bilingual-text: ja/en are strings
  if (jaType === "string") return "bilingual-text";

  // bilingual-url-array: ja/en are arrays (of {text,url})
  if (jaType === "array") return "bilingual-url-array";

  // bilingual-{text,url}-value: ja/en are objects — distinguish by inner keys
  if (jaType === "object") {
    const innerShape = objectShape(ja);
    if (innerShape && "url" in innerShape) return "bilingual-url-value";
    if (innerShape && "text" in innerShape) return "bilingual-text-value";
  }

  return null;
}
