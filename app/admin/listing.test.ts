import { describe, expect, it } from "vitest"

import { filled } from "~/content/empty"
import type { TranslatedText } from "~/content/types"
import { PAGE_SIZE } from "~/search/page-size"

import {
  ADMIN_FLAG_KEYS,
  ADMIN_STATUSES,
  axisCounts,
  BRANCH_REGISTRATIONS,
  BRANCH_STANDINGS,
  branchStanding,
  filterBranchRows,
  filterResearchRows,
  pageOf,
  sortBranchRows,
  sortResearchRows,
  type AdminResearchRow,
  type BranchRow,
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
    publishedOn: "2026-01-01",
    ...overrides,
  }
}

function matching(keyword: string, rows: AdminResearchRow[] = [row()]): number {
  return filterResearchRows(rows, { keyword, statuses: [], flags: [] }).length
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
    row({ researchId: "b", status: "published" }),
    row({ researchId: "c", status: "unpublished", flags: { ...NOTHING, noHumLabel: true } }),
    row({
      researchId: "d",
      status: "unpublished",
      flags: { ...NOTHING, noHumLabel: true, unsettled: true, untranslated: true },
    }),
  ]

  it("narrows to one status", () => {
    expect(filterResearchRows(rows, { keyword: "", statuses: ["unpublished"], flags: [] })
      .map((held) => held.researchId)).toEqual(["c", "d"])
  })

  it("takes a row in any of the ticked states, and every row when both are", () => {
    expect(filterResearchRows(rows, {
      keyword: "",
      statuses: ["published", "unpublished"],
      flags: [],
    }).map((held) => held.researchId)).toEqual(["a", "b", "c", "d"])
  })

  it("narrows nothing when neither state is ticked, as an untouched axis does", () => {
    expect(filterResearchRows(rows, { keyword: "", statuses: [], flags: [] })
      .map((held) => held.researchId))
      .toEqual(filterResearchRows(rows, {
        keyword: "",
        statuses: ["published", "unpublished"],
        flags: [],
      }).map((held) => held.researchId))
  })

  it("takes a row that has any one of the ticked shortcomings", () => {
    expect(filterResearchRows(rows, { keyword: "", statuses: [], flags: ["noHumLabel"] })
      .map((held) => held.researchId)).toEqual(["c", "d"])
    expect(filterResearchRows(rows, { keyword: "", statuses: [], flags: ["unsettled"] })
      .map((held) => held.researchId)).toEqual(["d"])
  })

  it("widens as more are ticked, and never drops a row that one of them took", () => {
    const one = filterResearchRows(rows, { keyword: "", statuses: [], flags: ["unsettled"] })
    const two = filterResearchRows(rows, {
      keyword: "",
      statuses: [],
      flags: ["noHumLabel", "unsettled"],
    })

    expect(two.map((held) => held.researchId)).toEqual(["c", "d"])
    for (const held of one) expect(two).toContain(held)
  })

  it("narrows nothing when none of them is ticked", () => {
    expect(filterResearchRows(rows, { keyword: "", statuses: [], flags: [] })
      .map((held) => held.researchId)).toEqual(["a", "b", "c", "d"])
  })

  it("takes a row on any of the five, the two pin-derived ones included", () => {
    const held = row({
      researchId: "e",
      flags: { ...NOTHING, upstreamMismatch: true },
    })

    for (const flag of ADMIN_FLAG_KEYS) {
      const taken = filterResearchRows([held], { keyword: "", statuses: [], flags: [flag] })
      expect(taken.length, flag).toBe(flag === "upstreamMismatch" ? 1 : 0)
    }
    expect(filterResearchRows([held], {
      keyword: "",
      statuses: [],
      flags: ["noHumLabel", "upstreamMismatch"],
    })).toHaveLength(1)
  })

  it("keeps the status and the shortcomings as separate axes, ANDed", () => {
    // 「未確定あり」は d だけが持ち、その d は未公開。公開中とは重ならない。
    expect(filterResearchRows(rows, {
      keyword: "糖尿病",
      statuses: ["published"],
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

  it("runs a key the way it reads when nobody says which way", () => {
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

  it("answers a page beyond the end with the last one rather than with nothing", () => {
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
    approvedOn: "2026-01-01",
    datasets: ["JGAD000001"],
    heldBy: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  }
}

const HELD = branch()
const ABSENT = branch({ applicationId: "J-DS000200-001", heldBy: null })
const UNLABELLED = branch({ applicationId: "J-DS000300-001", humLabel: null, heldBy: null })
const NOTHING_REGISTERED = branch({ applicationId: "J-DS000400-001", datasets: [] })
const ALL = [HELD, ABSENT, UNLABELLED, NOTHING_REGISTERED]

describe("where a branch stands with the portal", () => {
  it("reads the hum label first: no label is its own standing, not a missing research", () => {
    expect(branchStanding(HELD)).toBe("held")
    expect(branchStanding(ABSENT)).toBe("absent")
    expect(branchStanding(UNLABELLED)).toBe("unlabelled")
  })

  it("keeps every branch when an axis is asked for in full, as when it is not asked at all", () => {
    const every = { standings: BRANCH_STANDINGS, registrations: BRANCH_REGISTRATIONS }
    const none = { standings: [], registrations: [] }

    expect(filterBranchRows(ALL, every)).toEqual(ALL)
    expect(filterBranchRows(ALL, none)).toEqual(ALL)
  })

  it("combines the two axes as an AND and the values within one as an OR", () => {
    const held = filterBranchRows(ALL, { standings: ["held"], registrations: [] })
    expect(held.map((row) => row.applicationId))
      .toEqual([HELD.applicationId, NOTHING_REGISTERED.applicationId])

    const twoStandings = filterBranchRows(ALL, {
      standings: ["absent", "unlabelled"],
      registrations: [],
    })
    expect(twoStandings.map((row) => row.applicationId))
      .toEqual([ABSENT.applicationId, UNLABELLED.applicationId])

    // Held **and** holding datasets: the one row that manages both, not the
    // three that manage either.
    const both = filterBranchRows(ALL, { standings: ["held"], registrations: ["some"] })
    expect(both.map((row) => row.applicationId)).toEqual([HELD.applicationId])
  })

  it("counts a branch with no dataset as registering nothing", () => {
    const none = filterBranchRows(ALL, { standings: [], registrations: ["none"] })

    expect(none.map((row) => row.applicationId)).toEqual([NOTHING_REGISTERED.applicationId])
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
    const two = row({ flags: { ...NOTHING, noHumLabel: true, untranslated: true } })
    const one = row({ flags: { ...NOTHING, untranslated: true } })

    expect(axisCounts([two, one], ADMIN_FLAG_KEYS, (which, flag) => which.flags[flag]))
      .toEqual({
        noHumLabel: 1,
        noDatasetLabel: 0,
        unsettled: 0,
        untranslated: 2,
        upstreamMismatch: 0,
      })
  })

  it("leaves the rows it was given alone", () => {
    const rows = [published, unpublished]
    axisCounts(rows, ADMIN_STATUSES, (one, status) => one.status === status)

    expect(rows).toEqual([published, unpublished])
  })
})
