/**
 * Tests for text utility functions
 *
 * Covers:
 * - normalizeKey: key normalization
 * - splitValue: value splitting
 * - isTextValue: type guard
 * - normalizeText: text normalization
 * - httpToHttps: URL conversion
 * - normalizeFooterText: footer text cleanup
 */

import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import type { TextValue } from "@/crawler/types"
import {
  httpToHttps,
  isTextValue,
  normalizeFooterText,
  normalizeKey,
  normalizeText,
  splitValue,
} from "@/crawler/utils/text"

// ===========================================================================
// normalizeKey
// ===========================================================================
describe("normalizeKey", () => {
  describe("basic normalization", () => {
    it("should lowercase and trim whitespace", () => {
      expect(normalizeKey("  Hello World  ")).toBe("helloworld")
    })

    it("should normalize full-width characters (NFKC)", () => {
      expect(normalizeKey("ＡＢＣ")).toBe("abc")
    })

    it("should convert full-width parentheses to half-width", () => {
      expect(normalizeKey("（test）")).toBe("(test)")
    })

    it("should remove spaces and hyphens", () => {
      expect(normalizeKey("hello - world")).toBe("helloworld")
    })

    it("should handle empty string", () => {
      expect(normalizeKey("")).toBe("")
    })
  })

  describe("boundary cases", () => {
    it.each([
      // Mixed case
      ["AbCdEf", "abcdef", "mixed case"],

      // Full-width numbers
      ["１２３", "123", "full-width numbers"],

      // Multiple spaces
      ["a   b   c", "abc", "multiple spaces"],

      // Tabs
      ["a\tb\tc", "abc", "tabs"],

      // Multiple hyphens
      ["a--b--c", "abc", "multiple hyphens"],

      // Japanese with hyphens
      ["データ-タイプ", "データタイプ", "Japanese with hyphens"],
    ] as const)("%s -> %s (%s)", (input, expected, _desc) => {
      expect(normalizeKey(input)).toBe(expected)
    })
  })

  describe("properties (PBT)", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const first = normalizeKey(input)
          const second = normalizeKey(first)
          expect(second).toBe(first)
        }),
      )
    })

    it("output should be lowercase", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = normalizeKey(input)
          expect(result).toBe(result.toLowerCase())
        }),
      )
    })

    it("output should not contain spaces or hyphens", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = normalizeKey(input)
          expect(result).not.toMatch(/[\s-]/)
        }),
      )
    })
  })
})

// ===========================================================================
// splitValue
// ===========================================================================
describe("splitValue", () => {
  describe("basic splitting", () => {
    it("should split by newlines", () => {
      expect(splitValue("a\nb\nc")).toEqual(["a", "b", "c"])
    })

    it("should split by comma", () => {
      expect(splitValue("a,b,c")).toEqual(["a", "b", "c"])
    })

    it("should split by Japanese comma", () => {
      expect(splitValue("a、b、c")).toEqual(["a", "b", "c"])
    })

    it("should split by slash", () => {
      expect(splitValue("a/b/c")).toEqual(["a", "b", "c"])
    })

    it("should trim whitespace and filter empty values", () => {
      expect(splitValue("  a  ,  , b  ")).toEqual(["a", "b"])
    })

    it("should handle empty string", () => {
      expect(splitValue("")).toEqual([])
    })

    it("should handle CRLF", () => {
      expect(splitValue("a\r\nb\r\nc")).toEqual(["a", "b", "c"])
    })
  })

  describe("boundary cases", () => {
    it.each([
      // Only delimiters
      [",,,", [], "only commas"],
      ["\n\n\n", [], "only newlines"],
      ["///", [], "only slashes"],

      // Mixed delimiters
      ["a,b\nc/d", ["a", "b", "c", "d"], "mixed delimiters"],

      // Consecutive delimiters
      ["a,,b", ["a", "b"], "consecutive commas"],
      ["a\n\nb", ["a", "b"], "consecutive newlines"],

      // Full-width slash
      ["a／b／c", ["a", "b", "c"], "full-width slashes"],

      // With surrounding whitespace
      [" a , b , c ", ["a", "b", "c"], "whitespace around values"],
    ] as const)("%s -> %j (%s)", (input, expected, _desc) => {
      expect(splitValue(input)).toEqual(expected)
    })
  })

  describe("properties (PBT)", () => {
    it("result items should be trimmed", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = splitValue(input)
          for (const item of result) {
            expect(item.trim()).toBe(item)
          }
        }),
      )
    })

    it("result should not contain empty strings", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = splitValue(input)
          for (const item of result) {
            expect(item).not.toBe("")
          }
        }),
      )
    })
  })
})

// ===========================================================================
// isTextValue
// ===========================================================================
describe("isTextValue", () => {
  describe("positive cases", () => {
    it("should return true for valid TextValue object", () => {
      expect(isTextValue({ text: "hello", rawHtml: "<p>hello</p>" })).toBe(true)
    })

    it("should return true for empty string fields", () => {
      expect(isTextValue({ text: "", rawHtml: "" })).toBe(true)
    })

    it("should return true for TextValue with extra properties", () => {
      expect(isTextValue({ text: "a", rawHtml: "b", extra: "c" })).toBe(true)
    })
  })

  describe("negative cases", () => {
    it("should return false for plain string", () => {
      expect(isTextValue("hello")).toBe(false)
    })

    it("should return false for null", () => {
      expect(isTextValue(null)).toBe(false)
    })

    it("should return false for undefined", () => {
      expect(isTextValue(undefined)).toBe(false)
    })

    it("should return false for object missing text property", () => {
      expect(isTextValue({ rawHtml: "<p>hello</p>" })).toBe(false)
    })

    it("should return false for object missing rawHtml property", () => {
      expect(isTextValue({ text: "hello" })).toBe(false)
    })

    it("should return false for array", () => {
      expect(isTextValue([{ text: "a", rawHtml: "b" }])).toBe(false)
    })

    it("should return false for number", () => {
      expect(isTextValue(42)).toBe(false)
    })

    it("should return false for boolean", () => {
      expect(isTextValue(true)).toBe(false)
    })
  })
})

// ===========================================================================
// normalizeText
// ===========================================================================
describe("normalizeText", () => {
  describe("string input", () => {
    it("should trim whitespace", () => {
      expect(normalizeText("  hello  ", true)).toBe("hello")
    })

    it("should normalize full-width space to half-width", () => {
      expect(normalizeText("hello\u3000world", true)).toBe("hello world")
    })

    it("should convert full-width parentheses to half-width", () => {
      expect(normalizeText("（test）", true)).toBe("(test)")
    })

    it("should normalize quotes", () => {
      expect(normalizeText("\u2018hello\u2019", true)).toBe("'hello'")
      expect(normalizeText("\u201Chello\u201D", true)).toBe("\"hello\"")
    })

    it("should normalize dashes", () => {
      expect(normalizeText("a–b—c", true)).toBe("a-b-c")
    })

    it("should normalize colons with spacing", () => {
      expect(normalizeText("key：value", true)).toBe("key: value")
    })

    it("should replace newlines with space when newlineToSpace=true", () => {
      expect(normalizeText("a\nb\r\nc", true)).toBe("a b c")
    })

    it("should remove newlines when newlineToSpace=false", () => {
      expect(normalizeText("a\nb\r\nc", false)).toBe("abc")
    })

    it("should collapse multiple spaces", () => {
      expect(normalizeText("a    b", true)).toBe("a b")
    })

    it("should return empty string for empty input", () => {
      expect(normalizeText("", true)).toBe("")
    })

    it("should not modify URL-like strings", () => {
      expect(normalizeText("https://example.com", true)).toBe("https://example.com")
    })
  })

  describe("lang parameter", () => {
    it("should insert spaces around parentheses when lang is 'ja'", () => {
      expect(normalizeText("テスト(値)", true, "ja")).toBe("テスト (値)")
    })

    it("should not insert spaces around parentheses when lang is 'en'", () => {
      expect(normalizeText("test(value)", true, "en")).toBe("test(value)")
    })

    it("should not insert spaces around parentheses when lang is undefined", () => {
      expect(normalizeText("test(value)", true)).toBe("test(value)")
    })

    it("should not produce ') .' pattern in English text", () => {
      expect(normalizeText("(see above).", true, "en")).toBe("(see above).")
    })

    it("should insert space after closing parenthesis followed by non-space in Japanese", () => {
      expect(normalizeText("(値)テスト", true, "ja")).toBe("(値) テスト")
    })

    it("should preserve existing spaces around parentheses regardless of lang", () => {
      expect(normalizeText("hello (world)", true, "en")).toBe("hello (world)")
      expect(normalizeText("hello (world)", true, "ja")).toBe("hello (world)")
    })

    it("should add space before opening parenthesis when lang is 'ja'", () => {
      expect(normalizeText("hello(world)", true, "ja")).toBe("hello (world)")
    })

    it("should add space after closing parenthesis when lang is 'ja'", () => {
      expect(normalizeText("(hello)world", true, "ja")).toBe("(hello) world")
    })

    it("should not add space around parentheses when lang is 'en'", () => {
      expect(normalizeText("hello(world)", true, "en")).toBe("hello(world)")
      expect(normalizeText("(hello)world", true, "en")).toBe("(hello)world")
    })
  })

  describe("TextValue input", () => {
    it("should normalize text field while preserving rawHtml", () => {
      const input: TextValue = { text: "  hello  ", rawHtml: "<p>hello</p>" }
      const result = normalizeText(input, true)
      expect(result).toEqual({ text: "hello", rawHtml: "<p>hello</p>" })
    })
  })
})

// ===========================================================================
// httpToHttps
// ===========================================================================
describe("httpToHttps", () => {
  it("should convert http:// to https://", () => {
    expect(httpToHttps("http://example.com")).toBe("https://example.com")
  })

  it("should keep https:// unchanged", () => {
    expect(httpToHttps("https://example.com")).toBe("https://example.com")
  })

  it("should be case-insensitive", () => {
    expect(httpToHttps("HTTP://example.com")).toBe("https://example.com")
  })

  it("should return empty string for empty input", () => {
    expect(httpToHttps("")).toBe("")
  })

  it("should not modify non-URL strings", () => {
    expect(httpToHttps("not-a-url")).toBe("not-a-url")
  })

  describe("boundary cases", () => {
    it.each([
      // Whitespace
      ["  http://example.com  ", "https://example.com", "trimmed"],

      // Mixed case
      ["Http://example.com", "https://example.com", "mixed case"],
      ["hTtP://example.com", "https://example.com", "unusual case"],

      // Path and query
      ["http://example.com/path?query=1", "https://example.com/path?query=1", "with path and query"],

      // Port
      ["http://example.com:8080", "https://example.com:8080", "with port"],

      // Already HTTPS with various components
      ["https://example.com/path#anchor", "https://example.com/path#anchor", "https with anchor"],
    ] as const)("%s -> %s (%s)", (input, expected, _desc) => {
      expect(httpToHttps(input)).toBe(expected)
    })
  })

  describe("properties (PBT)", () => {
    it("should be idempotent", () => {
      fc.assert(
        fc.property(fc.webUrl(), (url) => {
          const first = httpToHttps(url)
          const second = httpToHttps(first)
          expect(second).toBe(first)
        }),
      )
    })

    it("result should not start with http://", () => {
      fc.assert(
        fc.property(fc.webUrl(), (url) => {
          const result = httpToHttps(url)
          expect(result.toLowerCase().startsWith("http://")).toBe(false)
        }),
      )
    })
  })
})

// ===========================================================================
// normalizeFooterText
// ===========================================================================
describe("normalizeFooterText", () => {
  describe("Japanese (ja)", () => {
    it("should remove ※ marker", () => {
      expect(normalizeFooterText("※注釈", "ja")).toBe("注釈")
    })

    it("should remove ※n marker", () => {
      expect(normalizeFooterText("※1 注釈", "ja")).toBe("注釈")
    })

    it("should remove * marker", () => {
      expect(normalizeFooterText("*注釈", "ja")).toBe("注釈")
    })

    it("should remove numbered parentheses 1)", () => {
      expect(normalizeFooterText("1) 注釈文", "ja")).toBe("注釈文")
    })

    it("should remove leading colon :", () => {
      expect(normalizeFooterText(": 説明文", "ja")).toBe("説明文")
    })

    it("should remove leading full-width colon ：", () => {
      expect(normalizeFooterText("：説明文", "ja")).toBe("説明文")
    })
  })

  describe("English (en)", () => {
    it("should remove * marker", () => {
      expect(normalizeFooterText("*note", "en")).toBe("note")
    })

    it("should remove *n marker", () => {
      expect(normalizeFooterText("*1 note", "en")).toBe("note")
    })

    it("should remove numbered parentheses 1)", () => {
      expect(normalizeFooterText("1) note text", "en")).toBe("note text")
    })

    it("should remove leading colon :", () => {
      expect(normalizeFooterText(": description", "en")).toBe("description")
    })

    it("should not remove ※ marker in English", () => {
      expect(normalizeFooterText("※note", "en")).toBe("※note")
    })
  })

  describe("boundary cases", () => {
    it.each([
      // Multiple markers (only first is removed)
      ["※※text", "※text", "ja", "double ※"],
      ["**text", "*text", "en", "double *"],

      // Marker at end (not removed)
      ["text※", "text※", "ja", "※ at end"],
      ["text*", "text*", "en", "* at end"],

      // Multi-digit numbers
      ["※12 text", "text", "ja", "double digit marker"],
      ["123) text", "text", "ja", "triple digit parenthesis"],
    ] as const)("%s -> %s (%s, %s)", (input, expected, lang, _desc) => {
      expect(normalizeFooterText(input, lang)).toBe(expected)
    })
  })
})
