/**
 * Common type definitions and constants
 *
 * This module provides:
 * - Language types and constants
 * - Common Zod preprocessing helpers
 */
import { z } from "zod"

// === Language Types (re-exported from es/types, SSOT is crawler/types) ===

export { LANG_TYPES } from "../../es/types"
export type { LangType } from "../../es/types"

// === Zod Preprocessing Helpers ===

export const booleanFromString = z.preprocess(
  (v) => v === "true" ? true : v === "false" ? false : undefined,
  z.boolean().optional(),
)
