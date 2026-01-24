/**
 * Text normalization utilities
 */
import { HUMANDBS_BASE_URL } from "@/crawler/config/urls"
import type { TextValue } from "@/crawler/types"

/**
 * Normalize whitespace (consecutive spaces to single, full-width to half-width)
 */
export const normalizeWhitespace = (s: string): string => {
  return s
    .replace(/[\u00A0\u200B\uFEFF]/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/**
 * Normalize parentheses (full-width to half-width)
 */
export const normalizeParentheses = (s: string): string => {
  return s.replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
}

/**
 * Normalize Unicode (NFC normalization)
 */
export const normalizeUnicode = (s: string): string => {
  return s.normalize("NFC")
}

/**
 * Normalize date (YYYY/M/D -> YYYY-MM-DD)
 */
export const normalizeDate = (s: string): string | null => {
  const raw = s.trim()
  const m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null

  const [, y, mo, d] = m
  const mm = mo.padStart(2, "0")
  const dd = d.padStart(2, "0")
  return `${y}-${mm}-${dd}`
}

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
 */
export function normalizeText(value: string, newlineToSpace?: boolean): string
export function normalizeText(value: TextValue, newlineToSpace?: boolean): TextValue
export function normalizeText(
  value: string | TextValue,
  newlineToSpace = true,
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

    t = t
      .replace(/([^\s(])\(/g, "$1 (")
      .replace(/\)([^\s)])/g, ") $1")

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
 * Normalize URL (relative to absolute)
 */
export const normalizeUrl = (url: string): string => {
  const u = url.trim()
  if (!u) return u

  if (/^https?:\/\//i.test(u)) return u

  if (u.startsWith("/")) return `${HUMANDBS_BASE_URL}${u}`

  return u
}

/**
 * Normalize footer text (remove leading markers)
 */
export const normalizeFooterText = (text: string, lang: "ja" | "en"): string => {
  if (lang === "ja") {
    return text.replace(/^[※*]\d*\s?/, "")
  } else {
    return text.replace(/^\*\d*\s?/, "")
  }
}

/**
 * Normalize full-width alphanumeric to half-width
 */
export const normalizeFullWidthAlphanumeric = (s: string): string => {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0),
  )
}

/**
 * Normalize hyphens and dashes
 */
export const normalizeHyphens = (s: string): string => {
  return s.replace(/[－―–—]/g, "-")
}
