/**
 * Utility to strip rawHtml fields from API responses
 *
 * By default, API responses exclude rawHtml fields to reduce response size.
 * Set includeRawHtml=true to include them.
 */

/**
 * Recursively strip rawHtml fields from an object
 */
export const stripRawHtml = <T>(obj: T): T => {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => stripRawHtml(item)) as T
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "rawHtml") {
        continue // Skip rawHtml fields
      }
      result[key] = stripRawHtml(value)
    }
    return result as T
  }

  return obj
}

/**
 * Conditionally strip rawHtml based on includeRawHtml parameter
 */
export const maybeStripRawHtml = <T>(obj: T, includeRawHtml: boolean): T => {
  if (includeRawHtml) {
    return obj
  }
  return stripRawHtml(obj)
}
