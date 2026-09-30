import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { backupDraftName, draftAside, draftNameOf, draftNameShown, plannedDraftName } from "./draft-name"

describe("plannedDraftName", () => {
  it("plans the number after the highest published, and v1 with none", () => {
    expect(plannedDraftName(null)).toBe("v1 予定")
    fc.assert(fc.property(fc.integer({ min: 0, max: 10_000 }), (highest) => {
      expect(plannedDraftName(highest)).toBe(`v${String(highest + 1)} 予定`)
    }))
  })
})

describe("backupDraftName", () => {
  it("writes the date a dump is named by with hyphens", () => {
    expect(backupDraftName("20260923")).toBe("2026-09-23 の backup から")
    fc.assert(fc.property(
      fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z"), noInvalidDate: true }),
      (date) => {
        const [year, month, day] = date.toISOString().slice(0, 10).split("-")
        expect(backupDraftName(`${year ?? ""}${month ?? ""}${day ?? ""}`)).toBe(`${year ?? ""}-${month ?? ""}-${day ?? ""} の backup から`)
      },
    ))
  })

  it("refuses a day the calendar does not have", () => {
    for (const day of ["20260230", "20250229", "20261301", "20260001", "20260900", "20260931", "00260923"]) {
      expect(backupDraftName(day)).toBeNull()
    }
    expect(backupDraftName("20240229")).toBe("2024-02-29 の backup から")
  })

  it("refuses anything but eight digits", () => {
    for (const day of ["", "2026923", "202609230", "2026-09-23", " 20260923", "20260923\n", "２０２６０９２３"]) {
      expect(backupDraftName(day)).toBeNull()
    }
    fc.assert(fc.property(fc.string().filter((text) => !/^\d{8}$/.test(text)), (text) => {
      expect(backupDraftName(text)).toBeNull()
    }))
  })
})

describe("draftNameOf", () => {
  it("drops the spaces around a name and refuses one with nothing else in it", () => {
    expect(draftNameOf("  v2 予定 ")).toBe("v2 予定")
    fc.assert(fc.property(fc.string({ unit: fc.constantFrom(" ", "\t", "\n", "　") }), (blank) => {
      expect(draftNameOf(blank)).toBeNull()
    }))
  })
})

describe("draftAside", () => {
  it("puts the draft's name after the research's identifier", () => {
    expect(draftAside("hum0006", "v7 予定", "ja")).toBe("hum0006 / v7 予定")
    expect(draftAside(undefined, "v1 予定", "ja")).toBe("v1 予定")
  })

  it("adds nothing for an update, which its version's number names", () => {
    expect(draftAside("hum0006", null, "ja")).toBe("hum0006")
    expect(draftAside(undefined, null, "ja")).toBeUndefined()
  })

  it("shows that a draft has no name rather than showing nothing", () => {
    expect(draftNameShown("", "ja")).toBe("下書き名未入力")
    expect(draftAside("hum0006", "", "ja")).toBe("hum0006 / 下書き名未入力")
  })
})
