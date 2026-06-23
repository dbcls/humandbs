import { detectLeaf, unwrap } from "./detectLeaf";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Build a blank value matching a Zod schema, suitable as a new array item or a
 * freshly-initialized object. Mirrors the structure the schema-driven widgets
 * expect (bilingual leaves get `{ja,en}` skeletons; arrays get `[]`; optional/
 * nullable primitives get `null`).
 *
 * This replaces the hand-written `emptyItem` literals in the research config —
 * adding/removing a schema field changes the blank automatically.
 */
export function buildEmpty(schema: any): any {
  // Domain bilingual leaves get structurally-correct skeletons (even when wrapped).
  const leaf = detectLeaf(schema);
  if (leaf === "bilingual-text") return { ja: "", en: "" };
  if (leaf === "bilingual-text-value") return { ja: { text: "" }, en: { text: "" } };
  if (leaf === "bilingual-url-array") return { ja: [], en: [] };
  if (leaf === "bilingual-url-value") return { ja: null, en: null };
  if (leaf === "period") return { startDate: null, endDate: null };

  // An optional/nullable wrapper (other than the leaves above) → absent by default.
  // This keeps e.g. `organization`, `periodOfDataUse`, `url` empty rather than
  // materializing hollow nested cards.
  const outerType: string | undefined = schema?._def?.type;
  if (outerType === "nullable" || outerType === "optional") return null;

  const s = unwrap(schema);
  const type: string | undefined = s?._def?.type;

  if (type === "array") return [];

  if (type === "object") {
    const shape: Record<string, any> = s._def.shape ?? {};
    const out: Record<string, any> = {};
    for (const [key, child] of Object.entries(shape)) {
      out[key] = buildEmpty(child);
    }
    return out;
  }

  if (type === "string") return "";

  // numbers, booleans, enums, unknowns, and optional/nullable primitives.
  return null;
}
