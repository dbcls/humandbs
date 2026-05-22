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

export const booleanFromString = z.preprocess(
  (v) => v === "true" ? true : v === "false" ? false : undefined,
  z.boolean().optional(),
)

// === Version String ===

/** Regex for Research/Dataset version identifiers (e.g., "v1", "v2", ...) */
export const VERSION_STRING_REGEX = /^v\d+$/

/** Zod schema for a version identifier string like "v1" / "v2". */
export const VersionStringSchema = z.string().regex(VERSION_STRING_REGEX)
