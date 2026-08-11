import { describe, expect, it } from "vitest"

import { filled } from "~/content/empty"
import type { TranslatedText } from "~/content/types"

import {
  ADMIN_PAGE_SIZE,
  filterResearchRows,
  pageOf,
  sortResearchRows,
  type AdminResearchRow,
} from "./listing"

const NOTHING = {
  noHumLabel: false,
  noDatasetLabel: false,
  unsettled: false,
  untranslated: false,
  upstreamMismatch: false,
}

function pair(ja: string, en: string): TranslatedText {
  return { ja: filled(ja), en: filled(en) }
}

function row(overrides: Partial<AdminResearchRow> = {}): AdminResearchRow {
  return {
    researchId: "00000000-0000-0000-0000-000000000001",
    humLabel: "hum0001",
    title: pair("糖尿病のゲノム解析", "Genome analysis of diabetes"),
    providerNames: [pair("田中 太郎", "Taro Tanaka")],
    datasetLabels: ["JGAD000001"],
    status: "published",
    publishedVersions: 1,
    draftCount: 0,
    flags: NOTHING,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function matching(keyword: string, rows: AdminResearchRow[] = [row()]): number {
  return filterResearchRows(rows, { keyword, status: null, flags: [] }).length
}

describe("the direct lookup", () => {
  it("matches a hum label, a dataset id, a title in either language, and a provider", () => {
    expect(matching("hum0001")).toBe(1)
    expect(matching("JGAD000001")).toBe(1)
    expect(matching("糖尿病")).toBe(1)
    expect(matching("diabetes")).toBe(1)
    expect(matching("Tanaka")).toBe(1)
  })

  it("ignores case, because a dataset id is written both ways in practice", () => {
    expect(matching("jgad000001")).toBe(1)
    expect(matching("HUM0001")).toBe(1)
  })

  it("requires every word, as the public box does", () => {
    expect(matching("糖尿病 hum0001")).toBe(1)
    expect(matching("糖尿病 hum0002")).toBe(0)
  })

  it("matches everything when nothing was typed", () => {
    expect(matching("")).toBe(1)
    expect(matching("   ")).toBe(1)
  })

  it("does not match on a value the row does not hold", () => {
    expect(matching("肝臓")).toBe(0)
  })

  it("has nothing to match on a research with no label and no title", () => {
    const bare = row({ humLabel: null, title: pair("", ""), providerNames: [], datasetLabels: [] })

    expect(matching("hum", [bare])).toBe(0)
    expect(matching("", [bare])).toBe(1)
  })

  it("does not match on a language whose value was never settled", () => {
    const unsettled = row({
      title: { ja: { state: "unknown" }, en: filled("Genome analysis of diabetes") },
    })

    expect(matching("糖尿病", [unsettled])).toBe(0)
    expect(matching("diabetes", [unsettled])).toBe(1)
  })
})

describe("the filters", () => {
  const rows = [
    row({ researchId: "a", status: "published" }),
    row({ researchId: "b", status: "withdrawn" }),
    row({ researchId: "c", status: "unpublished", flags: { ...NOTHING, noHumLabel: true } }),
    row({
      researchId: "d",
      status: "unpublished",
      flags: { ...NOTHING, noHumLabel: true, unsettled: true, untranslated: true },
    }),
  ]

  it("narrows to one status", () => {
    expect(filterResearchRows(rows, { keyword: "", status: "unpublished", flags: [] })
      .map((held) => held.researchId)).toEqual(["c", "d"])
  })

  it("requires every shortcoming that was ticked, not any of them", () => {
    expect(filterResearchRows(rows, { keyword: "", status: null, flags: ["noHumLabel"] })
      .map((held) => held.researchId)).toEqual(["c", "d"])
    expect(filterResearchRows(rows, {
      keyword: "",
      status: null,
      flags: ["noHumLabel", "unsettled"],
    }).map((held) => held.researchId)).toEqual(["d"])
  })

  it("ANDs all five shortcomings together, including the two pin-derived ones", () => {
    const withAllFive = [
      row({
        researchId: "e",
        flags: {
          noHumLabel: true,
          noDatasetLabel: true,
          unsettled: true,
          untranslated: true,
          upstreamMismatch: true,
        },
      }),
      row({
        researchId: "f",
        flags: { ...NOTHING, noHumLabel: true, noDatasetLabel: true, upstreamMismatch: true },
      }),
    ]

    expect(filterResearchRows(withAllFive, {
      keyword: "",
      status: null,
      flags: ["noHumLabel", "noDatasetLabel", "unsettled", "untranslated", "upstreamMismatch"],
    }).map((held) => held.researchId)).toEqual(["e"])

    expect(filterResearchRows(withAllFive, {
      keyword: "",
      status: null,
      flags: ["noDatasetLabel", "upstreamMismatch"],
    }).map((held) => held.researchId)).toEqual(["e", "f"])
  })

  it("combines the box, the status and the shortcomings", () => {
    expect(filterResearchRows(rows, {
      keyword: "糖尿病",
      status: "published",
      flags: ["unsettled"],
    })).toEqual([])
  })
})

describe("the order and the page", () => {
  it("puts the most recently touched first", () => {
    const rows = [
      row({ researchId: "old", updatedAt: "2025-01-01T00:00:00.000Z" }),
      row({ researchId: "new", updatedAt: "2026-06-01T00:00:00.000Z" }),
    ]

    expect(sortResearchRows(rows).map((held) => held.researchId)).toEqual(["new", "old"])
  })

  it("breaks a tie by identity, so a page boundary does not move between requests", () => {
    const rows = [row({ researchId: "a" }), row({ researchId: "b" })]

    expect(sortResearchRows(rows).map((held) => held.researchId)).toEqual(["b", "a"])
    expect(sortResearchRows([...rows].reverse()).map((held) => held.researchId)).toEqual(["b", "a"])
  })

  it("holds a page to its size and reports how many pages there are", () => {
    const rows = Array.from({ length: ADMIN_PAGE_SIZE * 2 + 1 }, (_, at) =>
      row({ researchId: String(at) }))

    expect(pageOf(rows, 1).rows).toHaveLength(ADMIN_PAGE_SIZE)
    expect(pageOf(rows, 3).rows).toHaveLength(1)
    expect(pageOf(rows, 3).pageCount).toBe(3)
  })

  it("answers a page beyond the end with the last one rather than with nothing", () => {
    const rows = [row()]

    expect(pageOf(rows, 9).page).toBe(1)
    expect(pageOf(rows, 9).rows).toHaveLength(1)
    expect(pageOf(rows, 0).page).toBe(1)
  })

  it("has one page even when there is nothing on it", () => {
    expect(pageOf([], 1)).toEqual({ rows: [], total: 0, page: 1, pageCount: 1 })
  })
})
