import { describe, expect, it } from "bun:test"

import {
  escapeForTsv,
  unescapeTsv,
  toTsvRow,
  parseTsv,
  parseJsonField,
  parseJsonFieldOrNull,
  parseNumberOrNull,
  parseBooleanOrNull,
} from "@/crawler/utils/tsv"

describe("escapeForTsv", () => {
  it("should return empty string for null", () => {
    expect(escapeForTsv(null)).toBe("")
  })

  it("should return empty string for undefined", () => {
    expect(escapeForTsv(undefined)).toBe("")
  })

  it("should escape tabs", () => {
    expect(escapeForTsv("a\tb")).toBe("a\\tb")
  })

  it("should escape newlines", () => {
    expect(escapeForTsv("a\nb")).toBe("a\\nb")
  })

  it("should escape carriage returns", () => {
    expect(escapeForTsv("a\rb")).toBe("a\\rb")
  })

  it("should JSON-stringify objects", () => {
    expect(escapeForTsv({ key: "value" })).toBe("{\"key\":\"value\"}")
  })

  it("should convert numbers to string", () => {
    expect(escapeForTsv(42)).toBe("42")
  })

  it("should convert booleans to string", () => {
    expect(escapeForTsv(true)).toBe("true")
  })
})

describe("unescapeTsv", () => {
  it("should unescape tabs", () => {
    expect(unescapeTsv("a\\tb")).toBe("a\tb")
  })

  it("should unescape newlines", () => {
    expect(unescapeTsv("a\\nb")).toBe("a\nb")
  })

  it("should unescape carriage returns", () => {
    expect(unescapeTsv("a\\rb")).toBe("a\rb")
  })

  it("should roundtrip with escapeForTsv", () => {
    const original = "line1\nline2\ttab\rreturn"
    expect(unescapeTsv(escapeForTsv(original))).toBe(original)
  })
})

describe("toTsvRow", () => {
  it("should join values with tabs", () => {
    expect(toTsvRow(["a", "b", "c"])).toBe("a\tb\tc")
  })

  it("should escape values", () => {
    expect(toTsvRow(["a\tb", null, 42])).toBe("a\\tb\t\t42")
  })
})

describe("parseTsv", () => {
  it("should parse TSV content with headers", () => {
    const content = "name\tage\nAlice\t30\nBob\t25"
    const rows = parseTsv(content)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: "Alice", age: "30" })
    expect(rows[1]).toEqual({ name: "Bob", age: "25" })
  })

  it("should return empty array for empty content", () => {
    expect(parseTsv("")).toEqual([])
  })

  it("should handle missing values", () => {
    const content = "a\tb\n1"
    const rows = parseTsv(content)
    expect(rows[0].a).toBe("1")
    expect(rows[0].b).toBe("")
  })

  it("should unescape values", () => {
    const content = "text\nhello\\nworld"
    const rows = parseTsv(content)
    expect(rows[0].text).toBe("hello\nworld")
  })
})

describe("parseJsonField", () => {
  it("should parse valid JSON", () => {
    expect(parseJsonField<string[]>("[\"a\",\"b\"]", [])).toEqual(["a", "b"])
  })

  it("should return default for empty string", () => {
    expect(parseJsonField<string[]>("", [])).toEqual([])
  })

  it("should return default for invalid JSON", () => {
    expect(parseJsonField<string>("not json", "default")).toBe("default")
  })
})

describe("parseJsonFieldOrNull", () => {
  it("should parse valid JSON", () => {
    expect(parseJsonFieldOrNull<Record<string, string>>("{\"key\":\"val\"}")).toEqual({ key: "val" })
  })

  it("should return null for empty string", () => {
    expect(parseJsonFieldOrNull("")).toBeNull()
  })

  it("should return null for empty array", () => {
    expect(parseJsonFieldOrNull("[]")).toBeNull()
  })

  it("should return null for invalid JSON", () => {
    expect(parseJsonFieldOrNull("bad")).toBeNull()
  })
})

describe("parseNumberOrNull", () => {
  it("should parse integer", () => {
    expect(parseNumberOrNull("42")).toBe(42)
  })

  it("should parse float", () => {
    expect(parseNumberOrNull("3.14")).toBe(3.14)
  })

  it("should return null for empty string", () => {
    expect(parseNumberOrNull("")).toBeNull()
  })

  it("should return null for non-numeric string", () => {
    expect(parseNumberOrNull("abc")).toBeNull()
  })
})

describe("parseBooleanOrNull", () => {
  it("should parse true", () => {
    expect(parseBooleanOrNull("true")).toBe(true)
  })

  it("should parse false", () => {
    expect(parseBooleanOrNull("false")).toBe(false)
  })

  it("should return null for empty string", () => {
    expect(parseBooleanOrNull("")).toBeNull()
  })

  it("should return null for other values", () => {
    expect(parseBooleanOrNull("yes")).toBeNull()
  })
})
