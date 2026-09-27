import { describe, expect, it } from "vitest"

import { oldDates, siteTime, type DatedArticle } from "./old-dates"

const page = (title: string, created: string, modified: string, catid = 10): DatedArticle => ({ title, catid, state: 1, introtext: "", created, modified })

describe("siteTime", () => {
  it("reads the site's time as UTC and gives null for its zero time and anything else", () => {
    expect(siteTime("2023-11-06 08:12:47.000000")?.toISOString()).toBe("2023-11-06T08:12:47.000Z")
    expect(siteTime("2023-11-06 08:12:47")?.toISOString()).toBe("2023-11-06T08:12:47.000Z")
    expect(siteTime("0000-00-00 00:00:00")).toBeNull()
    expect(siteTime("")).toBeNull()
    expect(siteTime("2023-13-45 99:99:99")).toBeNull()
  })
})

describe("oldDates", () => {
  const dates = oldDates([
    page("hum0169.v1", "2020-03-10 00:55:45.000000", "2020-12-04 05:55:21.000000"),
    page("hum0169.v2_release note", "2020-07-17 02:34:10.000000", "2020-07-17 02:34:10.000000"),
    page("hum0169.v3", "2023-10-31 06:00:00.000000", "2023-11-06 08:12:47.000000"),
    page("hum0169.v3", "2023-10-31 06:10:00.000000", "2023-11-06 08:21:18.000000", 16),
    page("hum0169.v5_release note", "2023-10-31 05:53:55.000000", "0000-00-00 00:00:00"),
    page("hum0169.v4", "2019-01-01 00:00:00.000000", "2019-01-01 00:00:00.000000", 26),
    page("利用可能な研究データ一覧", "2013-01-01 00:00:00.000000", "2026-01-01 00:00:00.000000"),
  ])

  it("dates a research by its first page in either language, release notes included", () => {
    expect(dates.researchCreated("hum0169")?.toISOString()).toBe("2020-03-10T00:55:45.000Z")
    expect(dates.researchCreated("hum0170")).toBeNull()
  })

  it("dates a draft by the pages above the latest published version: the first written and the last edited", () => {
    expect(dates.draftWritten("hum0169", 2)).toEqual({
      created: new Date("2023-10-31T05:53:55Z"),
      updated: new Date("2023-11-06T08:21:18Z"),
    })
    expect(dates.draftWritten("hum0169", 5)).toBeNull()
  })

  it("reads a page never edited as last edited when it was written, and leaves out articles of no research version", () => {
    expect(dates.draftWritten("hum0169", 4)).toEqual({
      created: new Date("2023-10-31T05:53:55Z"),
      updated: new Date("2023-10-31T05:53:55Z"),
    })
  })
})
