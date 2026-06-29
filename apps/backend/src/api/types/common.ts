/**
 * Common type definitions and constants
 *
 * This module provides:
 * - Language types and constants
 * - Common Zod preprocessing helpers
 */
import "@hono/zod-openapi"
import { z } from "zod"

// === Language Types (re-exported from es/types, SSOT is crawler/types) ===

export { LANG_TYPES, BilingualTextSchema } from "../../es/types"
export type { LangType, BilingualText } from "../../es/types"

// === Zod Preprocessing Helpers ===

/**
 * Boolean preprocessor that tolerates query-string values and plain booleans.
 *
 * `z.coerce.boolean()` cannot be used here: JavaScript's `Boolean("false")` is
 * `true`, so `?flag=false` would be parsed as `true`. The preprocessor maps the
 * literal strings "true"/"false" explicitly and forwards real booleans verbatim
 * so test callers (which pass booleans directly) keep working.
 */
export const booleanFromString = z.preprocess(
  (v) => {
    if (typeof v === "boolean") return v
    if (v === "true") return true
    if (v === "false") return false
    return undefined
  },
  z.boolean().optional(),
)

// === Version String ===

/** Regex for Research/Dataset version identifiers (e.g., "v1", "v2", ...) */
export const VERSION_STRING_REGEX = /^v\d+$/

/** Zod schema for a version identifier string like "v1" / "v2". */
export const VersionStringSchema = z.string().regex(VERSION_STRING_REGEX)
