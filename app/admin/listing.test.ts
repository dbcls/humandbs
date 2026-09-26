import { describe, expect, it } from "vitest"

import { filled } from "~/content/empty"
import type { TranslatedText } from "~/content/types"
import { PAGE_SIZE } from "~/search/page-size"

import {
  ADMIN_STATUSES,
  axisCounts,
  BRANCH_STATUSES,
  branchStatusOf,
  filterBranchRows,
  filterResearchRows,
  pageOf,
  sortBranchRows,
  sortResearchRows,
  OPEN_RANGE,
  type AdminResearchRow,
  type BranchRow,
  type ListingFilter,
} from "./listing"

function pair(ja: string, en: string): TranslatedText {
  return { ja: filled(ja), en: filled(en) }
}

function row(overrides: Partial<AdminResearchRow> = {}): AdminResearchRow {
  return {
    researchId: "00000000-0000-0000-0000-000000000001",
    humLabel: "hum0001",
    title: pair("糖尿病のゲノム解析", "Genome analysis of diabetes"),
    providerNames: [pair("田中 太郎", "Taro Tanaka")],
    datasets: [{ label: "JGAD000001", published: false }],
    status: "published",
    publishedVersions: 1,
    draftCount: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedOn: "2026-01-01",
    ...overrides,
  }
}

function filter(overrides: Partial<ListingFilter> = {}): ListingFilter {
  return { keyword: "", statuses: [], published: OPEN_RANGE, updated: OPEN_RANGE, files: [], ...overrides }
}

function matching(keyword: string, rows: AdminResearchRow[] = [row()]): number {
  return filterResearchRows(rows, filter({ keyword })).length
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

  it("requires every word, as the public search box does", () => {
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
    const bare = row({ humLabel: null, title: pair("", ""), providerNames: [], datasets: [] })

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
    row({ researchId: "b", status: "published" }),
    row({ researchId: "c", status: "unpublished" }),
    row({ researchId: "d", status: "unpublished" }),
  ]

  it("narrows to one status", () => {
    expect(filterResearchRows(rows, filter({ keyword: "", statuses: ["unpublished"] }))
      .map((held) => held.researchId)).toEqual(["c", "d"])
  })

  it("takes a row in any of the ticked states, and every row when both are", () => {
    expect(filterResearchRows(rows, filter({ statuses: ["published", "unpublished"] })).map((held) => held.researchId)).toEqual(["a", "b", "c", "d"])
  })

  it("narrows nothing when neither state is ticked, as an untouched axis does", () => {
    expect(filterResearchRows(rows, filter({ keyword: "", statuses: [] }))
      .map((held) => held.researchId))
      .toEqual(filterResearchRows(rows, filter({ statuses: ["published", "unpublished"] })).map((held) => held.researchId))
  })

  it("keeps the status and the word as separate conditions, ANDed", () => {
    const named = row({ researchId: "e", status: "unpublished", humLabel: "hum0999" })

    expect(filterResearchRows([...rows, named], filter({ keyword: "hum0999", statuses: ["published"] })))
      .toEqual([])
    expect(filterResearchRows([...rows, named], filter({ keyword: "hum0999", statuses: ["unpublished"] }))
      .map((held) => held.researchId)).toEqual(["e"])
  })
})

describe("the days and the files", () => {
  const rows = [
    row({ researchId: "a", publishedOn: "2024-03-01", updatedAt: "2025-12-31T15:30:00.000Z" }),
    row({ researchId: "b", publishedOn: "2025-06-30", updatedAt: "2026-06-30T00:00:00.000Z" }),
    row({ researchId: "c", publishedOn: null, status: "unpublished", updatedAt: "2026-09-25T23:59:00.000Z" }),
  ]
  const ids = (held: AdminResearchRow[]): string[] => held.map((one) => one.researchId)

  it("keeps the release days inside the range, both ends included, and a research never out outside any", () => {
    expect(ids(filterResearchRows(rows, filter({ published: { from: "2024-03-01", to: "2025-06-30" } })))).toEqual(["a", "b"])
    expect(ids(filterResearchRows(rows, filter({ published: { from: "2025-01-01", to: null } })))).toEqual(["b"])
    expect(ids(filterResearchRows(rows, filter({ published: { from: null, to: "2024-12-31" } })))).toEqual(["a"])
    expect(ids(filterResearchRows(rows, filter({ published: OPEN_RANGE })))).toEqual(["a", "b", "c"])
  })

  it("reads the day of the latest change in JST, the day the column shows", () => {
    // 2025-12-31T15:30Z is 2026-01-01 00:30 in JST; 2026-09-25T23:59Z is 09-26.
    expect(ids(filterResearchRows(rows, filter({ updated: { from: "2026-01-01", to: "2026-01-01" } })))).toEqual(["a"])
    expect(ids(filterResearchRows(rows, filter({ updated: { from: "2026-09-26", to: null } })))).toEqual(["c"])
  })

  it("keeps a research with or without files as ticked, and narrows nothing when the store could not say", () => {
    const holding = new Set(["a", "c"])
    const known = (one: AdminResearchRow): boolean => holding.has(one.researchId)
    expect(ids(filterResearchRows(rows, filter({ files: ["with"] }), known))).toEqual(["a", "c"])
    expect(ids(filterResearchRows(rows, filter({ files: ["without"] }), known))).toEqual(["b"])
    expect(ids(filterResearchRows(rows, filter({ files: ["with", "without"] }), known))).toEqual(["a", "b", "c"])
    expect(ids(filterResearchRows(rows, filter({ files: ["with"] }), () => null))).toEqual(["a", "b", "c"])
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

  it("sinks a research that has never been out, whichever way the release date runs", () => {
    const rows = [
      row({ researchId: "never", publishedOn: null }),
      row({ researchId: "old", publishedOn: "2024-01-01" }),
      row({ researchId: "new", publishedOn: "2026-06-01" }),
    ]

    expect(sortResearchRows(rows, "datePublished", "desc").map((held) => held.researchId))
      .toEqual(["new", "old", "never"])
    expect(sortResearchRows(rows, "datePublished", "asc").map((held) => held.researchId))
      .toEqual(["old", "new", "never"])
  })

  it("sinks an unpinned label the same way when the order is by identifier", () => {
    const rows = [
      row({ researchId: "unpinned", humLabel: null }),
      row({ researchId: "b", humLabel: "hum0002" }),
      row({ researchId: "a", humLabel: "hum0001" }),
    ]

    expect(sortResearchRows(rows, "id", "asc").map((held) => held.researchId))
      .toEqual(["a", "b", "unpinned"])
    expect(sortResearchRows(rows, "id", "desc").map((held) => held.researchId))
      .toEqual(["b", "a", "unpinned"])
  })

  it("runs a key the way it reads when nobody specifies which way", () => {
    const rows = [
      row({ researchId: "a", humLabel: "hum0001", updatedAt: "2025-01-01T00:00:00.000Z" }),
      row({ researchId: "b", humLabel: "hum0002", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ]

    // A date opens on the newest, an identifier on the smallest.
    expect(sortResearchRows(rows, "dateModified").map((held) => held.researchId)).toEqual(["b", "a"])
    expect(sortResearchRows(rows, "id").map((held) => held.researchId)).toEqual(["a", "b"])
  })

  it("breaks a tie by identity, so a page boundary does not move between requests", () => {
    const rows = [row({ researchId: "a" }), row({ researchId: "b" })]

    expect(sortResearchRows(rows).map((held) => held.researchId)).toEqual(["b", "a"])
    expect(sortResearchRows([...rows].reverse()).map((held) => held.researchId)).toEqual(["b", "a"])
  })

  it("holds a page to the size it was asked for", () => {
    const rows = Array.from({ length: 51 }, (_, at) =>
      row({ researchId: `r${String(at).padStart(3, "0")}` }))

    expect(pageOf(rows, 1, 50).rows).toHaveLength(50)
    expect(pageOf(rows, 2, 50).rows).toHaveLength(1)
    expect(pageOf(rows, 2, 50).pageCount).toBe(2)
    expect(pageOf(rows, 1, 100).pageCount).toBe(1)
  })

  it("holds a page to its size and reports how many pages there are", () => {
    const rows = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, at) =>
      row({ researchId: String(at) }))

    expect(pageOf(rows, 1).rows).toHaveLength(PAGE_SIZE)
    expect(pageOf(rows, 3).rows).toHaveLength(1)
    expect(pageOf(rows, 3).pageCount).toBe(3)
  })

  it("returns the last page for a page beyond the end rather than nothing", () => {
    const rows = [row()]

    expect(pageOf(rows, 9).page).toBe(1)
    expect(pageOf(rows, 9).rows).toHaveLength(1)
    expect(pageOf(rows, 0).page).toBe(1)
  })

  it("has one page even when there is nothing on it", () => {
    expect(pageOf([], 1)).toEqual({ rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 })
  })
})

function branch(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    applicationId: "J-DS000136-010",
    humLabel: "hum0001",
    applicationType: "new",
    approvedOn: "2026-01-01",
    datasets: ["JGAD000001"],
    heldBy: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  }
}

const HELD = branch()
const ABSENT = branch({ applicationId: "J-DS000200-001", heldBy: null })
const UNLABELLED = branch({ applicationId: "J-DS000300-001", humLabel: null, heldBy: null })
const UNREGISTERED = branch({ applicationId: "J-DS000400-001", datasets: [], applicationType: "update" })
const ALL = [HELD, ABSENT, UNLABELLED, UNREGISTERED]

describe("the status of a branch in the portal", () => {
  it("reads the hum label first: no label is its own status, not a missing research", () => {
    expect(branchStatusOf(HELD)).toBe("held")
    expect(branchStatusOf(ABSENT)).toBe("absent")
    expect(branchStatusOf(UNLABELLED)).toBe("unlabelled")
  })

  it("keeps every branch when the axis is asked for in full, as when it is not asked at all", () => {
    expect(filterBranchRows(ALL, { branchStatuses: BRANCH_STATUSES, applicationTypes: [] })).toEqual(ALL)
    expect(filterBranchRows(ALL, { branchStatuses: [], applicationTypes: [] })).toEqual(ALL)
  })

  it("keeps a branch with any of the ticked statuses", () => {
    const held = filterBranchRows(ALL, { branchStatuses: ["held"], applicationTypes: [] })
    expect(held.map((row) => row.applicationId))
      .toEqual([HELD.applicationId, UNREGISTERED.applicationId])

    const two = filterBranchRows(ALL, { branchStatuses: ["absent", "unlabelled"], applicationTypes: [] })
    expect(two.map((row) => row.applicationId))
      .toEqual([ABSENT.applicationId, UNLABELLED.applicationId])
  })

  it("keeps a branch of any of the ticked kinds, and narrows with the status as well", () => {
    expect(filterBranchRows(ALL, { branchStatuses: [], applicationTypes: ["update"] }).map((row) => row.applicationId))
      .toEqual([UNREGISTERED.applicationId])
    expect(filterBranchRows(ALL, { branchStatuses: [], applicationTypes: ["new", "update"] })).toEqual(ALL)
    expect(filterBranchRows(ALL, { branchStatuses: ["held"], applicationTypes: ["new"] }).map((row) => row.applicationId))
      .toEqual([HELD.applicationId])
    expect(filterBranchRows(ALL, { branchStatuses: ["absent"], applicationTypes: ["update"] })).toEqual([])
  })

  it("does not narrow by whether the branch registered anything", () => {
    for (const branchStatus of BRANCH_STATUSES) {
      const kept = filterBranchRows(ALL, { branchStatuses: [branchStatus], applicationTypes: [] })
      const datasetsOf = new Set(kept.map((row) => row.datasets.length === 0))
      expect(kept.every((row) => branchStatusOf(row) === branchStatus)).toBe(true)
      if (branchStatus === "held") expect(datasetsOf).toEqual(new Set([true, false]))
    }
  })
})

describe("the order the branches come in", () => {
  const older = branch({ applicationId: "J-DS000100-001", approvedOn: "2020-05-06" })
  const newer = branch({ applicationId: "J-DS000900-001", approvedOn: "2026-05-06" })
  const undated = branch({ applicationId: "J-DS000500-001", approvedOn: null })
  const ids = (rows: readonly BranchRow[]): string[] => rows.map((row) => row.applicationId)

  it("opens on the newest approval and on the first number issued", () => {
    expect(ids(sortBranchRows([older, newer]))).toEqual([newer.applicationId, older.applicationId])
    expect(ids(sortBranchRows([newer, older], "application")))
      .toEqual([older.applicationId, newer.applicationId])
  })

  it("turns round when the other direction is asked for", () => {
    expect(ids(sortBranchRows([newer, older], "approved", "asc")))
      .toEqual([older.applicationId, newer.applicationId])
    expect(ids(sortBranchRows([older, newer], "application", "desc")))
      .toEqual([newer.applicationId, older.applicationId])
  })

  it("sinks a branch with no approval date whichever way the order runs", () => {
    const rows = [undated, older, newer]

    expect(ids(sortBranchRows(rows, "approved", "desc")).at(-1)).toBe(undated.applicationId)
    expect(ids(sortBranchRows(rows, "approved", "asc")).at(-1)).toBe(undated.applicationId)
  })

  it("breaks a tie by the application number, so a page boundary stays put", () => {
    const first = branch({ applicationId: "J-DS000136-010", approvedOn: "2026-01-01" })
    const second = branch({ applicationId: "J-DS000136-011", approvedOn: "2026-01-01" })

    expect(ids(sortBranchRows([first, second]))).toEqual(ids(sortBranchRows([second, first])))
    expect(ids(sortBranchRows([second, first])))
      .toEqual([first.applicationId, second.applicationId])
  })

  it("leaves the rows it was given alone", () => {
    const rows = [older, newer]
    sortBranchRows(rows)

    expect(ids(rows)).toEqual([older.applicationId, newer.applicationId])
  })
})

describe("axisCounts", () => {
  const published = row({ researchId: "1", status: "published" })
  const unpublished = row({ researchId: "2", status: "unpublished" })
  const alsoUnpublished = row({ researchId: "3", status: "unpublished" })

  it("counts the rows each value holds", () => {
    expect(axisCounts(
      [published, unpublished, alsoUnpublished],
      ADMIN_STATUSES,
      (one, status) => one.status === status,
    )).toEqual({ published: 1, unpublished: 2 })
  })

  it("gives every value a number, including the ones nothing holds", () => {
    expect(axisCounts([published], ADMIN_STATUSES, (one, status) => one.status === status))
      .toEqual({ published: 1, unpublished: 0 })
    expect(axisCounts([], ADMIN_STATUSES, () => false))
      .toEqual({ published: 0, unpublished: 0 })
  })

  it("counts a row under every value it holds, where one row can hold several", () => {
    const both = row({
      datasets: [{ label: "JGAD000001", published: true }, { label: "JGAD000002", published: false }],
    })
    const closed = row({ datasets: [{ label: "JGAD000003", published: false }] })
    const holds = (which: AdminResearchRow, open: string) =>
      which.datasets.some((entry) => entry.published === (open === "open"))

    expect(axisCounts([both, closed], ["open", "closed"], holds))
      .toEqual({ open: 1, closed: 2 })
  })

  it("leaves the rows it was given alone", () => {
    const rows = [published, unpublished]
    axisCounts(rows, ADMIN_STATUSES, (one, status) => one.status === status)

    expect(rows).toEqual([published, unpublished])
  })
})
