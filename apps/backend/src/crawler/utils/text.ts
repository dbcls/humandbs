/**
 * Text normalization utilities
 */
import type { TextValue } from "@/crawler/types"

/**
 * Normalize a key for comparison (lowercase, parentheses normalized, whitespace removed)
 */
export const normalizeKey = (key: string): string => {
  return key
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
    .replace(/[\s-]/g, "")
}

/**
 * Split a value by multiple delimiters
 */
export const splitValue = (value: string, delimiters = /[\r\n]+|[、,／/]/): string[] => {
  return value
    .split(delimiters)
    .map(v => v.trim())
    .filter(v => v !== "")
}

/**
 * Check if a value is a TextValue
 */
export const isTextValue = (v: unknown): v is TextValue => {
  return (
    typeof v === "object" &&
    v !== null &&
    "text" in v &&
    "rawHtml" in v
  )
}

/**
 * Normalize text content
 *
 * @param lang - When "ja", inserts spaces around parentheses (needed after full-width→half-width conversion).
 *               When "en" or omitted, skips parenthesis spacing to avoid artifacts like ") ."
 */
export function normalizeText(value: string, newlineToSpace?: boolean, lang?: "ja" | "en"): string
export function normalizeText(value: TextValue, newlineToSpace?: boolean, lang?: "ja" | "en"): TextValue
export function normalizeText(
  value: string | TextValue,
  newlineToSpace = true,
  lang?: "ja" | "en",
): string | TextValue {
  const normalizeString = (s: string): string => {
    const raw = s.trim()
    if (raw === "") return ""

    if (/^https?:\/\//i.test(raw)) {
      return raw
    }

    let t = raw
      .normalize("NFC")
      .replace(/[\u00A0\u200B\uFEFF]/g, " ")
      .replace(/\u3000/g, " ")
      .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
      .replace(/／/g, "/")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, "\"")
      .replace(/[‐-‒–—―]/g, "-")
      .replace(/\s*[:：]\s*/g, ": ")

    if (newlineToSpace) {
      t = t.replace(/\r\n?|\n/g, " ")
    } else {
      t = t.replace(/\r\n?|\n/g, "")
    }

    if (lang === "ja") {
      t = t
        .replace(/([^\s(])\(/g, "$1 (")
        .replace(/\)([^\s)])/g, ") $1")
    }

    return t.replace(/[ \t]{2,}/g, " ").trim()
  }

  if (typeof value === "string") {
    return normalizeString(value)
  }
  if (isTextValue(value)) {
    return {
      ...value,
      text: normalizeString(value.text),
    }
  }

  return value
}

/**
 * Convert HTTP URL to HTTPS
 */
export const httpToHttps = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  return trimmed.replace(/^http:\/\//i, "https://")
}

/**
 * Normalize footer text (remove leading markers)
 */
export const normalizeFooterText = (text: string, lang: "ja" | "en"): string => {
  let result = text

  // Remove ※/※n, */*, etc. (existing pattern)
  if (lang === "ja") {
    result = result.replace(/^[※*]\d*\s*/, "")
  } else {
    result = result.replace(/^\*\d*\s*/, "")
  }

  // Remove numbered parentheses: 1), 2), 3), etc.
  result = result.replace(/^\d+\)\s*/, "")

  // Remove leading colons (half-width and full-width)
  result = result.replace(/^[:：]\s*/, "")

  return result.trim()
}

