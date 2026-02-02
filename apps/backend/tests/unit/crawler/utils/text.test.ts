import { describe, expect, it } from "bun:test"

import { httpToHttps, normalizeFooterText, normalizeText } from "@/crawler/utils/text"

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
})

describe("normalizeText lang parameter", () => {
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
})

describe("normalizeFooterText", () => {
  it("should remove ※ marker (ja)", () => {
    expect(normalizeFooterText("※注釈", "ja")).toBe("注釈")
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
