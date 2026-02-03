/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "bun:test"

import {
  normalizeUrl,
  normalizeCriteria,
  normalizePolicies,
  fixDatasetId,
  fixReleaseDate,
  fixDate,
  fixHumVersionId,
  normalizeDoiValue,
  fixGrantId,
  parsePeriodOfDataUse,
  mergeValue,
  removeUnusedPublications,
  expandJgadRange,
  filterEmptyMarker,
  filterAnnotations,
  filterParsedValues,
  compareHeaders,
  normalizeCellValue,
  extractAndExpandDatasetIdsFromMolData,
  buildDatasetIdRegistry,
  detectOrphanDatasetIds,
} from "@/crawler/processors/normalize"
import type {
  TextValue,
  RawPublication,
  NormalizedMolecularData,
  NormalizedParseResult,
  DatasetIdType,
} from "@/crawler/types"
import {
  normalizeKey,
  splitValue,
  isTextValue,
  normalizeText,
} from "@/crawler/utils/text"

const BASE_URL = "https://humandbs.dbcls.jp"

describe("processors/normalize.ts", () => {
  // ===========================================================================
  // normalizeKey
  // ===========================================================================
  describe("normalizeKey", () => {
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

  // ===========================================================================
  // splitValue
  // ===========================================================================
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

  // ===========================================================================
  // isTextValue
  // ===========================================================================
  describe("isTextValue", () => {
    it("should return true for valid TextValue object", () => {
      expect(isTextValue({ text: "hello", rawHtml: "<p>hello</p>" })).toBe(true)
    })

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

      it("should not add space around parentheses when lang is undefined", () => {
        expect(normalizeText("hello(world)", true)).toBe("hello(world)")
      })

      it("should not produce ') .' in English text", () => {
        expect(normalizeText("(see above).", true, "en")).toBe("(see above).")
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
      it("should normalize text field while preserving rawHtml", () => {
        const input: TextValue = { text: "  hello  ", rawHtml: "<p>hello</p>" }
        const result = normalizeText(input, true)
        expect(result).toEqual({ text: "hello", rawHtml: "<p>hello</p>" })
      })
    })
  })

  // ===========================================================================
  // normalizeUrl
  // ===========================================================================
  describe("normalizeUrl", () => {
    it("should return empty string for empty input", () => {
      expect(normalizeUrl("", BASE_URL)).toBe("")
    })

    it("should return absolute URLs unchanged", () => {
      expect(normalizeUrl("https://example.com/path", BASE_URL)).toBe("https://example.com/path")
      expect(normalizeUrl("http://example.com/path", BASE_URL)).toBe("http://example.com/path")
    })

    it("should prepend base URL for paths starting with /", () => {
      expect(normalizeUrl("/hum0001-v1", BASE_URL)).toBe("https://humandbs.dbcls.jp/hum0001-v1")
    })

    it("should return non-URL strings unchanged", () => {
      expect(normalizeUrl("not-a-url", BASE_URL)).toBe("not-a-url")
    })

    it("should trim whitespace", () => {
      expect(normalizeUrl("  /path  ", BASE_URL)).toBe("https://humandbs.dbcls.jp/path")
    })
  })

  // ===========================================================================
  // normalizeCriteria
  // ===========================================================================
  describe("normalizeCriteria", () => {
    it("should return null for null input", () => {
      expect(normalizeCriteria(null)).toBeNull()
    })

    it("should return null for undefined input", () => {
      expect(normalizeCriteria(undefined)).toBeNull()
    })

    it("should return null for empty string", () => {
      expect(normalizeCriteria("")).toBeNull()
    })

    it("should normalize Japanese Type I", () => {
      expect(normalizeCriteria("制限公開(TypeI)")).toBe("Controlled-access (Type I)")
    })

    it("should normalize English Type I", () => {
      expect(normalizeCriteria("Controlled-access (Type I)")).toBe("Controlled-access (Type I)")
    })

    it("should normalize Japanese Type II", () => {
      expect(normalizeCriteria("制限公開(TypeII)")).toBe("Controlled-access (Type II)")
    })

    it("should normalize unrestricted access (Japanese)", () => {
      expect(normalizeCriteria("非制限公開")).toBe("Unrestricted-access")
    })

    it("should normalize unrestricted access (English)", () => {
      expect(normalizeCriteria("Unrestricted-access")).toBe("Unrestricted-access")
    })

    it("should use first value when multiple comma-separated criteria", () => {
      const result = normalizeCriteria("制限公開(TypeI),非制限公開")
      expect(result).toBe("Controlled-access (Type I)")
    })

    it("should return null for unknown criteria", () => {
      expect(normalizeCriteria("Unknown Criteria")).toBeNull()
    })
  })

  // ===========================================================================
  // fixDatasetId
  // ===========================================================================
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

    it("should remove Japanese データ追加", () => {
      expect(fixDatasetId("JGAD000001 データ追加")).toEqual(["JGAD000001"])
    })

    it("should remove English Data addition", () => {
      expect(fixDatasetId("JGAD000001 Data addition")).toEqual(["JGAD000001"])
    })

    it("should convert comma to space and split", () => {
      expect(fixDatasetId("JGAD000001,JGAD000002")).toEqual(["JGAD000001", "JGAD000002"])
    })

    it("should handle special case AP023461-AP024084", () => {
      expect(fixDatasetId("AP023461-AP024084")).toEqual(["PRJDB10452"])
    })

    it("should handle 35 Diseases typo", () => {
      expect(fixDatasetId("35 Dieases")).toEqual(["35 Diseases"])
    })
  })

  // ===========================================================================
  // expandJgadRange
  // ===========================================================================
  describe("expandJgadRange", () => {
    it("should expand JGAD range notation", () => {
      expect(expandJgadRange("JGAD000106-JGAD000108")).toEqual([
        "JGAD000106",
        "JGAD000107",
        "JGAD000108",
      ])
    })

    it("should return single ID for non-range input", () => {
      expect(expandJgadRange("JGAD000001")).toEqual(["JGAD000001"])
    })

    it("should return original for reversed range", () => {
      expect(expandJgadRange("JGAD000108-JGAD000106")).toEqual(["JGAD000108-JGAD000106"])
    })

    it("should return original for non-JGAD IDs", () => {
      expect(expandJgadRange("JGAS000001")).toEqual(["JGAS000001"])
    })
  })

  // ===========================================================================
  // fixReleaseDate
  // ===========================================================================
  describe("fixReleaseDate", () => {
    it("should return null for null input", () => {
      expect(fixReleaseDate(null)).toBeNull()
    })

    it("should return null for empty string", () => {
      expect(fixReleaseDate("")).toBeNull()
    })

    it("should return null for 'Coming soon'", () => {
      expect(fixReleaseDate("Coming soon")).toBeNull()
    })

    it("should return null for '近日公開予定'", () => {
      expect(fixReleaseDate("近日公開予定")).toBeNull()
    })

    it("should convert YYYY/M/D to YYYY-MM-DD format", () => {
      expect(fixReleaseDate("2024/1/5")).toBe("2024-01-05")
    })

    it("should return the first date when multiple space-separated dates", () => {
      expect(fixReleaseDate("2024/1/5 2024/12/31")).toBe("2024-01-05")
    })

    it("should skip invalid date parts and return the first valid date", () => {
      expect(fixReleaseDate("invalid 2024/1/5")).toBe("2024-01-05")
    })

    it("should return null if no valid dates found", () => {
      expect(fixReleaseDate("invalid")).toBeNull()
    })
  })

  // ===========================================================================
  // fixDate
  // ===========================================================================
  describe("fixDate", () => {
    it("should convert YYYY/M/D to YYYY-MM-DD", () => {
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

  // ===========================================================================
  // fixHumVersionId
  // ===========================================================================
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

  // ===========================================================================
  // normalizeDoiValue
  // ===========================================================================
  describe("normalizeDoiValue", () => {
    it("should return null for null input", () => {
      expect(normalizeDoiValue(null)).toBeNull()
    })

    it("should return null for 'doi:'", () => {
      expect(normalizeDoiValue("doi:")).toBeNull()
    })

    it("should return null for 'In submission'", () => {
      expect(normalizeDoiValue("In submission")).toBeNull()
    })

    it("should return null for 'null' string", () => {
      expect(normalizeDoiValue("null")).toBeNull()
    })

    it("should return valid DOI unchanged", () => {
      expect(normalizeDoiValue("10.1234/example")).toBe("10.1234/example")
    })
  })

  // ===========================================================================
  // fixGrantId
  // ===========================================================================
  describe("fixGrantId", () => {
    it("should return null for empty array", () => {
      expect(fixGrantId([])).toBeNull()
    })

    it("should filter out 'None'", () => {
      expect(fixGrantId(["None"])).toBeNull()
    })

    it("should filter out 'null' string", () => {
      expect(fixGrantId(["null"])).toBeNull()
    })

    it("should filter out 'なし'", () => {
      expect(fixGrantId(["なし"])).toBeNull()
    })

    it("should convert full-width alphanumeric to half-width", () => {
      expect(fixGrantId(["ＡＢＣ１２３"])).toEqual(["ABC123"])
    })

    it("should convert full-width dash to half-width", () => {
      expect(fixGrantId(["A－B"])).toEqual(["A-B"])
    })

    it("should handle multiple values, filtering invalid ones", () => {
      expect(fixGrantId(["ABC", "None", "DEF"])).toEqual(["ABC", "DEF"])
    })

    it("should filter out empty values after processing", () => {
      expect(fixGrantId(["  "])).toBeNull()
    })
  })

  // ===========================================================================
  // parsePeriodOfDataUse
  // ===========================================================================
  describe("parsePeriodOfDataUse", () => {
    it("should return null for empty string", () => {
      expect(parsePeriodOfDataUse("")).toBeNull()
    })

    it("should parse YYYY-MM-DD-YYYY-MM-DD format", () => {
      expect(parsePeriodOfDataUse("2024-01-01-2024-12-31")).toEqual({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      })
    })

    it("should parse YYYY/M/D-YYYY/M/D format", () => {
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

  // ===========================================================================
  // mergeValue
  // ===========================================================================
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

  // ===========================================================================
  // removeUnusedPublications
  // ===========================================================================
  describe("removeUnusedPublications", () => {
    it("should keep publications with valid titles", () => {
      const pubs: RawPublication[] = [
        { title: "Valid Title", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual(pubs)
    })

    it("should keep publications with null titles", () => {
      const pubs: RawPublication[] = [
        { title: null, doi: "10.1234/example", datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual(pubs)
    })

    it("should remove 'In submission'", () => {
      const pubs: RawPublication[] = [
        { title: "In submission", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([])
    })

    it("should remove 'under publishing'", () => {
      const pubs: RawPublication[] = [
        { title: "under publishing", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([])
    })

    it("should remove '投稿中'", () => {
      const pubs: RawPublication[] = [
        { title: "投稿中", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([])
    })

    it("should remove '投稿準備中'", () => {
      const pubs: RawPublication[] = [
        { title: "投稿準備中", doi: null, datasetIds: [] },
      ]
      expect(removeUnusedPublications(pubs)).toEqual([])
    })

    it("should filter mixed list, keeping only valid ones", () => {
      const pubs: RawPublication[] = [
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

  // ===========================================================================
  // filterEmptyMarker
  // ===========================================================================
  describe("filterEmptyMarker", () => {
    it("should filter out '-' from values", () => {
      expect(filterEmptyMarker(["a", "-", "b"])).toEqual(["a", "b"])
    })

    it("should return empty array if all values are '-'", () => {
      expect(filterEmptyMarker(["-", "-"])).toEqual([])
    })

    it("should preserve other values", () => {
      expect(filterEmptyMarker(["JGAD000001", "JGAD000002"])).toEqual(["JGAD000001", "JGAD000002"])
    })

    it("should handle empty array", () => {
      expect(filterEmptyMarker([])).toEqual([])
    })
  })

  // ===========================================================================
  // filterAnnotations
  // ===========================================================================
  describe("filterAnnotations", () => {
    it("should filter out values starting with ※", () => {
      expect(filterAnnotations(["JGAD000001", "※注記"])).toEqual(["JGAD000001"])
    })

    it("should filter out values starting with *", () => {
      expect(filterAnnotations(["JGAD000001", "*note"])).toEqual(["JGAD000001"])
    })

    it("should filter out values starting with （ when not followed by capital letter", () => {
      expect(filterAnnotations(["JGAD000001", "（参考）"])).toEqual(["JGAD000001"])
    })

    it("should preserve values starting with （ followed by capital letter", () => {
      expect(filterAnnotations(["（A）", "（B）"])).toEqual(["（A）", "（B）"])
    })

    it("should preserve values starting with ( followed by capital letter", () => {
      expect(filterAnnotations(["(A)", "(B)"])).toEqual(["(A)", "(B)"])
    })

    it("should handle empty array", () => {
      expect(filterAnnotations([])).toEqual([])
    })
  })

  // ===========================================================================
  // filterParsedValues
  // ===========================================================================
  describe("filterParsedValues", () => {
    it("should filter both '-' and annotations", () => {
      expect(filterParsedValues(["JGAD000001", "-", "※注記", "JGAD000002"]))
        .toEqual(["JGAD000001", "JGAD000002"])
    })

    it("should handle mixed invalid values", () => {
      expect(filterParsedValues(["-", "※", "*note", "（参考）", "valid"]))
        .toEqual(["valid"])
    })

    it("should preserve IDs with parentheses and capital letters", () => {
      expect(filterParsedValues(["(A)", "-", "（B）"]))
        .toEqual(["(A)", "（B）"])
    })
  })

  // ===========================================================================
  // compareHeaders
  // ===========================================================================
  describe("compareHeaders", () => {
    it("should return true for matching headers", () => {
      expect(compareHeaders(["Title", "DOI"], ["Title", "DOI"])).toBe(true)
    })

    it("should ignore case differences", () => {
      expect(compareHeaders(["title", "doi"], ["Title", "DOI"])).toBe(true)
    })

    it("should ignore whitespace differences", () => {
      expect(compareHeaders(["Title ", " DOI"], ["Title", "DOI"])).toBe(true)
    })

    it("should ignore internal whitespace", () => {
      expect(compareHeaders(["Dataset ID", "Type of Data"], ["DatasetID", "TypeofData"])).toBe(true)
    })

    it("should return false for different lengths", () => {
      expect(compareHeaders(["Title"], ["Title", "DOI"])).toBe(false)
    })

    it("should return false for different values", () => {
      expect(compareHeaders(["Title", "Author"], ["Title", "DOI"])).toBe(false)
    })
  })

  // ===========================================================================
  // normalizeCellValue
  // ===========================================================================
  describe("normalizeCellValue", () => {
    // Mock HTMLTableCellElement for testing
    const createMockCell = (text: string): HTMLTableCellElement => {
      return { textContent: text } as HTMLTableCellElement
    }

    it("should return null for empty string", () => {
      expect(normalizeCellValue(createMockCell(""))).toBeNull()
    })

    it("should return null for '-'", () => {
      expect(normalizeCellValue(createMockCell("-"))).toBeNull()
    })

    it("should return trimmed value for normal text", () => {
      expect(normalizeCellValue(createMockCell("  hello  "))).toBe("hello")
    })

    it("should return value for text that is not '-'", () => {
      expect(normalizeCellValue(createMockCell("JGAD000001"))).toBe("JGAD000001")
    })
  })

  // ===========================================================================
  // extractAndExpandDatasetIdsFromMolData
  // ===========================================================================
  describe("extractAndExpandDatasetIdsFromMolData", () => {
    const mockExtractIdsByType = (text: string): Partial<Record<DatasetIdType, string[]>> => {
      const result: Partial<Record<DatasetIdType, string[]>> = {}
      const jgadMatches = text.match(/JGAD\d{6}/g)
      if (jgadMatches) result.JGAD = jgadMatches
      const jgasMatches = text.match(/JGAS\d{6}/g)
      if (jgasMatches) result.JGAS = jgasMatches
      const draMatches = text.match(/DRA\d{6}/g)
      if (draMatches) result.DRA = draMatches
      return result
    }

    const mockGetDatasetsFromStudy = async (studyId: string): Promise<string[]> => {
      if (studyId === "JGAS000001") return ["JGAD000001", "JGAD000002"]
      if (studyId === "JGAS000002") return ["JGAD000003"]
      return []
    }

    it("should extract JGAD IDs from molecular data header", async () => {
      const molData: NormalizedMolecularData = {
        id: { text: "JGAD000001", rawHtml: "JGAD000001" },
        data: {},
        footers: [],
      }

      const result = await extractAndExpandDatasetIdsFromMolData(
        molData,
        mockGetDatasetsFromStudy,
        mockExtractIdsByType,
        "hum0001",
      )

      expect(result.datasetIds).toContain("JGAD000001")
      expect(result.originalJgasIds).toEqual([])
    })

    it("should expand JGAS IDs to JGAD IDs", async () => {
      const molData: NormalizedMolecularData = {
        id: { text: "Study: JGAS000001", rawHtml: "Study: JGAS000001" },
        data: {},
        footers: [],
      }

      const result = await extractAndExpandDatasetIdsFromMolData(
        molData,
        mockGetDatasetsFromStudy,
        mockExtractIdsByType,
        "hum0001",
      )

      expect(result.datasetIds).toContain("JGAD000001")
      expect(result.datasetIds).toContain("JGAD000002")
      expect(result.originalJgasIds).toContain("JGAS000001")
    })

    it("should extract IDs from data fields", async () => {
      const molData: NormalizedMolecularData = {
        id: { text: "Header", rawHtml: "Header" },
        data: {
          // Use actual field name from idFields config
          "Japanese Genotype-phenotype Archive Dataset Accession": {
            text: "JGAD000005",
            rawHtml: "JGAD000005",
          },
        },
        footers: [],
      }

      const result = await extractAndExpandDatasetIdsFromMolData(
        molData,
        mockGetDatasetsFromStudy,
        mockExtractIdsByType,
        "hum0001",
      )

      expect(result.datasetIds).toContain("JGAD000005")
    })

    it("should extract DRA IDs", async () => {
      const molData: NormalizedMolecularData = {
        id: { text: "DRA001234", rawHtml: "DRA001234" },
        data: {},
        footers: [],
      }

      const result = await extractAndExpandDatasetIdsFromMolData(
        molData,
        mockGetDatasetsFromStudy,
        mockExtractIdsByType,
        "hum0001",
      )

      expect(result.datasetIds).toContain("DRA001234")
    })
  })

  // ===========================================================================
  // buildDatasetIdRegistry
  // ===========================================================================
  describe("buildDatasetIdRegistry", () => {
    it("should build registry from molecular data with extracted IDs", () => {
      const molecularData: NormalizedMolecularData[] = [
        {
          id: { text: "Data1", rawHtml: "Data1" },
          data: {},
          footers: [],
          extractedDatasetIds: {
            datasetIds: ["JGAD000001", "JGAD000002"],
            originalJgasIds: [],
            idsByType: {},
          },
        },
        {
          id: { text: "Data2", rawHtml: "Data2" },
          data: {},
          footers: [],
          extractedDatasetIds: {
            datasetIds: ["JGAD000002", "JGAD000003"],
            originalJgasIds: [],
            idsByType: {},
          },
        },
      ]

      const registry = buildDatasetIdRegistry(molecularData)

      expect(registry.validDatasetIds).toContain("JGAD000001")
      expect(registry.validDatasetIds).toContain("JGAD000002")
      expect(registry.validDatasetIds).toContain("JGAD000003")
      expect(registry.datasetIdToMolDataIndices.JGAD000001).toEqual([0])
      expect(registry.datasetIdToMolDataIndices.JGAD000002).toEqual([0, 1])
      expect(registry.datasetIdToMolDataIndices.JGAD000003).toEqual([1])
    })

    it("should skip molecular data without extracted IDs", () => {
      const molecularData: NormalizedMolecularData[] = [
        {
          id: { text: "Data1", rawHtml: "Data1" },
          data: {},
          footers: [],
          // No extractedDatasetIds
        },
      ]

      const registry = buildDatasetIdRegistry(molecularData)

      expect(registry.validDatasetIds).toEqual([])
      expect(registry.datasetIdToMolDataIndices).toEqual({})
    })

    it("should return empty registry for empty input", () => {
      const registry = buildDatasetIdRegistry([])

      expect(registry.validDatasetIds).toEqual([])
      expect(registry.datasetIdToMolDataIndices).toEqual({})
    })
  })

  // ===========================================================================
  // detectOrphanDatasetIds
  // ===========================================================================
  describe("detectOrphanDatasetIds", () => {
    const createMockNormalizedParseResult = (
      summaryDatasetIds: string[][],
      publicationDatasetIds: string[][],
      cauDatasetIds: string[][],
    ): NormalizedParseResult => ({
      title: "Test",
      summary: {
        aims: { text: "", rawHtml: "" },
        methods: { text: "", rawHtml: "" },
        targets: { text: "", rawHtml: "" },
        url: [],
        datasets: summaryDatasetIds.map((ids, i) => ({
          datasetId: ids,
          typeOfData: `Type${i}`,
          criteria: null,
          releaseDate: null,
        })),
        footers: [],
      },
      molecularData: [],
      dataProvider: {
        principalInvestigator: [],
        affiliation: [],
        projectName: [],
        projectUrl: [],
        grants: [],
      },
      publications: publicationDatasetIds.map((ids, i) => ({
        title: `Publication${i}`,
        doi: null,
        datasetIds: ids,
      })),
      controlledAccessUsers: cauDatasetIds.map((ids, i) => ({
        principalInvestigator: null,
        affiliation: null,
        country: null,
        researchTitle: `Research${i}`,
        datasetIds: ids,
        periodOfDataUse: null,
      })),
      releases: [],
    })

    it("should detect orphan dataset IDs in summary", () => {
      const result = createMockNormalizedParseResult(
        [["JGAD000001", "JGAD999999"]],
        [],
        [],
      )
      const validIds = new Set(["JGAD000001"])

      const orphans = detectOrphanDatasetIds(result, validIds, "hum0001-v1")

      expect(orphans).toHaveLength(1)
      expect(orphans[0]).toEqual({
        type: "summary",
        datasetId: "JGAD999999",
        context: "Type0",
      })
    })

    it("should detect orphan dataset IDs in publications", () => {
      const result = createMockNormalizedParseResult(
        [],
        [["JGAD000001", "JGAD999999"]],
        [],
      )
      const validIds = new Set(["JGAD000001"])

      const orphans = detectOrphanDatasetIds(result, validIds, "hum0001-v1")

      expect(orphans).toHaveLength(1)
      expect(orphans[0]).toEqual({
        type: "publication",
        datasetId: "JGAD999999",
        context: "Publication0",
      })
    })

    it("should detect orphan dataset IDs in controlled access users", () => {
      const result = createMockNormalizedParseResult(
        [],
        [],
        [["JGAD000001", "JGAD999999"]],
      )
      const validIds = new Set(["JGAD000001"])

      const orphans = detectOrphanDatasetIds(result, validIds, "hum0001-v1")

      expect(orphans).toHaveLength(1)
      expect(orphans[0]).toEqual({
        type: "controlledAccessUser",
        datasetId: "JGAD999999",
        context: "Research0",
      })
    })

    it("should return empty array when no orphans", () => {
      const result = createMockNormalizedParseResult(
        [["JGAD000001"]],
        [["JGAD000001", "JGAD000002"]],
        [["JGAD000002"]],
      )
      const validIds = new Set(["JGAD000001", "JGAD000002"])

      const orphans = detectOrphanDatasetIds(result, validIds, "hum0001-v1")

      expect(orphans).toHaveLength(0)
    })

    it("should detect multiple orphans across different sources", () => {
      const result = createMockNormalizedParseResult(
        [["JGAD999991"]],
        [["JGAD999992"]],
        [["JGAD999993"]],
      )
      const validIds = new Set(["JGAD000001"])

      const orphans = detectOrphanDatasetIds(result, validIds, "hum0001-v1")

      expect(orphans).toHaveLength(3)
      expect(orphans.map(o => o.datasetId).sort()).toEqual([
        "JGAD999991",
        "JGAD999992",
        "JGAD999993",
      ])
    })
  })

  // ===========================================================================
  // normalizePolicies
  // ===========================================================================
  describe("normalizePolicies", () => {
    it("should normalize single NBDC policy from text", () => {
      const result = normalizePolicies(
        "NBDC policy",
        null,
        null,
        null,
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: "nbdc-policy",
        name: { ja: "NBDC policy", en: "NBDC policy" },
        url: "https://humandbs.dbcls.jp/nbdc-policy",
      })
    })

    it("should normalize NBDC policy from rawHtml href", () => {
      const result = normalizePolicies(
        "NBDC policy",
        null,
        "<a href=\"/nbdc-policy\"><span>NBDC policy</span></a>",
        null,
      )

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("nbdc-policy")
      expect(result[0].url).toBe("https://humandbs.dbcls.jp/nbdc-policy")
    })

    it("should normalize multiple policies separated by 'および'", () => {
      const result = normalizePolicies(
        "NBDC policy および 民間企業における利用禁止",
        null,
        null,
        null,
      )

      expect(result).toHaveLength(2)
      expect(result.map(p => p.id)).toContain("nbdc-policy")
      expect(result.map(p => p.id)).toContain("company-limitation-policy")
    })

    it("should normalize multiple policies separated by '&'", () => {
      const result = normalizePolicies(
        null,
        "NBDC policy & Company User Limit",
        null,
        null,
      )

      expect(result).toHaveLength(2)
      expect(result.map(p => p.id)).toContain("nbdc-policy")
      expect(result.map(p => p.id)).toContain("company-limitation-policy")
    })

    it("should normalize Cancer Research Use Only policy", () => {
      const result = normalizePolicies(
        "NBDC policy および Cancer Research Use Only",
        null,
        null,
        null,
      )

      expect(result).toHaveLength(2)
      expect(result.map(p => p.id)).toContain("cancer-research-policy")
    })

    it("should normalize Familial policy", () => {
      const result = normalizePolicies(
        "Familial policy",
        null,
        null,
        null,
      )

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("familial-policy")
    })

    it("should handle custom hum policy", () => {
      const result = normalizePolicies(
        "NBDC policy および hum0184 policy",
        null,
        null,
        null,
      )

      expect(result).toHaveLength(2)
      expect(result.map(p => p.id)).toContain("nbdc-policy")
      expect(result.map(p => p.id)).toContain("custom-policy")

      const customPolicy = result.find(p => p.id === "custom-policy")
      expect(customPolicy?.name.ja).toContain("hum0184 policy")
    })

    it("should remove dataset ID annotations from text", () => {
      const result = normalizePolicies(
        "NBDC policy(JGAD000095、JGAD000122) NBDC policy および 民間企業における利用禁止(JGAD000110)",
        null,
        null,
        null,
      )

      // Should have nbdc-policy and company-limitation-policy, not duplicates
      expect(result.map(p => p.id)).toContain("nbdc-policy")
      expect(result.map(p => p.id)).toContain("company-limitation-policy")
    })

    it("should return empty array for null/empty input", () => {
      expect(normalizePolicies(null, null, null, null)).toEqual([])
      expect(normalizePolicies("", "", "", "")).toEqual([])
    })

    it("should deduplicate policies from ja and en text", () => {
      const result = normalizePolicies(
        "NBDC policy",
        "NBDC policy",
        null,
        null,
      )

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("nbdc-policy")
    })

    it("should extract policy from English rawHtml href", () => {
      const result = normalizePolicies(
        null,
        null,
        null,
        "<a href=\"/en/nbdc-policy\">NBDC policy</a>",
      )

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("nbdc-policy")
    })

    it("should handle Academic Use Only as company limitation", () => {
      // "Academic Use Only" typically appears with "NBDC policy" in the actual data
      // The text contains both patterns, so both should be detected
      const result = normalizePolicies(
        "NBDC policy および Academic Use Only",
        null,
        null,
        null,
      )

      expect(result.map(p => p.id)).toContain("nbdc-policy")
      expect(result.map(p => p.id)).toContain("company-limitation-policy")
    })
  })
})
