/**
 * hydrate-raw-html tests
 *
 * request shape (rawHtml 無し) を ES shape (rawHtml: null 注入) に変換する。
 * 変換結果が各 ES schema を parse できることを検証する。
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  hydrateBilingualTextValue,
  hydrateExperiment,
  hydratePerson,
  hydrateResearchProject,
  hydrateSummary,
  hydrateTextValue,
} from "@/api/utils/hydrate-raw-html"
import {
  BilingualTextValueSchema,
  TextValueSchema,
} from "@/crawler/types/common"
import {
  PersonSchema,
  ResearchProjectSchema,
  SummarySchema,
} from "@/crawler/types/structured"

describe("hydrateTextValue", () => {
  it("returns null for null input", () => {
    expect(hydrateTextValue(null)).toBeNull()
  })

  it("injects rawHtml: null for non-null input", () => {
    const result = hydrateTextValue({ text: "hello" })
    expect(result).toEqual({ text: "hello", rawHtml: null })
  })

  it("result is parseable by TextValueSchema", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const hydrated = hydrateTextValue({ text })
        expect(() => TextValueSchema.parse(hydrated)).not.toThrow()
      }),
    )
  })
})

describe("hydrateBilingualTextValue", () => {
  it("hydrates both ja and en", () => {
    const result = hydrateBilingualTextValue({
      ja: { text: "日本" },
      en: { text: "English" },
    })
    expect(result).toEqual({
      ja: { text: "日本", rawHtml: null },
      en: { text: "English", rawHtml: null },
    })
  })

  it("keeps null sides as null", () => {
    const result = hydrateBilingualTextValue({
      ja: { text: "日本" },
      en: null,
    })
    expect(result).toEqual({
      ja: { text: "日本", rawHtml: null },
      en: null,
    })
  })

  it("PBT: result is parseable by BilingualTextValueSchema", () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({ text: fc.string() }), { nil: null }),
        fc.option(fc.record({ text: fc.string() }), { nil: null }),
        (ja, en) => {
          const hydrated = hydrateBilingualTextValue({ ja, en })
          expect(() => BilingualTextValueSchema.parse(hydrated)).not.toThrow()
        },
      ),
    )
  })
})

describe("hydrateSummary", () => {
  it("hydrates all TextValue fields and preserves url", () => {
    const result = hydrateSummary({
      aims: { ja: { text: "目的" }, en: { text: "Aims" } },
      methods: { ja: null, en: null },
      targets: { ja: { text: "対象" }, en: null },
      url: { ja: [{ text: "link", url: "https://example.com" }], en: [] },
    })
    expect(() => SummarySchema.parse(result)).not.toThrow()
    expect(result.aims.ja).toEqual({ text: "目的", rawHtml: null })
    expect(result.url.ja).toEqual([{ text: "link", url: "https://example.com" }])
  })
})

describe("hydratePerson", () => {
  it("hydrates name and organization.name", () => {
    const result = hydratePerson({
      name: { ja: { text: "田中" }, en: { text: "Tanaka" } },
      email: "t@example.com",
      organization: {
        name: { ja: { text: "東大" }, en: { text: "UTokyo" } },
        address: { country: "Japan" },
      },
    })
    expect(() => PersonSchema.parse(result)).not.toThrow()
    expect(result.name.ja).toEqual({ text: "田中", rawHtml: null })
    expect(result.organization?.name.ja).toEqual({ text: "東大", rawHtml: null })
  })

  it("handles missing organization", () => {
    const result = hydratePerson({
      name: { ja: { text: "田中" }, en: null },
    })
    expect(() => PersonSchema.parse(result)).not.toThrow()
    expect(result.organization).toBeUndefined()
  })
})

describe("hydrateResearchProject", () => {
  it("hydrates name and preserves url", () => {
    const result = hydrateResearchProject({
      name: { ja: { text: "プロジェクト" }, en: null },
      url: { ja: { text: "link", url: "https://example.com" }, en: null },
    })
    expect(() => ResearchProjectSchema.parse(result)).not.toThrow()
    expect(result.name.ja).toEqual({ text: "プロジェクト", rawHtml: null })
  })
})

describe("hydrateExperiment", () => {
  it("hydrates header and all data cells", () => {
    const result = hydrateExperiment({
      header: {
        ja: { text: "ヘッダ" },
        en: { text: "Header" },
      },
      data: {
        row1: { ja: { text: "値" }, en: { text: "Value" } },
        row2: null,
      },
    })
    expect(result.header.ja).toEqual({ text: "ヘッダ", rawHtml: null })
    expect(result.data.row1?.ja).toEqual({ text: "値", rawHtml: null })
    expect(result.data.row2).toBeNull()
  })
})
