/**
 * Parser utility functions
 *
 * Common utilities shared across parsers
 *
 * Responsibility boundary:
 * - Parsers extract structured data from HTML (structure extraction)
 * - Value interpretation (e.g., "-" means empty) is done in normalize step
 */
import type { TextValue } from "@/crawler/types"

// Re-export normalization functions for backward compatibility
// These were moved to processors/normalize.ts as they are normalization concerns
export { compareHeaders, normalizeCellValue } from "@/crawler/processors/normalize"

/**
 * Clean whitespace from text
 */
export const cleanText = (str: string | null | undefined): string => {
  return str?.trim() ?? ""
}

/**
 * Clean innerHTML by removing style/class/id attributes
 */
export const cleanInnerHtml = (node: Element): string => {
  const clone = node.cloneNode(true) as Element

  const removeAttrs = (el: Element) => {
    el.removeAttribute("style")
    el.removeAttribute("class")
    el.removeAttribute("id")
    el.removeAttribute("rel")
    el.removeAttribute("target")
    for (const child of Array.from(el.children)) {
      removeAttrs(child)
    }
  }
  removeAttrs(clone)

  return clone.innerHTML.trim()
}

/**
 * Convert Element to TextValue (text + rawHtml)
 */
export const toTextValue = (el: Element): TextValue => ({
  text: cleanText(el.textContent),
  rawHtml: cleanInnerHtml(el),
})

/**
 * Parse values separated by <br> tags from a table cell
 * Used for grantId and other fields that use <br> as a separator
 */
export const parseBrSeparatedValues = (cell: Element): string[] => {
  let html = cell.innerHTML
  html = html.replace(/<br\s*\/?>/gi, "\n")
  html = html.replace(/<\/p>/gi, "\n")
  html = html.replace(/<\/div>/gi, "\n")

  const text = html.replace(/<[^>]+>/g, "")
  const parts = text.split(/\n+/)

  const values: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    // "-" は正規化ステップで除外するため、ここでは残す
    if (!trimmed || trimmed === "\u00a0") continue
    values.push(trimmed)
  }

  return values
}

/**
 * Parse dataset IDs from a table cell
 *
 * Handles various HTML formats:
 * - IDs separated by <br> tags
 * - IDs separated by <p> tags
 * - IDs separated by commas
 * - IDs separated by whitespace/newlines
 *
 * Returns each ID as a separate string in the array
 * Range formats like "JGAD000144-JGAD000201" are preserved as-is
 */
export const parseDatasetIdsFromCell = (cell: Element): string[] => {
  // Get innerHTML and replace block-level separators with newlines
  let html = cell.innerHTML
  html = html.replace(/<br\s*\/?>/gi, "\n")
  html = html.replace(/<\/p>/gi, "\n")
  html = html.replace(/<\/div>/gi, "\n")
  html = html.replace(/<\/li>/gi, "\n")

  // Remove all remaining HTML tags
  const text = html.replace(/<[^>]+>/g, "")

  // Split by separators: newline, comma, ideographic comma
  const parts = text.split(/[\n,\u3001]+/)

  // Clean up each part and filter
  // "-" と注釈記号は正規化ステップで除外するため、ここでは残す
  const ids: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    // Skip empty or whitespace-only
    if (!trimmed || trimmed === "\u00a0") continue
    ids.push(trimmed)
  }

  return ids
}
