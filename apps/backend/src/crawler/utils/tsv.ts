/**
 * TSV escape/unescape and parsing utilities
 */

// Escape/Unescape

export const escapeForTsv = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ""
  }

  const str = typeof value === "object" ? JSON.stringify(value) : String(value)

  return str
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
}

export const unescapeTsv = (value: string): string => {
  return value
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
}

// Row conversion

export const toTsvRow = (values: unknown[]): string => {
  return values.map(v => escapeForTsv(v)).join("\t")
}

// TSV parsing

export type TsvRow = Record<string, string>

export const parseTsv = (content: string): TsvRow[] => {
  const lines = content.split("\n").filter(line => line.trim() !== "")
  if (lines.length === 0) return []

  const headers = lines[0].split("\t")
  const rows: TsvRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split("\t")
    const row: TsvRow = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = unescapeTsv(values[j] ?? "")
    }
    rows.push(row)
  }

  return rows
}

// Field parsers

export const parseJsonField = <T>(value: string, defaultValue: T): T => {
  if (!value || value.trim() === "") return defaultValue
  try {
    return JSON.parse(value) as T
  } catch {
    return defaultValue
  }
}

export const parseJsonFieldOrNull = <T>(value: string): T | null => {
  if (!value || value.trim() === "") return null
  try {
    const parsed = JSON.parse(value) as T
    if (Array.isArray(parsed) && parsed.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export const parseNumberOrNull = (value: string): number | null => {
  if (!value || value.trim() === "") return null
  const num = parseFloat(value)
  return isNaN(num) ? null : num
}

export const parseBooleanOrNull = (value: string): boolean | null => {
  if (!value || value.trim() === "") return null
  if (value === "true") return true
  if (value === "false") return false
  return null
}
