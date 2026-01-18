import { describe, expect, it } from "bun:test"

import {
  normalizeKey,
  splitValue,
  isTextValue,
  normalizeText,
  normalizeUrl,
  normalizeCriteria,
  fixDatasetId,
  fixReleaseDate,
  fixDate,
  fixHumVersionId,
  normalizeDoiValue,
  fixGrantId,
  parsePeriodOfDataUse,
  mergeValue,
  removeUnusedPublications,
} from "@/crawler/normalize"
import type { TextValue, Publication } from "@/crawler/types"

describe("normalize.ts", () => {
  // ==========================================================================
  // normalizeKey
  // ==========================================================================
  describe("normalizeKey", () => {
    it("should lowercase and trim", () => {
      expect(normalizeKey("  Hello World  ")).toBe("helloworld")
    })

    it("should normalize NFKC", () => {
      expect(normalizeKey("ＡＢＣ")).toBe("abc")
    })

    it("should convert full-width parentheses to half-width", () => {
      expect(normalizeKey("（test）")).toBe("(test)")
    })

    it("should remove spaces and hyphens", () => {
      expect(normalizeKey("hello - world")).toBe("helloworld")
    })
  })

  // ==========================================================================
  // splitValue
  // ==========================================================================
  describe("splitValue", () => {
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

    it("should trim and filter empty values", () => {
      expect(splitValue("  a  ,  , b  ")).toEqual(["a", "b"])
    })

    it("should handle empty string", () => {
      expect(splitValue("")).toEqual([])
    })
  })

  // ==========================================================================
  // isTextValue
  // ==========================================================================
  describe("isTextValue", () => {
    it("should return true for valid TextValue", () => {
      expect(isTextValue({ text: "hello", rawHtml: "<p>hello</p>" })).toBe(true)
    })

    it("should return false for string", () => {
      expect(isTextValue("hello")).toBe(false)
    })

    it("should return false for null", () => {
      expect(isTextValue(null)).toBe(false)
    })

    it("should return false for object missing text", () => {
      expect(isTextValue({ rawHtml: "<p>hello</p>" })).toBe(false)
    })

    it("should return false for object missing rawHtml", () => {
      expect(isTextValue({ text: "hello" })).toBe(false)
    })
  })

  // ==========================================================================
  // normalizeText
  // ==========================================================================
  describe("normalizeText", () => {
    describe("string input", () => {
      it("should trim whitespace", () => {
        expect(normalizeText("  hello  ", true)).toBe("hello")
      })

      it("should normalize full-width spaces", () => {
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

      it("should normalize colons", () => {
        expect(normalizeText("key：value", true)).toBe("key: value")
      })

      it("should replace newlines with space when newlineToSpace is true", () => {
        expect(normalizeText("a\nb\r\nc", true)).toBe("a b c")
      })

      it("should remove newlines when newlineToSpace is false", () => {
        expect(normalizeText("a\nb\r\nc", false)).toBe("abc")
      })

      it("should add space before and after parentheses", () => {
        expect(normalizeText("hello(world)test", true)).toBe("hello (world) test")
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

    describe("TextValue input", () => {
      it("should normalize text field", () => {
        const input: TextValue = { text: "  hello  ", rawHtml: "<p>hello</p>" }
        const result = normalizeText(input, true)
        expect(result).toEqual({ text: "hello", rawHtml: "<p>hello</p>" })
      })
    })
  })

  // ==========================================================================
  // normalizeUrl
  // ==========================================================================
  describe("normalizeUrl", () => {
    it("should return empty string for empty input", () => {
      expect(normalizeUrl("")).toBe("")
    })

    it("should return absolute URLs unchanged", () => {
      expect(normalizeUrl("https://example.com/path")).toBe("https://example.com/path")
      expect(normalizeUrl("http://example.com/path")).toBe("http://example.com/path")
    })

    it("should prepend base URL for relative paths", () => {
      expect(normalizeUrl("/hum0001-v1")).toBe("https://humandbs.dbcls.jp/hum0001-v1")
    })

    it("should return non-URL strings unchanged", () => {
      expect(normalizeUrl("not-a-url")).toBe("not-a-url")
    })

    it("should trim whitespace", () => {
      expect(normalizeUrl("  /path  ")).toBe("https://humandbs.dbcls.jp/path")
    })
  })

  // ==========================================================================
  // normalizeCriteria
  // ==========================================================================
  describe("normalizeCriteria", () => {
    it("should return null for null input", () => {
      expect(normalizeCriteria(null)).toBeNull()
    })

    it("should return null for empty string", () => {
      expect(normalizeCriteria("")).toBeNull()
    })

    it("should normalize Japanese Type I", () => {
      expect(normalizeCriteria("制限公開(TypeI)")).toEqual(["Controlled-access (Type I)"])
    })

    it("should normalize English Type I", () => {
      expect(normalizeCriteria("Controlled-access (Type I)")).toEqual(["Controlled-access (Type I)"])
    })

    it("should normalize Japanese Type II", () => {
      expect(normalizeCriteria("制限公開(TypeII)")).toEqual(["Controlled-access (Type II)"])
    })

    it("should normalize unrestricted access Japanese", () => {
      expect(normalizeCriteria("非制限公開")).toEqual(["Unrestricted-access"])
    })

    it("should normalize unrestricted access English", () => {
      expect(normalizeCriteria("Unrestricted-access")).toEqual(["Unrestricted-access"])
    })

    it("should handle multiple criteria", () => {
      const result = normalizeCriteria("制限公開(TypeI),非制限公開")
      expect(result).toEqual(["Controlled-access (Type I)", "Unrestricted-access"])
    })

    it("should return null for unknown criteria", () => {
      expect(normalizeCriteria("Unknown")).toBeNull()
    })
  })

  // ==========================================================================
  // fixDatasetId
  // ==========================================================================
  describe("fixDatasetId", () => {
    it("should return empty array for empty string", () => {
      expect(fixDatasetId("")).toEqual([])
    })

    it("should split by space", () => {
      expect(fixDatasetId("JGAD000001 JGAD000002")).toEqual(["JGAD000001", "JGAD000002"])
    })

    it("should remove parentheses", () => {
      expect(fixDatasetId("JGAD000001 (data added)")).toEqual(["JGAD000001"])
    })

    it("should remove データ追加", () => {
      expect(fixDatasetId("JGAD000001 データ追加")).toEqual(["JGAD000001"])
    })

    it("should remove Data addition", () => {
      expect(fixDatasetId("JGAD000001 Data addition")).toEqual(["JGAD000001"])
    })

    it("should convert comma to space and split", () => {
      expect(fixDatasetId("JGAD000001,JGAD000002")).toEqual(["JGAD000001", "JGAD000002"])
    })

    it("should handle AP023461-AP024084 special case", () => {
      expect(fixDatasetId("AP023461-AP024084")).toEqual(["PRJDB10452"])
    })

    it("should handle 35 Diseases typo", () => {
      expect(fixDatasetId("35 Dieases")).toEqual(["35 Diseases"])
    })
  })

  // ==========================================================================
  // fixReleaseDate
  // ==========================================================================
  describe("fixReleaseDate", () => {
    it("should return null for null input", () => {
      expect(fixReleaseDate(null)).toBeNull()
    })

    it("should return null for empty string", () => {
      expect(fixReleaseDate("")).toBeNull()
    })

    it("should return null for Coming soon", () => {
      expect(fixReleaseDate("Coming soon")).toBeNull()
    })

    it("should return null for 近日公開予定", () => {
      expect(fixReleaseDate("近日公開予定")).toBeNull()
    })

    it("should convert date format", () => {
      expect(fixReleaseDate("2024/1/5")).toEqual(["2024-01-05"])
    })

    it("should handle multiple dates", () => {
      expect(fixReleaseDate("2024/1/5 2024/12/31")).toEqual(["2024-01-05", "2024-12-31"])
    })

    it("should skip invalid dates", () => {
      expect(fixReleaseDate("invalid 2024/1/5")).toEqual(["2024-01-05"])
    })

    it("should return null if no valid dates", () => {
      expect(fixReleaseDate("invalid")).toBeNull()
    })
  })

  // ==========================================================================
  // fixDate
  // ==========================================================================
  describe("fixDate", () => {
    it("should convert date format", () => {
      expect(fixDate("2024/1/5")).toBe("2024-01-05")
    })

    it("should pad single digit months and days", () => {
      expect(fixDate("2024/3/9")).toBe("2024-03-09")
    })

    it("should return original if format does not match", () => {
      expect(fixDate("2024-01-05")).toBe("2024-01-05")
    })

    it("should trim whitespace", () => {
      expect(fixDate("  2024/1/5  ")).toBe("2024-01-05")
    })
  })

  // ==========================================================================
  // fixHumVersionId
  // ==========================================================================
  describe("fixHumVersionId", () => {
    it("should extract base humVersionId from extended format", () => {
      expect(fixHumVersionId("hum0014-v1-freq-v1")).toBe("hum0014-v1")
    })

    it("should extract base humVersionId with longer suffix", () => {
      expect(fixHumVersionId("hum0014-v5-gwas-v1")).toBe("hum0014-v5")
    })

    it("should return unchanged for normal humVersionId", () => {
      expect(fixHumVersionId("hum0001-v1")).toBe("hum0001-v1")
    })

    it("should handle various version numbers", () => {
      expect(fixHumVersionId("hum0014-v14-extra")).toBe("hum0014-v14")
      expect(fixHumVersionId("hum1234-v99-suffix")).toBe("hum1234-v99")
    })

    it("should return unchanged for non-matching format", () => {
      expect(fixHumVersionId("invalid")).toBe("invalid")
    })
  })

  // ==========================================================================
  // normalizeDoiValue
  // ==========================================================================
  describe("normalizeDoiValue", () => {
    it("should return null for null input", () => {
      expect(normalizeDoiValue(null)).toBeNull()
    })

    it("should return null for doi:", () => {
      expect(normalizeDoiValue("doi:")).toBeNull()
    })

    it("should return null for In submission", () => {
      expect(normalizeDoiValue("In submission")).toBeNull()
    })

    it("should return null for null string", () => {
      expect(normalizeDoiValue("null")).toBeNull()
    })

    // Note: "投稿中" is no longer in INVALID_DOI_VALUES.
    // Publications with title "投稿中" are filtered out entirely by removeUnusedPublications,
    // so their DOI values don't need special handling.

    it("should return valid DOI unchanged", () => {
      expect(normalizeDoiValue("10.1234/example")).toBe("10.1234/example")
    })
  })

  // ==========================================================================
  // fixGrantId
  // ==========================================================================
  describe("fixGrantId", () => {
    it("should return null for empty array", () => {
      expect(fixGrantId([])).toBeNull()
    })

    it("should filter out None", () => {
      expect(fixGrantId(["None"])).toBeNull()
    })

    it("should filter out null string", () => {
      expect(fixGrantId(["null"])).toBeNull()
    })

    it("should filter out なし", () => {
      expect(fixGrantId(["なし"])).toBeNull()
    })

    it("should convert full-width alphanumeric to half-width", () => {
      expect(fixGrantId(["ＡＢＣ１２３"])).toEqual(["ABC123"])
    })

    it("should convert full-width dash to half-width", () => {
      expect(fixGrantId(["A－B"])).toEqual(["A-B"])
    })

    it("should handle multiple values", () => {
      expect(fixGrantId(["ABC", "None", "DEF"])).toEqual(["ABC", "DEF"])
    })

    it("should filter out empty values after processing", () => {
      expect(fixGrantId(["  "])).toBeNull()
    })
  })

  // ==========================================================================
  // parsePeriodOfDataUse
  // ==========================================================================
  describe("parsePeriodOfDataUse", () => {
    it("should return null for empty string", () => {
      expect(parsePeriodOfDataUse("")).toBeNull()
    })

    it("should parse valid period with hyphen format", () => {
      expect(parsePeriodOfDataUse("2024-01-01-2024-12-31")).toEqual({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      })
    })

    it("should parse valid period with slash format", () => {
      expect(parsePeriodOfDataUse("2023/06/12-2029/03/31")).toEqual({
        startDate: "2023-06-12",
        endDate: "2029-03-31",
      })
    })

    it("should parse slash format with single digit month/day", () => {
      expect(parsePeriodOfDataUse("2016/5/23-2017/4/1")).toEqual({
        startDate: "2016-05-23",
        endDate: "2017-04-01",
      })
    })

    it("should handle whitespace", () => {
      expect(parsePeriodOfDataUse("  2024-01-01 - 2024-12-31  ")).toEqual({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      })
    })

    it("should return null for invalid format", () => {
      expect(parsePeriodOfDataUse("invalid")).toBeNull()
    })

    it("should return null for single date", () => {
      expect(parsePeriodOfDataUse("2024-01-01")).toBeNull()
    })
  })

  // ==========================================================================
  // mergeValue
  // ==========================================================================
  describe("mergeValue", () => {
    const tv1: TextValue = { text: "a", rawHtml: "<p>a</p>" }
    const tv2: TextValue = { text: "b", rawHtml: "<p>b</p>" }
    const tv3: TextValue = { text: "c", rawHtml: "<p>c</p>" }

    it("should return null if both are null/undefined", () => {
      expect(mergeValue(null, null)).toBeNull()
      expect(mergeValue(undefined, null)).toBeNull()
    })

    it("should return existing if incoming is null", () => {
      expect(mergeValue(tv1, null)).toEqual(tv1)
    })

    it("should return incoming if existing is null", () => {
      expect(mergeValue(null, tv1)).toEqual(tv1)
    })

    it("should merge two TextValues into array", () => {
      expect(mergeValue(tv1, tv2)).toEqual([tv1, tv2])
    })

    it("should merge array with TextValue", () => {
      expect(mergeValue([tv1, tv2], tv3)).toEqual([tv1, tv2, tv3])
    })

    it("should merge TextValue with array", () => {
      expect(mergeValue(tv1, [tv2, tv3])).toEqual([tv1, tv2, tv3])
    })

    it("should merge two arrays", () => {
      expect(mergeValue([tv1], [tv2, tv3])).toEqual([tv1, tv2, tv3])
    })
  })

  // ==========================================================================
  // removeUnusedPublications
  // ==========================================================================
  describe("removeUnusedPublications", () => {
    it("should keep publications with valid titles", () => {
      const pubs: Publication[] = [
        { title: "Valid Title", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual(pubs)
    })

    it("should keep publications with null titles", () => {
      const pubs: Publication[] = [
        { title: null, doi: "10.1234/example", datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual(pubs)
    })

    it("should remove In submission", () => {
      const pubs: Publication[] = [
        { title: "In submission", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([])
    })

    it("should remove under publishing", () => {
      const pubs: Publication[] = [
        { title: "under publishing", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([])
    })

    it("should remove 投稿中", () => {
      const pubs: Publication[] = [
        { title: "投稿中", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([])
    })

    it("should remove 投稿準備中", () => {
      const pubs: Publication[] = [
        { title: "投稿準備中", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([])
    })

    it("should filter mixed list", () => {
      const pubs: Publication[] = [
        { title: "Valid", doi: null, datasetIds: [] },
        { title: "In submission", doi: null, datasetIds: [] },
        { title: "Another Valid", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([
        { title: "Valid", doi: null, datasetIds: [] },
        { title: "Another Valid", doi: null, datasetIds: [] },
      ])
    })
  })
})
