/**
 * Common type definitions and constants
 *
 * This module provides:
 * - Language types and constants
 * - Common Zod preprocessing helpers
 */
import { z } from "zod"

// === Language Types ===

export const LANG_TYPES = ["ja", "en"] as const
export type LangType = (typeof LANG_TYPES)[number]

// === Zod Preprocessing Helpers ===

export const booleanFromString = z.preprocess(
  (v) => v === "true" ? true : v === "false" ? false : undefined,
  z.boolean().optional(),
)
