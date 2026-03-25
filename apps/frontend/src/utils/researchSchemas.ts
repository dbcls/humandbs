/**
 * Frontend-only schema overrides for research forms.
 *
 * The backend requires `rawHtml` in all TextValue fields, but the admin UI
 * only collects plain `text`. These schemas extend the backend request schemas
 * to default `rawHtml` to `""` so users never have to fill it in.
 */
import {
  CreateResearchRequestSchema,
  UpdateResearchRequestSchema,
} from "@humandbs/backend/types";
import { z } from "zod";

/**
 * Recursively walk a Zod schema and replace every `z.object` that has both
 * `text` and `rawHtml` string fields with a version that defaults `rawHtml`
 * to `""`.
 *
 * We do this via `z.preprocess` at the top level so we don't have to re-type
 * every nested field — the runtime coercion happens before Zod validation.
 */
function defaultRawHtml(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(defaultRawHtml);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = defaultRawHtml(obj[key]);
    }
    // If this object looks like a TextValue ({ text, rawHtml }), default rawHtml
    if ("text" in result && !("rawHtml" in result)) {
      result.rawHtml = "";
    }
    return result;
  }
  return value;
}

export const FrontendCreateResearchRequestSchema = z.preprocess(
  defaultRawHtml,
  CreateResearchRequestSchema,
);

export const FrontendUpdateResearchRequestSchema = z.preprocess(
  defaultRawHtml,
  UpdateResearchRequestSchema,
);
